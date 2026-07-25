"""Batch-convert all PDFs in input/ → output/ using the Docling → RapidOCR chain.

Run with the hrrag-myjobs venv:

    D:\\hr-hackathon\\hrrag-myjobs\\backend\\.venv\\Scripts\\python.exe \
        scripts/batch_convert.py [--input input/] [--output output/]
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

from convert import (
    ConversionError,
    NeedsOCRError,
    convert_with_docling,
    now_iso,
    write_outputs,
)
from fallback_rapidocr import ocr_with_rapidocr


def convert_one(pdf: Path, output_dir: Path, *, no_fallback: bool = False) -> str:
    """Convert a single PDF; return status string."""
    started = now_iso()
    t0 = time.perf_counter()
    warnings: list[str] = []
    engine = "docling"
    status = "success"
    markdown = ""

    try:
        markdown = convert_with_docling(pdf, timeout_seconds=900)
    except (NeedsOCRError, ConversionError) as e:
        warnings.append(f"docling_{type(e).__name__}: {str(e)[:200]}")
        if no_fallback:
            status = "needs_review"
        else:
            try:
                markdown = ocr_with_rapidocr(pdf)
                engine = "rapidocr"
                status = "used_rapidocr_fallback"
            except Exception as ocr_err:
                warnings.append(f"rapidocr_{type(ocr_err).__name__}: {str(ocr_err)[:200]}")
                status = "needs_review"

    write_outputs(
        markdown, source=pdf, output_dir=output_dir, status=status,
        started_at=started, finished_at=now_iso(),
        warnings=warnings, elapsed_seconds=time.perf_counter() - t0,
        engine=engine,
    )
    return status


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--input", type=Path, default=Path("input"))
    p.add_argument("--output", type=Path, default=Path("output"))
    p.add_argument("--no-fallback", action="store_true")
    args = p.parse_args()

    pdfs = sorted(args.input.glob("*.pdf"))
    if not pdfs:
        print(f"[warn] No PDF files in {args.input}/", file=sys.stderr)
        return 1

    print(f"[batch] {len(pdfs)} PDF(s) in {args.input}/")
    results: dict[str, int] = {}
    for i, pdf in enumerate(pdfs, 1):
        print(f"  [{i}/{len(pdfs)}] {pdf.name} ...", end=" ", flush=True)
        status = convert_one(pdf, args.output, no_fallback=args.no_fallback)
        results[status] = results.get(status, 0) + 1
        print(status)

    print(f"\n[done] {len(pdfs)} files: {results}")
    return 0 if results.get("needs_review", 0) == 0 else 3


if __name__ == "__main__":
    raise SystemExit(main())
