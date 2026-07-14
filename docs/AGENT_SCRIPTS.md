# Agent Scripts

Agent scripts are compile-time artifacts. The wizard may generate one pinned Python script for a file-processing agent under:

```text
var/agent_files/{agent_id}/scripts/{slug}.py
```

Runtime agents do not create, edit, or repair scripts. They can only call `run_agent_script` with a runtime `storage_path`; the platform resolves the pinned script from `Agent.config_json.workspace_script`.

## Training / validation flow

```text
file_setup → planning (Q&A) → stamp answers → io_schema → script_generate → script_verify → smoke invoke
```

- **I/O samples** are required for file-upload agents that need a script: unprefixed or `input-sample__` input, and `output-sample__` gold output. Optional `pair_id` / `pairN` naming supports multi-pair verify.
- **Planning answers** clear `workspace_script.verified_at` so the next pass re-synthesizes with clarifications.
- **`io_schema`** (multi-sheet headers, row counts, head/tail) is injected into synthesis instead of a sheet0-only 20-row dump.
- **`script_verify`** compares multi-sheet structure (hard) and cell values (soft, default ≥95%). Domain footer trust is opt-in via `task_profile` / config, not global.
- Existing **`verified_at`** pins stay until the owner re-trains or replaces samples (forward-only).

Before interactive training the wizard also calls:

```text
runtime/prepare → tool_plan → script_generate/script_verify when needed → training/start
```

There is **no** live `karkard_process` product tool. File processing is always `run_agent_script` + the pinned workspace script. Domain libraries under `src/karkard/` may exist for tests/demos only.

## File roles

| Role | Prefix / DB | Use |
|------|-------------|-----|
| instruction | `instruction__` | Compiles into system prompt |
| output_sample | `output-sample__` | Gold output for verify/synth |
| input_sample | `input-sample__` or unprefixed | Training input |
| runtime | unprefixed | Live uploads |

`agent_files.role` and `pair_id` are nullable columns; filenames remain backward-compatible.

## Security (v1)

- script path and input/output paths must stay inside the agent workspace
- one primary pinned script per agent
- no runtime code generation tools
- forbidden imports/capabilities are rejected before execution
- script execution runs in a **subprocess** with wall-clock timeout and optional rlimits (`MA_SCRIPT_TIMEOUT_S`, opt-out `MA_SCRIPT_INPROCESS=1`)
- normal agents receive the domain tool catalog at runtime; `agent.tool_names` is legacy audit/cache only

## Env knobs

| Var | Meaning |
|-----|---------|
| `MA_SCRIPT_TIMEOUT_S` | Subprocess wall timeout (default 120) |
| `MA_SCRIPT_INPROCESS=1` | Run script in-process (debug only) |
| `MA_SCRIPT_WRITER=caveman` | Terse synthesis system prompt |
| `MA_SCRIPT_PYTHON` | Interpreter for subprocess runner |
