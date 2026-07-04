"use client";

/**
 * Real wizard draft persistence (localStorage). Replaces the old cosmetic
 * autosave countdown. Uploaded File objects can't be serialized, so staged
 * files are intentionally excluded from the draft.
 */

const DRAFT_KEY = "ma_agent_wizard_draft_v1";

export type WizardDraft = {
  savedAt: string;
  data: Record<string, unknown>;
};

export function loadDraft(): WizardDraft | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WizardDraft;
    if (!parsed || typeof parsed !== "object" || !parsed.data) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveDraft(data: Record<string, unknown>): string | null {
  try {
    const savedAt = new Date().toISOString();
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ savedAt, data }));
    return savedAt;
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* private mode */
  }
}
