#!/usr/bin/env python3
"""Strictly disabled live API transport contract. Never sends network requests."""
import os

class ActivationBlocked(RuntimeError):
    pass

def invoke_model(provider, message):
    """Future integration point; deliberately cannot be enabled via environment."""
    if provider not in ("openai", "anthropic"):
        raise ValueError("Unknown provider")
    if not isinstance(message, str) or not message.strip():
        raise ValueError("Empty message")
    raise ActivationBlocked(
        "Live model calls disabled: missing approved durable budget, isolated credentials, "
        "and founder-authorised activation. Environment variables cannot override this."
    )

def credentials_present():
    """Report only presence, never log values; not a permission to use credentials."""
    return {"openai": bool(os.environ.get("OPENAI_API_KEY")),
            "anthropic": bool(os.environ.get("ANTHROPIC_API_KEY"))}
