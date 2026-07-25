"""Convert one PDF to Markdown using Docling (default, fail-closed).

Engine lives in hrrag-myjobs venv (NOT smart-port). Run with that Python:

    D:\\hr-hackathon\\hrrag-myjobs\\backend\\.venv\\Scripts\\python.exe \
        scripts/convert.py "input/Data Dictionary.pdf" --output output/

Strategy (matches hrrag-myjobs `app/ingestion/docling_worker.py` + `quality.py`):
  - Docling with `do_ocr=False` → only the PDF's embedded text layer is used
  - Empty / corrupted text layer raises NeedsOCRError → route to human review
    (NO automatic OCR — fail-closed contract for HR data)
  - Only accepted fallback = explicit, human-approved reviewed-Markdown
    file (opt-in per file via --fallback-markdown).

Writes:
  output/<stem>/<stem>.md     — converted Markdown
  output/<stem>/_meta.json    — engine, status, timing, warnings
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ENGINE_NAME = "docling"
REPLACEMENT_CHAR = "\ufffd"


class ConversionError(Exception):
    """Tooling failure during conversion (missing engine, timeout, crash)."""


class NeedsOCRError(ConversionError):
    """Source has no usable text layer → route to OCR / manual review."""


def require_usable_text(
    markdown: str,
    *,
    min_text_chars: int = 1,
    max_replacement_char_ratio: float = 0.2,
    source_label: str = "PDF",
) -> str:
    """Raise NeedsOCRError if the converted text is empty or corrupted."""
    if not markdown or len(markdown) < min_text_chars:
        raise NeedsOCRError(
            f"{source_label} has no usable text layer "
            "(empty or near-empty output); route to OCR or manual review"
        )
    ratio = markdown.count(REPLACEMENT_CHAR) / len(markdown) if markdown else 0.0
    if ratio > max_replacement_char_ratio:
        raise NeedsOCRError(
            f"{source_label} text layer is corrupted; route to OCR or manual review"
        )
    return markdown


# Child-process payload. Docling is imported lazily inside the child so the
# parent (which only needs stdlib) can spawn, enforce a timeout, and survive a
# hang/OOM in the model.
_SUBLING_CODE = (
    "import sys, os\n"
    "from pathlib import Path\n"
    "from docling.datamodel.base_models import InputFormat\n"
    "from docling.datamodel.pipeline_options import PdfPipelineOptions\n"
    "from docling.document_converter import DocumentConverter, PdfFormatOption\n"
    "artifacts = os.environ.get('DOCLING_ARTIFACTS_PATH')\n"
    "po = PdfPipelineOptions(do_ocr=False, "
    "artifacts_path=Path(artifacts) if artifacts else None)\n"
    "conv = DocumentConverter(format_options={"
    "InputFormat.PDF: PdfFormatOption(pipeline_options=po)})\n"
    "md = conv.convert(sys.argv[1]).document.export_to_markdown()\n"
    "sys.stdout.write(md)\n"
)


def convert_with_docling(
    pdf_path: Path,
    *,
    artifacts_path: Path | None = None,
    timeout_seconds: int = 900,
) -> str:
    """Run Docling (do_ocr=False) in a child process with a hard timeout."""
    env = dict(os.environ)
    if artifacts_path is not None:
        env["DOCLING_ARTIFACTS_PATH"] = str(artifacts_path)
    try:
        proc = subprocess.run(
            [sys.executable, "-c", _SUBLING_CODE, str(pdf_path)],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout_seconds,
            env=env,
        )
    except subprocess.TimeoutExpired as e:
        raise ConversionError(
            f"Docling timed out after {timeout_seconds}s "
            "(first run downloads models)"
        ) from e
    if proc.returncode != 0:
        raise ConversionError(
            f"Docling failed (exit {proc.returncode}): "
            f"{(proc.stderr or '').strip()[:500]}"
        )
    markdown = proc.stdout.strip()
    return require_usable_text(markdown, source_label="PDF (Docling)")


def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def write_outputs(
    markdown: str,
    *,
    source: Path,
    output_dir: Path,
    status: str,
    started_at: str,
    finished_at: str,
    warnings: list[str],
    elapsed_seconds: float,
    engine: str = ENGINE_NAME,
) -> Path:
    """Write <stem>/<stem>.md + <stem>/_meta.json under output_dir."""
    stem = source.stem or "document"
    target_dir = output_dir / stem
    target_dir.mkdir(parents=True, exist_ok=True)
    md_path = target_dir / f"{stem}.md"
    md_path.write_text(markdown, encoding="utf-8")
    meta = {
        "source": source.name,
        "engine": engine,
        "status": status,
        "started_at": started_at,
        "finished_at": finished_at,
        "elapsed_seconds": round(elapsed_seconds, 2),
        "output_chars": len(markdown),
        "warnings": warnings,
    }
    (target_dir / "_meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return md_path


def main() -> int:
    p = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("pdf", type=Path, help="Input PDF")
    p.add_argument(
        "--output", type=Path, default=Path("output"),
        help="Output directory (default: ./output)",
    )
    p.add_argument(
        "--timeout-seconds", type=int, default=900,
        help="Hard timeout for Docling (default 900s; first run downloads models)",
    )
    p.add_argument(
        "--fallback-markdown", type=Path, default=None,
        help="Explicit human-reviewed Markdown to use if all engines fail",
    )
    p.add_argument(
        "--no-fallback", action="store_true",
        help="Disable auto-OCR fallback (RapidOCR); fail-closed to human review",
    )
    p.add_argument(
        "--artifacts-path", type=Path, default=None,
        help="Pre-baked Docling model artifacts dir (env DOCLING_ARTIFACTS_PATH)",
    )
    p.add_argument(
        "--force", action="store_true",
        help="Re-convert even if output is already newer than source PDF",
    )
    args = p.parse_args()

    pdf: Path = args.pdf
    if not pdf.exists() or not pdf.is_file():
        print(f"[error] PDF not found: {pdf}", file=sys.stderr)
        return 2
    args.output.mkdir(parents=True, exist_ok=True)

    stem = pdf.stem or "document"
    existing_md = args.output / stem / f"{stem}.md"
    if not args.force and existing_md.is_file():
        if existing_md.stat().st_mtime >= pdf.stat().st_mtime:
            print(f"[skip] {existing_md} is already newer than {pdf.name} "
                  f"(use --force to re-convert)")
            meta_path = args.output / stem / "_meta.json"
            try:
                meta = json.loads(meta_path.read_text(encoding="utf-8"))
            except (FileNotFoundError, json.JSONDecodeError):
                meta = {"source": pdf.name}
            meta.setdefault("skip_log", []).append(
                f"{now_iso()} skipped (output newer than source)")
            meta_path.write_text(
                json.dumps(meta, ensure_ascii=False, indent=2),
                encoding="utf-8")
            return 0

    started_iso = now_iso()
    t0 = time.perf_counter()
    warnings: list[str] = []
    status = "success"
    engine_used = ENGINE_NAME
    markdown = ""
    try:
        markdown = convert_with_docling(
            pdf,
            artifacts_path=args.artifacts_path,
            timeout_seconds=args.timeout_seconds,
        )
    except (NeedsOCRError, ConversionError) as e:
        # Docling failed (text layer unusable OR engine crash/timeout/OOM).
        # smart-port allows AUTO fallback (unlike hrrag-myjobs fail-closed).
        warnings.append(f"docling_{type(e).__name__}: {str(e)[:200]}")
        if args.no_fallback:
            status = "needs_review"
        else:
            # Tier 2: pypdfium2 text-layer extraction (preserves Thai perfectly)
            print("[warn] Docling failed → trying text-layer extraction",
                  file=sys.stderr)
            try:
                from extract_textlayer import convert_pdf as extract_textlayer
            except ImportError:
                import importlib.util
                here = Path(__file__).parent / "extract_textlayer.py"
                spec = importlib.util.spec_from_file_location(
                    "extract_textlayer", here)
                mod = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(mod)
                extract_textlayer = mod.convert_pdf
            try:
                markdown, _pages = extract_textlayer(pdf)
                markdown = require_usable_text(
                    markdown, source_label="PDF (text-layer)")
                engine_used = "pypdfium2_textlayer"
                status = "used_textlayer_fallback"
            except Exception as tl_err:
                warnings.append(
                    f"textlayer_{type(tl_err).__name__}: {str(tl_err)[:200]}")
                # Tier 3: RapidOCR (image OCR — last resort)
                print("[warn] Text-layer failed → trying RapidOCR",
                      file=sys.stderr)
                try:
                    from fallback_rapidocr import ocr_with_rapidocr
                except ImportError:
                    import importlib.util
                    here = Path(__file__).parent / "fallback_rapidocr.py"
                    spec = importlib.util.spec_from_file_location(
                        "fallback_rapidocr", here)
                    mod = importlib.util.module_from_spec(spec)
                    spec.loader.exec_module(mod)
                    ocr_with_rapidocr = mod.ocr_with_rapidocr
                try:
                    markdown = ocr_with_rapidocr(pdf)
                    engine_used = "rapidocr"
                    status = "used_rapidocr_fallback"
                except Exception as ocr_err:
                    warnings.append(
                        f"rapidocr_{type(ocr_err).__name__}: {str(ocr_err)[:200]}")
                    if args.fallback_markdown and args.fallback_markdown.is_file():
                        fb = args.fallback_markdown.read_text(
                            encoding="utf-8").strip()
                        if fb:
                            markdown = fb
                            engine_used = "reviewed"
                            status = "used_reviewed_fallback"
                            warnings.append(
                                f"used_fallback: {args.fallback_markdown}")
                    else:
                        status = "needs_review"

    md_path = write_outputs(
        markdown, source=pdf, output_dir=args.output, status=status,
        started_at=started_iso, finished_at=now_iso(),
        warnings=warnings, elapsed_seconds=time.perf_counter() - t0,
        engine=engine_used,
    )
    print(f"[ok] {status}: {md_path}")
    print(f"     engine={engine_used} chars={len(markdown)} "
          f"elapsed={time.perf_counter()-t0:.1f}s")
    if status == "needs_review":
        print(
            "[action] Text layer unusable — route to human review, then re-run "
            "with --fallback-markdown <reviewed.md>",
            file=sys.stderr,
        )
        return 3
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

