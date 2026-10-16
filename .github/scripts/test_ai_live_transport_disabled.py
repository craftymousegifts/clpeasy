import os
import unittest
from unittest.mock import patch
from ai_live_transport_disabled import invoke_model, ActivationBlocked, credentials_present

class TransportTests(unittest.TestCase):
    def test_all_providers_fail_closed(self):
        for provider in ("openai", "anthropic"):
            with self.assertRaises(ActivationBlocked):
                invoke_model(provider, "Review only")

    def test_environment_cannot_activate(self):
        with patch.dict(os.environ, {"ENABLE_LIVE_AI": "true", "OPENAI_API_KEY": "dummy", "ANTHROPIC_API_KEY": "dummy"}):
            self.assertEqual(credentials_present(), {"openai": True, "anthropic": True})
            with self.assertRaises(ActivationBlocked):
                invoke_model("openai", "Review only")

    def test_invalid_input(self):
        with self.assertRaises(ValueError):
            invoke_model("unknown", "Review")
        with self.assertRaises(ValueError):
            invoke_model("openai", "")

if __name__ == "__main__":
    unittest.main()
