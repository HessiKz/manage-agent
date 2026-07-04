#!/usr/bin/env bash
# One-time: layer local work on top of origin/main as logical commits.
set -euo pipefail
cd "$(dirname "$0")/.."

G=(git -c safe.directory="$(pwd)" -c user.email="hessi@manage-agent.local" -c user.name="HessiKz")

commit_paths() {
  local msg="$1"
  shift
  local had=0
  for p in "$@"; do
    if [[ -e "$p" ]] || [[ -d "$p" ]]; then
      "${G[@]}" add -- "$p" 2>/dev/null || true
      had=1
    fi
  done
  if "${G[@]}" diff --cached --quiet; then
    echo "skip (empty): $msg"
    return 0
  fi
  "${G[@]}" commit -m "$msg"
  echo "ok: $msg"
}

commit_paths "chore: project docs, gitignore, and Makefile" \
  .gitignore README.md PLAN.md AGENT.md Makefile docs/

commit_paths "chore(docker): compose stacks, nginx, and deploy scripts" \
  docker-compose.yml docker-compose.prod.yml docker-compose.dev-proxy.yml docker-compose.fast.yml \
  nginx/ render.yaml .deploy.env.example \
  scripts/dev.sh scripts/public-up.sh scripts/public-down.sh scripts/deploy-vps.sh \
  scripts/daily-restart.sh scripts/rsync-source.sh scripts/_vps_transport.py

commit_paths "feat(backend): database migrations" \
  backend/alembic/versions/k2l3m4n5o6p7_default_model_claude_opus_4_8.py \
  backend/alembic/versions/l3m4n5o6p7q8_knowledge_datasets.py \
  backend/alembic/versions/m4n5o6p7q8r9_knowledge_dataset_enrichments.py \
  backend/alembic/versions/n5o6p7q8r9s0_user_phone_address.py

commit_paths "feat(backend): knowledge datasets and user profile fields" \
  backend/src/models/knowledge_dataset.py \
  backend/src/schemas/knowledge_dataset.py \
  backend/src/api/v1/knowledge.py \
  backend/src/models/user.py \
  backend/src/schemas/user.py \
  backend/src/api/v1/users.py \
  backend/src/services/auth_service.py \
  frontend/src/app/\(dashboard\)/knowledge/ \
  frontend/src/app/\(dashboard\)/settings/page.tsx \
  frontend/src/app/\(dashboard\)/users/page.tsx \
  frontend/src/components/admin/knowledge-base-admin.tsx \
  frontend/src/components/agents/knowledge-dataset-manager.tsx \
  frontend/src/components/agents/knowledge-dataset-picker.tsx \
  frontend/src/components/agents/knowledge-source-picker.tsx \
  frontend/src/components/agents/knowledge-bindings-summary.tsx \
  frontend/src/components/agents/agent-knowledge-panel.tsx \
  frontend/src/components/agents/agent-knowledge-summary.tsx \
  frontend/src/components/agents/wizard-knowledge-step.tsx \
  frontend/src/app/\(dashboard\)/admin/knowledge/

commit_paths "feat(backend): platform support agent tools and grounding" \
  backend/src/agents_lib/platform_constants.py \
  backend/src/agents_lib/platform_support_grounding.py \
  backend/src/agents_lib/platform_tools.py \
  backend/src/agents_lib/platform_ui_catalog.py \
  backend/src/agents_lib/graph_agent.py \
  backend/src/api/v1/platform.py \
  backend/src/schemas/platform.py \
  backend/src/demo/datasets.py \
  backend/src/services/platform_settings_service.py \
  backend/src/services/platform_wizard_service.py \
  backend/src/services/platform_widget_prompts.py \
  backend/tests/unit/test_platform_support_grounding.py \
  backend/tests/unit/test_platform_ui_automation.py \
  backend/tests/unit/test_platform_resolve_agent.py \
  backend/tests/unit/test_platform_departments.py \
  backend/tests/unit/test_platform_user_tools.py \
  backend/tests/unit/test_platform_widget_prompts.py \
  backend/tests/unit/test_platform_wizard.py \
  backend/tests/test_platform.py \
  backend/tests/test_support_wizard_flow.py \
  backend/tests/unit/test_support_conversations.py \
  backend/tests/unit/test_training_wizard_guards.py

