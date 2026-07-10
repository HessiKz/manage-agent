"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { prepareActionsForPublish, deriveAgentToolNames } from "@/lib/action-inputs";
import { appAlert } from "@/lib/app-dialog";
import { formatPersianMonthYear } from "@/lib/persian-date";
import {
  createAgentWithPermissions,
  checkAgentNameAvailable,
  fetchAgentBySlug,
  fetchAgentPermissions,
  fetchAllAgents,
  fetchUsers,
  prepareAgentRuntime,
  replaceAgentPermissions,
  startAgentTraining,
  suggestSystemPrompt,
  uploadAgentFile,
  refreshAgentInstructions,
  updateAgent,
} from "@/lib/api";

import {
  canNavigateToStep,
  computeSequentialStepComplete,
  computeStepValidity,
  getStepBlockMessage,
  type WizardStepContext,
} from "@/lib/wizard-step-validation";
import { handleApiError } from "@/lib/api-error-handler";
import { PanelTransition } from "@/components/motion/transitions";
import { KindPicker } from "@/components/agents/kind-picker";
import { PrecisionPicker } from "@/components/agents/precision-picker";
import { CapabilityToggles } from "@/components/agents/capability-toggles";
import { WizardField } from "@/components/agents/wizard-field";
import { WizardStepIntro } from "@/components/agents/wizard-step-intro";
import { FIELD_HELP, WIZARD_STEP_HELP } from "@/lib/wizard-step-help";
import { FilePolicyForm, validateFilePolicy } from "@/components/agents/file-policy-form";
import { ActionRepeater } from "@/components/agents/action-repeater";
import { TemplateRepeater } from "@/components/agents/template-repeater";
import { LinkedAgentsPicker } from "@/components/agents/linked-agents-picker";
import { InstructionPromptField } from "@/components/agents/instruction-prompt-field";
import { ReviewAlertsPlanForm } from "@/components/agents/review-alerts-plan-form";
import {
  defaultWidgetPlan,
  parseReviewAlertRules,
  validateReviewAlertsPlan,
  widgetPlanToConfigJson,
  type AgentWidgetPlan,
} from "@/lib/widget-plan";
import { WizardIoPanel, type IoExamples } from "@/components/agents/wizard-io-panel";
import { WizardProcessStepper } from "@/components/agents/wizard-process-stepper";
import { WizardTemperatureField } from "@/components/agents/wizard-temperature-field";
import {
  WizardPostPublishPanel,
  postPublishStepReady,
  suggestPostPublishStep,
} from "@/components/agents/wizard-post-publish-panel";
import { resolveTestingPhase, type ValidationReport } from "@/lib/agent-testing-phase";
import { useWizardSupportBridge } from "@/hooks/use-wizard-support-bridge";
import { clearStaleWizardCreatedSlug } from "@/lib/support-wizard-mission";
import { AutosaveLine } from "./autosave-line";
import { clearDraft, loadDraft, saveDraft } from "./draft";
import { extractInstructionFileTexts } from "@/lib/instruction-file-text";
import {
  DEFAULT_FILE_POLICY,
  EMPTY_API_BINDINGS,
  filePolicyForCapabilities,
  FILE_POLICY_INSTRUCTION_ATTACHMENTS,
  resolvePublishFileConfig,
  KIND_LABELS,
  KIND_PRESETS,
  estimateCostMultiplier,
  parseExecutionPrecision,
  precisionForKind,
} from "@/lib/agent-presets";
import { EMPTY_KNOWLEDGE_BINDINGS, parseKnowledgeBindings } from "@/lib/agent-knowledge-bindings";
import { agentToEditorDraft } from "@/lib/agent-editor-state";
import { scriptSamplesPublishBlock, agentLikelyNeedsScript } from "@/lib/agent-script-samples";
import { patchRunState, wizardScopeKey } from "@/lib/run-state-client";
import {
  agentLinksRequired,
  clampCapabilitiesForKind,
  shouldShowAgentLinks,
} from "@/lib/capability-rules";
import { ExternalApiManager } from "@/components/agents/external-api-manager";
import { KnowledgeSourcePicker } from "@/components/agents/knowledge-source-picker";
import { ModelPicker } from "@/components/agents/model-picker";
import { WIZARD_BOOTSTRAP_STAGES, type LlmLoadingPhase } from "@/lib/llm-loading-state";
import { LlmProcessIndicator } from "@/components/loading/llm-process-indicator";
import type {
  AgentAction,
  AgentApiBindings,
  AgentKnowledgeBindings,
  AgentCapabilities,
  AgentFilePolicy,
  AgentKind,
  AgentLink,
  AgentLinkPolicy,
  AgentPermissionGrantInput,
  AgentPromptTemplate,
  Agent,
  ExecutionPrecision,
} from "@/types";

function buildWizardConfigJson(
  plan: AgentWidgetPlan,
  ioExamples: IoExamples,
  precision: ExecutionPrecision
): Record<string, unknown> {
  const base = widgetPlanToConfigJson(plan);
  const cfg: Record<string, unknown> = { ...base, execution_precision: precision };
  const inputText = ioExamples.inputText.trim();
  const outputText = ioExamples.outputText.trim();
  if (!inputText && !outputText) return cfg;
  return {
    ...cfg,
    io_examples: {
      ...(inputText ? { input_text: inputText } : {}),
      ...(outputText ? { output_text: outputText } : {}),
    },
  };
}

function parseIoExamples(config: Record<string, unknown> | undefined): IoExamples {
  const raw = config?.io_examples as { input_text?: string; output_text?: string } | undefined;
  return {
    inputText: raw?.input_text ?? "",
    outputText: raw?.output_text ?? "",
  };
}

function wizardBootstrapPhase(stageId: string): LlmLoadingPhase {
  switch (stageId) {
    case "persist":
      return "preparing";
    case "runtime":
      return "tools";
    case "training":
      return "generating";
    default:
      return "preparing";
  }
}

