import json
import time
from collections.abc import AsyncIterator
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from cursor_to_api import config
from cursor_to_api.agent_runner import (
    _extract_assistant_text,
    list_agent_models,
    new_completion_id,
    run_agent,
    text_delta,
)
from cursor_to_api.openai_schema import ChatCompletionRequest, messages_to_prompt

router = APIRouter(prefix="/api/v1")


def verify_api_key(request: Request) -> None:
    if not config.API_KEY:
        return
    auth = request.headers.get("authorization", "")
    if auth == f"Bearer {config.API_KEY}":
        return
    if request.headers.get("x-api-key") == config.API_KEY:
        return
    raise HTTPException(
        status_code=401,
        detail={
            "error": {
                "message": "Incorrect API key provided",
                "type": "invalid_request_error",
                "code": "invalid_api_key",
            }
        },
    )


def usage_from_event(event: dict[str, Any]) -> dict[str, int]:
    usage = event.get("usage") or {}
    prompt = int(usage.get("inputTokens") or usage.get("prompt_tokens") or 0)
    completion = int(usage.get("outputTokens") or usage.get("completion_tokens") or 0)
    return {
        "prompt_tokens": prompt,
        "completion_tokens": completion,
        "total_tokens": prompt + completion,
    }


def chunk_payload(
    completion_id: str,
    model: str,
    delta: dict[str, Any],
    *,
    finish_reason: str | None = None,
) -> str:
    payload = {
        "id": completion_id,
        "object": "chat.completion.chunk",
        "created": int(time.time()),
        "model": model,
        "choices": [
            {
                "index": 0,
                "delta": delta,
                "finish_reason": finish_reason,
            }
        ],
    }
    return f"data: {json.dumps(payload)}\n\n"


def completion_response(
    completion_id: str,
    model: str,
    content: str,
    *,
    usage: dict[str, int] | None = None,
    tool_calls: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    message: dict[str, Any] = {"role": "assistant", "content": content or None}
    finish = "stop"
    if tool_calls:
        message["tool_calls"] = tool_calls
        message["content"] = content or None
        finish = "tool_calls"
    body: dict[str, Any] = {
        "id": completion_id,
        "object": "chat.completion",
        "created": int(time.time()),
        "model": model,
        "choices": [
            {
                "index": 0,
                "message": message,
                "finish_reason": finish,
            }
        ],
        "usage": usage or {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
    }
    return body


@router.get("/models")
async def list_models(_: None = Depends(verify_api_key)) -> dict[str, Any]:
    try:
        model_ids = await list_agent_models()
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return {
        "object": "list",
        "data": [
            {
                "id": model_id,
                "object": "model",
                "created": int(time.time()),
                "owned_by": "cursor",
            }
            for model_id in model_ids
        ],
    }


@router.post("/chat/completions")
async def chat_completions(
    body: ChatCompletionRequest,
    _: None = Depends(verify_api_key),
) -> Any:
    if not body.messages:
        raise HTTPException(
            status_code=400,
            detail={
                "error": {
                    "message": "messages is required",
                    "type": "invalid_request_error",
                }
            },
        )

    raw_messages = [m.model_dump(exclude_none=True) for m in body.messages]
    prompt = messages_to_prompt(
        raw_messages,
        tools=body.tools,
        functions=body.functions,
    )
    model = body.model or config.DEFAULT_MODEL
    completion_id = new_completion_id()

    if body.stream:
        return StreamingResponse(
            stream_chat_completion(prompt, model, completion_id),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    try:
        result_event: dict[str, Any] | None = None
        async for event in run_agent(prompt, model, stream=False):
            if event.get("type") == "result":
                result_event = event
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    if not result_event:
        raise HTTPException(status_code=502, detail="No result from agent")

    if result_event.get("is_error"):
        raise HTTPException(
            status_code=502,
            detail=result_event.get("result") or "Agent returned an error",
        )

    content = str(result_event.get("result") or "")
    return completion_response(
        completion_id,
        model,
        content,
        usage=usage_from_event(result_event),
    )


async def stream_chat_completion(
    prompt: str,
    model: str,
    completion_id: str,
) -> AsyncIterator[str]:
    accumulated = ""
    sent_role = False

    yield chunk_payload(
        completion_id,
        model,
        {"role": "assistant", "content": ""},
    )

    try:
        async for event in run_agent(prompt, model, stream=True):
            if event.get("type") == "assistant":
                text = _extract_assistant_text(event)
                delta_text, accumulated = text_delta(accumulated, text)
                if delta_text:
                    delta: dict[str, Any] = {"content": delta_text}
                    if not sent_role:
                        delta["role"] = "assistant"
                        sent_role = True
                    yield chunk_payload(completion_id, model, delta)

            elif event.get("type") == "result":
                if event.get("is_error"):
                    err = event.get("result") or "Agent error"
                    yield f"data: {json.dumps({'error': {'message': err, 'type': 'server_error'}})}\n\n"
                    return
                usage = usage_from_event(event)
                yield chunk_payload(
                    completion_id,
                    model,
                    {},
                    finish_reason="stop",
                )
                yield f"data: {json.dumps({'id': completion_id, 'object': 'chat.completion.chunk', 'choices': [{'index': 0, 'delta': {}, 'finish_reason': 'stop'}], 'usage': usage})}\n\n"
    except RuntimeError as exc:
        yield f"data: {json.dumps({'error': {'message': str(exc), 'type': 'server_error'}})}\n\n"
        return

    yield "data: [DONE]\n\n"


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