commit_paths "feat(backend): agent preview, training, validation, and dashboard" \
  backend/src/schemas/agent_preview.py \
  backend/src/schemas/agent_training.py \
  backend/src/schemas/agent_dashboard_config.py \
  backend/src/schemas/agent_knowledge_bindings.py \
  backend/src/schemas/agent_widget_plan.py \
  backend/src/services/agent_preview_service.py \
  backend/src/services/agent_training_service.py \
  backend/src/services/agent_validation_service.py \
  backend/src/services/agent_validation_runner.py \
  backend/src/services/agent_dashboard_config_service.py \
  backend/src/services/agent_widget_plan_service.py \
  backend/src/services/agent_instruction_service.py \
  backend/src/services/agent_runtime_prepare_service.py \
  backend/src/services/agent_execution_guide_service.py \
  backend/src/services/agent_script_service.py \
  backend/src/services/agent_batch_validation.py \
  backend/src/services/catalog_agent_upgrade_service.py \
  backend/src/services/execution_guide_runner.py \
  backend/src/core/agent_config_validation.py \
  backend/src/core/agent_training_context.py \
  backend/src/core/llm_runtime.py \
  backend/src/agents_lib/agent_factory.py \
  backend/src/api/v1/agents.py \
  backend/src/schemas/agent.py \
  backend/src/services/agent_service.py \
  backend/src/services/invoke_service.py \
  backend/src/services/orchestrator_service.py \
  backend/tests/unit/test_agent_preview_service.py \
  backend/tests/unit/test_agent_validation_service.py \
  backend/tests/unit/test_agent_training.py \
  backend/tests/unit/test_agent_dashboard_config.py \
  backend/tests/unit/test_llm_runtime_forced_model.py

commit_paths "feat(backend): karkard processor, workspace files, and assets" \
  backend/src/karkard/ \
  backend/src/core/agent_workspace_files.py \
  backend/src/core/agent_file_roles.py \
  backend/src/core/agent_tool_files.py \
  backend/src/core/workspace_paths.py \
  backend/src/core/workspace_output_registry.py \
  backend/src/core/runtime_file_selection.py \
  backend/src/core/file_text_extract.py \
  backend/src/core/reference_workbook_enrichment.py \
  backend/src/services/karkard_workspace_service.py \
  backend/formdocs/ \
  backend/assets/ \
  backend/scripts/e2e_karkard_api.py \
  backend/scripts/e2e_karkard_fresh.py \
  backend/scripts/live_karkard_api_test.py \
  backend/scripts/verify_karkard_output.py \
  backend/tests/test_karkard_formdocs.py \
  backend/tests/test_karkard_locked_input.py \
  backend/tests/unit/test_karkard_fresh_output.py \
  backend/tests/unit/test_karkard_input_selection.py \
  backend/tests/unit/test_karkard_no_reference_copy.py \
  backend/tests/unit/test_karkard_summary_display.py

commit_paths "fix(dev): same-origin API URL via nginx in make dev" \
  scripts/dev.sh \
  docker-compose.dev-proxy.yml \
  nginx/nginx.dev-host.conf

commit_paths "fix(support): wizard automation — mission, heal, recovery, and bridges" \
  frontend/src/lib/support-wizard-mission.ts \
  frontend/src/lib/support-wizard-mission.test.ts \
  frontend/src/lib/support-wizard-heal.ts \
  frontend/src/lib/support-wizard-recovery.ts \
  frontend/src/lib/support-wizard-recovery.test.ts \
  frontend/src/lib/support-wizard-field-heal.ts \
  frontend/src/lib/support-wizard-field-heal.test.ts \
  frontend/src/lib/support-wizard-errors.ts \
  frontend/src/lib/support-wizard-errors.test.ts \
  frontend/src/lib/support-page-state.ts \
  frontend/src/lib/support-page-state.test.ts \
  frontend/src/lib/support-testing-actions.ts \
  frontend/src/lib/support-testing-actions.test.ts \
  frontend/src/lib/support-auto-recovery.ts \
  frontend/src/lib/page-guide-context.ts \
  frontend/src/lib/ui-snapshot.ts \
  frontend/src/lib/ui-snapshot.test.ts \
  frontend/src/lib/support-wait-extend.ts \
  frontend/src/lib/support-wait-extend.test.ts \
  frontend/src/lib/support-user-choices.ts \
  frontend/src/lib/support-error-text.ts \
  frontend/src/lib/support-error-text.test.ts \
  frontend/src/lib/support-assistant-text.ts \
  frontend/src/lib/support-abort.ts \
  frontend/src/lib/support-chat.ts \
  frontend/src/lib/support-dom-typing.ts \
  frontend/src/lib/support-widget-plan-enable.ts \
  frontend/src/lib/support-dashboard-generate.ts \
  frontend/src/hooks/use-wizard-support-bridge.ts \
  frontend/src/hooks/use-testing-support-bridge.ts \
  frontend/src/hooks/use-testing-support-bridge.test.ts \
  frontend/src/hooks/use-dashboard-support-bridge.ts \
  frontend/src/components/support/

