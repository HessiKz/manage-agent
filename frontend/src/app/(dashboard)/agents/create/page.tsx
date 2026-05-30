"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { prepareActionsForPublish } from "@/lib/action-inputs";
import { appAlert } from "@/lib/app-dialog";
import {
  createAgentWithPermissions,
  checkAgentNameAvailable,
  fetchAllAgents,
  fetchMe,
  fetchTools,
  fetchUsers,
  startAgentValidation,
  suggestSystemPrompt,
  uploadAgentFile,
} from "@/lib/api";
import {
  AGENT_EXAMPLES,
  loadExampleSampleFiles,
  type AgentExample,
} from "@/lib/agent-examples";
import {
  DEFAULT_FILE_POLICY,
  EMPTY_API_BINDINGS,
  filePolicyForCapabilities,
  FILE_POLICY_WIZARD_ATTACHMENTS,
  KIND_LABELS,
  KIND_PRESETS,
  estimateCostMultiplier,
} from "@/lib/agent-presets";
import { ExternalApiPicker } from "@/components/agents/external-api-picker";
import { deptLabel, statusLabel } from "@/lib/utils";
import { PanelTransition } from "@/components/motion/transitions";
import { AgentToolPicker } from "@/components/agents/agent-tool-picker";
import { KindPicker } from "@/components/agents/kind-picker";
import { CapabilityToggles } from "@/components/agents/capability-toggles";
import { WizardField } from "@/components/agents/wizard-field";
import { WizardStepIntro } from "@/components/agents/wizard-step-intro";
import { FIELD_HELP, WIZARD_STEP_HELP } from "@/lib/wizard-step-help";
import { FilePolicyForm, validateFilePolicy } from "@/components/agents/file-policy-form";
import { ActionRepeater } from "@/components/agents/action-repeater";
import { TemplateRepeater } from "@/components/agents/template-repeater";
import { LinkedAgentsPicker } from "@/components/agents/linked-agents-picker";
import { WizardStagedFiles } from "@/components/agents/wizard-staged-files";
import { AutosaveLine } from "./autosave-line";
import type {
  AgentAction,
  AgentApiBindings,
  AgentCapabilities,
  AgentFilePolicy,
  AgentKind,
  AgentLink,
  AgentLinkPolicy,
  AgentPermissionGrantInput,
  AgentPromptTemplate,
} from "@/types";

const STEPS = [
  "پایه",
  "نوع و توانایی",
  "اتصال API",
  "فایل و سیاست",
  "منطق و دستور",
  "دسترسی‌ها",
  "بازبینی",
];

const DEPARTMENTS = [
  { value: "finance", label: "مالی" },
  { value: "hr", label: "منابع انسانی" },
  { value: "support", label: "پشتیبانی" },
  { value: "sales", label: "فروش" },
  { value: "ops", label: "عملیات" },
];

