import { getApiBaseUrl } from "@/lib/api-base";
import { fetchWithAuth, getValidAccessToken } from "@/lib/auth-token";

function apiBase(): string {
  return getApiBaseUrl();
}

/** Prefix an API path with the runtime base URL (same-origin on VPS). */
function apiUrl(path: string): string {
  const base = apiBase();
  return base ? `${base}${path}` : path;
}

/** Encode each segment of a workspace relative path for fetch URLs. */
export function encodeWorkspaceApiPath(agentId: string, relPath: string): string {
  const rel = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
  const encoded = rel
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return apiUrl(`/api/v1/agents/${agentId}/workspace/${encoded}`);
}

const WORKSPACE_UNTIL_EXT =
  /[^\n)\]"'<>]*?\.(?:xlsx|xls|pdf|csv|docx?|zip|txt|json)/i;

/** Strip markdown punctuation LLMs add around paths (e.g. `file.pdf`). */
function stripMarkdownPunctuation(value: string): string {
  return value.replace(/^[`"'<\[\(]+/, "").replace(/[`"'.,;>\]\)]+$/, "");
}

/** Turn API download_path or legacy files.local URLs into a browser fetch URL. */
export function resolveDownloadUrl(raw: string): string | null {
  const trimmed = stripMarkdownPunctuation(raw.trim());
  if (trimmed.startsWith("/api/v1/")) {
    return apiUrl(trimmed);
  }

  const workspaceApi = trimmed.match(
    new RegExp(
      `/api/v1/agents/([0-9a-fA-F-]{36})/workspace/(${WORKSPACE_UNTIL_EXT.source})`,
      "i"
    )
  );
  if (workspaceApi) {
    return encodeWorkspaceApiPath(workspaceApi[1], workspaceApi[2]);
  }

  const workspaceMatch = trimmed.match(
    new RegExp(
      `(?:var/agent_files/([0-9a-fA-F-]{36})/(${WORKSPACE_UNTIL_EXT.source})|agents/([0-9a-fA-F-]{36})/workspace/(${WORKSPACE_UNTIL_EXT.source}))`,
      "i"
    )
  );
  if (workspaceMatch) {
    const agentId = workspaceMatch[1] || workspaceMatch[3];
    const rel = workspaceMatch[2] || workspaceMatch[4];
    if (agentId && rel) {
      return encodeWorkspaceApiPath(agentId, rel);
    }
  }

  if (trimmed.startsWith("/demo-files/")) {
    return apiUrl(`/api/v1${trimmed}`);
  }
  const pathMatch = trimmed.match(/\/api\/v1\/demo-files\/[^\s)\]"'`]+/);
  if (pathMatch) {
    return apiUrl(pathMatch[0]);
  }
  const legacy = trimmed.match(/files\.local\/reports\/([^\s)\]"'`]+)/);
  if (legacy) {
    return apiUrl(`/api/v1/demo-files/reports/${legacy[1]}`);
  }
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const u = new URL(trimmed);
      if (u.pathname.startsWith("/api/v1/")) {
        return apiUrl(u.pathname);
      }
    } catch {
      /* ignore */
    }
    if (trimmed.includes("files.local")) {
      const name = trimmed.split("/").pop();
      return name ? apiUrl(`/api/v1/demo-files/reports/${name}`) : null;
    }
    return trimmed;
  }
  return null;
}

const PROTECTED_DOWNLOAD_PATH =
  /^\/api\/v1\/agents\/[0-9a-fA-F-]{36}\/(?:workspace\/|files\/[0-9a-fA-F-]{36}\/download)/;

const DOWNLOAD_PATH_RE = new RegExp(
  `(\\/api\\/v1\\/(?:demo-files\\/[^\\s)\\]"'<>]+|agents\\/[0-9a-fA-F-]{36}\\/(?:workspace\\/${WORKSPACE_UNTIL_EXT.source}|files\\/[0-9a-fA-F-]{36}\\/download)))` +
    `|https?:\\/\\/[^\\s)\\]"'<>]+\\/api\\/v1\\/(?:demo-files\\/[^\\s)\\]"'<>]+|agents\\/[0-9a-fA-F-]{36}\\/(?:workspace\\/${WORKSPACE_UNTIL_EXT.source}|files\\/[0-9a-fA-F-]{36}\\/download))` +
    `|https?:\\/\\/files\\.local\\/reports\\/[^\\s)\\]"'\`]+` +
    `|var\\/agent_files\\/[0-9a-fA-F-]{36}\\/${WORKSPACE_UNTIL_EXT.source}`,
  "gi"
);

/** Agent file downloads require JWT — plain browser navigation will 401. */
export function isProtectedDownloadUrl(href: string): boolean {
  try {
    const u = new URL(
      href.trim(),
      typeof window !== "undefined" ? window.location.origin : "http://localhost"
    );
    const path = decodeURIComponent(u.pathname);
    return PROTECTED_DOWNLOAD_PATH.test(path);
  } catch {
    return false;
  }
}

/** Normalize markdown / chat links to a fetchable absolute URL. */
export function toFetchableDownloadUrl(href: string): string {
  const trimmed = href.trim();
  const resolved = resolveDownloadUrl(trimmed);
  if (resolved) {
    return resolved;
  }
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  if (trimmed.startsWith("/api/v1/")) {
    return apiUrl(trimmed);
  }
  try {
    return new URL(trimmed, typeof window !== "undefined" ? window.location.origin : "http://localhost")
      .href;
  } catch {
    return apiUrl(trimmed.startsWith("/") ? trimmed : `/${trimmed}`);
  }
}

export function extractDownloadUrls(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(DOWNLOAD_PATH_RE)) {
    const resolved = resolveDownloadUrl(m[1]);
    if (resolved) found.add(resolved);
  }
  return [...found];
}

function filenameFromResponse(res: Response, url: string, fallback?: string): string {
  const cd = res.headers.get("content-disposition") ?? "";
  const quoted = cd.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i);
  if (quoted?.[1]) {
    try {
      return decodeURIComponent(quoted[1].replace(/"/g, ""));
    } catch {
      return quoted[1].replace(/"/g, "");
    }
  }
  return fallback || url.split("/").pop() || "download";
}

/** Fetch a protected file with JWT and trigger a browser download. */
export async function downloadFileWithAuth(url: string, filename?: string): Promise<void> {
  const token = await getValidAccessToken();
  if (!token) {
    throw new Error("برای دانلود باید وارد شوید.");
  }
  const fetchUrl = toFetchableDownloadUrl(url);
  const res = await fetchWithAuth(fetchUrl);
  if (!res.ok) {
    let message = `دانلود ناموفق (${res.status})`;
    try {
      const body = await res.json();
      if (body && typeof body.message === "string") message = body.message;
    } catch {
      /* non-JSON body */
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  let name = filename;
  if (!name) {
    try {
      name = decodeURIComponent(new URL(fetchUrl).pathname.split("/").pop() || "");
    } catch {
      name = undefined;
    }
  }
  name = filenameFromResponse(res, fetchUrl, name);
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = name;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
