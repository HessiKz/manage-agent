/**
 * Resolve API base URL for browser, SSR, and Vercel deployments.
 *
 * Modes:
 * - NEXT_PUBLIC_API_URL set → direct calls to backend (best for long LLM / validation)
 * - Empty in browser → same-origin `/api/v1` via Next.js rewrites
 * - Empty on server → INTERNAL_API_URL (Docker) or localhost:8000
 */

function trimUrl(url: string): string {
  return url.replace(/\/$/, "");
}

export function getApiBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (explicit) return trimUrl(explicit);

  if (process.env.VERCEL || process.env.RAILWAY_ENVIRONMENT) return "";

  // Browser: always same-origin so Next rewrites /api/v1 → backend (no CORS).
  if (typeof window !== "undefined") return "";

  // SSR / server actions in Docker: hit backend service directly.
  const internal = process.env.INTERNAL_API_URL?.trim();
  if (internal) return trimUrl(internal);

  return "http://localhost:8000";
}

/** Prefix for REST calls, e.g. `/api/v1` or `https://api.example.com/api/v1`. */
export function getApiV1Url(): string {
  const base = getApiBaseUrl();
  return base ? `${base}/api/v1` : "/api/v1";
}