function WizardBootstrapLoading({
  stageId,
  className,
}: {
  stageId: string;
  className?: string;
}) {
  const label =
    WIZARD_BOOTSTRAP_STAGES.find((s) => s.id === stageId)?.label ??
    "در حال آماده‌سازی تست تعاملی…";
  return (
    <div data-ma-support="wizard-bootstrap-loading" className={className}>
      <LlmProcessIndicator
        variant="panel"
        phase={wizardBootstrapPhase(stageId)}
        statusMessage={label}
        thinkingActive
        thinkingOpen
        thinkingContent="در حال ساخت ایجنت، آماده‌سازی محیط اجرا و راه‌اندازی تست تعاملی…"
        thinkingSummary="آماده‌سازی ویزارد با هوش مصنوعی"
      />
    </div>
  );
}

const WIZARD_STEPS = [
  "اطلاعات پایه",
  "دستورالعمل ایجنت",
  "هشدار و بازبینی",
  "ورودی و خروجی",
  "دسترسی‌ها",
  "تست و انتشار",
] as const;

const VISIBLE_STEPS: string[] = [...WIZARD_STEPS];

const DEPARTMENTS = [
  { value: "finance", label: "مالی" },
  { value: "hr", label: "منابع انسانی" },
  { value: "support", label: "پشتیبانی" },
  { value: "sales", label: "فروش" },
  { value: "ops", label: "عملیات" },
];

