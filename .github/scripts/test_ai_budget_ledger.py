import os
import tempfile
import threading
import unittest
from ai_budget_ledger import BudgetLedger, live_calls_permitted

class LedgerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = os.path.join(self.tmp.name, "ledger.db")
        self.db = BudgetLedger(self.path)
    def tearDown(self):
        self.tmp.cleanup()
    def test_live_blocked(self):
        self.assertFalse(live_calls_permitted())
    def test_restart_and_duplicate(self):
        self.assertTrue(self.db.reserve("a","2026-10",400))
        other = BudgetLedger(self.path)
        self.assertFalse(other.reserve("a","2026-10",100))
        self.assertFalse(other.reserve("b","2026-10",101))
        self.assertTrue(other.reserve("b","2026-10",100))
    def test_settle(self):
        self.assertTrue(self.db.reserve("a","2026-10",500))
        self.assertFalse(self.db.settle("a",501))
        self.assertTrue(self.db.settle("a",300))
        self.assertFalse(self.db.settle("a",100))
        self.assertTrue(self.db.reserve("b","2026-10",200))
    def test_month_boundary(self):
        self.assertTrue(self.db.reserve("a","2026-10",500))
        self.assertTrue(self.db.reserve("b","2026-11",500))
    def test_parallel_requests(self):
        results = []
        lock = threading.Lock()
        def work(i):
            accepted = BudgetLedger(self.path).reserve(str(i),"2026-10",100)
            with lock:
                results.append(accepted)
        threads = [threading.Thread(target=work,args=(i,)) for i in range(20)]
        for t in threads: t.start()
        for t in threads: t.join()
        self.assertEqual(sum(results),5)
    def test_cannot_release_uncertain_reservation(self):
        self.assertTrue(self.db.reserve("a","2026-10",500))
        self.assertFalse(self.db.cancel("a"))
        self.assertFalse(self.db.reserve("b","2026-10",1))

if __name__ == "__main__":
    unittest.main()
