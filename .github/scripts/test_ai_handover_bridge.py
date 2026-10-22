#!/usr/bin/env python3
"""Offline tests; run python3 -m unittest discover -s .github/scripts -p 'test_ai_handover_bridge.py'."""
import unittest
from ai_handover_bridge import envelope, validate

class BridgeTests(unittest.TestCase):
    def test_two_way(self):
        for sender, recipient in (("claude", "openai"), ("openai", "claude")):
            item = envelope(sender, recipient, "Review only", "pilot-1")
            self.assertEqual(validate(item)["to"], recipient)
            self.assertTrue(item["requires_founder_approval"])

    def test_reject_invalid_roles(self):
        with self.assertRaises(ValueError):
            envelope("openai", "openai", "x", "pilot-1")
        with self.assertRaises(ValueError):
            envelope("unknown", "claude", "x", "pilot-1")

    def test_reject_unsafe_payload(self):
        with self.assertRaises(ValueError):
            envelope("claude", "openai", "x" * 4001, "pilot-1")
        with self.assertRaises(ValueError):
            envelope("claude", "openai", "", "pilot-1")

    def test_reject_non_simulation(self):
        item = envelope("claude", "openai", "x", "pilot-1")
        item["mode"] = "live"
        with self.assertRaises(ValueError):
            validate(item)

if __name__ == "__main__":
    unittest.main()
