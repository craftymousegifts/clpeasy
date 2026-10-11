import unittest
from ai_transport_contract import Exchange, TransportError, build_request, send_request

class TransportContractTests(unittest.TestCase):
    def test_anthropic_body(self):
        body=build_request(Exchange("anthropic","example-model","Review",256))
        self.assertEqual(body["max_tokens"],256)
        self.assertEqual(body["messages"][0]["content"],"Review")
    def test_openai_body(self):
        body=build_request(Exchange("openai","example-model","Review",256))
        self.assertEqual(body["max_output_tokens"],256)
        self.assertFalse(body["store"])
    def test_provider_and_caps(self):
        for x in [Exchange("other","model","Review",10),Exchange("openai","model","",10),Exchange("openai","model","Review",513),Exchange("openai","model","Review",True)]:
            with self.assertRaises(TransportError):
                build_request(x)
    def test_no_paid_dispatch(self):
        for p in ("anthropic","openai"):
            with self.assertRaises(TransportError):
                send_request(Exchange(p,"example-model","Review",10),budget_authorization=True)

if __name__=="__main__":
    unittest.main()
