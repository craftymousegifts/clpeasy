import unittest
from ai_budget_guard import OfflineBudget, MONTHLY_LIMIT_PENCE, live_calls_permitted

class OfflineBudgetTests(unittest.TestCase):
    def test_fails_closed_for_live_calls(self):
        self.assertFalse(live_calls_permitted())

    def test_combined_reservation_ceiling(self):
        budget = OfflineBudget("2026-10")
        self.assertTrue(budget.reserve("claude-1", 300))
        self.assertFalse(budget.reserve("openai-1", 201))
        self.assertTrue(budget.reserve("openai-1", 200))
        self.assertEqual(sum(budget.reservations.values()), MONTHLY_LIMIT_PENCE)

    def test_duplicate_or_invalid_reservation_rejected(self):
        budget = OfflineBudget("2026-10")
        self.assertFalse(budget.reserve("x", -1))
        self.assertFalse(budget.reserve("x", True))
        self.assertTrue(budget.reserve("x", 100))
        self.assertFalse(budget.reserve("x", 100))

    def test_settlement_and_release(self):
        budget = OfflineBudget("2026-10")
        self.assertTrue(budget.reserve("a", 400))
        self.assertFalse(budget.settle("a", 401))
        self.assertTrue(budget.settle("a", 250))
        self.assertEqual(budget.spent_pence, 250)
        self.assertTrue(budget.reserve("b", 250))
        self.assertTrue(budget.cancel("b"))

    def test_cannot_exceed_limit_after_spending(self):
        budget = OfflineBudget("2026-10")
        self.assertTrue(budget.reserve("a", 500))
        self.assertTrue(budget.settle("a", 499))
        self.assertFalse(budget.reserve("b", 2))
        self.assertTrue(budget.reserve("b", 1))

if __name__ == "__main__":
    unittest.main()
