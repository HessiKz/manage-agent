import { describe, expect, it } from "vitest";
import { pickPopularAgents } from "@/lib/top-agent-card";
import type { TopAgent } from "@/types";

function row(id: string, created_at: string, runs = 1): TopAgent {
  return { id, name: id, slug: id, runs, created_at };
}

describe("pickPopularAgents", () => {
  it("marks the newest agent among the top slice as جدید", () => {
    const top = [
      row("a", "2024-01-01", 100),
      row("b", "2025-06-01", 90),
      row("c", "2024-06-01", 80),
    ];
    const out = pickPopularAgents(top);
    expect(out.find((x) => x.agent.id === "b")?.isNew).toBe(true);
    expect(out.find((x) => x.agent.id === "a")?.isNew).toBe(false);
  });

  it("returns at most eight agents", () => {
    const top = Array.from({ length: 12 }, (_, i) => row(`id-${i}`, `2024-0${i + 1}-01`, 12 - i));
    expect(pickPopularAgents(top)).toHaveLength(8);
  });
});
