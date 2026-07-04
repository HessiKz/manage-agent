import { describe, expect, it, vi, beforeEach } from "vitest";
import { ApiError } from "./errors";
import { handleApiError } from "./api-error-handler";

vi.mock("./toast-errors", () => ({
  showErrorToast: vi.fn(),
}));

vi.mock("./logger", () => ({
  clientLog: vi.fn(),
}));

import { showErrorToast } from "./toast-errors";
import { clientLog } from "./logger";

describe("handleApiError", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns parsed ApiError and logs with warn console path", () => {
    const err = new ApiError("سرویس LLM در دسترس نیست", {
      status: 503,
      code: "LLM_UNAVAILABLE",
      requestId: "req-1",
    });
    const out = handleApiError(err, { event: "test", log: true, toast: false });
    expect(out.message).toContain("LLM");
    expect(clientLog).toHaveBeenCalledWith(
      "warn",
      expect.any(String),
      expect.objectContaining({ event: "test", remoteLevel: "error" })
    );
    expect(showErrorToast).not.toHaveBeenCalled();
  });

  it("shows toast when requested and not 401", () => {
    const err = new ApiError("خطای سرور", { status: 500, code: "INTERNAL_ERROR" });
    handleApiError(err, { toast: true, toastTitle: "خطا" });
    expect(showErrorToast).toHaveBeenCalledWith(err, "خطا");
  });

  it("skips toast for 401", () => {
    const err = new ApiError("ورود", { status: 401, code: "AUTHENTICATION_REQUIRED" });
    handleApiError(err, { toast: true });
    expect(showErrorToast).not.toHaveBeenCalled();
  });
});
