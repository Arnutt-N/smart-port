"""Auth gate ของ convert_server — Issue #147.

แยกเป็นโมดูลเพื่อเทสได้โดยไม่ต้องติดตั้ง fastapi/uvicorn (เทสหลักของ repo
นี้รันใน venv ที่ไม่มี deps ของ server)

กติกา fail-closed:
  - ตั้ง OCR_SHARED_SECRET  → ต้องมี header X-OCR-Secret ตรงเป๊ะ (constant-time)
  - ไม่ตั้ง secret           → ปฏิเสธทุกคำขอ ยกเว้น OCR_ALLOW_UNAUTHENTICATED=1
    (สำหรับ local dev / e2e ในเครื่อง ที่ service ไม่โผล่สู่ internet)
"""
from __future__ import annotations

import hmac
import os
from typing import Callable, Mapping

SECRET_ENV = "OCR_SHARED_SECRET"
ALLOW_ENV = "OCR_ALLOW_UNAUTHENTICATED"
HEADER_NAME = "x-ocr-secret"


def request_authorized(get_header: Callable[[str], str],
                       env: Mapping[str, str] | None = None) -> bool:
    e = os.environ if env is None else env
    expected = (e.get(SECRET_ENV) or "").strip()
    if expected:
        got = get_header(HEADER_NAME) or ""
        return hmac.compare_digest(got, expected)
    return (e.get(ALLOW_ENV) or "") == "1"


def auth_state(env: Mapping[str, str] | None = None) -> str:
    """สถานะที่ /health รายงาน: secret | open | locked"""
    e = os.environ if env is None else env
    if (e.get(SECRET_ENV) or "").strip():
        return "secret"
    return "open" if (e.get(ALLOW_ENV) or "") == "1" else "locked"
