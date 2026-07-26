"""RapidOCR fallback: render PDF pages to images via pypdfium2, OCR with RapidOCR.

Used by convert.py when Docling raises ConversionError / NeedsOCRError.
Self-contained so it can also be run directly for testing:

    python scripts/fallback_rapidocr.py "input/x.pdf" --output output/

Dependencies (all in the external OCR venv):
  - rapidocr (ONNX) — must be pinned to a Thai recognition model, see below
  - pypdfium2 (renders PDF → PIL image, no external poppler needed)
  - Pillow, numpy

Recognition model:
  RapidOCR's stock rec model (PP-OCRv6_rec_small) has an 18,708-entry charset
  with ZERO Thai characters — it silently transliterates Thai into Latin
  lookalikes ("ระบบบริหาร" -> "VUUNMLAS") instead of failing. Every source
  document in this project is Thai, so tier 3 pins `th_PP-OCRv5_rec_mobile`
  (524 entries, 83 of them Thai). Measured on the source document p.3:
  stock model produced 0 Thai characters, the Thai model 689.
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

REPLACEMENT_CHAR = "\ufffd"

# Recognition language. Every source document in this project is Thai; the
# stock RapidOCR rec model has no Thai in its charset (see module docstring).
DEFAULT_LANG = "th"

# Render scale for pypdfium2 (multiplier on 72 dpi). 2.0 \u2248 144 dpi measured
# best on the source document; 4.0 started dropping Thai characters.
DEFAULT_SCALE = 2.0


def require_usable_text(markdown: str, *, source_label: str = "PDF (RapidOCR)") -> str:
    if not markdown or len(markdown) < 1:
        raise ValueError(f"{source_label}: empty result")
    ratio = markdown.count(REPLACEMENT_CHAR) / len(markdown)
    if ratio > 0.5:  # OCR may have some noise; allow higher ratio than Docling
        raise ValueError(f"{source_label}: too many replacement chars ({ratio:.0%})")
    return markdown


def build_engine(lang: str = DEFAULT_LANG):
    """Construct a RapidOCR engine pinned to a language-specific rec model.

    Raises RuntimeError if the model cannot be loaded (e.g. first run offline),
    rather than silently falling back to a rec model that cannot read Thai.
    """
    from rapidocr import RapidOCR
    from rapidocr.utils.typings import LangRec, ModelType, OCRVersion

    try:
        lang_rec = LangRec(lang)
    except ValueError as exc:
        supported = ", ".join(e.value for e in LangRec)
        raise ValueError(f"unsupported rec language {lang!r}; supported: {supported}") from exc

    try:
        return RapidOCR(params={
            "Rec.lang_type": lang_rec,
            "Rec.ocr_version": OCRVersion.PPOCRV5,
            "Rec.model_type": ModelType.MOBILE,
            # Engine pre-filters at 0.5 by default, which would make our own
            # min_confidence gate (0.3) unreachable — align the two.
            "Global.text_score": 0.3,
        })
    except Exception as exc:
        raise RuntimeError(
            f"could not load '{lang}' recognition model "
            f"({type(exc).__name__}: {exc}). The model is downloaded on first "
            f"use — check network access to modelscope.cn."
        ) from exc


def render_pages(pdf_path: Path, *, scale: float = DEFAULT_SCALE):
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


def ocr_with_rapidocr(
    pdf_path: Path,
    *,
    min_confidence: float = 0.3,
    scale: float = DEFAULT_SCALE,
    lang: str = DEFAULT_LANG,
    time_budget_seconds: float | None = None,
) -> str:
    """OCR every page; return concatenated Markdown.

    Raises TimeoutError when time_budget_seconds is exceeded between pages,
    and ValueError when no page yields any text (a blank scan must surface
    as needs_review, not as a successful conversion).
    """
    import numpy as np

    try:
        from extract_textlayer import fix_thai_encoding
    except ImportError:
        import importlib.util
        here = Path(__file__).parent / "extract_textlayer.py"
        spec = importlib.util.spec_from_file_location("extract_textlayer", here)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        fix_thai_encoding = mod.fix_thai_encoding

    engine = build_engine(lang)
    pages_text: list[str] = []
    any_text = False
    t0 = time.perf_counter()
    for page_num, pil in render_pages(pdf_path, scale=scale):
        if (time_budget_seconds is not None
                and time.perf_counter() - t0 > time_budget_seconds):
            raise TimeoutError(
                f"OCR exceeded {time_budget_seconds:.0f}s budget "
                f"at page {page_num}"
            )
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
            any_text = True
            pages_text.append(f"## หน้า {page_num}\n\n" + "\n".join(lines))
        else:
            pages_text.append(f"## หน้า {page_num}\n\n_(ไม่พบข้อความ)_")
    if not any_text:
        raise ValueError(
            f"no text detected in any of {len(pages_text)} page(s); "
            "route to manual review"
        )
    # Quality gate applied here so every caller (CLI, convert.py, server)
    # inherits it — a garbage result must not be reported as success.
    return require_usable_text("\n\n".join(pages_text).strip())


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("pdf", type=Path)
    p.add_argument("--output", type=Path, default=Path("output"))
    p.add_argument("--scale", type=float, default=DEFAULT_SCALE,
                   help=f"Render scale (default {DEFAULT_SCALE} ≈ 144 dpi)")
    p.add_argument("--lang", default=DEFAULT_LANG,
                   help=f"Recognition language (default {DEFAULT_LANG})")
    args = p.parse_args()

    if not args.pdf.is_file():
        print(f"[error] PDF not found: {args.pdf}", file=sys.stderr)
        return 2

    t0 = time.perf_counter()
    print(f"[rapidocr] OCR {args.pdf.name} ...", file=sys.stderr)
    markdown = ocr_with_rapidocr(args.pdf, scale=args.scale, lang=args.lang)
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
