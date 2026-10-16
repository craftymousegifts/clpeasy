import unittest
from ai_provider_http import fake_http_adapter, extract_text, ProviderResponseError, live_http_adapter
from ai_transport_contract import Exchange

class ProviderHttpTests(unittest.TestCase):
    def test_anthropic_response(self):
        def fake(provider, body):
            self.assertEqual(provider, "anthropic")
            self.assertEqual(body["messages"][0]["content"], "Review")
            return {"stop_reason":"end_turn","content": [{"type":"text","text":"Claude findings"}]}
        self.assertEqual(fake_http_adapter(Exchange("anthropic","fake","Review",128),fake),"Claude findings")
    def test_openai_response(self):
        def fake(provider, body):
            self.assertEqual(provider,"openai")
            self.assertEqual(body["input"],"Claude findings")
            return {"status":"completed","output":[{"type":"message","content":[{"type":"output_text","text":"OpenAI review"}]}]}
        self.assertEqual(fake_http_adapter(Exchange("openai","fake","Claude findings",128),fake),"OpenAI review")
    def test_refusal_or_tool_only_response_blocks(self):
        with self.assertRaises(ProviderResponseError):
            extract_text("openai",{"output":[{"type":"function_call","arguments":"{}"}]})
        with self.assertRaises(ProviderResponseError):
            extract_text("anthropic",{"content":[{"type":"tool_use","name":"shell"}]})
    def test_oversize_and_malformed(self):
        with self.assertRaises(ProviderResponseError):
            extract_text("anthropic",{"content":[{"type":"text","text":"x"*4001}]})
        with self.assertRaises(ProviderResponseError):
            extract_text("openai",{"output":"not-list"})
    def test_truncated_anthropic_response_rejected(self):
        with self.assertRaises(ProviderResponseError):
            extract_text("anthropic",{"stop_reason":"max_tokens","content":[{"type":"text","text":"Partial answer"}]})
    def test_incomplete_openai_response_rejected(self):
        with self.assertRaises(ProviderResponseError):
            extract_text("openai",{"status":"incomplete","output":[{"type":"message","content":[{"type":"output_text","text":"Partial answer"}]}]})
    def test_completed_provider_responses_accepted(self):
        self.assertEqual(extract_text("anthropic",{"stop_reason":"end_turn","content":[{"type":"text","text":"OK"}]}),"OK")
        self.assertEqual(extract_text("openai",{"status":"completed","output":[{"type":"message","content":[{"type":"output_text","text":"OK"}]}]}),"OK")
    def test_missing_completion_state_rejected(self):
        with self.assertRaises(ProviderResponseError):
            extract_text("anthropic",{"content":[{"type":"text","text":"Partial"}]})
        with self.assertRaises(ProviderResponseError):
            extract_text("openai",{"output":[{"type":"message","content":[{"type":"output_text","text":"Partial"}]}]})
    def test_live_is_blocked(self):
        with self.assertRaises(RuntimeError):
            live_http_adapter()

if __name__=="__main__":
    unittest.main()
