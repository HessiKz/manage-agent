/** Visible DOM typing for support automation — React-controlled fields need native setter + input. */

import { sleepAbortable, throwIfSupportAborted } from "@/lib/support-abort";
import type { SupportPlayerContext } from "@/lib/support-ui-player-context";

const CHAR_DELAY_MS = 28;
const FIELD_PAUSE_MS = 320;

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function setNativeFormValue(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string
): void {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function centerOf(el: Element): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

async function highlightElement(
  el: HTMLElement,
  ctx?: SupportPlayerContext | null
): Promise<void> {
  throwIfSupportAborted();
  if (ctx) {
    const sel = el.getAttribute("data-ma-support");
    if (sel) {
      await ctx.highlight(`[data-ma-support="${sel}"]`);
      return;
    }
  }
  const reduced = prefersReducedMotion();
  el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
  el.classList.add("ma-support-target");
  await sleepAbortable(reduced ? 120 : 450);
  el.classList.remove("ma-support-target");
}

/** Type into a field character-by-character so the user sees answers appear live. */
export async function typeIntoFormFieldVisually(
  el: HTMLInputElement | HTMLTextAreaElement,
  text: string,
  ctx?: SupportPlayerContext | null
): Promise<void> {
  throwIfSupportAborted();
  await highlightElement(el, ctx);

  if (ctx) {
    const sel = el.getAttribute("data-ma-support");
    if (sel) {
      await ctx.setStatus("وارد کردن پاسخ…");
      await ctx.typeIntoElement(`[data-ma-support="${sel}"]`, text);
      return;
    }
  }

  const reduced = prefersReducedMotion();
  el.focus();
  el.classList.add("ma-support-typing");
  try {
    if (reduced) {
      setNativeFormValue(el, text);
    } else {
      let built = "";
      for (const ch of text) {
        built += ch;
        setNativeFormValue(el, built);
        await sleepAbortable(CHAR_DELAY_MS);
      }
    }
  } finally {
    el.classList.remove("ma-support-typing");
  }
  await sleepAbortable(FIELD_PAUSE_MS);
}

export async function clickElementVisually(
  el: HTMLElement,
  ctx?: SupportPlayerContext | null
): Promise<void> {
  throwIfSupportAborted();
  if (ctx) {
    const sel = el.getAttribute("data-ma-support");
    if (sel) {
      await ctx.highlight(`[data-ma-support="${sel}"]`);
      await ctx.click(`[data-ma-support="${sel}"]`);
      return;
    }
  }
  el.scrollIntoView({
    behavior: prefersReducedMotion() ? "auto" : "smooth",
    block: "center",
  });
  await sleepAbortable(200);
  el.click();
}

export function centerOfElement(el: Element): { x: number; y: number } {
  return centerOf(el);
}
