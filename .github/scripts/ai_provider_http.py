"""Testable HTTP adapter with no network capability unless an HTTP function is injected.

Production transport activation is intentionally absent. Credentials and real HTTP
functions are never read from the environment. Use only with fake HTTP functions.
"""
from ai_transport_contract import Exchange, build_request, validate

class ProviderResponseError(ValueError):
    pass

def extract_text(provider, payload):
    if not isinstance(payload, dict):
        raise ProviderResponseError("Expected JSON object")
    if provider == "anthropic":
        blocks = payload.get("content")
        if not isinstance(blocks, list):
            raise ProviderResponseError("Missing content blocks")
        parts = [block.get("text") for block in blocks if isinstance(block, dict) and block.get("type") == "text" and isinstance(block.get("text"), str)]
    elif provider == "openai":
        blocks = payload.get("output")
        if not isinstance(blocks, list):
            raise ProviderResponseError("Missing output blocks")
        parts = []
        for block in blocks:
            if isinstance(block, dict) and block.get("type") == "message":
                for item in block.get("content", []):
                    if isinstance(item, dict) and item.get("type") == "output_text" and isinstance(item.get("text"), str):
                        parts.append(item["text"])
    else:
        raise ProviderResponseError("Unsupported provider")
    text = "\n".join(p for p in parts if p.strip())
    if not text.strip() or len(text.encode("utf-8")) > 4000:
        raise ProviderResponseError("Empty or oversized response")
    return text

def fake_http_adapter(exchange, fake_post):
    """Explicit fake_post injection; never supplies a URL, key or real network client."""
    validate(exchange)
    if not callable(fake_post):
        raise TypeError("A fake transport callback is required")
    request = build_request(exchange)
    response = fake_post(exchange.provider, request)
    return extract_text(exchange.provider, response)

def live_http_adapter(*args, **kwargs):
    raise RuntimeError("Live API transport is disabled until verified budget and founder approval")
