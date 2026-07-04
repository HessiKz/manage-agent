/** Live DOM observation for the platform support agent (vision-like UI context). */

import { SupportUiBlockedError } from "@/lib/support-abort";
import { setUiRefRegistry } from "@/lib/ui-ref-registry";

export type UiSnapshotElement = {
  ref: string;
  selector: string;
  role: string;
  label: string;
  tag: string;
  value?: string;
  placeholder?: string;
  disabled?: boolean;
  checked?: boolean;
  options?: string[];
};

export type UiBlocker = {
  kind: "dialog" | "alert" | "error" | "toast";
  text: string;
  selector?: string;
};

export type UiSnapshot = {
  path: string;
  search: string;
  title: string;
  scrollY: number;
  elementCount: number;
  elements: UiSnapshotElement[];
  blockers: UiBlocker[];
  blocked: boolean;
  blockerText: string;
  capturedAt: string;
};

const INTERACTIVE_SELECTOR = [
  "[data-ma-support]",
  "[data-ma-guide]",
  "button:not([disabled])",
  "input:not([type=hidden])",
  "textarea",
  "select",
  'a[href]:not([href="#"])',
  '[role="button"]',
  '[role="tab"]',
  '[role="link"]',
].join(",");

const ROOT_SELECTORS = ["#ma-main-scroll", "main", '[role="main"]', "body"];

const BLOCKER_SELECTORS = [
  '[role="alertdialog"]',
  '[role="dialog"][aria-modal="true"]',
  '[role="alert"]',
  '[data-ma-support="app-dialog"]',
  '[data-ma-support="app-dialog-message"]',
  '[data-ma-support="wizard-name-error"]',
  '[data-ma-support="wizard-error"]',
  '[data-ma-support="app-error"]',
  '[data-sonner-toast][data-type="error"]',
].join(",");

/** Portaled modals (e.g. app-dialog) render on document.body outside #ma-main-scroll. */
const PORTAL_BLOCKER_SELECTORS = [
  '[data-ma-support="app-dialog"]',
  '[data-ma-support="app-dialog-message"]',
].join(",");

function visible(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
    return false;
  }
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function labelFor(el: Element): string {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const aria = el.getAttribute("aria-label");
    if (aria) return aria;
    const id = el.id;
    if (id) {
      const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (label?.textContent) return label.textContent.trim();
    }
    if (el.placeholder) return el.placeholder;
    if (el.value) return el.value.slice(0, 80);
  }
  if (el instanceof HTMLSelectElement) {
    const opt = el.selectedOptions[0];
    return opt?.textContent?.trim() || el.name || "select";
  }
  if (el instanceof HTMLButtonElement || el.getAttribute("role") === "button") {
    return (el.textContent || el.getAttribute("aria-label") || "button").trim().slice(0, 120);
  }
  const aria = el.getAttribute("aria-label");
  if (aria) return aria;
  const text = (el.textContent || "").replace(/\s+/g, " ").trim();
  return text.slice(0, 120) || el.tagName.toLowerCase();
}

function roleFor(el: Element): string {
  const explicit = el.getAttribute("role");
  if (explicit) return explicit;
  if (el instanceof HTMLButtonElement) return "button";
  if (el instanceof HTMLInputElement) return `input:${el.type || "text"}`;
  if (el instanceof HTMLTextAreaElement) return "textarea";
  if (el instanceof HTMLSelectElement) return "select";
  if (el instanceof HTMLAnchorElement) return "link";
  return el.tagName.toLowerCase();
}

function bestSelector(el: Element): string {
  const support = el.getAttribute("data-ma-support");
  if (support) return `[data-ma-support="${support}"]`;
  const guide = el.getAttribute("data-ma-guide");
  if (guide) return `[data-ma-guide="${guide}"]`;
  if (el.id) return `#${CSS.escape(el.id)}`;
  const name = el.getAttribute("name");
  if (name && el.tagName !== "DIV") {
    return `${el.tagName.toLowerCase()}[name="${name}"]`;
  }
  const testId = el.getAttribute("data-testid");
  if (testId) return `[data-testid="${testId}"]`;
  return "";
}

function findRoot(): Element {
  for (const sel of ROOT_SELECTORS) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return document.body;
}

function isInformationalWizardText(text: string): boolean {
  return /شناسه\s*پیشنهادی|هنوز\s*ذخیره\s*نشده/i.test(text);
}

function collectBlockersFrom(root: Element, blockers: UiBlocker[], seen: Set<string>): void {
  for (const el of root.querySelectorAll(BLOCKER_SELECTORS)) {
    if (!(el instanceof HTMLElement) || !visible(el)) continue;
    if (el.getAttribute("data-ma-support") === "wizard-name-slug-preview") continue;
    const text = (el.textContent || el.getAttribute("aria-label") || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 240);
    if (!text || seen.has(text) || isInformationalWizardText(text)) continue;
    seen.add(text);

    let kind: UiBlocker["kind"] = "error";
    const role = el.getAttribute("role");
    if (role === "alertdialog" || role === "dialog") kind = "dialog";
    else if (el.hasAttribute("data-sonner-toast")) kind = "toast";
    else if (role === "alert") kind = "alert";

    blockers.push({
      kind,
      text,
      selector: bestSelector(el) || undefined,
    });
    if (blockers.length >= 6) return;
  }
}

