import unittest
from ai_provider_http import fake_http_adapter, extract_text, ProviderResponseError, live_http_adapter
from ai_transport_contract import Exchange

class ProviderHttpTests(unittest.TestCase):
    def test_anthropic_response(self):
        def fake(provider, body):
            self.assertEqual(provider, "anthropic")
            self.assertEqual(body["messages"][0]["content"], "Review")
            return {"content": [{"type":"text","text":"Claude findings"}]}
        self.assertEqual(fake_http_adapter(Exchange("anthropic","fake","Review",128),fake),"Claude findings")
    def test_openai_response(self):
        def fake(provider, body):
            self.assertEqual(provider,"openai")
            self.assertEqual(body["input"],"Claude findings")
            return {"output":[{"type":"message","content":[{"type":"output_text","text":"OpenAI review"}]}]}
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
    def test_live_is_blocked(self):
        with self.assertRaises(RuntimeError):
            live_http_adapter()

if __name__=="__main__":
    unittest.main()
