#!/usr/bin/env python3
"""Offline model API transport, dependency-free, disabled unless explicitly injected.

No credentials are read and no network calls occur when imported or executed.
Real requests are deliberately unavailable until budget and billing gates pass.
"""
import json
from dataclasses import dataclass

class TransportError(RuntimeError):
    pass

@dataclass(frozen=True)
class Exchange:
    provider: str
    model: str
    text: str
    max_output_tokens: int

def validate(exchange):
    if exchange.provider not in ("openai", "anthropic"):
        raise TransportError("Unsupported provider")
    if not exchange.model or not isinstance(exchange.model, str):
        raise TransportError("Missing model")
    if not isinstance(exchange.text, str) or not exchange.text.strip():
        raise TransportError("Empty prompt")
    if len(exchange.text.encode("utf-8")) > 16000:
        raise TransportError("Prompt exceeds offline byte ceiling")
    if type(exchange.max_output_tokens) is not int or not 1 <= exchange.max_output_tokens <= 512:
        raise TransportError("Invalid output cap")
    return exchange

def build_request(exchange):
    """Construct request body for inspection only. Never dispatches it."""
    x = validate(exchange)
    if x.provider == "openai":
        return {"model": x.model, "input": x.text, "max_output_tokens": x.max_output_tokens,
                "store": False}
    return {"model": x.model, "messages": [{"role":"user","content":x.text}],
            "max_tokens": x.max_output_tokens}

def send_request(exchange, *, budget_authorization=None):
    """Fail closed even if an external caller supplies an authorization flag."""
    validate(exchange)
    raise TransportError("Paid transport is disabled pending independent budget verification and founder approval")

def example_handover():
    first = Exchange("anthropic","MODEL_NOT_CONFIGURED","Review a proposed patch; do not modify files.",256)
    second = Exchange("openai","MODEL_NOT_CONFIGURED","Review Claude's findings; do not modify files.",256)
    return [build_request(first),build_request(second)]

if __name__ == "__main__":
    print(json.dumps(example_handover(),indent=2))
