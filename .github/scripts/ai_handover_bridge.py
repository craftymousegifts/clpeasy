#!/usr/bin/env python3
"""Offline proof of a two-way agent handover envelope. No network or model calls."""
import argparse
import json
from datetime import datetime, timezone

VERSION = 1
ROLES = ("claude", "openai")

def envelope(sender, recipient, message, correlation_id):
    if sender not in ROLES or recipient not in ROLES or sender == recipient:
        raise ValueError("Invalid sender/recipient")
    if not correlation_id or not correlation_id.isascii() or len(correlation_id) > 80:
        raise ValueError("Invalid correlation ID")
    if not isinstance(message, str) or not message.strip() or len(message) > 4000:
        raise ValueError("Message must be 1-4000 characters")
    return {"version": VERSION, "correlation_id": correlation_id,
            "from": sender, "to": recipient, "message": message,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "mode": "simulation", "requires_founder_approval": True}

def validate(item):
    if item.get("version") != VERSION or item.get("mode") != "simulation":
        raise ValueError("Unsupported handover")
    return envelope(item["from"], item["to"], item["message"], item["correlation_id"])

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="ai-handover-simulation.json")
    args = parser.parse_args()
    first = envelope("claude", "openai", "Review proposed change; do not implement.", "offline-pilot-001")
    second = envelope("openai", "claude", "Review received. Founder approval required before changes.", "offline-pilot-001")
    validate(first)
    validate(second)
    with open(args.output, "w", encoding="utf-8") as file:
        json.dump({"simulation_only": True, "handoffs": [first, second],
                   "paid_ai_calls": 0, "repository_writes": 0}, file, indent=2)
    print("PASS: simulated Claude -> OpenAI -> Claude handover; no API calls, no GitHub writes")

if __name__ == "__main__":
    main()
