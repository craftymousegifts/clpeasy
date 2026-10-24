#!/usr/bin/env python3
"""Offline regression tests for ai_handover_report.py pagination; no network."""
import importlib.util
import io
import os
import unittest
from contextlib import redirect_stdout
from unittest import mock

_spec = importlib.util.spec_from_file_location(
    "ai_handover_report", os.path.join(os.path.dirname(__file__), "ai_handover_report.py"))
report = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(report)

BASE = "https://api.github.com/repos/craftymousegifts/clpeasy/issues/230/comments?per_page=100"
MULTI_PAGE_LINK = f'<{BASE}&page=2>; rel="next", <{BASE}&page=3>; rel="last"'


class LastPageUrlTests(unittest.TestCase):
    def test_multi_page_link_header_returns_last_url(self):
        self.assertEqual(report.last_page_url(MULTI_PAGE_LINK), f"{BASE}&page=3")

    def test_single_page_has_no_last_url(self):
        self.assertIsNone(report.last_page_url(""))
        self.assertIsNone(report.last_page_url(f'<{BASE}&page=2>; rel="next"'))


class MainPaginationTests(unittest.TestCase):
    def test_main_reports_latest_comment_from_last_page(self):
        pages = {
            BASE: ([{"html_url": "page-1-comment"}], MULTI_PAGE_LINK),
            f"{BASE}&page=3": ([{"html_url": "page-3-older"}, {"html_url": "page-3-latest"}], ""),
        }
        with mock.patch.object(report, "fetch_json", side_effect=lambda url: pages[url]) as fetch, \
                mock.patch.dict(os.environ, {"GITHUB_STEP_SUMMARY": ""}), \
                redirect_stdout(io.StringIO()) as out:
            report.main()
        self.assertEqual([c.args[0] for c in fetch.call_args_list], [BASE, f"{BASE}&page=3"])
        self.assertIn("- Latest comment: page-3-latest", out.getvalue())


if __name__ == "__main__":
    unittest.main()
