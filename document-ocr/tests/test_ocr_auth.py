"""Issue #147 — auth gate ของ convert_server (ocr_auth.py) ต้อง fail-closed.

อ่านกติกาเต็มที่ docstring ของ scripts/ocr_auth.py — สรุปสั้น:
secret ตั้ง = ต้องมี header ตรง; secret ไม่ตั้ง = ปฏิเสธ ยกเว้น opt-in ชัดเจน
"""
from __future__ import annotations

import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent.parent / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))

from ocr_auth import auth_state, request_authorized


def hdr(value: str | None):
    """get_header fake: คืนค่าเมื่อถามชื่อ header ของเรา ไม่งั้นคืน None (รูป FastAPI)"""
    return lambda name: value if name == "x-ocr-secret" else None


def test_secret_set_accepts_matching_header():
    env = {"OCR_SHARED_SECRET": "s3cret"}
    assert request_authorized(hdr("s3cret"), env) is True


def test_secret_set_rejects_wrong_and_missing_header():
    env = {"OCR_SHARED_SECRET": "s3cret"}
    assert request_authorized(hdr("wrong"), env) is False
    assert request_authorized(hdr(None), env) is False


def test_secret_blank_is_rejected_fail_closed():
    # ไม่ตั้ง secret และไม่ opt-in = ปฏิเสธ แม้จะส่ง header มาด้วย
    assert request_authorized(hdr("anything"), {}) is False
    assert request_authorized(hdr(None), {"OCR_SHARED_SECRET": "   "}) is False


def test_no_secret_optin_allows_local_dev():
    assert request_authorized(hdr(None), {"OCR_ALLOW_UNAUTHENTICATED": "1"}) is True


def test_auth_state_reports_secret_open_locked():
    assert auth_state({"OCR_SHARED_SECRET": "x"}) == "secret"
    assert auth_state({"OCR_ALLOW_UNAUTHENTICATED": "1"}) == "open"
    assert auth_state({}) == "locked"
