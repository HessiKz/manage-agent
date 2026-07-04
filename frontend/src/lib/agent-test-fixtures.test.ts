import { describe, expect, it } from "vitest";
import {
  buildAgentTestPlan,
  buildSampleFile,
  buildWidgetAdminTestPrompt,
  exampleChatPrompt,
  sampleVariablesForAction,
} from "@/lib/agent-test-fixtures";
import type { Agent, AgentAction } from "@/types";

const baseAgent: Agent = {
  id: "1",
  name: "Test",
  slug: "test",
  status: "active",
  kind: "chat",
  capabilities: {
    chat_enabled: true,
    file_upload_enabled: false,
    actions_enabled: false,
    templates_enabled: false,
    can_call_agents: false,
    supervisor_enabled: false,
  },
  file_policy: {
    min_files: 0,
    max_files: 10,
    max_file_size_mb: 5,
    max_total_size_mb: 50,
    allowed_mime_types: ["text/plain"],
    allowed_extensions: [".txt"],
    require_files_to_invoke: false,
    auto_ingest_to_rag: false,
  },
  agent_link_policy: { max_depth: 3, default_requires_user_permission: true },
  model_provider: "openai",
  model_name: "claude-opus-4-8",
  temperature: 0.2,
  tool_names: [],
  created_at: "",
  updated_at: "",
};

describe("buildAgentTestPlan", () => {
  it("includes upload when file capability enabled", () => {
    const plan = buildAgentTestPlan({
      ...baseAgent,
      kind: "worker",
      capabilities: {
        ...baseAgent.capabilities,
        chat_enabled: false,
        file_upload_enabled: true,
      },
      file_policy: {
        ...baseAgent.file_policy,
        allowed_mime_types: ["text/csv"],
        allowed_extensions: [".csv"],
      },
    });
    expect(plan.some((s) => s.kind === "upload")).toBe(true);
  });

  it("uses resolveFile for excel file policy (کارکرد)", () => {
    const plan = buildAgentTestPlan({
      ...baseAgent,
      kind: "worker",
      slug: "example-karkard",
      capabilities: {
        ...baseAgent.capabilities,
        file_upload_enabled: true,
        actions_enabled: true,
      },
      file_policy: {
        ...baseAgent.file_policy,
        allowed_mime_types: [
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ],
        allowed_extensions: [".xlsx"],
      },
    }, [
      {
        slug: "process_karkard",
        label: "محاسبه",
        prompt_template: "",
        tool_chain: ["karkard_process"],
        input_schema: {
          jalali_year: { type: "integer", default: 1405 },
        },
        confirmation_required: false,
        order_index: 0,
      },
    ]);
    const upload = plan.find((s) => s.kind === "upload");
    expect(upload?.resolveFile).toBeDefined();
    const action = plan.find((s) => s.kind === "action");
    expect(action?.variables?.jalali_year).toBe(1405);
    expect(plan.some((s) => s.kind === "action")).toBe(true);
  });

  it("uses template body for chat prompt when provided", () => {
    const prompt = exampleChatPrompt(baseAgent, [
      { slug: "t1", label: "T", body: "متن قالب", variables: {}, order_index: 0 },
    ]);
    expect(prompt).toBe("متن قالب");
  });
});

describe("sampleVariablesForAction", () => {
  it("uses integer defaults for jalali_year", () => {
    const action: AgentAction = {
      slug: "process_karkard",
      label: "محاسبه",
      prompt_template: "",
      tool_chain: ["karkard_process"],
      confirmation_required: false,
      input_schema: {
        jalali_year: { title: "سال شمسی", type: "integer", default: 1405 },
        company_name: {
          title: "نام شرکت",
          type: "string",
          default: "شرکت توسعه کارآفرینی سوره",
        },
      },
      order_index: 0,
    };
    const vars = sampleVariablesForAction(action);
    expect(vars.jalali_year).toBe(1405);
    expect(vars.company_name).toBe("شرکت توسعه کارآفرینی سوره");
    expect(String(vars.jalali_year)).not.toContain("نمونه-");
  });
});

describe("buildWidgetAdminTestPrompt", () => {
  it("suggests resume widgets for HR screening agents", () => {
    const prompt = buildWidgetAdminTestPrompt(
      { ...baseAgent, name: "غربال‌گر رزومه", slug: "resume-screener", description: "غربال رزومه" },
      { profile: "resume", stat_cards: [], line_chart: null, pie_chart: null }
    );
    expect(prompt).toContain("غربال");
    expect(prompt).toMatch(/KPI|کارت/);
  });

  it("uses agent description when domain is unknown", () => {
    const prompt = buildWidgetAdminTestPrompt(
      { ...baseAgent, name: "Custom Bot", description: "گزارش‌گیری ماهانه فروش" },
      null
    );
    expect(prompt).toContain("گزارش‌گیری ماهانه فروش");
  });
});

describe("buildSampleFile", () => {
  it("prefers csv when policy allows csv", () => {
    const f = buildSampleFile({
      ...baseAgent.file_policy,
      allowed_mime_types: ["text/csv"],
      allowed_extensions: [".csv"],
    });
    expect(f.name).toContain(".csv");
  });
});
