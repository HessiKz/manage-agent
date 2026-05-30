import asyncio
import json
import uuid
from collections.abc import AsyncIterator
from typing import Any

from cursor_to_api import config


def _content_to_text(content: str | list[dict[str, Any]] | None) -> str:
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    bits: list[str] = []
    for block in content:
        if isinstance(block, dict) and block.get("type") == "text":
            bits.append(block.get("text", ""))
    return "\n".join(bits)


def messages_to_prompt(messages: list[dict[str, Any]]) -> str:
    """Backward-compatible wrapper; prefer openai_schema.messages_to_prompt."""
    from cursor_to_api.openai_schema import messages_to_prompt as _full

    return _full(messages)


def _extract_assistant_text(event: dict[str, Any]) -> str:
    message = event.get("message") or {}
    content = message.get("content") or []
    chunks: list[str] = []
    for block in content:
        if isinstance(block, dict) and block.get("type") == "text":
            chunks.append(block.get("text", ""))
    return "".join(chunks)


def text_delta(accumulated: str, chunk: str) -> tuple[str, str]:
    if not chunk:
        return "", accumulated
    if chunk == accumulated:
        return "", accumulated
    if not accumulated:
        return chunk, chunk
    if chunk.startswith(accumulated):
        return chunk[len(accumulated) :], chunk
    if accumulated.startswith(chunk) or chunk in accumulated:
        return "", accumulated

    common = 0
    for a, b in zip(accumulated, chunk):
        if a != b:
            break
        common += 1
    if common >= len(chunk) * 0.5:
        return "", accumulated
    return chunk, accumulated + chunk


def build_agent_cmd(prompt: str, model: str, stream: bool) -> list[str]:
    cmd = [
        config.AGENT_BIN,
        "--print",
        "--output-format",
        "stream-json" if stream else "json",
        "--model",
        model,
        "--workspace",
        str(config.WORKSPACE),
    ]
    if stream:
        cmd.append("--stream-partial-output")
    if config.AGENT_TRUST:
        cmd.append("--trust")
    if config.AGENT_FORCE:
        cmd.append("--force")
    cmd.append(prompt)
    return cmd


async def _collect_agent_events(
    prompt: str,
    model: str,
    *,
    stream: bool,
) -> AsyncIterator[dict[str, Any]]:
    cmd = build_agent_cmd(prompt, model, stream)
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=str(config.WORKSPACE),
    )

    assert proc.stdout is not None
    assert proc.stderr is not None

    async def read_stdout() -> AsyncIterator[dict[str, Any]]:
        while True:
            line = await proc.stdout.readline()
            if not line:
                break
            line = line.decode("utf-8", errors="replace").strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError:
                continue

    try:
        if stream:
            async for event in read_stdout():
                yield event
        else:
            raw = await proc.stdout.read()
            await proc.wait()
            stderr = (await proc.stderr.read()).decode("utf-8", errors="replace")
            if proc.returncode != 0:
                raise RuntimeError(stderr.strip() or f"agent exited with code {proc.returncode}")
            text = raw.decode("utf-8", errors="replace").strip()
            if not text:
                raise RuntimeError("agent returned empty output")
            yield json.loads(text.splitlines()[-1])
            return

        await proc.wait()
        stderr = (await proc.stderr.read()).decode("utf-8", errors="replace")
        if proc.returncode != 0:
            raise RuntimeError(stderr.strip() or f"agent exited with code {proc.returncode}")
    finally:
        if proc.returncode is None:
            proc.kill()
            await proc.wait()


async def run_agent(
    prompt: str,
    model: str,
    *,
    stream: bool,
) -> AsyncIterator[dict[str, Any]]:
    timeout = max(30, int(config.REQUEST_TIMEOUT_SEC))

    if stream:

        async def _stream_with_timeout() -> AsyncIterator[dict[str, Any]]:
            loop = asyncio.get_running_loop()
            deadline = loop.time() + timeout
            async for event in _collect_agent_events(prompt, model, stream=True):
                if loop.time() > deadline:
                    raise RuntimeError(f"agent timed out after {timeout}s")
                yield event

        async for event in _stream_with_timeout():
            yield event
        return

    async def _collect_once() -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        async for event in _collect_agent_events(prompt, model, stream=False):
            out.append(event)
        return out

    try:
        events = await asyncio.wait_for(_collect_once(), timeout=timeout)
    except asyncio.TimeoutError as exc:
        raise RuntimeError(f"agent timed out after {timeout}s") from exc

    for event in events:
        yield event


async def list_agent_models() -> list[str]:
    proc = await asyncio.create_subprocess_exec(
        config.AGENT_BIN,
        "models",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=30)
    except asyncio.TimeoutError as exc:
        proc.kill()
        raise RuntimeError("agent models timed out") from exc
    if proc.returncode != 0:
        raise RuntimeError((stderr or b"").decode("utf-8", errors="replace").strip() or "agent models failed")

    models: list[str] = []
    for line in stdout.decode("utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line or line.startswith("Available"):
            continue
        if " - " in line:
            model_id = line.split(" - ", 1)[0].strip()
            if model_id:
                models.append(model_id)
    return models


def new_completion_id() -> str:
    return f"chatcmpl-{uuid.uuid4().hex[:24]}"
