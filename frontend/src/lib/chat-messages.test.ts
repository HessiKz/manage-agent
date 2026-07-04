import { describe, expect, it } from "vitest";
import {
  appendChatExchange,
  appendPendingUserAction,
  finalizePendingExchange,
} from "./chat-messages";

describe("chat-messages", () => {
  it("finalizes pending assistant bubble", () => {
    const pending = appendPendingUserAction([], "اقدام: فیش حقوق");
    const done = finalizePendingExchange(pending, {
      user: "اقدام: فیش حقوق",
      assistant: "گزارش آماده است.",
    });
    expect(done).toHaveLength(2);
    expect(done[1].content).toContain("گزارش");
  });

  it("appends new exchange when no pending match", () => {
    const out = appendChatExchange([], {
      user: "سلام",
      assistant: "پاسخ",
    });
    expect(out).toHaveLength(2);
  });
});
