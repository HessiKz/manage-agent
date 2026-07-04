"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** URL keys that open overview sub-UI (widget builder, draft preview). */
export const WIDGET_BUILDER_URL_KEYS = [
  "open_widget_builder",
  "widget_type",
  "auto_generate",
  "widget_prompt",
] as const;

export const DRAFT_PREVIEW_URL_KEYS = ["draft", "highlight_widget"] as const;

export const OVERVIEW_PANEL_URL_KEYS = [
  ...WIDGET_BUILDER_URL_KEYS,
  ...DRAFT_PREVIEW_URL_KEYS,
] as const;

export type UrlParamsPatch = {
  set?: Record<string, string | undefined>;
  delete?: string[];
};

export function buildPathWithParams(
  pathname: string,
  current: URLSearchParams | string,
  patch: UrlParamsPatch
): string {
  const params = new URLSearchParams(
    typeof current === "string" ? current : current.toString()
  );
  for (const key of patch.delete ?? []) {
    params.delete(key);
  }
  for (const [key, value] of Object.entries(patch.set ?? {})) {
    if (value === undefined) params.delete(key);
    else params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/** Read/write search params on the current route without scrolling. */
export function useUrlParams() {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const paramsKey = searchParams.toString();

  const replaceParams = useCallback(
    (patch: UrlParamsPatch) => {
      router.replace(buildPathWithParams(pathname, paramsKey, patch), { scroll: false });
    },
    [router, pathname, paramsKey]
  );

  const clearParams = useCallback(
    (keys: readonly string[]) => replaceParams({ delete: [...keys] }),
    [replaceParams]
  );

  return { pathname, searchParams, replaceParams, clearParams };
}

export function syncWidgetBuilderUrl(
  replaceParams: (patch: UrlParamsPatch) => void,
  open: boolean,
  widgetType?: string
) {
  if (open) {
    replaceParams({
      set: {
        tab: "overview",
        open_widget_builder: "1",
        widget_type: widgetType,
      },
    });
    return;
  }
  replaceParams({ delete: [...WIDGET_BUILDER_URL_KEYS] });
}
