/**
 * Shared JWT access for fetch() calls (SSE invoke, file downloads).
 * Axios interceptors in api.ts use the same refresh mutex.
 */

import { getApiV1Url } from "@/lib/api-base";
import type { TokenPair } from "@/types";

let refreshPromise: Promise<string | null> | null = null;

export function readAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("access_token");
}

export function readRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("refresh_token");
}

export function storeTokenPair(data: TokenPair): void {
  localStorage.setItem("access_token", data.access_token);
  localStorage.setItem("refresh_token", data.refresh_token);
}

export function clearSessionTokens(): void {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
}

/** Refresh access token; concurrent callers share one in-flight request. */
export async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const refresh = readRefreshToken();
    if (!refresh) return null;
    try {
      const res = await fetch(`${getApiV1Url()}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refresh }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as TokenPair;
      if (!data.access_token) return null;
      storeTokenPair(data);
      return data.access_token;
    } catch {
      return null;
    }
  })().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

function decodeJwtPayload(token: string): { exp?: number } | null {
  try {
    const segment = token.split(".")[1];
    if (!segment) return null;
    const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64)) as { exp?: number };
  } catch {
    return null;
  }
}

function accessTokenExpired(token: string, skewSeconds = 30): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return false;
  return payload.exp * 1000 <= Date.now() + skewSeconds * 1000;
}

/** Return a usable access token, refreshing when missing or expired. */
export async function getValidAccessToken(): Promise<string | null> {
  const existing = readAccessToken();
  if (existing && !accessTokenExpired(existing)) return existing;
  const refreshed = await refreshAccessToken();
  return refreshed ?? (existing && !accessTokenExpired(existing, 0) ? existing : null);
}

type AuthFetchInit = RequestInit & { _authRetried?: boolean };

/** fetch() with Bearer token and a single 401 → refresh → retry cycle. */
export async function fetchWithAuth(
  input: RequestInfo | URL,
  init: AuthFetchInit = {}
): Promise<Response> {
  const { _authRetried, ...fetchInit } = init;
  const token = await getValidAccessToken();
  if (!token) {
    return new Response(
      JSON.stringify({
        error: true,
        code: "AUTHENTICATION_REQUIRED",
        message: "برای ادامه باید وارد شوید.",
      }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const headers = new Headers(fetchInit.headers);
  headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(input, { ...fetchInit, headers });
  if (res.status === 401 && !_authRetried) {
    const next = await refreshAccessToken();
    if (next) {
      const retryHeaders = new Headers(fetchInit.headers);
      retryHeaders.set("Authorization", `Bearer ${next}`);
      return fetchWithAuth(input, { ...fetchInit, headers: retryHeaders, _authRetried: true });
    }
  }
  return res;
}
