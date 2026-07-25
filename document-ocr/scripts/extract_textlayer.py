"""Extract PDF text layer via pypdfium2 and format as structured Markdown.

Handles Data Dictionary style tables:
  Table Name : N. TABLE_NAME
  Description : ...
  No. Column Name Data Type Null? Description Index Reference
  1 col_name Type Y/N desc PK/U1/FK1

Falls back to plain text for non-table pages.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

_SARA_AM_FIX = re.compile("([\u0E01-\u0E2E])([\u0E48-\u0E4B]?) \u0E32")
_MAIYAMOK_FIX = re.compile(r"([^\s\u0E46])\u0E46")
_SOURCE_FIXES = [
    (re.compile("สมรถนะ"), "สมรรถนะ"),
    (re.compile("กฏหมาย"), "กฎหมาย"),
]


def fix_thai_encoding(text: str) -> str:
    """Repair legacy PDF Thai encoding: consonant [+tone] + space + Sara AA → consonant [+tone] + Sara Am.
    Tone mark must precede Sara Am so it renders on top (ต่ำ not ตำ่).
    Also corrects known source PDF misspellings and ๆ spacing."""
    text = _SARA_AM_FIX.sub(lambda m: m.group(1) + m.group(2) + "\u0E33", text)
    text = _MAIYAMOK_FIX.sub(lambda m: m.group(1) + " \u0E46", text)
    for pat, repl in _SOURCE_FIXES:
        text = pat.sub(repl, text)
    return text


def extract_page_text(page) -> str:
    textpage = page.get_textpage()
    return fix_thai_encoding(textpage.get_text_range())


def parse_data_dictionary_page(text: str) -> str:
    """Parse a page that contains Data Dictionary table definitions."""
    lines = text.split("\n")
    output: list[str] = []
    i = 0

    while i < len(lines):
        line = lines[i].strip()

        # Detect table header: "Table Name : N. TABLE_NAME"
        m = re.match(r"Table Name\s*:\s*(\d+)\.\s*(\S+)", line)
        if m:
            table_num = m.group(1)
            table_name = m.group(2)
            i += 1

            # Next line should be "Description : ..."
            desc = ""
            if i < len(lines) and lines[i].strip().startswith("Description"):
                desc = lines[i].strip().replace("Description", "").lstrip(": ").strip()
                i += 1

            output.append(f"### {table_num}. {table_name}")
            if desc:
                output.append(f"> {desc}")
            output.append("")

            # Skip column header line
            if i < len(lines) and "Column Name" in lines[i] and "Data Type" in lines[i]:
                i += 1

            # Parse rows until next Table Name or end
            output.append("| No. | Column Name | Data Type | Null? | Description | Index | Reference |")
            output.append("|-----|-------------|-----------|-------|-------------|-------|-----------|")

            while i < len(lines):
                row_line = lines[i].strip()
                if not row_line:
                    i += 1
                    continue
                if re.match(r"Table Name\s*:", row_line):
                    break
                # Row starts with a number
                row_match = re.match(r"^(\d+)\s+(.+)", row_line)
                if row_match:
                    parts = _parse_row(row_match.group(1), row_match.group(2))
                    output.append(parts)
                    i += 1
                    # Check for continuation lines (multi-line descriptions like "0 : ...\n1 : ...")
                    while i < len(lines):
                        cont = lines[i].strip()
                        if not cont:
                            i += 1
                            break
                        if re.match(r"^\d+\s+\w", cont) or re.match(r"Table Name\s*:", cont):
                            break
                        # continuation of description
                        i += 1
                else:
                    i += 1
                    break

            output.append("")
        else:
            # Non-table content: pass through
            if line:
                output.append(line)
            i += 1

    return "\n".join(output)


def _parse_row(num: str, rest: str) -> str:
    """Parse a table row into Markdown table cell format."""
    # Pattern: col_name Data_Type Null? Description [Index] [Reference]
    # Data types: Char(N), Varchar2(N), Number(N), Date, CLOB, BLOB
    type_pattern = r"((?:Varchar2|Char|Number|Date|CLOB|BLOB|Integer|Float)\s*\(\d+\)|(?:Date|CLOB|BLOB|Integer|Float))"
    m = re.match(r"(\S+)\s+" + type_pattern + r"\s+([YN])\s+(.*)", rest)
    if m:
        col_name = m.group(1)
        data_type = m.group(2)
        nullable = m.group(3)
        remainder = m.group(4).strip()

        # Try to split remainder into description + index + reference
        # Index patterns: PK, U1-U9, FKn, IDX
        idx_match = re.search(r"\s+(PK|U\d+|FK\d*|IDX\w*)\s*$", remainder)
        index = ""
        reference = ""
        desc = remainder
        if idx_match:
            index = idx_match.group(1)
            desc = remainder[: idx_match.start()].strip()
            # Check for reference after index
            ref_match = re.search(r"\s+(\S+)$", desc)

        return f"| {num} | {col_name} | {data_type} | {nullable} | {desc} | {index} | {reference} |"

    # Fallback: just put everything in description
    return f"| {num} | {rest} | | | | | |"


def convert_pdf(pdf_path: Path) -> tuple[str, int]:
    """Extract all pages and format as Markdown. Returns (markdown, page_count)."""
    import pypdfium2 as pdfium

    pdf = pdfium.PdfDocument(str(pdf_path))
    pages_md: list[str] = []

    try:
        n_pages = len(pdf)
        for i in range(n_pages):
            page = pdf[i]
            text = extract_page_text(page)
            if not text or not text.strip():
                pages_md.append(f"## หน้า {i + 1}\n\n_(ไม่พบข้อความ)_")
                continue

            if "Table Name" in text and "Column Name" in text:
                formatted = parse_data_dictionary_page(text)
            else:
                formatted = text.strip()

            pages_md.append(f"## หน้า {i + 1}\n\n{formatted}")
    finally:
        pdf.close()

    return "\n\n".join(pages_md), n_pages


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
