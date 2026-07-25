"""RapidOCR fallback: render PDF pages to images via pypdfium2, OCR with RapidOCR.

Used by convert.py when Docling raises ConversionError / NeedsOCRError.
Self-contained so it can also be run directly for testing:

    python scripts/fallback_rapidocr.py "input/x.pdf" --output output/

Dependencies (all in hrrag-myjobs venv):
  - rapidocr (ONNX, multilingual incl. Thai/English)
  - pypdfium2 (renders PDF → PIL image, no external poppler needed)
  - Pillow, numpy
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

REPLACEMENT_CHAR = "\ufffd"


def require_usable_text(markdown: str, *, source_label: str = "PDF (RapidOCR)") -> str:
    if not markdown or len(markdown) < 1:
        raise ValueError(f"{source_label}: empty result")
    ratio = markdown.count(REPLACEMENT_CHAR) / len(markdown)
    if ratio > 0.5:  # OCR may have some noise; allow higher ratio than Docling
        raise ValueError(f"{source_label}: too many replacement chars ({ratio:.0%})")
    return markdown


def render_pages(pdf_path: Path, *, scale: float = 2.0):
    """Yield (page_num, PIL.Image) for every page. scale=2 ≈ 144 dpi."""
    import pypdfium2 as pdfium

    pdf = pdfium.PdfDocument(str(pdf_path))
    try:
        n_pages = len(pdf)
        for i in range(n_pages):
            page = pdf[i]
            bitmap = page.render(scale=scale)
            pil = bitmap.to_pil()
            yield i + 1, pil
    finally:
        pdf.close()


def ocr_with_rapidocr(pdf_path: Path, *, min_confidence: float = 0.3, scale: float = 1.5) -> str:
    """OCR every page; return concatenated Markdown."""
    import numpy as np
    from rapidocr import RapidOCR

    try:
        from extract_textlayer import fix_thai_encoding
    except ImportError:
        import importlib.util
        here = Path(__file__).parent / "extract_textlayer.py"
        spec = importlib.util.spec_from_file_location("extract_textlayer", here)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        fix_thai_encoding = mod.fix_thai_encoding

    engine = RapidOCR()
    pages_text: list[str] = []
    for page_num, pil in render_pages(pdf_path, scale=scale):
        img = np.array(pil.convert("RGB"))
        out = engine(img)
        lines: list[str] = []
        if out.txts:
            for text, score in zip(out.txts, out.scores):
                if isinstance(text, str) and text.strip():
                    if isinstance(score, (int, float)) and score < min_confidence:
                        continue
                    lines.append(fix_thai_encoding(text.strip()))
        if lines:
            pages_text.append(f"## หน้า {page_num}\n\n" + "\n".join(lines))
        else:
            pages_text.append(f"## หน้า {page_num}\n\n_(ไม่พบข้อความ)_")
    return "\n\n".join(pages_text).strip()


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("pdf", type=Path)
    p.add_argument("--output", type=Path, default=Path("output"))
    p.add_argument("--scale", type=float, default=1.5, help="Render scale (default 1.5 ≈ 108 dpi)")
    args = p.parse_args()

    if not args.pdf.is_file():
        print(f"[error] PDF not found: {args.pdf}", file=sys.stderr)
        return 2

    t0 = time.perf_counter()
    print(f"[rapidocr] OCR {args.pdf.name} ...", file=sys.stderr)
    markdown = ocr_with_rapidocr(args.pdf, scale=args.scale)
    markdown = require_usable_text(markdown)
    elapsed = time.perf_counter() - t0

    args.output.mkdir(parents=True, exist_ok=True)
    md_path = args.output / args.pdf.stem / f"{args.pdf.stem}.md"
    md_path.parent.mkdir(parents=True, exist_ok=True)
    md_path.write_text(markdown, encoding="utf-8")
    print(f"[ok] {md_path} ({len(markdown)} chars, {elapsed:.1f}s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
