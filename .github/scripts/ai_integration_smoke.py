#!/usr/bin/env python3
"""One-command offline integration smoke test; no secrets, APIs, or repo writes."""
import json
import tempfile
from pathlib import Path
from ai_budget_ledger import BudgetLedger
from ai_offline_runner import run_handover
from ai_transport_contract import TransportError, Exchange, send_request

def smoke():
    with tempfile.TemporaryDirectory() as tmp:
        db = BudgetLedger(str(Path(tmp) / "budget.sqlite"))
        assert db.reserve("claude-task","2026-10",250)
        assert db.reserve("openai-review","2026-10",250)
        assert not db.reserve("extra","2026-10",1)
        report = run_handover(
            "Read-only investigation; founder approval required",
            "Claude: findings and evidence; no changes made",
            "OpenAI: REVIEW; do not merge or deploy",
        )
        assert report["paid_calls_enabled"] is False
        assert report["status"] == "REVIEW"
        assert len(report["request_previews"]) == 2
        assert db.settle("claude-task",200)
        assert db.settle("openai-review",200)
        assert db.reserve("spare","2026-10",100)
        for provider in ("anthropic","openai"):
            try:
                send_request(Exchange(provider,"unused-model","Never send",10))
            except TransportError:
                pass
            else:
                raise AssertionError("Paid API call unexpectedly permitted")
        return {"result":"PASS","mode":"OFFLINE_ONLY","simulated_requests":2,
                "api_requests_sent":0,"repository_writes":0,"production_deploys":0,
                "founder_review_required":True}

if __name__=="__main__":
    print(json.dumps(smoke(),indent=2))