export function detectBlockers(root: Element = findRoot()): UiBlocker[] {
  const blockers: UiBlocker[] = [];
  const seen = new Set<string>();

  collectBlockersFrom(root, blockers, seen);
  if (blockers.length < 6 && document.body && document.body !== root) {
    collectBlockersFrom(document.body, blockers, seen);
    for (const el of document.body.querySelectorAll(PORTAL_BLOCKER_SELECTORS)) {
      if (!(el instanceof HTMLElement) || !visible(el)) continue;
      const text = (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 240);
      if (!text || seen.has(text)) continue;
      seen.add(text);
      blockers.push({
        kind: "dialog",
        text,
        selector: bestSelector(el) || undefined,
      });
      if (blockers.length >= 6) break;
    }
  }

  return blockers;
}

export function snapshotHasBlocker(snapshot: UiSnapshot): boolean {
  return snapshot.blocked || snapshot.blockers.length > 0;
}

export function assertNoUiBlocker(): void {
  const blockers = detectBlockers();
  if (!blockers.length) return;
  const primary = blockers[0];
  throw new SupportUiBlockedError(primary.text || "مانع در رابط کاربری — اجرا متوقف شد.");
}

export function captureUiSnapshot(): UiSnapshot {
  const root = findRoot();
  const seen = new Set<Element>();
  const elements: UiSnapshotElement[] = [];
  const refMap: Record<string, string> = {};
  let refIndex = 1;

  const candidates = root.querySelectorAll(INTERACTIVE_SELECTOR);
  for (const el of candidates) {
    if (seen.has(el) || !visible(el)) continue;
    const selector = bestSelector(el);
    if (!selector) continue;
    if (document.querySelectorAll(selector).length > 1 && !el.hasAttribute("data-ma-support")) {
      continue;
    }
    seen.add(el);

    const ref = `ui-${refIndex++}`;
    refMap[ref] = selector;

    const item: UiSnapshotElement = {
      ref,
      selector,
      role: roleFor(el),
      label: labelFor(el),
      tag: el.tagName.toLowerCase(),
    };

    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      item.value = el.value;
      if (el.placeholder) item.placeholder = el.placeholder;
      item.disabled = el.disabled;
      if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
        item.checked = el.checked;
      }
    } else if (el instanceof HTMLSelectElement) {
      item.value = el.value;
      item.disabled = el.disabled;
      item.options = Array.from(el.options)
        .slice(0, 12)
        .map((o) => o.textContent?.trim() || o.value);
    } else if (el instanceof HTMLButtonElement) {
      item.disabled = el.disabled;
    }

    elements.push(item);
    if (elements.length >= 48) break;
  }

  setUiRefRegistry(refMap);

  const dialogRoot = document.querySelector('[data-ma-support="app-dialog"]');
  if (dialogRoot && elements.length < 48) {
    for (const el of dialogRoot.querySelectorAll(INTERACTIVE_SELECTOR)) {
      if (seen.has(el) || !visible(el)) continue;
      const selector = bestSelector(el);
      if (!selector) continue;
      seen.add(el);
      const ref = `ui-${refIndex++}`;
      refMap[ref] = selector;
      const item: UiSnapshotElement = {
        ref,
        selector,
        role: roleFor(el),
        label: labelFor(el),
        tag: el.tagName.toLowerCase(),
      };
      if (el instanceof HTMLButtonElement) item.disabled = el.disabled;
      elements.unshift(item);
      if (elements.length >= 48) break;
    }
    setUiRefRegistry(refMap);
  }

  const blockers = detectBlockers(root);
  const blockerText = blockers[0]?.text ?? "";

  return {
    path: window.location.pathname,
    search: window.location.search,
    title: document.title,
    scrollY: window.scrollY,
    elementCount: elements.length,
    elements,
    blockers,
    blocked: blockers.length > 0,
    blockerText,
    capturedAt: new Date().toISOString(),
  };
}

export function formatUiSnapshotForAgent(snapshot: UiSnapshot): string {
  const lines = snapshot.elements.map((el) => {
    const bits = [
      `ref:${el.ref}`,
      el.role,
      `"${el.label}"`,
      `selector:${el.selector}`,
    ];
    if (el.value !== undefined && el.value !== "") bits.push(`value:"${el.value.slice(0, 80)}"`);
    if (el.placeholder) bits.push(`placeholder:"${el.placeholder}"`);
    if (el.disabled) bits.push("disabled");
    if (el.checked !== undefined) bits.push(el.checked ? "checked" : "unchecked");
    if (el.options?.length) bits.push(`options:[${el.options.join(", ")}]`);
    return `- ${bits.join(" | ")}`;
  });

  const location = snapshot.search
    ? `${snapshot.path}${snapshot.search}`
    : snapshot.path;

  return [
    `مسیر: ${location}`,
    `عنوان: ${snapshot.title}`,
    snapshot.blocked ? `blocked: true · blockerText: "${snapshot.blockerText}"` : "blocked: false",
    `عناصر تعاملی (${snapshot.elementCount}):`,
    ...lines,
    snapshot.blockers.length
      ? `\nمانع‌های UI (${snapshot.blockers.length}) — تا ۳ راه‌حل امتحان کن:\n${snapshot.blockers.map((b) => `- [${b.kind}] ${b.text}`).join("\n")}\nراهنما: دیالوگ → کلیک ref دکمه «متوجه شدم» (app-dialog-confirm)؛ دسترسی‌ها → تیک wizard-permissions-default؛ اگر نشد از کاربر بپرس.`
      : "",
    "",
    "برای کلیک/تایپ از ref در platform_execute_ui استفاده کنید: {\"type\":\"click\",\"ref\":\"ui-3\"}",
  ]
    .filter(Boolean)
    .join("\n");
}