commit_paths "feat(frontend): agent create wizard and post-publish testing" \
  frontend/src/app/\(dashboard\)/agents/create/ \
  frontend/src/lib/wizard-step-validation.ts \
  frontend/src/lib/wizard-step-validation.test.ts \
  frontend/src/lib/wizard-step-help.ts \
  frontend/src/lib/agent-testing-phase.ts \
  frontend/src/lib/agent-testing-phase.test.ts \
  frontend/src/components/agents/wizard-io-panel.tsx \
  frontend/src/components/agents/wizard-post-publish-panel.tsx \
  frontend/src/components/agents/wizard-pre-publish-test.tsx \
  frontend/src/components/agents/wizard-process-stepper.tsx \
  frontend/src/components/agents/wizard-temperature-field.tsx \
  frontend/src/components/agents/wizard-staged-files.tsx \
  frontend/src/components/agents/agent-training-panel.tsx \
  frontend/src/components/agents/agent-clarification-questions.tsx

commit_paths "feat(frontend): LLM stream loading, chat UI, and layout" \
  frontend/src/hooks/use-llm-stream-loading.ts \
  frontend/src/hooks/use-llm-stream-loading.test.ts \
  frontend/src/lib/llm-loading-state.ts \
  frontend/src/lib/llm-loading-state.test.ts \
  frontend/src/components/loading/ \
  frontend/src/components/chat/chat-turn.tsx \
  frontend/src/components/agents/thinking-block.tsx \
  frontend/src/components/agents/chat-panel.tsx \
  frontend/src/components/agents/chat-markdown.tsx \
  frontend/src/components/layout/app-shell.tsx \
  frontend/src/components/layout/sidebar.tsx \
  frontend/src/components/layout/sidebar.test.ts \
  frontend/src/components/layout/view-mode-toggle.tsx \
  frontend/src/components/motion/view-mode-transition.tsx \
  frontend/src/hooks/use-view-mode-switch.ts \
  frontend/src/components/auth/auth-guard.tsx

commit_paths "feat(frontend): agent dashboard, editor, and widget builder" \
  frontend/src/components/agents/agent-dashboard-view.tsx \
  frontend/src/components/agents/agent-dashboard-editor-panel.tsx \
  frontend/src/components/agents/agent-editor-form.tsx \
  frontend/src/components/agents/widget-create-chat-modal.tsx \
  frontend/src/components/agents/widget-layout-preview.tsx \
  frontend/src/components/agents/widget-plan-form.tsx \
  frontend/src/components/agents/dashboard-widget-chrome.tsx \
  frontend/src/components/agents/review-alerts-plan-form.tsx \
  frontend/src/components/agents/model-picker.tsx \
  frontend/src/components/agents/instruction-prompt-field.tsx \
  frontend/src/app/\(dashboard\)/agents/\[slug\]/edit/

commit_paths "chore(backend): packaging, docker entry, railway, and uv lock" \
  backend/Dockerfile \
  backend/pyproject.toml \
  backend/uv.lock \
  backend/railway.toml \
  backend/README.md \
  backend/.env.example \
  backend/.env.production.example \
  backend/.env.railway.example \
  backend/scripts/docker-entry.sh \
  backend/scripts/ensure_catalog_agents.py \
  backend/scripts/ensure_demo_history.py \
  backend/scripts/refresh_instruction_prompts.py \
  backend/scripts/validate_all_agents.py \
  frontend/railway.toml \
  frontend/vercel.json \
  frontend/.env.vercel.example \
  frontend/scripts/docker-dev-entry.sh \
  frontend/package.json \
  frontend/package-lock.json \
  frontend/next.config.ts

# Remaining backend + frontend + tests in one sweep
if ! "${G[@]}" diff --quiet || ! "${G[@]}" diff --cached --quiet || [ -n "$("${G[@]}" status --porcelain)" ]; then
  "${G[@]}" add -A
  if ! "${G[@]}" diff --cached --quiet; then
    "${G[@]}" commit -m "feat: remaining backend services, frontend pages, and test coverage"
    echo "ok: final sweep"
  fi
fi

echo "---"
"${G[@]}" log --oneline
echo "---"
"${G[@]}" status --short
