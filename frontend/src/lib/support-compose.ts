/** Bridge dashboard / command bar → floating platform support assistant. */

export type SupportComposeDetail = {
  message: string;
  /** Open the support panel (default true). */
  open?: boolean;
};

export const SUPPORT_COMPOSE_EVENT = "ma-support-compose";

export function requestSupportCompose(detail: SupportComposeDetail): void {
  if (typeof window === "undefined") return;
  const trimmed = detail.message.trim();
  if (!trimmed) return;
  window.dispatchEvent(
    new CustomEvent<SupportComposeDetail>(SUPPORT_COMPOSE_EVENT, {
      detail: { ...detail, message: trimmed },
    })
  );
}
