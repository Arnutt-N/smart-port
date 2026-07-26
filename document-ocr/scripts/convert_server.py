"""FastAPI server wrapping the Docling → text-layer → RapidOCR conversion chain.

Run with the external OCR venv (real path: internal note under research/docs-ocr/):

    <OCR_VENV_PYTHON> scripts/convert_server.py [--port 8100]

PHP backend calls:
    POST /convert  (raw body = PDF bytes, header X-Filename: name.pdf)
        → JSON {status, engine, markdown, meta}
    GET  /health   → {"ok": true}

The chain mirrors convert.py exactly (Docling → pypdfium2 text-layer →
RapidOCR); conversion runs in a worker thread so /health stays responsive.
"""
from __future__ import annotations

import argparse
import re
import tempfile
import time
from pathlib import Path

import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from convert import (
    ConversionError,
    NeedsOCRError,
    convert_with_docling,
    require_usable_text,
)
from extract_textlayer import convert_pdf as extract_textlayer
from fallback_rapidocr import ocr_with_rapidocr

MAX_UPLOAD_BYTES = 50 * 1024 * 1024   # matches backend/routes/ocr.php limit
DOCLING_TIMEOUT_SECONDS = 900
OCR_TIME_BUDGET_SECONDS = 600

# Dedicated temp dir (gitignored via document-ocr/output rules) so files that
# survive a crash are found and purged at next startup, not stranded in %TEMP%.
TMP_DIR = Path(__file__).resolve().parent.parent / "tmp"
_STALE_AFTER_SECONDS = 24 * 3600

_PAGE_MARKER_RE = re.compile(r"^(## หน้า \d+|_\(ไม่พบข้อความ\)_)$", re.M)

app = FastAPI(title="smart-port document-ocr", version="1.1.0")


def _purge_stale_tmp() -> None:
    TMP_DIR.mkdir(parents=True, exist_ok=True)
    cutoff = time.time() - _STALE_AFTER_SECONDS
    for f in TMP_DIR.glob("*.pdf"):
        try:
            if f.stat().st_mtime < cutoff:
                f.unlink()
        except OSError:
            pass  # in use or already gone


_purge_stale_tmp()


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/convert")
async def convert(request: Request):
    filename = request.headers.get("x-filename", "upload.pdf")
    content = await request.body()
    if not content:
        return JSONResponse(status_code=422, content={"error": "Empty body"})
    if len(content) > MAX_UPLOAD_BYTES:
        return JSONResponse(
            status_code=413,
            content={"error": f"PDF exceeds {MAX_UPLOAD_BYTES // (1024 * 1024)}MB limit"},
        )
    if not content[:5].startswith(b"%PDF"):
        return JSONResponse(
            status_code=422,
            content={"error": "Body does not look like a PDF (missing %PDF header)"},
        )

    TMP_DIR.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(suffix=".pdf", dir=TMP_DIR, delete=False) as tmp:
        tmp.write(content)
        tmp_path = Path(tmp.name)

    try:
        # Worker thread keeps the event loop (and /health) responsive
        result = await run_in_threadpool(_run_chain, tmp_path, filename)
    finally:
        tmp_path.unlink(missing_ok=True)

    return result


def _run_chain(pdf_path: Path, original_name: str) -> dict:
    """Docling → pypdfium2 text-layer → RapidOCR, same order as convert.py."""
    t0 = time.perf_counter()
    warnings: list[str] = []
    engine = "docling"
    status = "success"
    markdown: str | None = None

    try:
        markdown = convert_with_docling(
            pdf_path, timeout_seconds=DOCLING_TIMEOUT_SECONDS)
    except (NeedsOCRError, ConversionError) as e:
        warnings.append(f"docling_{type(e).__name__}: {str(e)[:200]}")

        # Tier 2: text layer (fast; perfect Thai when a text layer exists)
        try:
            markdown, _pages = extract_textlayer(pdf_path)
            content_only = _PAGE_MARKER_RE.sub("", markdown).strip()
            require_usable_text(content_only, source_label="PDF (text-layer)")
            engine = "pypdfium2_textlayer"
            status = "used_textlayer_fallback"
        except Exception as tl_err:
            warnings.append(
                f"textlayer_{type(tl_err).__name__}: {str(tl_err)[:200]}")

            # Tier 3: RapidOCR (Thai rec model; quality-gated internally)
            try:
                markdown = ocr_with_rapidocr(
                    pdf_path, time_budget_seconds=OCR_TIME_BUDGET_SECONDS)
                engine = "rapidocr"
                status = "used_rapidocr_fallback"
            except Exception as ocr_err:
                warnings.append(
                    f"rapidocr_{type(ocr_err).__name__}: {str(ocr_err)[:200]}")
                return {
                    "status": "needs_review",
                    "engine": None,
                    "markdown": None,
                    "meta": {
                        "source": original_name,
                        "warnings": warnings,
                        "elapsed_seconds": round(time.perf_counter() - t0, 2),
                    },
                }

    return {
        "status": status,
        "engine": engine,
        "markdown": markdown,
        "meta": {
            "source": original_name,
            "engine": engine,
            "status": status,
            "output_chars": len(markdown),
            "elapsed_seconds": round(time.perf_counter() - t0, 2),
            "warnings": warnings,
        },
    }


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8100)
    args = p.parse_args()
    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
