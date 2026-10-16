import unittest
from ai_offline_runner import run_handover

class OfflineRunnerTests(unittest.TestCase):
    def test_sequence_and_roles(self):
        result=run_handover("Check issue","Claude evidence","OpenAI review")
        self.assertEqual([x["from_agent"] for x in result["turns"]],["founder","claude","openai"])
        self.assertEqual(result["status"],"REVIEW")
        self.assertFalse(result["paid_calls_enabled"])
    def test_provider_requests(self):
        result=run_handover("Task","Claude response","Review")
        self.assertEqual(len(result["request_previews"]),2)
        self.assertIn("input",result["request_previews"][1])
        self.assertIn("messages",result["request_previews"][0])
    def test_invalid_input(self):
        for task in ("", "x"*16001):
            with self.assertRaises(ValueError):
                run_handover(task,"Claude","OpenAI")
        with self.assertRaises(ValueError):
            run_handover("Task","","OpenAI")
if __name__=="__main__":
    unittest.main()
