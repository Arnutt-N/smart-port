"""FastAPI server wrapping the Docling → RapidOCR conversion chain.

Run with the hrrag-myjobs venv:

    D:\\hr-hackathon\\hrrag-myjobs\\backend\\.venv\\Scripts\\python.exe \
        scripts/convert_server.py [--port 8100]

PHP backend calls:
    POST /convert  (raw body = PDF bytes, header X-Filename: name.pdf)
        → JSON {status, engine, markdown, meta}
    GET  /health   → {"ok": true}
"""
from __future__ import annotations

import argparse
import tempfile
import time
from pathlib import Path

import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from convert import (
    ConversionError,
    NeedsOCRError,
    convert_with_docling,
)
from fallback_rapidocr import ocr_with_rapidocr

app = FastAPI(title="smart-port document-ocr", version="1.0.0")


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/convert")
async def convert(request: Request):
    filename = request.headers.get("x-filename", "upload.pdf")
    content = await request.body()
    if not content:
        return JSONResponse(status_code=422, content={"error": "Empty body"})
    if not content[:5].startswith(b"%PDF"):
        return JSONResponse(
            status_code=422,
            content={"error": "Body does not look like a PDF (missing %PDF header)"},
        )

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(content)
        tmp_path = Path(tmp.name)

    try:
        result = _run_chain(tmp_path, filename)
    finally:
        tmp_path.unlink(missing_ok=True)

    return result


def _run_chain(pdf_path: Path, original_name: str) -> dict:
    t0 = time.perf_counter()
    warnings: list[str] = []
    engine = "docling"
    status = "success"

    try:
        markdown = convert_with_docling(pdf_path, timeout_seconds=900)
    except (NeedsOCRError, ConversionError) as e:
        warnings.append(f"docling_{type(e).__name__}: {str(e)[:200]}")
        try:
            markdown = ocr_with_rapidocr(pdf_path)
            engine = "rapidocr"
            status = "used_rapidocr_fallback"
        except Exception as ocr_err:
            warnings.append(f"rapidocr_{type(ocr_err).__name__}: {str(ocr_err)[:200]}")
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
