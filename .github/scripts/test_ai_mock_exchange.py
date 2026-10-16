import unittest
from ai_mock_exchange import exchange

class MockExchangeTests(unittest.TestCase):
    def test_passes_real_return_value_to_second_adapter(self):
        calls=[]
        def claude(body):
            calls.append(("claude",body["messages"][0]["content"]))
            return "CLAUDE FINDINGS"
        def openai(body):
            calls.append(("openai",body["input"]))
            return "REVIEW"
        result=exchange("Investigate",claude,openai)
        self.assertEqual(calls,[("claude","Investigate"),("openai","CLAUDE FINDINGS")])
        self.assertEqual(result["openai"],"REVIEW")
        self.assertFalse(result["auto_deploy"])
    def test_rejects_invalid_responses(self):
        with self.assertRaises(ValueError):
            exchange("Task",lambda x:"",lambda x:"Review")
        with self.assertRaises(ValueError):
            exchange("Task",lambda x:"Findings",lambda x:"")
if __name__=="__main__":
    unittest.main()
