import { describe, expect, it } from "vitest";
import {
  AUTONOMY_BLOCKED_FA,
  AUTONOMY_LABELS,
  canRunAutomation,
  coerceLevel,
  type AutonomyLevel,
} from "@/lib/autonomy-policy";

describe("coerceLevel", () => {
  it("maps valid ints", () => {
    expect(coerceLevel(0)).toBe(0);
    expect(coerceLevel(3)).toBe(3);
  });
  it("clamps out-of-range", () => {
    expect(coerceLevel(5)).toBe(1);
    expect(coerceLevel(-1)).toBe(1);
  });
  it("parses strings", () => {
    expect(coerceLevel("2")).toBe(2);
    expect(coerceLevel("x")).toBe(1);
  });
  it("handles booleans", () => {
    expect(coerceLevel(true)).toBe(1);
    expect(coerceLevel(false)).toBe(0);
  });
  it("falls back to default for null/undefined", () => {
    expect(coerceLevel(null)).toBe(1);
    expect(coerceLevel(undefined)).toBe(1);
  });
});

describe("canRunAutomation", () => {
  it("L0 only allows suggest", () => {
    expect(canRunAutomation(0 as AutonomyLevel, "suggest")).toBe(true);
    expect(canRunAutomation(0 as AutonomyLevel, "fill")).toBe(false);
    expect(canRunAutomation(0 as AutonomyLevel, "bridge")).toBe(false);
    expect(canRunAutomation(0 as AutonomyLevel, "full")).toBe(false);
  });
  it("L1 allows suggest + fill", () => {
    expect(canRunAutomation(1, "fill")).toBe(true);
    expect(canRunAutomation(1, "bridge")).toBe(false);
  });
  it("L2 allows bridges", () => {
    expect(canRunAutomation(2, "bridge")).toBe(true);
    expect(canRunAutomation(2, "full")).toBe(false);
  });
  it("L3 allows everything", () => {
    expect(canRunAutomation(3, "full")).toBe(true);
  });
});

describe("labels", () => {
  it("has a label per level", () => {
    expect(AUTONOMY_LABELS[3]).toBeTruthy();
    expect(AUTONOMY_BLOCKED_FA).toContain("خودمختاری");
  });
});
