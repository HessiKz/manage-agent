/** Persist and restore platform support assistant chat — multi-session. */

import type { SupportUiAction } from "@/lib/page-guide-context";
import type { MessageThinking, MessageUiTask, SupportUserChoice } from "@/lib/chat-message-types";
import { parseSupportHighlight } from "@/lib/page-guide-context";
import { formatAssistantOutput } from "@/lib/sanitize-chat-message";
import { sanitizeSupportAssistantText } from "@/lib/support-assistant-text";
import type { ConversationMessage } from "@/types";

export const SUPPORT_AGENT_SLUG = "support";

export type SupportChatMessage = {
  role: "user" | "assistant";
  content: string;
  thinking?: MessageThinking | string;
  uiTask?: MessageUiTask;
  uiAction?: SupportUiAction;
  userChoices?: SupportUserChoice[];
  isStreaming?: boolean;
};

export type SupportSessionMeta = {
  threadId: string;
  title: string;
  updatedAt: string;
};

const SESSIONS_KEY = "ma_support_sessions_v1";
const ACTIVE_KEY = "ma_support_active_v1";
const LEGACY_CACHE_KEY = "ma_support_chat_v1";

function chatCacheKey(threadId: string): string {
  return `ma_support_chat_v2:${threadId}`;
}

function legacyThreadId(userId: string, agentId: string): string {
  return `user-${userId}:agent-${agentId}`;
}

export function buildSupportThreadId(userId: string, agentId: string): string {
  return legacyThreadId(userId, agentId);
}

export function createSupportSessionThreadId(userId: string, agentId: string): string {
  const session =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID().slice(0, 12)
      : Date.now().toString(36);
  return `${legacyThreadId(userId, agentId)}:session-${session}`;
}

export function getActiveSupportThreadId(
  userId: string,
  agentId: string
): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ACTIVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { userId: string; agentId: string; threadId: string };
    if (parsed.userId !== userId || parsed.agentId !== agentId) return null;
    return parsed.threadId;
  } catch {
    return null;
  }
}

export function setActiveSupportThreadId(
  userId: string,
  agentId: string,
  threadId: string
): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      ACTIVE_KEY,
      JSON.stringify({ userId, agentId, threadId })
    );
  } catch {
    /* quota */
  }
}

export function readSupportSessions(
  userId: string,
  agentId: string
): SupportSessionMeta[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    if (!raw) return migrateLegacySessions(userId, agentId);
    const parsed = JSON.parse(raw) as {
      userId: string;
      agentId: string;
      sessions: SupportSessionMeta[];
    };
    if (parsed.userId !== userId || parsed.agentId !== agentId) return [];
    return parsed.sessions ?? [];
  } catch {
    return [];
  }
}

function migrateLegacySessions(userId: string, agentId: string): SupportSessionMeta[] {
  const legacy = readLegacySupportChatCache(userId, agentId);
  if (!legacy?.length) return [];
  const threadId = legacyThreadId(userId, agentId);
  const firstUser = legacy.find((m) => m.role === "user")?.content?.trim();
  const meta: SupportSessionMeta = {
    threadId,
    title: firstUser?.slice(0, 60) || "گفتگوی قبلی",
    updatedAt: new Date().toISOString(),
  };
  writeSupportSessions(userId, agentId, [meta]);
  writeSupportChatCache(userId, agentId, threadId, legacy);
  return [meta];
}

export function writeSupportSessions(
  userId: string,
  agentId: string,
  sessions: SupportSessionMeta[]
): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      SESSIONS_KEY,
      JSON.stringify({ userId, agentId, sessions })
    );
  } catch {
    /* quota */
  }
}

export function upsertSupportSession(
  userId: string,
  agentId: string,
  threadId: string,
  title: string
): SupportSessionMeta[] {
  const now = new Date().toISOString();
  const sessions = readSupportSessions(userId, agentId).filter((s) => s.threadId !== threadId);
  const next: SupportSessionMeta = {
    threadId,
    title: title.slice(0, 80) || "گفتگوی جدید",
    updatedAt: now,
  };
  const merged = [next, ...sessions].slice(0, 50);
  writeSupportSessions(userId, agentId, merged);
  return merged;
}

function readLegacySupportChatCache(
  userId: string,
  agentId: string
): SupportChatMessage[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LEGACY_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      userId: string;
      agentId: string;
      messages: SupportChatMessage[];
    };
    if (parsed.userId !== userId || parsed.agentId !== agentId) return null;
    if (!Array.isArray(parsed.messages)) return null;
    return parsed.messages;
  } catch {
    return null;
  }
}

export function readSupportChatCache(
  userId: string,
  agentId: string,
  threadId: string
): SupportChatMessage[] | null {
  if (typeof window === "undefined") return null;
  if (threadId === legacyThreadId(userId, agentId)) {
    const legacy = readLegacySupportChatCache(userId, agentId);
    if (legacy?.length) return legacy;
  }
  try {
    const raw = localStorage.getItem(chatCacheKey(threadId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      userId: string;
      agentId: string;
      threadId: string;
      messages: SupportChatMessage[];
    };
    if (
      parsed.userId !== userId ||
      parsed.agentId !== agentId ||
      parsed.threadId !== threadId
    ) {
      return null;
    }
    if (!Array.isArray(parsed.messages)) return null;
    return parsed.messages;
  } catch {
    return null;
  }
}

export function writeSupportChatCache(
  userId: string,
  agentId: string,
  threadId: string,
  messages: SupportChatMessage[]
): void {
  if (typeof window === "undefined") return;
  try {
    const payload = { userId, agentId, threadId, messages };
    localStorage.setItem(chatCacheKey(threadId), JSON.stringify(payload));
    if (threadId === legacyThreadId(userId, agentId)) {
      localStorage.setItem(LEGACY_CACHE_KEY, JSON.stringify(payload));
    }
  } catch {
    /* quota */
  }
}

export function mergeSupportSessions(
  local: SupportSessionMeta[],
  remote: { thread_id: string; preview: string; updated_at?: string | null; started_at?: string | null }[]
): SupportSessionMeta[] {
  const map = new Map<string, SupportSessionMeta>();
  for (const s of local) {
    map.set(s.threadId, s);
  }
  for (const r of remote) {
    const existing = map.get(r.thread_id);
    const updatedAt = r.updated_at || r.started_at || existing?.updatedAt || "";
    map.set(r.thread_id, {
      threadId: r.thread_id,
      title: existing?.title || r.preview?.slice(0, 80) || "گفتگوی پشتیبانی",
      updatedAt: updatedAt || existing?.updatedAt || new Date().toISOString(),
    });
  }
  return [...map.values()].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export function restoreSupportMessages(rows: ConversationMessage[]): SupportChatMessage[] {
  return rows.map((row) => {
    if (row.role === "assistant") {
      const formatted = formatAssistantOutput(row.content);
      const { answer, uiAction } = parseSupportHighlight(formatted);
      return {
        role: "assistant",
        content: sanitizeSupportAssistantText(answer),
        uiAction,
      };
    }
    return { role: "user", content: row.content };
  });
}
