"""Tests for the Docling → RapidOCR fallback chain in convert.py."""
from __future__ import annotations

import json
import sys
from pathlib import Path
from unittest.mock import patch

import pytest

SCRIPTS_DIR = Path(__file__).resolve().parent.parent / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))

from convert import ConversionError, NeedsOCRError, require_usable_text, write_outputs
from fallback_rapidocr import (
    DEFAULT_LANG,
    build_engine,
    ocr_with_rapidocr,
    require_usable_text as ocr_require,
)

THAI_RANGE = ("\u0e00", "\u0e7f")


def count_thai(text: str) -> int:
    return sum(1 for c in text if THAI_RANGE[0] <= c <= THAI_RANGE[1])


@pytest.fixture()
def thai_image_pdf(tmp_path: Path) -> Path:
    """Create a 1-page image-only PDF containing Thai text."""
    from PIL import Image, ImageDraw, ImageFont

    font_path = Path(r"C:\Windows\Fonts\LeelawUI.ttf")
    if not font_path.is_file():
        pytest.skip("Thai font not available on this machine")

    img = Image.new("RGB", (1240, 500), "white")
    draw = ImageDraw.Draw(img)
    font = ImageFont.truetype(str(font_path), 48)
    for i, line in enumerate(["ระบบบริหารงานบุคคล", "ประวัติการรับเงินเดือน"]):
        draw.text((80, 80 + i * 110), line, fill="black", font=font)
    pdf_path = tmp_path / "thai_scan.pdf"
    img.save(str(pdf_path), "PDF", resolution=150.0)
    return pdf_path


@pytest.fixture()
def image_pdf(tmp_path: Path) -> Path:
    """Create a 1-page image-only PDF (no text layer)."""
    from PIL import Image, ImageDraw

    img = Image.new("RGB", (612, 792), "white")
    draw = ImageDraw.Draw(img)
    draw.text((72, 72), "EMPLOYEE_MASTER", fill="black")
    draw.text((72, 110), "EMP_ID INT PK", fill="black")
    draw.text((72, 148), "EMP_NAME VARCHAR100", fill="black")
    pdf_path = tmp_path / "test_image.pdf"
    img.save(str(pdf_path), "PDF", resolution=72.0)
    return pdf_path


class TestRequireUsableText:
    def test_empty_raises(self):
        with pytest.raises(NeedsOCRError):
            require_usable_text("")

    def test_replacement_char_flood_raises(self):
        bad = "\ufffd" * 100 + "ok"
        with pytest.raises(NeedsOCRError):
            require_usable_text(bad)

    def test_good_text_passes(self):
        assert require_usable_text("Hello world") == "Hello world"

    def test_ocr_gate_empty_raises(self):
        with pytest.raises(ValueError):
            ocr_require("")

    def test_ocr_gate_allows_some_noise(self):
        text = "abc" + "\ufffd" * 2 + "def"
        assert ocr_require(text) == text


class TestRapidOCRFallback:
    def test_ocr_produces_text(self, image_pdf: Path):
        result = ocr_with_rapidocr(image_pdf)
        assert "EMPLOYEE" in result.upper()
        assert len(result) > 20

    def test_ocr_quality_gate(self, image_pdf: Path):
        result = ocr_with_rapidocr(image_pdf)
        assert ocr_require(result) == result


class TestThaiRecognitionModel:
    """Guards the tier-3 defect where the stock rec model had no Thai charset
    and silently transliterated Thai into Latin lookalikes."""

    def test_rec_model_charset_contains_thai(self):
        engine = build_engine(DEFAULT_LANG)
        charset = "".join(engine.text_rec.session.get_character_list())
        assert count_thai(charset) > 50, (
            f"rec model charset has {count_thai(charset)} Thai chars — "
            "it cannot transcribe Thai"
        )

    def test_unsupported_language_raises(self):
        with pytest.raises(ValueError, match="unsupported rec language"):
            build_engine("klingon")

    def test_ocr_of_thai_scan_produces_thai(self, thai_image_pdf: Path):
        import re

        result = ocr_with_rapidocr(thai_image_pdf)
        # Strip page headings and no-text markers — they contain Thai
        # themselves and previously let this test pass vacuously.
        content = re.sub(r"^(## หน้า \d+|_\(ไม่พบข้อความ\)_)$", "", result, flags=re.M)
        assert count_thai(content) > 0, f"no Thai characters in OCR output: {result!r}"


class TestConvertChainFallback:
    def test_docling_failure_triggers_rapidocr(self, image_pdf: Path, tmp_path: Path):
        """Mock Docling to raise ConversionError; verify RapidOCR fallback runs."""
        output_dir = tmp_path / "output"

        with patch(
            "convert.convert_with_docling",
            side_effect=ConversionError("mock crash"),
        ):
            from convert import main as convert_main

            with patch(
                "sys.argv",
                ["convert.py", str(image_pdf), "--output", str(output_dir)],
            ):
                exit_code = convert_main()

        assert exit_code == 0
        meta_path = output_dir / image_pdf.stem / "_meta.json"
        assert meta_path.exists()
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        assert meta["status"] in ("used_textlayer_fallback", "used_rapidocr_fallback")
        assert "mock crash" in meta["warnings"][0]

    def test_no_fallback_flag_returns_needs_review(self, image_pdf: Path, tmp_path: Path):
        """With --no-fallback, Docling failure → needs_review (exit 3)."""
        output_dir = tmp_path / "output"

        with patch(
            "convert.convert_with_docling",
            side_effect=NeedsOCRError("no text layer"),
        ):
            from convert import main as convert_main

            with patch(
                "sys.argv",
                ["convert.py", str(image_pdf), "--output", str(output_dir), "--no-fallback"],
            ):
                exit_code = convert_main()

        assert exit_code == 3
        meta = json.loads(
            (output_dir / image_pdf.stem / "_meta.json").read_text(encoding="utf-8")
        )
        assert meta["status"] == "needs_review"


class TestWriteOutputs:
    def test_writes_md_and_meta(self, tmp_path: Path):
        source = tmp_path / "doc.pdf"
        source.touch()
        out = tmp_path / "out"
        md_path = write_outputs(
            "# Hello",
            source=source,
            output_dir=out,
            status="success",
            started_at="2026-01-01T00:00:00+07:00",
            finished_at="2026-01-01T00:01:00+07:00",
            warnings=[],
            elapsed_seconds=60.0,
        )
        assert md_path.read_text(encoding="utf-8") == "# Hello"
        meta = json.loads((out / "doc" / "_meta.json").read_text(encoding="utf-8"))
        assert meta["engine"] == "docling"
        assert meta["output_chars"] == 7