export default function AgentWizardPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const prevStepRef = useRef(0);

  const [kind, setKind] = useState<AgentKind>("chat");
  const [capabilities, setCapabilities] = useState<AgentCapabilities>(KIND_PRESETS.chat);
  const [filePolicy, setFilePolicy] = useState<AgentFilePolicy>(DEFAULT_FILE_POLICY);
  const [linkPolicy] = useState<AgentLinkPolicy>({
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
    model_name: "auto",
    temperature: 0.2,
  });
  const [template, setTemplate] = useState("محاسبه حقوق");
  const [variables, setVariables] = useState([
    { key: "overtime_threshold", value: "12" },
    { key: "period", value: "۱۴۰۲ بهمن" },
  ]);
  const [policies, setPolicies] = useState({
    working_hours_only: true,
    mfa_required: true,
    monthly_token_cap: "840K",
  });
  const [permissions, setPermissions] = useState<AgentPermissionGrantInput[]>([]);
  const [apiBindings, setApiBindings] = useState<AgentApiBindings>(EMPTY_API_BINDINGS);
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);

  const [loadingExample, setLoadingExample] = useState(false);
  const [appliedExample, setAppliedExample] = useState<string | null>(null);
  const [suggestingPrompt, setSuggestingPrompt] = useState(false);
  const [nameCheck, setNameCheck] = useState<{
    slug: string;
    available: boolean;
    checking: boolean;
  }>({ slug: "", available: true, checking: false });
  const nameCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: tools = [] } = useQuery({ queryKey: ["tools"], queryFn: fetchTools });
  const { data: users = [] } = useQuery({ queryKey: ["users"], queryFn: fetchUsers });
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  const isAdmin = Boolean(me?.is_superuser);
  const { data: allAgents = [] } = useQuery({
    queryKey: ["agents-all"],
    queryFn: async () => (await fetchAllAgents({ page_size: 100 })).items,
  });

  const panelDirection = step >= prevStepRef.current ? "forward" : "backward";
  useEffect(() => {
    prevStepRef.current = step;
  }, [step]);

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

  const nameConflict = form.name.trim().length >= 2 && !nameCheck.checking && !nameCheck.available;

  const needsApiStep = Boolean(capabilities.external_apis_enabled);

  const visibleSteps = useMemo(() => {
    let s = [...STEPS];
    if (!needsApiStep) {
      s = s.filter((x) => x !== "اتصال API");
    }
    if (!capabilities.file_upload_enabled) {
      s = s.filter((x) => x !== "فایل و سیاست");
    }
    return s;
  }, [capabilities.file_upload_enabled, needsApiStep]);

  const stepIndex = visibleSteps[step] ?? STEPS[step];
  const stepHelp = WIZARD_STEP_HELP[stepIndex] ?? WIZARD_STEP_HELP["پایه"];
  const costMult = estimateCostMultiplier(capabilities);

  const instructionFilePolicy = useMemo(
    () => (capabilities.file_upload_enabled ? filePolicy : FILE_POLICY_WIZARD_ATTACHMENTS),
    [capabilities.file_upload_enabled, filePolicy]
  );

  function resolvePublishConfig() {
    if (stagedFiles.length === 0 || capabilities.file_upload_enabled) {
      return { capabilities, filePolicy };
    }
    const caps = { ...capabilities, file_upload_enabled: true };
    const fpPreset = filePolicyForCapabilities(caps, form.tool_names);
    return {
      capabilities: caps,
      filePolicy: fpPreset
        ? { ...DEFAULT_FILE_POLICY, ...fpPreset }
        : FILE_POLICY_WIZARD_ATTACHMENTS,
    };
  }

  function applyKind(next: AgentKind, caps: AgentCapabilities) {
    setKind(next);
    setCapabilities(caps);
    const fpPreset = filePolicyForCapabilities(caps, form.tool_names);
    if (fpPreset) setFilePolicy({ ...DEFAULT_FILE_POLICY, ...fpPreset });
    if (!caps.external_apis_enabled) {
      setApiBindings(EMPTY_API_BINDINGS);
    }
  }

  async function applyExample(example: AgentExample) {
    setLoadingExample(true);
    try {
      setKind(example.kind);
      setCapabilities(example.capabilities);
      setFilePolicy(example.filePolicy ?? DEFAULT_FILE_POLICY);
      setForm({ ...example.form });
      setActions(example.actions.map((a, i) => ({ ...a, order_index: i })));
      setTemplates(example.templates.map((t, i) => ({ ...t, order_index: i })));
      setLinks([]);
      setApiBindings(EMPTY_API_BINDINGS);
      const files = await loadExampleSampleFiles(example);
      setStagedFiles(files);
      setAppliedExample(example.id);
      setStep(0);
    } finally {
      setLoadingExample(false);
    }
  }

  async function suggestPrompt() {
    if (!form.name.trim()) {
      await appAlert({ title: "نام ایجنت", message: "ابتدا نام ایجنت را در مرحله «پایه» وارد کنید." });
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

  async function publish() {
    if (nameConflict) {
      await appAlert({
        title: "نام تکراری",
        message: "این نام قبلاً استفاده شده — لطفاً نام دیگری انتخاب کنید.",
      });
      return;
    }
    const { capabilities: publishCaps, filePolicy: publishFilePolicy } = resolvePublishConfig();
    if (publishCaps.file_upload_enabled) {
      const policyErr = validateFilePolicy(publishFilePolicy);
      if (policyErr) {
        await appAlert({ title: "تنظیمات فایل", message: policyErr });
        return;
      }
    }
    if (
      needsApiStep &&
      !apiBindings.service_ids.length &&
      !apiBindings.endpoint_ids.length
    ) {
      await appAlert({
        title: "اتصال API",
        message: "حداقل یک سرویس یا endpoint API انتخاب کنید.",
      });
      return;
    }
    setSaving(true);
    try {
      const agent = await createAgentWithPermissions({
        ...form,
        kind,
        capabilities: publishCaps,
        file_policy: publishFilePolicy,
        agent_link_policy: linkPolicy,
        actions: prepareActionsForPublish(actions, form.tool_names),
        templates,
        links,
        permissions: permissions.length ? permissions : undefined,
        api_bindings: needsApiStep ? apiBindings : undefined,
      });
      for (const file of stagedFiles) {
        await uploadAgentFile(agent.id, file);
      }
      await startAgentValidation(agent.id);
      const qs = new URLSearchParams({
        slug: agent.slug,
        name: agent.name,
      });
      router.push(`/agents/create/testing?${qs.toString()}`);
    } catch {
      await appAlert({
        title: "خطا",
        message: "خطا در ایجاد ایجنت",
        tone: "danger",
      });
    } finally {
      setSaving(false);
    }
  }

  function nextStep() {
    setStep((s) => Math.min(s + 1, visibleSteps.length - 1));
  }

  function prevStep() {
    setStep((s) => Math.max(s - 1, 0));
  }

  return (
    <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-stone-900">ساخت ایجنت جدید</h1>
            <p className="mt-1 max-w-xl text-sm text-stone-500">
              مرحله‌به‌مرحله تنظیم کنید — در هر بخش توضیح کوتاه می‌بینید؛ نیازی به دانش فنی نیست.
            </p>
            <AutosaveLine />
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setStep(visibleSteps.length - 1)}>
              پیش‌نمایش
            </Button>
            <Button onClick={publish} disabled={saving || !form.name || nameConflict || nameCheck.checking}>
              {saving ? "در حال انتشار…" : "انتشار"}
            </Button>
          </div>
        </div>

        {isAdmin && (
          <Card className="border-dashed border-brand-300 bg-brand-50/40">
            <CardBody className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="flex items-center gap-1.5 text-sm font-bold text-stone-900">
                    <Sparkles className="h-4 w-4 text-brand-600" />
                    استفاده از نمونه (ویژه ادمین)
                  </p>
                  <p className="mt-0.5 text-xs text-stone-500">
                    یک نمونه را انتخاب کنید تا همه‌ی مراحل با داده آماده پر شود — برای تست سریع.
                    فایل‌های لازم هم خودکار پیوست می‌شوند.
                  </p>
                </div>
                {loadingExample && (
                  <span className="text-xs text-brand-700">در حال بارگذاری نمونه…</span>
                )}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {AGENT_EXAMPLES.map((ex) => {
                  const active = appliedExample === ex.id;
                  return (
                    <button
                      key={ex.id}
                      type="button"
                      disabled={loadingExample}
                      onClick={() => applyExample(ex)}
                      className={`rounded-xl border p-3 text-right transition-colors disabled:opacity-60 ${
                        active
                          ? "border-brand-500 bg-white shadow-glow"
                          : "border-stone-200 bg-white hover:border-brand-300"
                      }`}
                    >
                      <p className="text-sm font-semibold text-stone-900">{ex.label}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-stone-500">{ex.summary}</p>
                      {ex.sampleFiles.length > 0 && (
                        <span className="mt-1.5 inline-flex items-center rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-semibold text-brand-700">
                          {ex.sampleFiles.length} فایل نمونه
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              {appliedExample && (
                <p className="text-xs font-medium text-brand-700">
                  نمونه اعمال شد — می‌توانید مراحل را بازبینی و سپس «انتشار» کنید.
                </p>
              )}
            </CardBody>
          </Card>
        )}

        <div className="flex flex-wrap gap-2">
          {visibleSteps.map((label, i) => (
            <button
              key={label}
              type="button"
              onClick={() => setStep(i)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors duration-150 ${
                i === step ? "bg-brand-600 text-white" : "bg-stone-100 text-stone-700 hover:bg-stone-200"
              }`}
            >
              {i + 1}. {label}
            </button>
          ))}
        </div>

        <Card>
          <CardBody className="space-y-4">
            <PanelTransition transitionKey={String(stepIndex)} direction={panelDirection} preset="fade" mode="wait">
              <div className="space-y-4">
                <WizardStepIntro
                  title={stepHelp.title}
                  description={stepHelp.description}
                  tip={stepHelp.tip}
                />

                {stepIndex === "پایه" && (
                  <>
                    <WizardField
                      label={FIELD_HELP.name.label}
                      hint={FIELD_HELP.name.hint}
                    >
                      <Input
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        placeholder={FIELD_HELP.name.placeholder}
                        aria-invalid={nameConflict}
                        className={nameConflict ? "border-accent-red focus:border-accent-red" : undefined}
                      />
                      {form.name.trim().length >= 2 && (
                        <div className="mt-1.5 space-y-0.5">
                          {nameCheck.checking ? (
                            <p className="text-xs text-stone-400">در حال بررسی نام…</p>
                          ) : nameConflict ? (
                            <p className="text-xs font-medium text-accent-red">
                              ایجنت با شناسه «{nameCheck.slug}» از قبل وجود دارد — نام دیگری انتخاب کنید.
                            </p>
                          ) : nameCheck.slug ? (
                            <p className="text-xs text-brand-700">شناسه: {nameCheck.slug} · در دسترس</p>
                          ) : null}
                        </div>
                      )}
                    </WizardField>
                    <WizardField
                      label={FIELD_HELP.description.label}
                      hint={FIELD_HELP.description.hint}
                    >
                      <Textarea
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
                    <details className="rounded-xl border border-stone-200 bg-stone-50/50 px-4 py-3">
                      <summary className="cursor-pointer text-sm font-semibold text-stone-700">
                        تنظیمات پیشرفته مدل (اختیاری)
                      </summary>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <WizardField label={FIELD_HELP.model.label} hint={FIELD_HELP.model.hint}>
                          <Input
                            value={form.model_name}
                            onChange={(e) => setForm({ ...form, model_name: e.target.value })}
                            placeholder={FIELD_HELP.model.placeholder}
                            dir="ltr"
                            className="text-left font-mono text-sm"
                          />
                        </WizardField>
                        <WizardField
                          label={FIELD_HELP.temperature.label}
                          hint={FIELD_HELP.temperature.hint}
                        >
                          <Input
                            type="number"
                            value={form.temperature}
                            onChange={(e) =>
                              setForm({ ...form, temperature: Number(e.target.value) })
                            }
                            min={0}
                            max={2}
                            step={0.1}
                          />
                        </WizardField>
                      </div>
                    </details>
                  </>
                )}

                {stepIndex === "نوع و توانایی" && (
                  <>
                    <KindPicker value={kind} onChange={applyKind} />
                    <Card>
                      <CardHeader>
                        <h4 className="font-bold">توانایی‌های اضافه</h4>
                        <p className="mt-1 text-xs font-normal text-stone-500">
                          هر مورد یک قابلیت جداست — مثلاً «آپلود فایل» یا «اتصال API». نوع ایجنت را
                          عوض نکنید؛ فقط روشن/خاموش کنید.
                        </p>
                      </CardHeader>
                      <CardBody>
                        <CapabilityToggles value={capabilities} onChange={setCapabilities} />
                      </CardBody>
                    </Card>
                  </>
                )}

                {stepIndex === "اتصال API" && (
                  <div className="space-y-3">
                    <p className="text-sm leading-relaxed text-stone-600">
                      سرویس بیرونی یعنی برنامه دیگری در شرکت (مثلاً سامانه بانک یا پرسنلی). ایجنت
                      فقط به مواردی که اینجا انتخاب کنید دسترسی دارد.
                    </p>
                    <ExternalApiPicker value={apiBindings} onChange={setApiBindings} />
                  </div>
                )}

                {stepIndex === "فایل و سیاست" && (
                  <div className="space-y-4">
                    <FilePolicyForm value={filePolicy} onChange={setFilePolicy} />
                    <WizardStagedFiles
                      files={stagedFiles}
                      onChange={setStagedFiles}
                      filePolicy={filePolicy}
                    />
                  </div>
                )}

                {stepIndex === "منطق و دستور" && (
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-stone-800">
                            {FIELD_HELP.systemPrompt.label}
                          </p>
                          <p className="mt-1 text-xs text-stone-500">{FIELD_HELP.systemPrompt.hint}</p>
                        </div>
                        <Button
                          variant="secondary"
                          className="shrink-0"
                          disabled={suggestingPrompt || !form.name.trim()}
                          onClick={suggestPrompt}
                        >
                          <Sparkles className="h-4 w-4" />
                          {suggestingPrompt ? "در حال پیشنهاد…" : "پیشنهاد متن"}
                        </Button>
                      </div>
                      <Textarea
                        value={form.system_prompt}
                        onChange={(e) => setForm({ ...form, system_prompt: e.target.value })}
                        rows={6}
                        placeholder={FIELD_HELP.systemPrompt.placeholder}
                      />
                    </div>

                    <WizardStagedFiles
                      files={stagedFiles}
                      onChange={setStagedFiles}
                      filePolicy={instructionFilePolicy}
                      title="فایل‌های مرجع دستورالعمل (اختیاری)"
                      description="قالب اکسل، PDF راهنما یا هر فایلی که ایجنت باید طبق آن عمل کند — بعد از انتشار به ایجنت پیوست می‌شود."
                    />

                    {capabilities.actions_enabled && (
                      <ActionRepeater actions={actions} onChange={setActions} />
                    )}
                    {capabilities.templates_enabled && (
                      <TemplateRepeater templates={templates} onChange={setTemplates} />
                    )}
                    {(capabilities.can_call_agents || capabilities.supervisor_enabled) && (
                      <LinkedAgentsPicker
                        agents={allAgents}
                        links={links}
                        supervisorMode={capabilities.supervisor_enabled}
                        canCallAgents={capabilities.can_call_agents}
                        onChange={setLinks}
                      />
                    )}

                    <Card>
                      <CardHeader>
                        <h4 className="font-bold">امکانات کمکی (در صورت نیاز)</h4>
                        <p className="mt-1 text-xs font-normal text-stone-500">
                          اگر ایجنت باید فایل پردازش کند، گزارش بسازد یا داده پرسنلی بخواند — فقط
                          موارد لازم را فعال کنید.
                        </p>
                      </CardHeader>
                      <CardBody>
                        <AgentToolPicker
                          tools={tools}
                          selected={form.tool_names}
                          onChange={(slugs) => setForm((f) => ({ ...f, tool_names: slugs }))}
                          compact
                          wizardOnly
                        />
                      </CardBody>
                    </Card>
                  </div>
                )}

                {stepIndex === "دسترسی‌ها" && (
                  <div className="space-y-3">
                    <p className="text-sm leading-relaxed text-stone-600">
                      فقط افرادی که تیک می‌خورند می‌توانند این ایجنت را ببینند و اجرا کنند — حتی اگر
                      نقش کلی دیگری در سازمان داشته باشند.
                    </p>
                    <div className="max-h-64 space-y-2 overflow-y-auto">
                      {users.map((u) => {
                        const grant = permissions.find((p) => p.user_id === u.id);
                        const selected = Boolean(grant);
                        return (
                          <label
                            key={u.id}
                            className="flex flex-wrap items-center gap-3 rounded-xl border border-stone-200 p-3"
                          >
                            <input
                              type="checkbox"
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
                  </div>
                )}

                {stepIndex === "بازبینی" && (
                  <div className="space-y-4 text-sm">
                    <dl className="grid gap-2 sm:grid-cols-2">
                      <div className="rounded-xl bg-stone-50/80 px-3 py-2">
                        <dt className="text-xs text-stone-500">نام</dt>
                        <dd className="font-semibold text-stone-900">{form.name || "—"}</dd>
                      </div>
                      <div className="rounded-xl bg-stone-50/80 px-3 py-2">
                        <dt className="text-xs text-stone-500">نوع ایجنت</dt>
                        <dd className="font-semibold text-stone-900">{KIND_LABELS[kind]}</dd>
                      </div>
                      <div className="rounded-xl bg-stone-50/80 px-3 py-2 sm:col-span-2">
                        <dt className="text-xs text-stone-500">توانایی‌های فعال</dt>
                        <dd className="font-medium text-stone-800">
                          {capBadges.map((b) => b.label).join(" · ")}
                        </dd>
                      </div>
                      <div className="rounded-xl bg-stone-50/80 px-3 py-2">
                        <dt className="text-xs text-stone-500">دکمه‌های عملیاتی</dt>
                        <dd className="font-semibold text-stone-900">{actions.length || "ندارد"}</dd>
                      </div>
                      <div className="rounded-xl bg-stone-50/80 px-3 py-2">
                        <dt className="text-xs text-stone-500">میانبر گفت‌وگو</dt>
                        <dd className="font-semibold text-stone-900">{templates.length || "ندارد"}</dd>
                      </div>
                      <div className="rounded-xl bg-stone-50/80 px-3 py-2">
                        <dt className="text-xs text-stone-500">قابلیت‌های سیستم</dt>
                        <dd className="font-semibold text-stone-900">
                          {form.tool_names.length || "ندارد"}
                        </dd>
                      </div>
                      <div className="rounded-xl bg-stone-50/80 px-3 py-2">
                        <dt className="text-xs text-stone-500">اتصال ایجنت دیگر</dt>
                        <dd className="font-semibold text-stone-900">{links.length || "ندارد"}</dd>
                      </div>
                    </dl>
                    {needsApiStep && (
                      <p className="text-stone-600">
                        <strong>سرویس API:</strong> {apiSelectionCount} مورد انتخاب شده
                      </p>
                    )}
                    <div className="rounded-2xl border border-brand-100 bg-brand-50/50 p-4">
                      <p className="text-xs font-semibold text-stone-500">برآورد مصرف (نسبی)</p>
                      <p className="mt-1 text-sm text-stone-700">
                        ایجنت‌های پیچیده‌تر (سرپرست، API، چند ابزار) معمولاً هزینه بیشتری دارند.
                        ضریب فعلی: <strong>×{costMult.toFixed(1)}</strong>
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </PanelTransition>

            <div className="flex justify-between pt-4">
              <Button variant="secondary" disabled={step === 0} onClick={prevStep}>
                گام قبل
              </Button>
              {step < visibleSteps.length - 1 ? (
                <Button onClick={nextStep}>گام بعد</Button>
              ) : (
                <Button onClick={publish} disabled={saving || !form.name || nameConflict || nameCheck.checking}>
                  {saving ? "در حال انتشار…" : "انتشار"}
                </Button>
              )}
            </div>
          </CardBody>
        </Card>
      </div>

      <Card className="h-fit">
        <CardHeader>
          <h3 className="font-bold">پیش‌نمایش زنده</h3>
        </CardHeader>
        <CardBody className="space-y-3">
          <div className="flex flex-wrap gap-1">
            {capBadges.map((b) => (
              <Badge key={b.id} variant="muted">
                {b.label}
              </Badge>
            ))}
          </div>
          <Badge>{statusLabel("draft")}</Badge>
          <h4 className="text-lg font-bold">{form.name || "ایجنت جدید"}</h4>
          <p className="text-sm text-stone-500">
            {deptLabel(form.department)} · {template}
          </p>
          {capabilities.actions_enabled && actions.length > 0 && (
            <p className="text-xs text-stone-500">
              {actions.length} اقدام عملیاتی
            </p>
          )}
          {capabilities.file_upload_enabled && (
            <p className="text-xs text-brand-700">
              فایل: {filePolicy.min_files}–{filePolicy.max_files} · {filePolicy.max_file_size_mb}MB
            </p>
          )}
          {!capabilities.chat_enabled && (
            <p className="text-xs text-stone-400">گفت‌وگو غیرفعال — رابط اختصاصی</p>
          )}
          {needsApiStep && apiSelectionCount > 0 && (
            <p className="text-xs text-brand-700">{apiSelectionCount} اتصال API</p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
