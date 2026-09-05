"""One model call through OpenRouter.

Two rules shape this file.

Rate limits and provider blips are expected across ~800 calls and must not be
recorded against a model: they are retried with backoff. Auth, billing and
access failures will never resolve on their own, so those fail immediately
rather than burning five retries first.

And cost comes from the provider, not from a rate table kept here. OpenRouter
reports the charge for each response, so there is no local price list to drift
out of date and silently misreport what a run cost.
"""

from __future__ import annotations

import random
import re
import time
from dataclasses import dataclass
from typing import Any

import httpx

from ..config import Limits, ModelSpec

ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"

TRANSIENT_STATUS = {408, 409, 425, 429, 500, 502, 503, 504}
TRANSIENT_TEXT = re.compile(
    r"rate.?limit|overloaded|too many requests|timeout|timed out|temporarily|"
    r"try again|capacity|connection reset|read error",
    re.IGNORECASE,
)
# Checked first: "free tier is rate-limited, upgrade" reads as both, but no
# amount of retrying fixes a plan that does not include the model.
FATAL_TEXT = re.compile(
    r"no endpoints found|not a valid model|authentication|unauthorized|"
    r"invalid api key|insufficient|billing|payment|requires more credits",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class ChatResult:
    text: str
    """Provider-side reasoning where the API exposes it, otherwise None."""
    hidden_thinking: str | None
    tokens_in: int
    tokens_out: int
    cost_usd: float
    latency_ms: int
    """Set when the call failed outright rather than returning a bad answer."""
    error: str | None = None


def classify(message: str, status: int | None) -> str:
    if FATAL_TEXT.search(message):
        return "fatal"
    if status is not None and status in TRANSIENT_STATUS:
        return "transient"
    return "transient" if TRANSIENT_TEXT.search(message) else "fatal"


def _thinking(message: dict[str, Any]) -> str | None:
    """Whatever the provider chose to expose of its own reasoning.

    The shape differs by vendor -- Anthropic streams thinking blocks, DeepSeek
    and Qwen a reasoning field, OpenAI a summary, and some models nothing at
    all -- so this normalises to text or None and the runner records which.
    """
    direct = message.get("reasoning")
    if isinstance(direct, str) and direct.strip():
        return direct

    parts: list[str] = []
    for detail in message.get("reasoning_details") or []:
        if isinstance(detail, dict):
            chunk = detail.get("text") or detail.get("summary")
            if isinstance(chunk, str) and chunk.strip():
                parts.append(chunk)
    return "\n".join(parts) if parts else None


def chat(
    client: httpx.Client,
    spec: ModelSpec,
    messages: list[dict[str, str]],
    limits: Limits,
) -> ChatResult:
    body: dict[str, Any] = {
        "model": spec.id,
        "messages": messages,
        "usage": {"include": True},
    }
    if spec.reasoning:
        body["reasoning"] = dict(spec.reasoning)

    started = time.monotonic()
    last_error = "no attempt was made"

    for attempt in range(limits.max_transient_retries + 1):
        status: int | None = None
        try:
            response = client.post(ENDPOINT, json=body, timeout=limits.request_timeout_s)
            status = response.status_code
            response.raise_for_status()
            payload = response.json()

            # OpenRouter can report a provider failure inside a 200 response.
            if "error" in payload and not payload.get("choices"):
                raise RuntimeError(str(payload["error"].get("message", payload["error"])))

            message = payload["choices"][0]["message"]
            usage = payload.get("usage") or {}
            return ChatResult(
                text=message.get("content") or "",
                hidden_thinking=_thinking(message),
                tokens_in=int(usage.get("prompt_tokens") or 0),
                tokens_out=int(usage.get("completion_tokens") or 0),
                cost_usd=float(usage.get("cost") or 0.0),
                latency_ms=round((time.monotonic() - started) * 1000),
            )
        except Exception as err:  # noqa: BLE001 - classified below, not swallowed
            last_error = f"{type(err).__name__}: {err}"
            if classify(last_error, status) == "fatal":
                break
            if attempt == limits.max_transient_retries:
                break
            # Jittered, so a run that hits a shared limit does not retry every
            # model in lockstep and hit it again together.
            delay = min(30.0, 2.0 * 2**attempt)
            time.sleep(delay * (0.5 + random.random()))

    return ChatResult(
        text="",
        hidden_thinking=None,
        tokens_in=0,
        tokens_out=0,
        cost_usd=0.0,
        latency_ms=round((time.monotonic() - started) * 1000),
        error=last_error,
    )


def make_client(api_key: str) -> httpx.Client:
    return httpx.Client(
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        timeout=httpx.Timeout(600.0),
    )
