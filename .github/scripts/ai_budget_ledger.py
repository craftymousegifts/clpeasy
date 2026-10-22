#!/usr/bin/env python3
"""SQLite transactional budget simulator; no provider calls or activation switch.

A single shared durable SQLite DB on a persistent filesystem can serialize
reservations. GitHub-hosted runners do NOT share a filesystem, so this is
NOT a cross-run production solution and must never authorise paid calls.
"""
import sqlite3
import re

LIMIT_PENCE = 500

class BudgetLedger:
    def __init__(self, path):
        self.path = path
        with self._connect() as db:
            db.execute("CREATE TABLE IF NOT EXISTS requests (id TEXT PRIMARY KEY, month TEXT NOT NULL, reserved INTEGER NOT NULL, actual INTEGER, status TEXT NOT NULL)")
    def _connect(self):
        db = sqlite3.connect(self.path, timeout=10, isolation_level=None)
        db.execute("PRAGMA busy_timeout=10000")
        return db
    def reserve(self, request_id, month, maximum_pence):
        if not isinstance(request_id, str) or not request_id.strip() or len(request_id)>128 or not isinstance(month, str) or not re.fullmatch(r"[0-9]{4}-(0[1-9]|1[0-2])",month):
            return False
        if type(maximum_pence) is not int or maximum_pence <= 0 or maximum_pence > LIMIT_PENCE:
            return False
        with self._connect() as db:
            db.execute("BEGIN IMMEDIATE")
            try:
                spent = db.execute("SELECT COALESCE(SUM(CASE WHEN status='settled' THEN actual ELSE reserved END),0) FROM requests WHERE month=? AND status IN ('reserved','settled')", (month,)).fetchone()[0]
                if spent + maximum_pence > LIMIT_PENCE:
                    db.rollback()
                    return False
                db.execute("INSERT INTO requests(id,month,reserved,actual,status) VALUES (?,?,?,NULL,'reserved')", (request_id,month,maximum_pence))
                db.commit()
                return True
            except sqlite3.IntegrityError:
                db.rollback()
                return False
    def settle(self, request_id, actual_pence):
        if type(actual_pence) is not int or actual_pence < 0:
            return False
        with self._connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT reserved,status FROM requests WHERE id=?", (request_id,)).fetchone()
            if not row or row[1] != 'reserved' or actual_pence > row[0]:
                db.rollback()
                return False
            db.execute("UPDATE requests SET actual=?,status='settled' WHERE id=?", (actual_pence,request_id))
            db.commit()
            return True
    def cancel(self, request_id):
        # Not safe to release a reservation for a sent/uncertain provider call.
        # This prototype deliberately never releases reservations.
        return False

def live_calls_permitted():
    return False