export default function AgentWizardPage() {
  const searchParams = useSearchParams();
  const isSuperuser = Boolean(useAuthStore((s) => s.user?.is_superuser));
  const [step, setStep] = useState(0);
  const [visitedSteps, setVisitedSteps] = useState<Set<number>>(() => new Set([0]));
  const [saving, setSaving] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [bootstrapStage, setBootstrapStage] = useState(WIZARD_BOOTSTRAP_STAGES[0].id);
  const prevStepRef = useRef(0);

  const [kind, setKind] = useState<AgentKind>("chat");
  const [executionPrecision, setExecutionPrecision] =
    useState<ExecutionPrecision>("autonomous");
  const [capabilities, setCapabilities] = useState<AgentCapabilities>(KIND_PRESETS.chat);
  const [filePolicy, setFilePolicy] = useState<AgentFilePolicy>(DEFAULT_FILE_POLICY);
  const [linkPolicy, setLinkPolicy] = useState<AgentLinkPolicy>({
    max_depth: 3,
    default_requires_user_permission: true,
  });
  const [actions, setActions] = useState<AgentAction[]>([]);
  const [templates, setTemplates] = useState<AgentPromptTemplate[]>([]);
  const [links, setLinks] = useState<AgentLink[]>([]);

  const [form, setForm] = useState({
    name: "",
    description: "",
    department: "finance",
    system_prompt: "",
    tool_names: [] as string[],
    model_name: "claude-opus-4-8",
    temperature: 0.2,
  });
  const [variables, setVariables] = useState(() => [
    { key: "overtime_threshold", value: "12" },
    { key: "period", value: formatPersianMonthYear() },
  ]);
  const [policies, setPolicies] = useState({
    working_hours_only: true,
    mfa_required: true,
    monthly_token_cap: "840K",
  });
  const [permissions, setPermissions] = useState<AgentPermissionGrantInput[]>([]);
  const [apiBindings, setApiBindings] = useState<AgentApiBindings>(EMPTY_API_BINDINGS);
  const [knowledgeBindings, setKnowledgeBindings] = useState<AgentKnowledgeBindings>(
    EMPTY_KNOWLEDGE_BINDINGS
  );
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [ioExamples, setIoExamples] = useState<IoExamples>({ inputText: "", outputText: "" });
  const [publishedAgent, setPublishedAgent] = useState<Agent | null>(null);
  const [widgetPlan, setWidgetPlan] = useState<AgentWidgetPlan>(() => defaultWidgetPlan());

  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [restorePromptAt, setRestorePromptAt] = useState<string | null>(null);
  const draftReady = useRef(false);
  const draftSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [suggestingPrompt, setSuggestingPrompt] = useState(false);
  const [nameCheck, setNameCheck] = useState<{
    slug: string;
    available: boolean;
    checking: boolean;
  }>({ slug: "", available: true, checking: false });
  const nameCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resumeSlug = searchParams.get("slug")?.trim() ?? "";
  const editMode = searchParams.get("mode") === "edit";

  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: fetchUsers,
    enabled: isSuperuser,
  });
  const { data: allPermissions = [] } = useQuery({
    queryKey: ["agent-permissions"],
    queryFn: fetchAgentPermissions,
    enabled: editMode && isSuperuser,
  });
  const { data: allAgents = [] } = useQuery({
    queryKey: ["agents-all"],
    queryFn: async () => (await fetchAllAgents({ page_size: 100 })).items,
  });

  const [permissionsAllowDefault, setPermissionsAllowDefault] = useState(false);
  const [showAdvancedIo, setShowAdvancedIo] = useState(false);

  const agentPollSlug = publishedAgent?.slug ?? resumeSlug;

  const { data: resumedAgent } = useQuery({
    queryKey: ["agent-wizard-resume", agentPollSlug],
    queryFn: () => fetchAgentBySlug(agentPollSlug),
    enabled: Boolean(agentPollSlug),
    meta: { suppressErrorToast: true },
    refetchInterval: (query) => {
      const a = query.state.data;
      if (!a) return false;
      const v = a.config_json?.validation as {
        state?: string;
        planning?: { awaiting_answers?: boolean };
      } | undefined;
      if (v?.planning?.awaiting_answers) return 2000;
      if (v?.state === "running" || v?.state === "pending_auto") return 2000;
      if (v?.state === "training" || v?.state === "dashboard_review") return 3000;
      if (a.status === "deploying") return 2000;
      if (a.status === "active" && v?.state && v.state !== "done") return 2000;
      return false;
    },
  });

  const activeAgent = publishedAgent ?? (!editMode ? resumedAgent ?? null : null);

  const panelDirection = step >= prevStepRef.current ? "forward" : "backward";
  useEffect(() => {
    prevStepRef.current = step;
  }, [step]);

  useEffect(() => {
    const draft = loadDraft();
    if (resumeSlug) {
      draftReady.current = true;
      setRestorePromptAt(null);
      return;
    }
    clearStaleWizardCreatedSlug();
    if (draft && typeof (draft.data as { name?: string })?.name === "string") {
      setRestorePromptAt(draft.savedAt);
    } else {
      draftReady.current = true;
    }
  }, [resumeSlug]);

  function applyDraft(data: Record<string, unknown>) {
    const d = data as Partial<{
      form: typeof form;
      kind: AgentKind;
      capabilities: AgentCapabilities;
      filePolicy: AgentFilePolicy;
      actions: AgentAction[];
      templates: AgentPromptTemplate[];
      links: AgentLink[];
      variables: { key: string; value: string }[];
      policies: typeof policies;
      permissions: AgentPermissionGrantInput[];
      apiBindings: AgentApiBindings;
      knowledgeBindings: AgentKnowledgeBindings;
      ioExamples: IoExamples;
      widgetPlan: AgentWidgetPlan;
      step: number;
    }>;
    if (d.form) setForm(d.form);
    if (d.kind) setKind(d.kind);
    if (d.capabilities) setCapabilities(d.capabilities);
    if (d.filePolicy) setFilePolicy(d.filePolicy);
    if (d.actions) setActions(d.actions);
    if (d.templates) setTemplates(d.templates);
    if (d.links) setLinks(d.links);
    if (d.variables) setVariables(d.variables);
    if (d.policies) setPolicies(d.policies);
    if (d.permissions) setPermissions(d.permissions);
    if (d.apiBindings) setApiBindings(d.apiBindings);
    if (d.knowledgeBindings) setKnowledgeBindings(d.knowledgeBindings);
    if (d.ioExamples) setIoExamples(d.ioExamples);
    if (d.widgetPlan) setWidgetPlan(d.widgetPlan);
    if (typeof d.step === "number") {
      const s = Math.min(Math.max(0, d.step), WIZARD_STEPS.length - 1);
      setStep(s);
      setVisitedSteps(new Set(Array.from({ length: s + 1 }, (_, i) => i)));
    }
  }

  // Debounced real autosave to localStorage once hydration is settled.
  useEffect(() => {
    if (!draftReady.current) return;
    if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
    draftSaveTimer.current = setTimeout(() => {
      const at = saveDraft({
        form,
        kind,
        capabilities,
        filePolicy,
        actions,
        templates,
        links,
        variables,
        policies,
        permissions,
        apiBindings,
        knowledgeBindings,
        ioExamples,
        widgetPlan,
        step,
      });
      if (at) setDraftSavedAt(at);
    }, 800);
    return () => {
      if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
    };
  }, [
    form,
    kind,
    capabilities,
    filePolicy,
    actions,
    templates,
    links,
    variables,
    policies,
    permissions,
    apiBindings,
    knowledgeBindings,
    ioExamples,
    widgetPlan,
    step,
  ]);

  useEffect(() => {
    const trimmed = form.name.trim();
    if (nameCheckTimer.current) clearTimeout(nameCheckTimer.current);
    if (trimmed.length < 2) {
      setNameCheck({ slug: "", available: true, checking: false });
      return;
    }
    setNameCheck((s) => ({ ...s, checking: true }));
    nameCheckTimer.current = setTimeout(() => {
      checkAgentNameAvailable(trimmed)
        .then((res) => setNameCheck({ slug: res.slug, available: res.available, checking: false }))
        .catch(() => setNameCheck((s) => ({ ...s, checking: false })));
    }, 450);
    return () => {
      if (nameCheckTimer.current) clearTimeout(nameCheckTimer.current);
    };
  }, [form.name]);

  const nameConflict =
    !editMode &&
    form.name.trim().length >= 2 &&
    !nameCheck.checking &&
    !nameCheck.available;

  const visibleSteps = VISIBLE_STEPS;

  useEffect(() => {
    if (searchParams.get("step") !== "api") return;
    setCapabilities((c) =>
      c.external_apis_enabled ? c : { ...c, external_apis_enabled: true }
    );
    const idx = visibleSteps.indexOf("ورودی و خروجی");
    if (idx >= 0) setStep(idx);
  }, [searchParams, visibleSteps]);

  useEffect(() => {
    if (searchParams.get("step") !== "knowledge") return;
    const idx = visibleSteps.indexOf("دستورالعمل ایجنت");
    if (idx >= 0) setStep(idx);
  }, [searchParams, visibleSteps]);

  const resumeHandled = useRef(false);
  const editHydrated = useRef(false);

  useEffect(() => {
    if (!resumedAgent) return;
    if (editMode) {
      if (editHydrated.current) return;
      const permRows = allPermissions.filter((p) => p.agent_id === resumedAgent.id);
      const draft = agentToEditorDraft(resumedAgent, permRows);
      setForm({
        name: draft.name,
        description: draft.description,
        department: draft.department,
        system_prompt: draft.systemPrompt,
        tool_names: resumedAgent.tool_names ?? [],
        model_name: draft.modelName,
        temperature: draft.temperature,
      });
      setKind(draft.kind);
      setCapabilities(draft.capabilities);
      setFilePolicy(draft.filePolicy);
      setLinkPolicy(draft.linkPolicy);
      setActions(draft.actions);
      setTemplates(draft.templates);
      setLinks(draft.links);
      setApiBindings(draft.apiBindings);
      setWidgetPlan(draft.widgetPlan);
      setKnowledgeBindings(parseKnowledgeBindings(resumedAgent.config_json));
      setIoExamples(parseIoExamples(resumedAgent.config_json));
      setExecutionPrecision(
        parseExecutionPrecision(resumedAgent.config_json) ?? precisionForKind(draft.kind)
      );
      setPermissions(draft.permissions);
      setPermissionsAllowDefault(draft.permissions.length === 0);
      editHydrated.current = true;
      return;
    }
    setPublishedAgent(resumedAgent);
    if (!resumeSlug || resumeHandled.current) return;
    resumeHandled.current = true;
    const idx = visibleSteps.indexOf("تست و انتشار");
    if (idx >= 0) setStep(idx);
  }, [resumeSlug, resumedAgent, visibleSteps, editMode, allPermissions]);

  useEffect(() => {
    setVisitedSteps((prev) => {
      if (prev.has(step)) return prev;
      const next = new Set(prev);
      next.add(step);
      return next;
    });
  }, [step]);

  const needsApiStep = Boolean(capabilities.external_apis_enabled);

  const hasApiBindings =
    apiBindings.service_ids.length > 0 || apiBindings.endpoint_ids.length > 0;

  function handleApiBindingsChange(next: AgentApiBindings) {
    setApiBindings(next);
    const picked = next.service_ids.length > 0 || next.endpoint_ids.length > 0;
    if (picked && !capabilities.external_apis_enabled) {
      setCapabilities((c) => ({ ...c, external_apis_enabled: true }));
    }
  }

  function resolvePublishApiBindings() {
    return hasApiBindings ? apiBindings : undefined;
  }

  function resolvePublishCapabilities(base: AgentCapabilities) {
    const clamped = clampCapabilitiesForKind(kind, base);
    if (hasApiBindings && !clamped.external_apis_enabled) {
      return { ...clamped, external_apis_enabled: true };
    }
    return clamped;
  }

  const stepIndex = visibleSteps[step] ?? WIZARD_STEPS[0];
  const onPublishStep = stepIndex === "تست و انتشار";
  const permissionsStepIdx = visibleSteps.indexOf("دسترسی‌ها");
  const testingStepIdx = visibleSteps.indexOf("تست و انتشار");
  const stepHelp = WIZARD_STEP_HELP[stepIndex] ?? WIZARD_STEP_HELP["اطلاعات پایه"];
  const costMult = estimateCostMultiplier(capabilities);

  const instructionFilePolicy = FILE_POLICY_INSTRUCTION_ATTACHMENTS;
  const scriptSamplesRequired = useMemo(
    () =>
      agentLikelyNeedsScript(
        kind,
        capabilities,
        deriveAgentToolNames(actions),
        actions
      ),
    [kind, capabilities, actions]
  );

  useWizardSupportBridge({
    visibleSteps,
    setStep,
    setForm,
    applyKind,
    setPermissionsAllowDefault,
  });

  const autoBootstrapRef = useRef(false);

  function resolvePublishConfig() {
    return resolvePublishFileConfig(
      capabilities,
      filePolicy,
      stagedFiles.length,
      deriveAgentToolNames(actions)
    );
  }

  function goToWizardStep(label: string, fallback?: string) {
    const idx = visibleSteps.indexOf(label);
    if (idx >= 0) {
      setStep(idx);
      return;
    }
    if (fallback) {
      const fb = visibleSteps.indexOf(fallback);
      if (fb >= 0) setStep(fb);
    }
  }

  function openFinalReview() {
    goToWizardStep("تست و انتشار");
  }

  type PublishBlock = { title: string; message: string; step?: string; fallback?: string };

  function collectPublishBlock(): PublishBlock | null {
    if (nameConflict) {
      return {
        title: "نام تکراری",
        message: "این نام قبلاً استفاده شده — لطفاً نام دیگری انتخاب کنید.",
        step: "اطلاعات پایه",
      };
    }
    const { capabilities: publishCaps, filePolicy: publishFilePolicy } = resolvePublishConfig();
    if (publishCaps.file_upload_enabled) {
      const policyErr = validateFilePolicy(publishFilePolicy);
      if (policyErr) {
        return {
          title: "تنظیمات فایل",
          message: policyErr,
          step: "ورودی و خروجی",
        };
      }
    }
    if (
      needsApiStep &&
      !apiBindings.service_ids.length &&
      !apiBindings.endpoint_ids.length
    ) {
      return {
        title: "اتصال API",
        message: "حداقل یک سرویس یا endpoint API انتخاب کنید.",
        step: "دستورالعمل ایجنت",
      };
    }
    const reviewErr = validateReviewAlertsPlan(widgetPlan);
    if (reviewErr) {
      return {
        title: "هشدار و بازبینی",
        message: reviewErr,
        step: "هشدار و بازبینی",
      };
    }
    const clampedCaps = clampCapabilitiesForKind(kind, publishCaps);
    const sampleBlock = scriptSamplesPublishBlock(
      kind,
      clampedCaps,
      deriveAgentToolNames(prepareActionsForPublish(actions)),
      prepareActionsForPublish(actions),
      stagedFiles
    );
    if (sampleBlock) return sampleBlock;
    if (agentLinksRequired(kind, clampedCaps)) {
      const linkType = kind === "supervisor" ? "supervises" : "tool";
      const selected = links.filter((l) => l.link_type === linkType);
      if (selected.length === 0) {
        return {
          title: kind === "supervisor" ? "زیرایجنت سرپرست" : "فراخوانی ایجنت",
          message:
            kind === "supervisor"
              ? "برای ایجنت سرپرست حداقل یک زیرایجنت انتخاب کنید."
              : "با فعال بودن «فراخوانی ایجنت‌ها» حداقل یک ایجنت مقصد انتخاب کنید.",
          step: "ورودی و خروجی",
        };
      }
    }
    return null;
  }

  function applyKind(next: AgentKind, caps: AgentCapabilities) {
    const clamped = clampCapabilitiesForKind(next, caps);
    setKind(next);
    setExecutionPrecision(precisionForKind(next));
    setCapabilities(clamped);
    if (!clamped.templates_enabled) {
      setTemplates([]);
    }
    setLinks((prev) => {
      if (next === "supervisor") {
        return prev.filter((l) => l.link_type === "supervises");
      }
      if (clamped.can_call_agents) {
        return prev.filter((l) => l.link_type === "tool");
      }
      return [];
    });
    const fpPreset = filePolicyForCapabilities(clamped, form.tool_names);
    if (fpPreset) setFilePolicy({ ...DEFAULT_FILE_POLICY, ...fpPreset });
    if (!clamped.external_apis_enabled) {
      setApiBindings(EMPTY_API_BINDINGS);
    }
  }

  function updateCapabilities(next: AgentCapabilities) {
    const clamped = clampCapabilitiesForKind(kind, next);
    setCapabilities(clamped);
    if (!clamped.templates_enabled) {
      setTemplates([]);
    }
    if (!shouldShowAgentLinks(kind, clamped)) {
      setLinks([]);
    } else if (kind === "supervisor") {
      setLinks((prev) => prev.filter((l) => l.link_type === "supervises"));
    } else {
      setLinks((prev) => prev.filter((l) => l.link_type === "tool"));
    }
    if (!clamped.external_apis_enabled) {
      setApiBindings(EMPTY_API_BINDINGS);
    }
  }

  async function suggestPrompt() {
    if (!form.name.trim()) {
      await appAlert({ title: "نام ایجنت", message: "ابتدا نام ایجنت را در مرحله «اطلاعات پایه» وارد کنید." });
      return;
    }
    setSuggestingPrompt(true);
    try {
      const suggested = await suggestSystemPrompt({
        name: form.name,
        description: form.description || undefined,
        department: form.department,
        kind,
        tool_names: form.tool_names,
        capabilities: capabilities as unknown as Record<string, boolean>,
        existing_prompt: form.system_prompt || undefined,
        instruction_files: await extractInstructionFileTexts(stagedFiles),
      });
      setForm((f) => ({ ...f, system_prompt: suggested }));
    } catch {
      await appAlert({
        title: "پیشنهاد متن",
        message: "پیشنهاد متن با هوش مصنوعی ممکن نشد. اتصال API یا کلید OpenAI را بررسی کنید.",
        tone: "danger",
      });
    } finally {
      setSuggestingPrompt(false);
    }
  }

  const capBadges = useMemo(() => {
    const items: { id: string; label: string }[] = [];
    const seen = new Set<string>();
    const add = (id: string, label: string) => {
      if (seen.has(id)) return;
      seen.add(id);
      items.push({ id, label });
    };
    add(`kind:${kind}`, KIND_LABELS[kind]);
    if (capabilities.chat_enabled) add("cap:chat", "گفت‌وگو");
    if (capabilities.file_upload_enabled) add("cap:file", "فایل");
    if (capabilities.actions_enabled) add("cap:actions", "اقدام");
    if (capabilities.templates_enabled) add("cap:templates", "قالب");
    if (capabilities.can_call_agents) add("cap:call", "فراخوانی");
    if (capabilities.supervisor_enabled) add("cap:supervisor", "سرپرست");
    if (capabilities.external_apis_enabled) add("cap:api", "API خارجی");
    return items;
  }, [kind, capabilities]);

  const apiSelectionCount =
    apiBindings.service_ids.length + apiBindings.endpoint_ids.length;

  const stepComplete = useMemo(() => {
    const ctx: WizardStepContext = {
      form,
      nameConflict,
      nameChecking: nameCheck.checking,
      kind,
      capabilities,
      filePolicy,
      stagedFiles,
      actions,
      links,
      widgetPlan,
      needsApiStep,
      apiBindings,
      permissions,
      permissionsAllowDefault,
    };
    const intrinsic = computeStepValidity(ctx);
    const step6 = activeAgent
      ? resolveTestingPhase(
          activeAgent.status,
          (activeAgent.config_json?.validation ?? null) as ValidationReport | null
        ) === "success"
      : false;
    return computeSequentialStepComplete(intrinsic, step6);
  }, [
    form,
    nameConflict,
    nameCheck.checking,
    kind,
    capabilities,
    filePolicy,
    stagedFiles,
    actions,
    links,
    widgetPlan,
    needsApiStep,
    apiBindings,
    permissions,
    permissionsAllowDefault,
    activeAgent,
  ]);

  const stepValidationCtx: WizardStepContext = useMemo(
    () => ({
      form,
      nameConflict,
      nameChecking: nameCheck.checking,
      kind,
      capabilities,
      filePolicy,
      stagedFiles,
      actions,
      links,
      widgetPlan,
      needsApiStep,
      apiBindings,
      permissions,
      permissionsAllowDefault,
    }),
    [
      form,
      nameConflict,
      nameCheck.checking,
      kind,
      capabilities,
      filePolicy,
      stagedFiles,
      actions,
      links,
      widgetPlan,
      needsApiStep,
      apiBindings,
      permissions,
      permissionsAllowDefault,
    ]
  );

  function refreshPublishedAgent() {
    const slug = publishedAgent?.slug ?? resumeSlug;
    if (!slug) return;
    void fetchAgentBySlug(slug).then(setPublishedAgent);
  }

  async function persistAgent(): Promise<Agent> {
    const { capabilities: publishCaps, filePolicy: publishFilePolicy } = resolvePublishConfig();
    const clampedCaps = resolvePublishCapabilities(publishCaps);
    const preparedActions = prepareActionsForPublish(actions);
    const toolNames = deriveAgentToolNames(preparedActions);
    const existing = publishedAgent ?? resumedAgent ?? null;

    if (existing) {
      const updated = await updateAgent(existing.id, {
        ...form,
        kind,
        capabilities: clampedCaps,
        file_policy: publishFilePolicy,
        agent_link_policy: linkPolicy,
        tool_names: toolNames,
        actions: preparedActions,
        templates,
        links,
        api_bindings: resolvePublishApiBindings(),
        knowledge_bindings: knowledgeBindings.dataset_ids.length ? knowledgeBindings : undefined,
        config_json: buildWizardConfigJson(widgetPlan, ioExamples, executionPrecision),
      });
      if (permissions.length) {
        await replaceAgentPermissions(updated.id, permissions);
      }
      for (const file of stagedFiles) {
        await uploadAgentFile(updated.id, file);
      }
      const hasInstructionAttachment = stagedFiles.some((f) =>
        f.name.startsWith("instruction__")
      );
      await refreshAgentInstructions(updated.id, {
        instruction_text: form.system_prompt || undefined,
        force: hasInstructionAttachment || Boolean(form.system_prompt?.trim()),
      });
      return updated;
    }

    const agent = await createAgentWithPermissions({
      ...form,
      kind,
      capabilities: clampedCaps,
      file_policy: publishFilePolicy,
      agent_link_policy: linkPolicy,
      tool_names: toolNames,
      actions: preparedActions,
      templates,
      links,
      permissions: permissions.length ? permissions : undefined,
      api_bindings: resolvePublishApiBindings(),
      knowledge_bindings: knowledgeBindings.dataset_ids.length ? knowledgeBindings : undefined,
      config_json: buildWizardConfigJson(widgetPlan, ioExamples, executionPrecision),
    });
    for (const file of stagedFiles) {
      await uploadAgentFile(agent.id, file);
    }
    const hasInstructionAttachment = stagedFiles.some((f) => f.name.startsWith("instruction__"));
    const compiled = await refreshAgentInstructions(agent.id, {
      instruction_text: form.system_prompt || undefined,
      force: hasInstructionAttachment || Boolean(form.system_prompt?.trim()),
    });
    const instructionMeta = compiled.config_json?.instruction_prompt as
      | { status?: string; rule_count?: number }
      | undefined;
    if (hasInstructionAttachment && instructionMeta?.status === "failed") {
      await appAlert({
        title: "هشدار دستورالعمل",
        message:
          "فایل دستورالعمل پیوست شد اما کامپایل کامل نشد. قبل از تست، دوباره ذخیره کنید یا API مدل را بررسی کنید.",
        tone: "danger",
      });
    }
    try {
      sessionStorage.setItem("ma_wizard_created_slug", agent.slug);
    } catch {
      /* private mode */
    }
    // M1.5 hook point 1: persist verified slug + training phase to run state (API is authoritative).
    void patchRunState(
      { type: "wizard", key: wizardScopeKey() },
      { slug: agent.slug, phase: "training", payload: { agent_slug_verified: true, source_of_slug: "api" } }
    ).catch(() => undefined);
    clearDraft();
    setPublishedAgent(agent);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("slug", agent.slug);
      window.history.replaceState(null, "", url.toString());
    } catch {
      /* ignore */
    }
    return agent;
  }

  async function enterTestingStep() {
    const block = collectPublishBlock();
    if (block) {
      if (block.step) goToWizardStep(block.step, block.fallback);
      await appAlert({ title: block.title, message: block.message, tone: "danger" });
      return;
    }
    const permBlock = getStepBlockMessage(
      visibleSteps.indexOf("دسترسی‌ها"),
      stepValidationCtx
    );
    if (permBlock) {
      await appAlert({ title: permBlock.title, message: permBlock.message, tone: "danger" });
      return;
    }

    const testingIdx = visibleSteps.indexOf("تست و انتشار");
    setBootstrapping(true);
    setBootstrapStage("persist");
    try {
      let agent = publishedAgent ?? resumedAgent ?? null;
      if (editMode || !agent) {
        agent = await persistAgent();
      }
      setBootstrapStage("runtime");
      agent = await prepareAgentRuntime(agent.id);
      setBootstrapStage("training");
      agent = await startAgentTraining(agent.id);
      setPublishedAgent(agent);
      if (testingIdx >= 0) setStep(testingIdx);
    } catch (e) {
      const apiErr = handleApiError(e, { event: "agent.wizard.bootstrap" });
      const detail = apiErr.requestId
        ? `${apiErr.message}\n\nشناسه درخواست: ${apiErr.requestId}`
        : apiErr.message;
      await appAlert({
        title: "خطا در آماده‌سازی تست",
        message: detail,
        tone: "danger",
      });
    } finally {
      setBootstrapping(false);
    }
  }

  async function publish() {
    const block = collectPublishBlock();
    if (block) {
      if (block.step) goToWizardStep(block.step, block.fallback);
      await appAlert({ title: block.title, message: block.message, tone: "danger" });
      return;
    }
    setSaving(true);
    try {
      await persistAgent();
      await appAlert({
        title: "ذخیره شد",
        message: "تغییرات ایجنت با موفقیت ذخیره شد.",
      });
    } catch (e) {
      const apiErr = handleApiError(e, { event: "agent.wizard.publish" });
      const detail = apiErr.requestId
        ? `${apiErr.message}\n\nشناسه درخواست: ${apiErr.requestId}`
        : apiErr.message;
      await appAlert({
        title: "خطا در انتشار",
        message: detail,
        tone: "danger",
      });
    } finally {
      setSaving(false);
    }
  }

  async function nextStep() {
    const block = getStepBlockMessage(step, stepValidationCtx);
    if (block) {
      void appAlert({ title: block.title, message: block.message, tone: "danger" });
      return;
    }

    const permissionsIdx = visibleSteps.indexOf("دسترسی‌ها");
    if (step === permissionsIdx) {
      await enterTestingStep();
      return;
    }

    setStep((s) => Math.min(s + 1, visibleSteps.length - 1));
  }

  function prevStep() {
    setStep((s) => Math.max(s - 1, 0));
  }

  useEffect(() => {
    if (!onPublishStep || activeAgent || bootstrapping || saving || autoBootstrapRef.current) {
      return;
    }
    autoBootstrapRef.current = true;
    void enterTestingStep().finally(() => {
      autoBootstrapRef.current = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bootstrap once when opening test step
  }, [onPublishStep, activeAgent, bootstrapping, saving]);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
        {!isSuperuser && (
          <div
            className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
            data-ma-support="wizard-admin-only"
            role="alert"
          >
            ساخت ایجنت فقط برای ادمین پلتفرم مجاز است — از نوار کنار «نمای ادمین» را فعال کنید
            یا از مدیر سیستم بخواهید.
          </div>
        )}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-stone-900">
              {editMode ? "ویرایش ایجنت" : "ساخت ایجنت جدید"}
            </h1>
            <p className="mt-1 max-w-xl text-sm text-stone-500">
              شش مرحله — از اطلاعات پایه تا تست و انتشار — در همین ویزارد انجام می‌شود.
            </p>
            <AutosaveLine savedAt={draftSavedAt} />
          </div>
          <div className="flex flex-wrap gap-2">
            {!onPublishStep ? (
              <Button variant="secondary" onClick={openFinalReview}>
                مرور نهایی
              </Button>
            ) : editMode ? (
              <Button
                data-ma-support="wizard-save"
                onClick={() => void publish()}
                disabled={
                  saving ||
                  bootstrapping ||
                  !form.name ||
                  nameConflict ||
                  nameCheck.checking
                }
              >
                {saving ? "در حال ذخیره…" : "ذخیره تغییرات"}
              </Button>
            ) : null}
          </div>
        </div>

        {restorePromptAt && (
          <Card className="border-brand-300 bg-brand-50/60">
            <CardBody className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-stone-700">
                یک پیش‌نویس ذخیره‌شده پیدا شد. می‌خواهید ادامه دهید؟
                <span className="mr-1 text-xs text-stone-400">
                  (فایل‌های پیوست ذخیره نمی‌شوند)
                </span>
              </p>
              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    const draft = loadDraft();
                    if (draft) {
                      applyDraft(draft.data);
                      setDraftSavedAt(draft.savedAt);
                    }
                    draftReady.current = true;
                    setRestorePromptAt(null);
                  }}
                >
                  بازیابی پیش‌نویس
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    clearDraft();
                    draftReady.current = true;
                    setRestorePromptAt(null);
                  }}
                >
                  شروع تازه
                </Button>
              </div>
            </CardBody>
          </Card>
        )}

        <WizardProcessStepper
          steps={visibleSteps}
          currentIndex={step}
          stepComplete={stepComplete}
          onStepClick={(i) => {
            if (
              !canNavigateToStep(i, stepComplete, step, {
                lastStepRequiresAgent: true,
                hasActiveAgent: Boolean(activeAgent),
              })
            ) {
              const block = getStepBlockMessage(
                i > step ? step : Math.max(0, i - 1),
                stepValidationCtx
              );
              if (block) {
                void appAlert({ title: block.title, message: block.message, tone: "danger" });
              }
              return;
            }
            setStep(i);
          }}
        />

        <Card>
          <CardBody className="space-y-4">
            <PanelTransition transitionKey={String(stepIndex)} direction={panelDirection} preset="fade" mode="wait">
              <div className="space-y-4" data-ma-support="wizard-step-body">
                <WizardStepIntro
                  title={stepHelp.title}
                  description={stepHelp.description}
                  tip={stepHelp.tip}
                />

                {stepIndex === "اطلاعات پایه" && (
                  <>
                    <WizardField
                      label={FIELD_HELP.name.label}
                      hint={FIELD_HELP.name.hint}
                    >
                      <Input
                        data-ma-support="wizard-name"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        placeholder={FIELD_HELP.name.placeholder}
                        aria-invalid={nameConflict}
                        className={nameConflict ? "border-accent-red focus:border-accent-red" : undefined}
                      />
                      {form.name.trim().length >= 2 && (
                        <div className="mt-1.5 space-y-0.5">
                          {nameCheck.checking ? (
                            <p
                              className="text-xs text-stone-400"
                              data-ma-support="wizard-name-checking"
                            >
                              در حال بررسی نام…
                            </p>
                          ) : nameConflict ? (
                            <p
                              className="text-xs font-medium text-accent-red"
                              data-ma-support="wizard-name-error"
                            >
                              ایجنت با شناسه «{nameCheck.slug}» از قبل وجود دارد — نام دیگری انتخاب کنید.
                            </p>
                          ) : nameCheck.slug ? (
                            <p
                              className="text-xs text-brand-700"
                              data-ma-support="wizard-name-slug-preview"
                            >
                              شناسه پیشنهادی: {nameCheck.slug} · در دسترس (هنوز ذخیره نشده)
                            </p>
                          ) : null}
                        </div>
                      )}
                    </WizardField>
                    <WizardField
                      label={FIELD_HELP.description.label}
                      hint={FIELD_HELP.description.hint}
                    >
                      <Textarea
                        data-ma-support="wizard-description"
                        value={form.description}
                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                        rows={3}
                        placeholder={FIELD_HELP.description.placeholder}
                      />
                    </WizardField>
                    <WizardField
                      label={FIELD_HELP.department.label}
                      hint={FIELD_HELP.department.hint}
                    >
                      <select
                        data-ma-support="wizard-department"
                        className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm"
                        value={form.department}
                        onChange={(e) => setForm({ ...form, department: e.target.value })}
                      >
                        {DEPARTMENTS.map((d) => (
                          <option key={d.value} value={d.value}>
                            {d.label}
                          </option>
                        ))}
                      </select>
                    </WizardField>
                    <ModelPicker
                      value={form.model_name}
                      onChange={(model_name) => setForm((f) => ({ ...f, model_name }))}
                    />
                    <WizardTemperatureField
                      value={form.temperature}
                      onChange={(temperature) => setForm((f) => ({ ...f, temperature }))}
                    />
                  </>
                )}

                {stepIndex === "دستورالعمل ایجنت" && (
                  <div className="space-y-6">
                    <InstructionPromptField
                      label={FIELD_HELP.systemPrompt.label}
                      hint={FIELD_HELP.systemPrompt.hint}
                      placeholder={FIELD_HELP.systemPrompt.placeholder}
                      textareaSupportId="wizard-system-prompt"
                      value={form.system_prompt}
                      onChange={(v) => setForm({ ...form, system_prompt: v })}
                      files={stagedFiles}
                      onFilesChange={setStagedFiles}
                      filePolicy={instructionFilePolicy}
                      onSuggest={suggestPrompt}
                      suggesting={suggestingPrompt}
                      suggestDisabled={!form.name.trim()}
                    />
                    {capabilities.actions_enabled && (
                      <ActionRepeater actions={actions} onChange={setActions} />
                    )}
                    {capabilities.templates_enabled && (
                      <TemplateRepeater templates={templates} onChange={setTemplates} />
                    )}
                    <div className="space-y-3 border-t border-stone-100 pt-6">
                      <p className="text-sm font-semibold text-stone-800">منابع دانش و API</p>
                      <KnowledgeSourcePicker
                        knowledgeBindings={knowledgeBindings}
                        onKnowledgeChange={setKnowledgeBindings}
                        apiBindings={apiBindings}
                        onApiChange={handleApiBindingsChange}
                      />
                    </div>
                  </div>
                )}

                {stepIndex === "ورودی و خروجی" && (
                  <div className="space-y-6">
                    <WizardIoPanel
                      stagedFiles={stagedFiles}
                      onFilesChange={setStagedFiles}
                      filePolicy={filePolicy}
                      ioExamples={ioExamples}
                      onIoExamplesChange={setIoExamples}
                    />

                    <details className="group rounded-2xl border border-stone-200 bg-white shadow-sm">
                      <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4">
                        <div>
                          <span className="text-sm font-bold text-stone-800">
                            تنظیمات پیشرفته
                          </span>
                          <p className="mt-0.5 text-xs text-stone-500">
                            نوع ایجنت، قابلیت‌ها، API خارجی، سیاست فایل و لینک ایجنت‌ها.
                          </p>
                        </div>
                        <span className="text-xs text-stone-400 transition-transform duration-200 group-open:rotate-180">
                          ▾
                        </span>
                      </summary>
                      <div className="space-y-4 border-t border-stone-100 px-5 py-5">
                        {(kind !== "chat" || showAdvancedIo) && (
                          <Card>
                            <CardHeader>
                              <h4 className="font-bold">توانایی‌ها و ورودی/خروجی</h4>
                              <p className="mt-1 text-xs font-normal text-stone-500">
                                قابلیت‌های اضافه مثل فایل، API و فراخوانی ایجنت.
                              </p>
                            </CardHeader>
                            <CardBody className="space-y-4">
                              <CapabilityToggles
                                kind={kind}
                                value={capabilities}
                                onChange={updateCapabilities}
                              />
                              {shouldShowAgentLinks(kind, capabilities) && (
                                <LinkedAgentsPicker
                                  agents={allAgents}
                                  links={links}
                                  supervisorMode={kind === "supervisor"}
                                  canCallAgents={capabilities.can_call_agents}
                                  onChange={setLinks}
                                />
                              )}
                            </CardBody>
                          </Card>
                        )}
                        {kind === "chat" && !showAdvancedIo && (
                          <Button
                            type="button"
                            variant="secondary"
                            className="text-sm"
                            onClick={() => setShowAdvancedIo(true)}
                          >
                            تنظیمات پیشرفته (فایل، API، …)
                          </Button>
                        )}
                        {needsApiStep && (
                          <div className="space-y-6">
                            <ExternalApiManager compact />
                          </div>
                        )}
                        {capabilities.file_upload_enabled && (
                          <FilePolicyForm value={filePolicy} onChange={setFilePolicy} />
                        )}
                      </div>

                      <div className="border-t border-stone-100 px-5 py-4">
                        <p className="mb-2 text-xs font-semibold text-stone-600">نوع ایجنت</p>
                        <KindPicker value={kind} onChange={applyKind} />
                      </div>

                      <div className="border-t border-stone-100 px-5 py-4">
                        <p className="mb-2 text-xs font-semibold text-stone-600">دقت اجرا</p>
                        <PrecisionPicker
                          value={executionPrecision}
                          onChange={setExecutionPrecision}
                        />
                      </div>
                    </details>
                  </div>
                )}

                {stepIndex === "هشدار و بازبینی" && (
                  <ReviewAlertsPlanForm value={widgetPlan} onChange={setWidgetPlan} />
                )}

                {stepIndex === "دسترسی‌ها" && (
                  <div className="space-y-4">
                    {bootstrapping ? (
                      <WizardBootstrapLoading stageId={bootstrapStage} />
                    ) : (
                      <>
                    <p className="text-sm leading-relaxed text-stone-600">
                      فقط افرادی که تیک می‌خورند می‌توانند این ایجنت را ببینند و اجرا کنند.
                    </p>
                    <p
                      className="text-xs font-medium text-brand-800"
                      data-ma-support="wizard-permissions-count"
                    >
                      {permissionsAllowDefault
                        ? "دسترسی پیش‌فرض سازمان فعال است"
                        : `${permissions.length} کاربر انتخاب شده`}
                    </p>
                    <label className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50/80 p-3 text-sm">
                      <input
                        type="checkbox"
                        data-ma-support="wizard-permissions-default"
                        checked={permissionsAllowDefault}
                        onChange={(e) => setPermissionsAllowDefault(e.target.checked)}
                      />
                      <span>دسترسی پیش‌فرض سازمان (بدون محدودیت کاربر خاص)</span>
                    </label>
                    <div className="max-h-64 space-y-2 overflow-y-auto">
                      {users.map((u, userIdx) => {
                        const grant = permissions.find((p) => p.user_id === u.id);
                        const selected = Boolean(grant);
                        return (
                          <label
                            key={u.id}
                            className="flex flex-wrap items-center gap-3 rounded-xl border border-stone-200 p-3"
                          >
                            <input
                              type="checkbox"
                              data-ma-support={
                                userIdx === 0 ? "wizard-permissions-user" : undefined
                              }
                              checked={selected}
                              onChange={() => {
                                if (selected) {
                                  setPermissions((p) => p.filter((x) => x.user_id !== u.id));
                                } else {
                                  setPermissions((p) => [
                                    ...p,
                                    { user_id: u.id, can_invoke: true, can_configure: false },
                                  ]);
                                }
                              }}
                            />
                            <span className="min-w-[140px] flex-1 font-medium">
                              {u.full_name ?? u.email}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                      </>
                    )}
                  </div>
                )}

                {stepIndex === "تست و انتشار" && (
                  <div className="space-y-4 text-sm">
                    {bootstrapping ? (
                      <WizardBootstrapLoading stageId={bootstrapStage} />
                    ) : activeAgent ? (
                      <WizardPostPublishPanel
                        agent={activeAgent}
                        stepLabel={suggestPostPublishStep(activeAgent)}
                        onAgentRefresh={refreshPublishedAgent}
                      />
                    ) : (
                      <p className="py-8 text-center text-stone-500">در حال بارگذاری…</p>
                    )}
                  </div>
                )}
              </div>
            </PanelTransition>

            <div className="flex justify-between pt-4">
              <Button
                variant="secondary"
                disabled={step === 0}
                data-ma-support="wizard-prev"
                onClick={prevStep}
              >
                گام قبل
              </Button>
              {step < visibleSteps.length - 1 ? (
                <Button
                  data-ma-support="wizard-next"
                  onClick={() => void nextStep()}
                  disabled={
                    bootstrapping ||
                    saving ||
                    (step === permissionsStepIdx &&
                      (!form.name || nameConflict || nameCheck.checking))
                  }
                >
                  {bootstrapping
                    ? "در حال آماده‌سازی…"
                    : step === permissionsStepIdx
                      ? "شروع تست"
                      : "گام بعد"}
                </Button>
              ) : null}
            </div>
          </CardBody>
        </Card>
    </div>
  );
}