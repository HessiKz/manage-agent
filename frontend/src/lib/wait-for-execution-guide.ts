import { fetchAgentExecutionGuideStatus } from "@/lib/api";

const TERMINAL_STATES = new Set(["ready", "failed"]);

export async function waitForExecutionGuide(
  agentId: string,
  opts?: { intervalMs?: number; timeoutMs?: number }
): Promise<{ state: string; source?: string | null }> {
  const intervalMs = opts?.intervalMs ?? 2000;
  const timeoutMs = opts?.timeoutMs ?? 120_000;
  const started = Date.now();

  for (;;) {
    const status = await fetchAgentExecutionGuideStatus(agentId);
    if (TERMINAL_STATES.has(status.state)) {
      return status;
    }
    if (Date.now() - started >= timeoutMs) {
      return { state: "failed", source: null };
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
