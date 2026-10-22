import unittest
from ai_mock_http_integration import run

class MockHttpIntegrationTests(unittest.TestCase):
    def test_full_chain(self):
        result=run("Check an SDS issue")
        self.assertIn("Check an SDS issue",result["claude"])
        self.assertIn(result["claude"],result["openai"])
        self.assertTrue(result["founder_approval_required"])
        self.assertFalse(result["auto_merge"])
        self.assertFalse(result["auto_deploy"])
    def test_empty_task(self):
        with self.assertRaises(ValueError):
            run("")

if __name__=="__main__":
    unittest.main()
