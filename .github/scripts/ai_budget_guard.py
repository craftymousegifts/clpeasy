#!/usr/bin/env python3
"""Offline-only budget reservation prototype. NOT safe for paid API activation.

All amounts in integer GBP pence. This file intentionally has no API client,
currency conversion, persistent store or live-mode switch.
"""
from dataclasses import dataclass, field

MONTHLY_LIMIT_PENCE = 500

@dataclass
class OfflineBudget:
    month: str
    spent_pence: int = 0
    reservations: dict = field(default_factory=dict)

    def reserve(self, request_id: str, max_cost_pence: int) -> bool:
        if not request_id or request_id in self.reservations:
            return False
        if type(max_cost_pence) is not int or max_cost_pence <= 0:
            return False
        if self.spent_pence + sum(self.reservations.values()) + max_cost_pence > MONTHLY_LIMIT_PENCE:
            return False
        self.reservations[request_id] = max_cost_pence
        return True

    def settle(self, request_id: str, actual_cost_pence: int) -> bool:
        reserved = self.reservations.get(request_id)
        if reserved is None or type(actual_cost_pence) is not int or actual_cost_pence < 0 or actual_cost_pence > reserved:
            return False
        self.spent_pence += actual_cost_pence
        del self.reservations[request_id]
        return True

    def cancel(self, request_id: str) -> bool:
        if request_id not in self.reservations:
            return False
        del self.reservations[request_id]
        return True

def live_calls_permitted() -> bool:
    """Fail closed: offline prototype cannot approve paid calls."""
    return False
