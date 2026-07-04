"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ActionRepeater } from "@/components/agents/action-repeater";
import { CapabilityToggles } from "@/components/agents/capability-toggles";
import { ExternalApiPicker } from "@/components/agents/external-api-picker";
import { FilePolicyForm, validateFilePolicy } from "@/components/agents/file-policy-form";
import { InstructionPromptField } from "@/components/agents/instruction-prompt-field";
import { KindPicker } from "@/components/agents/kind-picker";
import { LinkedAgentsPicker } from "@/components/agents/linked-agents-picker";
import { TemplateRepeater } from "@/components/agents/template-repeater";
import { WidgetPlanForm } from "@/components/agents/widget-plan-form";
import { ReviewAlertsPlanForm } from "@/components/agents/review-alerts-plan-form";
import { WizardField } from "@/components/agents/wizard-field";
import { WizardStepIntro } from "@/components/agents/wizard-step-intro";
import { WizardStagedFiles } from "@/components/agents/wizard-staged-files";
import { PanelTransition } from "@/components/motion/transitions";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import {
  agentToEditorDraft,
  type AgentEditorDraft,
} from "@/lib/agent-editor-state";
import {
  agentLinksRequired,
  clampCapabilitiesForKind,
  shouldShowAgentLinks,
} from "@/lib/capability-rules";
import { validateReviewAlertsPlan } from "@/lib/widget-plan";
import {
  filePolicyForCapabilities,
  FILE_POLICY_INSTRUCTION_ATTACHMENTS,
} from "@/lib/agent-presets";
import { fetchAllAgents, fetchUsers, suggestSystemPrompt } from "@/lib/api";
import { extractInstructionFileTexts } from "@/lib/instruction-file-text";
import { FIELD_HELP, WIZARD_STEP_HELP } from "@/lib/wizard-step-help";
import type { Agent, AgentKind, AgentPermission } from "@/types";

const DEPARTMENTS = [
  { value: "finance", label: "مالی" },
  { value: "hr", label: "منابع انسانی" },
  { value: "support", label: "پشتیبانی" },
  { value: "sales", label: "فروش" },
  { value: "ops", label: "عملیات" },
];

const STEPS = [
  "پایه",
  "نوع و توانایی",
  "اتصال API",
  "فایل و سیاست",
  "منطق و دستور",
  "ویجت‌های پنل",
  "هشدار و بازبینی",
  "دسترسی‌ها",
] as const;

type StepId = (typeof STEPS)[number];

type Props = {
  agent: Agent;
  draft: AgentEditorDraft;
  onChange: (draft: AgentEditorDraft) => void;
  disabled?: boolean;
};

export function createEditorDraftFromAgent(
  agent: Agent,
  permissionRows: AgentPermission[] = []
): AgentEditorDraft {
  return agentToEditorDraft(agent, permissionRows);
}

