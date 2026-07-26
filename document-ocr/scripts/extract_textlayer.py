"""Extract PDF text layer via pypdfium2 and format as structured Markdown.

Handles column-definition style tables:
  Table Name : N. TABLE_NAME
  Description : ...
  No. Column Name Data Type Null? Description Index Reference
  1 col_name Type Y/N desc PK/U1/FK1 ref_table.ref_col

Parsing is DOCUMENT-WIDE, not per-page: a table that spans a page break
continues through the repeated page header ("การส่งมอบงานครั้งที่ ...") and
column-header line. Continuation lines (enum legends such as "0 : ยกเลิกการใช้",
wrapped descriptions, "(ใหม่)" suffixes) are appended to the owning row's
Description with <br>. Index tokens (PK / Un / FKn) and FK targets
(table.column) are split into the Index / Reference columns — including when
the FK arrives alone on a continuation line.

Falls back to plain text for non-table pages (TOC, cover pages).
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

_SARA_AM_FIX = re.compile("([ก-ฮ])([่-๋]?) า")
_MAIYAMOK_FIX = re.compile(r"([^\sๆ])ๆ")
_SOURCE_FIXES = [
    # คำสะกดผิดที่พบในต้นฉบับ PDF (ตรวจยืนยัน 2026-07-26 — ทุกคำ unambiguous)
    (re.compile("สมรถนะ"), "สมรรถนะ"),
    (re.compile("กฏหมาย"), "กฎหมาย"),
    (re.compile("ประด็น"), "ประเด็น"),      # ขาดสระ เ (ประด็นการประเมิน)
    (re.compile("บุลากร"), "บุคลากร"),      # ขาด ค
    (re.compile("ตวจเลือก"), "ตรวจเลือก"),  # ขาด ร (การตรวจเลือกทหาร)
    (re.compile("เป้หมาย"), "เป้าหมาย"),    # ขาดสระ า
    (re.compile("สังเกตุ"), "สังเกต"),      # สังเกต ไม่มีสระอุ
    (re.compile("อีเมล์"), "อีเมล"),        # ตามราชบัณฑิตยสภา
    (re.compile("ลายเซ็นต์"), "ลายเซ็น"),   # เซ็น ไม่มี ต์
]


def fix_thai_encoding(text: str) -> str:
    """Repair legacy PDF Thai encoding: consonant [+tone] + space + Sara AA → consonant [+tone] + Sara Am.
    Tone mark must precede Sara Am so it renders on top (ต่ำ not ตำ่).
    Also corrects known source PDF misspellings and ๆ spacing."""
    text = _SARA_AM_FIX.sub(lambda m: m.group(1) + m.group(2) + "ำ", text)
    text = _MAIYAMOK_FIX.sub(lambda m: m.group(1) + " ๆ", text)
    for pat, repl in _SOURCE_FIXES:
        text = pat.sub(repl, text)
    return text


def extract_page_text(page) -> str:
    textpage = page.get_textpage()
    return fix_thai_encoding(textpage.get_text_range())


# --- document grammar -------------------------------------------------------

NO_TEXT_MARKER = "_(ไม่พบข้อความ)_"

_TABLE_START_RE = re.compile(r"Table Name\s*:\s*(\d+)\.\s*(\S+)")
_TABLE_DESC_RE = re.compile(r"^Description\s*:?\s*(.*)$")
_PAGE_HEADER_RE = re.compile(r"^การส่งมอบงานครั้งที่")
_COLUMN_HEADER_RE = re.compile(r"No\.?\s*Column Name\s+Data Type", re.IGNORECASE)

# Data types: Char(N), Varchar2(N), Number(N), Number(p,s), Date, CLOB, BLOB.
# The text layer sometimes splits "Varchar2" into "Varchar 2".
_TYPE_PATTERN = (
    r"(?:Varchar\s*2|Char|Number|Integer|Float|CLOB|BLOB|Long|Timestamp)"
    r"\s*\(\s*\d+(?:\s*,\s*\d+)?\s*\)"
    r"|(?:Date|CLOB|BLOB|Integer|Float|Long|Number)\b"
)
_ROW_RE = re.compile(rf"^(\d+)\s+(\S+)\s+({_TYPE_PATTERN})\s+([YN])\s*(.*)$")

# Index markers: PK, U1-U9, FKn, IDX* — possibly comma-joined ("PK,FK1"),
# optionally followed by an FK target "ref_table.ref_col".
_INDEX_TOKEN = r"(?:PK|U\d+|FK\d+|IDX\w*)"
_INDEX_TAIL_RE = re.compile(
    rf"(?:^|\s)({_INDEX_TOKEN}(?:\s*,\s*{_INDEX_TOKEN})*)(?:\s+(\w+\.\w+))?\s*$"
)
# A continuation line consisting only of index/reference info, e.g.
# "FK5 tb_org.org_id" stranded below its row by a page break.
_INDEX_ONLY_RE = re.compile(
    rf"^({_INDEX_TOKEN}(?:\s*,\s*{_INDEX_TOKEN})*)(?:\s+(\w+\.\w+))?$"
)


def _escape_cell(text: str) -> str:
    """Make text safe inside a Markdown table cell.

    Uses &#124; (not \\|) so downstream consumers that split rows on the
    literal '|' character (secrets/generate_schema.py) stay aligned.
    """
    return text.replace("|", "&#124;")


class _Row:
    __slots__ = ("no", "name", "type", "nullable", "desc_parts", "index", "reference")

    def __init__(self, no: str, name: str, type_: str, nullable: str, remainder: str):
        self.no = no
        self.name = name
        # Normalise the split "Varchar 2(13)" form back to Varchar2(13)
        self.type = re.sub(r"Varchar\s+2", "Varchar2", type_)
        self.nullable = nullable
        self.desc_parts: list[str] = []
        self.index = ""
        self.reference = ""
        self._absorb(remainder)

    def _absorb(self, text: str) -> None:
        """Split trailing index/reference markers off a description fragment."""
        text = text.strip()
        if not text:
            return
        m = _INDEX_TAIL_RE.search(text)
        if m:
            self._merge_index(m.group(1), m.group(2) or "")
            text = text[: m.start()].strip()
        if text:
            self.desc_parts.append(text)

    def _merge_index(self, index: str, reference: str) -> None:
        self.index = f"{self.index},{index}" if self.index else index
        if reference:
            self.reference = (
                f"{self.reference}, {reference}" if self.reference else reference
            )

    def continuation(self, line: str) -> None:
        """Attach a continuation line (enum legend, wrapped text, lone FK)."""
        m = _INDEX_ONLY_RE.match(line)
        if m:
            self._merge_index(m.group(1), m.group(2) or "")
        else:
            self._absorb(line)

    def to_markdown(self) -> str:
        desc = "<br>".join(self.desc_parts)
        if not desc and (self.index or self.reference):
            desc = "-"  # keep cell non-empty so pipe-splitting stays aligned
        cells = [self.no, self.name, self.type, self.nullable,
                 desc, self.index, self.reference]
        return "| " + " | ".join(_escape_cell(c) for c in cells) + " |"


class _Table:
    def __init__(self, num: str, name: str):
        self.num = num
        self.name = name
        self.desc = ""
        self.rows: list[_Row] = []

    def to_markdown(self) -> str:
        out = [f"### {self.num}. {self.name}"]
        if self.desc:
            out.append(f"> {_escape_cell(self.desc)}")
        out.append("")
        out.append("| No. | Column Name | Data Type | Null? | Description | Index | Reference |")
        out.append("|-----|-------------|-----------|-------|-------------|-------|-----------|")
        out.extend(r.to_markdown() for r in self.rows)
        out.append("")
        return "\n".join(out)


def parse_document(page_texts: list[str]) -> str:
    """Parse the whole document (list of per-page texts) into Markdown.

    Tables continue across page breaks; text outside any table is passed
    through under its "## หน้า N" heading.
    """
    # Flatten to (page_no, line) preserving page attribution for plain text
    tagged: list[tuple[int, str]] = []
    for page_no, text in enumerate(page_texts, start=1):
        page_lines = [ln.strip() for ln in text.split("\n") if ln.strip()]
        if not page_lines:
            page_lines = [NO_TEXT_MARKER]
        for line in page_lines:
            tagged.append((page_no, line))
        tagged.append((page_no, ""))  # page boundary spacer

    output: list[str] = []
    plain: list[str] = []      # buffered plain text for the current page
    plain_page = 0             # page the buffer belongs to
    table: _Table | None = None
    row: _Row | None = None
    expect_desc = False        # just saw "Table Name :" — Description next

    def flush_plain() -> None:
        nonlocal plain
        if plain:
            output.append(f"## หน้า {plain_page}\n\n" + "\n".join(plain) + "\n")
            plain = []

    def flush_table() -> None:
        nonlocal table, row
        if table is not None:
            output.append(table.to_markdown())
            table = None
            row = None

    for page_no, line in tagged:
        if not line:
            continue

        m = _TABLE_START_RE.search(line)
        if m:
            flush_plain()
            flush_table()
            table = _Table(m.group(1), m.group(2))
            expect_desc = True
            continue

        if table is not None:
            if expect_desc:
                dm = _TABLE_DESC_RE.match(line)
                if dm:
                    table.desc = dm.group(1).strip()
                    expect_desc = False
                    continue
                expect_desc = False  # no Description line for this table

            if (_PAGE_HEADER_RE.match(line) or _COLUMN_HEADER_RE.search(line)
                    or line == NO_TEXT_MARKER):
                continue  # page furniture inside a spanning table

            rm = _ROW_RE.match(line)
            if rm:
                row = _Row(*rm.groups())
                table.rows.append(row)
                continue

            if row is not None:
                row.continuation(line)
            # else: stray line between header and first row — drop
            continue

        # Outside any table: plain-text passthrough grouped by page
        if plain and plain_page != page_no:
            flush_plain()
        plain_page = page_no
        plain.append(line)

    flush_plain()
    flush_table()
    return "\n".join(output).strip() + "\n"


def convert_pdf(pdf_path: Path) -> tuple[str, int]:
    """Extract all pages and format as Markdown. Returns (markdown, page_count)."""
    import pypdfium2 as pdfium

    pdf = pdfium.PdfDocument(str(pdf_path))
    try:
        page_texts = [extract_page_text(pdf[i]) for i in range(len(pdf))]
    finally:
        pdf.close()

    return parse_document(page_texts), len(page_texts)


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: python extract_textlayer.py <pdf> [--output <dir>]", file=sys.stderr)
        return 2

    pdf_path = Path(sys.argv[1])
    output_dir = Path("output")
    if "--output" in sys.argv:
        idx = sys.argv.index("--output")
        if idx + 1 < len(sys.argv):
            output_dir = Path(sys.argv[idx + 1])

    if not pdf_path.is_file():
        print(f"[error] PDF not found: {pdf_path}", file=sys.stderr)
        return 2

    markdown, n_pages = convert_pdf(pdf_path)

    out_dir = output_dir / pdf_path.stem
    out_dir.mkdir(parents=True, exist_ok=True)
    md_path = out_dir / f"{pdf_path.stem}.md"
    md_path.write_text(markdown, encoding="utf-8")
    print(f"[ok] {md_path} ({len(markdown)} chars, {n_pages} pages)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
