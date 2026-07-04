import { describe, expect, it } from "vitest";
import { ApiError, getErrorMessage, parseApiError } from "./errors";

describe("parseApiError", () => {
  it("parses standard API envelope", () => {
    const err = parseApiError({
      isAxiosError: true,
      message: "Request failed",
      response: {
        status: 503,
        headers: { "x-request-id": "abc123" },
        data: {
          error: true,
          code: "LLM_UNAVAILABLE",
          message: "سرویس LLM در دسترس نیست",
        },
      },
    });
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(503);
    expect(err.code).toBe("LLM_UNAVAILABLE");
    expect(err.message).toContain("LLM");
    expect(err.requestId).toBe("abc123");
  });

  it("falls back for legacy detail string", () => {
    const err = parseApiError({
      isAxiosError: true,
      response: { status: 404, data: { detail: "Agent not found" } },
    });
    expect(getErrorMessage(err)).toBe("Agent not found");
  });
});