export function AgentEditorForm({ agent, draft, onChange, disabled = false }: Props) {
  const [step, setStep] = useState(0);
  const [suggestingPrompt, setSuggestingPrompt] = useState(false);

  const { data: allAgentsPage } = useQuery({
    queryKey: ["agents", "all-for-links"],
    queryFn: () => fetchAllAgents({ page_size: 100 }),
  });
  const { data: users = [] } = useQuery({ queryKey: ["users"], queryFn: fetchUsers });
  const allAgents = useMemo(
    () => (allAgentsPage?.items ?? []).filter((a) => a.id !== agent.id),
    [allAgentsPage, agent.id]
  );

  const needsApiStep = draft.capabilities.external_apis_enabled === true;
  const visibleSteps = useMemo(
    () => STEPS.filter((s) => s !== "اتصال API" || needsApiStep),
    [needsApiStep]
  );
  const stepIndex = visibleSteps[step] ?? visibleSteps[0];

  useEffect(() => {
    if (step >= visibleSteps.length) setStep(Math.max(0, visibleSteps.length - 1));
  }, [step, visibleSteps.length]);

  function patch(partial: Partial<AgentEditorDraft>) {
    onChange({ ...draft, ...partial });
  }

  function applyKind(nextKind: AgentKind) {
    const caps = clampCapabilitiesForKind(nextKind, draft.capabilities);
    const autoFp = filePolicyForCapabilities(caps, draft.actions.flatMap((a) => a.tool_chain));
    patch({
      kind: nextKind,
      capabilities: caps,
      filePolicy: autoFp ? { ...draft.filePolicy, ...autoFp } : draft.filePolicy,
    });
  }

  function updateCapabilities(next: typeof draft.capabilities) {
    const caps = clampCapabilitiesForKind(draft.kind, next);
    const autoFp = filePolicyForCapabilities(caps, draft.actions.flatMap((a) => a.tool_chain));
    patch({
      capabilities: caps,
      filePolicy: autoFp ? { ...draft.filePolicy, ...autoFp } : draft.filePolicy,
    });
  }

  async function suggestPrompt() {
    setSuggestingPrompt(true);
    try {
      const suggested = await suggestSystemPrompt({
        name: draft.name,
        description: draft.description,
        department: draft.department,
        kind: draft.kind,
        tool_names: draft.actions.flatMap((a) => a.tool_chain ?? []),
        capabilities: draft.capabilities as unknown as Record<string, boolean>,
        existing_prompt: draft.systemPrompt,
        instruction_files: await extractInstructionFileTexts(draft.stagedFiles),
      });
      patch({ systemPrompt: suggested });
    } finally {
      setSuggestingPrompt(false);
    }
  }

  const instructionFilePolicy = FILE_POLICY_INSTRUCTION_ATTACHMENTS;

  const stepHelp = WIZARD_STEP_HELP[stepIndex as keyof typeof WIZARD_STEP_HELP] ?? {
    title: stepIndex,
    description: "",
    tip: "",
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {visibleSteps.map((label, i) => (
          <button
            key={label}
            type="button"
            disabled={disabled}
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
          <PanelTransition transitionKey={stepIndex} direction="forward" preset="fade" mode="wait">
            <fieldset disabled={disabled} className="space-y-4 disabled:opacity-60">
              <WizardStepIntro
                title={stepHelp.title}
                description={stepHelp.description}
                tip={stepHelp.tip}
              />

              {stepIndex === "پایه" && (
                <>
                  <WizardField label={FIELD_HELP.name.label} hint={FIELD_HELP.name.hint}>
                    <Input
                      value={draft.name}
                      onChange={(e) => patch({ name: e.target.value })}
                      placeholder={FIELD_HELP.name.placeholder}
                    />
                    <p className="mt-1 text-xs text-stone-400">شناسه URL: {agent.slug} (ثابت)</p>
                  </WizardField>
                  <WizardField label={FIELD_HELP.description.label} hint={FIELD_HELP.description.hint}>
                    <Textarea
                      value={draft.description}
                      onChange={(e) => patch({ description: e.target.value })}
                      rows={3}
                      placeholder={FIELD_HELP.description.placeholder}
                    />
                  </WizardField>
                  <WizardField label={FIELD_HELP.department.label} hint={FIELD_HELP.department.hint}>
                    <select
                      className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm"
                      value={draft.department}
                      onChange={(e) => patch({ department: e.target.value })}
                    >
                      {DEPARTMENTS.map((d) => (
                        <option key={d.value} value={d.value}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                  </WizardField>
                  <div className="rounded-xl border border-stone-200 bg-stone-50/50 px-4 py-3 text-sm">
                    <span className="text-stone-500">مدل ثابت:</span>{" "}
                    <span className="font-mono font-semibold text-stone-900">claude-opus-4-8</span>
                  </div>
                </>
              )}

              {stepIndex === "نوع و توانایی" && (
                <>
                  <KindPicker value={draft.kind} onChange={applyKind} />
                  <Card>
                    <CardHeader>
                      <h4 className="font-bold">توانایی‌های اضافه</h4>
                    </CardHeader>
                    <CardBody className="space-y-4">
                      <CapabilityToggles
                        kind={draft.kind}
                        value={draft.capabilities}
                        onChange={updateCapabilities}
                      />
                      {shouldShowAgentLinks(draft.kind, draft.capabilities) && (
                        <LinkedAgentsPicker
                          agents={allAgents}
                          links={draft.links}
                          supervisorMode={draft.kind === "supervisor"}
                          canCallAgents={draft.capabilities.can_call_agents}
                          onChange={(links) => patch({ links })}
                        />
                      )}
                      {draft.capabilities.templates_enabled && (
                        <TemplateRepeater
                          templates={draft.templates}
                          onChange={(templates) => patch({ templates })}
                        />
                      )}
                    </CardBody>
                  </Card>
                </>
              )}

              {stepIndex === "اتصال API" && (
                <ExternalApiPicker
                  value={draft.apiBindings}
                  onChange={(apiBindings) => patch({ apiBindings })}
                />
              )}

              {stepIndex === "فایل و سیاست" && (
                <div className="space-y-4">
                  <FilePolicyForm
                    value={draft.filePolicy}
                    onChange={(filePolicy) => patch({ filePolicy })}
                  />
                  <WizardStagedFiles
                    files={draft.stagedFiles}
                    onChange={(stagedFiles) => patch({ stagedFiles })}
                    filePolicy={draft.filePolicy}
                  />
                </div>
              )}

              {stepIndex === "منطق و دستور" && (
                <div className="space-y-6">
                  <InstructionPromptField
                    label={FIELD_HELP.systemPrompt.label}
                    hint={FIELD_HELP.systemPrompt.hint}
                    placeholder={FIELD_HELP.systemPrompt.placeholder}
                    value={draft.systemPrompt}
                    onChange={(systemPrompt) => patch({ systemPrompt })}
                    files={draft.stagedFiles}
                    onFilesChange={(stagedFiles) => patch({ stagedFiles })}
                    filePolicy={instructionFilePolicy}
                    onSuggest={suggestPrompt}
                    suggesting={suggestingPrompt}
                    suggestDisabled={!draft.name.trim()}
                  />
                  {draft.capabilities.actions_enabled && (
                    <ActionRepeater
                      actions={draft.actions}
                      onChange={(actions) => patch({ actions })}
                    />
                  )}
                </div>
              )}

              {stepIndex === "ویجت‌های پنل" && (
                <WidgetPlanForm
                  value={draft.widgetPlan}
                  onChange={(widgetPlan) => patch({ widgetPlan })}
                  department={draft.department}
                />
              )}

              {stepIndex === "هشدار و بازبینی" && (
                <ReviewAlertsPlanForm
                  value={draft.widgetPlan}
                  onChange={(widgetPlan) => patch({ widgetPlan })}
                />
              )}

              {stepIndex === "دسترسی‌ها" && (
                <div className="space-y-3">
                  <p className="text-sm leading-relaxed text-stone-600">
                    فقط افرادی که تیک می‌خورند می‌توانند این ایجنت را ببینند و اجرا کنند — حتی اگر
                    نقش کلی دیگری در سازمان داشته باشند.
                  </p>
                  <div className="max-h-64 space-y-2 overflow-y-auto">
                    {users.map((u) => {
                      const grant = draft.permissions.find((p) => p.user_id === u.id);
                      const selected = Boolean(grant);
                      return (
                        <label
                          key={u.id}
                          className="flex flex-wrap items-center gap-3 rounded-xl border border-stone-200 p-3"
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            disabled={disabled}
                            onChange={() => {
                              if (selected) {
                                patch({
                                  permissions: draft.permissions.filter((x) => x.user_id !== u.id),
                                });
                              } else {
                                patch({
                                  permissions: [
                                    ...draft.permissions,
                                    { user_id: u.id, can_invoke: true, can_configure: false },
                                  ],
                                });
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
            </fieldset>
          </PanelTransition>
        </CardBody>
      </Card>
    </div>
  );
}

export function validateAgentEditorDraft(
  agent: Agent,
  draft: AgentEditorDraft
): string | null {
  if (!draft.name.trim()) return "نام ایجنت الزامی است.";
  const fpErr = validateFilePolicy(draft.filePolicy);
  if (fpErr) return fpErr;
  const caps = clampCapabilitiesForKind(draft.kind, draft.capabilities);
  if (agentLinksRequired(draft.kind, caps)) {
    const linkType = draft.kind === "supervisor" ? "supervises" : "tool";
    if (!draft.links.some((l) => l.link_type === linkType)) {
      return draft.kind === "supervisor"
        ? "برای سرپرست حداقل یک زیرایجنت انتخاب کنید."
        : "با فعال بودن «فراخوانی ایجنت‌ها» حداقل یک ایجنت مقصد انتخاب کنید.";
    }
  }
  if (caps.external_apis_enabled) {
    const hasApi =
      draft.apiBindings.service_ids.length > 0 || draft.apiBindings.endpoint_ids.length > 0;
    if (!hasApi) return "حداقل یک سرویس یا endpoint API انتخاب کنید.";
  }
  return validateReviewAlertsPlan(draft.widgetPlan);
}
