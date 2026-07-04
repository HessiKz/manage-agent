# Agent Scripts

Agent scripts are compile-time artifacts. The wizard may generate one pinned Python script for a file-processing agent under:

```text
var/agent_files/{agent_id}/scripts/{slug}.py
```

Runtime agents do not create, edit, or repair scripts. They can only call `run_agent_script` with a runtime `storage_path`; the platform resolves the pinned script from `Agent.config_json.workspace_script`.

Before interactive training the wizard calls:

```text
runtime/prepare -> tool_plan -> script_generate/script_verify when needed -> training/start
```

`runtime_plan.primary_tool` pins a built-in shortcut when one is enough, for example `karkard_process`.
If no built-in tool fits and deterministic file work is detected, `workspace_script` is generated and verified.
`script_verify` runs the script against the wizard input sample and compares the result to `output-sample__`. A mismatch blocks entry to interactive training.

Security rules in v1:

- script path and input/output paths must stay inside the agent workspace
- one primary pinned script per agent
- no runtime code generation tools
- forbidden imports/capabilities are rejected before execution
- script execution has a timeout
- normal agents receive the full domain tool catalog at runtime; `agent.tool_names` is legacy audit/cache only

`karkard_process` remains supported as a catalog tool. New generic file-transform agents should use `run_agent_script` after wizard verification.
