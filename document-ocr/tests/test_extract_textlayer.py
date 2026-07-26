"""Regression tests for the document-wide column-definition table parser.

Unit tests use synthetic page texts (no PDF needed) — guarding against
C-1..C-5 regressions:

  C-1  tables spanning page breaks lost their rows
  C-2  Index/Reference never populated (FK info stranded in Description)
  C-3  Number(p,s) / "Varchar 2" rows fell into a one-cell fallback
  C-4  continuation lines (enum legends) silently dropped
  C-5  literal '|' broke Markdown table alignment

หมายเหตุ: ชุด acceptance test กับเอกสารจริงแยกเก็บนอกโซน commit
(นโยบายจัดชั้นความลับ — รันภายในเท่านั้น ดู research/docs-ocr/)
"""
from __future__ import annotations

import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent.parent / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))

from extract_textlayer import NO_TEXT_MARKER, fix_thai_encoding, parse_document

PAGE_HEADER = (
    "การส่งมอบงานครั้งที่ 2 รายงานการศึกษาวิเคราะห์และออกแบบระบบ : "
    "ระบบสารสนเทศตัวอย่าง 6-33"
)
COLUMN_HEADER = "No. Column Name Data Type Null? Description Index Reference"


def table_rows(markdown: str) -> list[list[str]]:
    rows = [l for l in markdown.splitlines()
            if l.startswith("| ") and "Column Name" not in l
            and not l.startswith("|---")]
    return [[c.strip() for c in r.strip().strip("|").split("|")] for r in rows]


def row_named(markdown: str, col_name: str) -> list[str]:
    for cells in table_rows(markdown):
        if len(cells) >= 2 and cells[1] == col_name:
            return cells
    raise AssertionError(f"row {col_name!r} not found")


class TestRowParsing:
    def test_number_precision_scale(self):  # C-3
        md = parse_document([
            "Table Name : 1. T_SALARY\n"
            "Description : เงินเดือน\n"
            f"{COLUMN_HEADER}\n"
            "1 layer_salary Number(16,2) N เงินเดือน\n"
        ])
        cells = row_named(md, "layer_salary")
        assert cells[2] == "Number(16,2)"
        assert cells[4] == "เงินเดือน"

    def test_varchar_split_by_textlayer(self):  # C-3
        md = parse_document([
            "Table Name : 1. T\n"
            f"{COLUMN_HEADER}\n"
            "1 emp_taxno Varchar 2(13) Y เลขประจำตัวผู้เสียภาษี U3\n"
        ])
        cells = row_named(md, "emp_taxno")
        assert cells[2] == "Varchar2(13)"
        assert cells[5] == "U3"

    def test_index_and_reference_split(self):  # C-2
        md = parse_document([
            "Table Name : 1. T\n"
            f"{COLUMN_HEADER}\n"
            "1 ot_code Char(10) N ประเภทพนักงาน FK1 tb_type.ot_code\n"
        ])
        cells = row_named(md, "ot_code")
        assert cells[4] == "ประเภทพนักงาน"
        assert cells[5] == "FK1"
        assert cells[6] == "tb_type.ot_code"

    def test_compound_index(self):  # C-2 (PK,FK1)
        md = parse_document([
            "Table Name : 1. T\n"
            f"{COLUMN_HEADER}\n"
            "1 req_id Number(10) N คำขอตัวอย่าง PK,FK1 tb_req.req_id\n"
        ])
        cells = row_named(md, "req_id")
        assert cells[5] == "PK,FK1"
        assert cells[6] == "tb_req.req_id"

    def test_pipe_escaped_for_downstream_split(self):  # C-5
        md = parse_document([
            "Table Name : 1. T\n"
            f"{COLUMN_HEADER}\n"
            "1 x_othername Varchar2(1000) Y ชื่ออื่น ๆ รูปแบบ ||xx||yy||\n"
        ])
        cells = row_named(md, "x_othername")
        assert len(cells) == 7
        assert "&#124;" in cells[4]
        assert "|" not in cells[4]


class TestContinuationLines:
    def test_enum_legend_appended(self):  # C-4
        md = parse_document([
            "Table Name : 1. T\n"
            f"{COLUMN_HEADER}\n"
            "5 x_active Number(1) N 0 : ยกเลิกการใช้\n"
            "1 : ใช้\n"
        ])
        cells = row_named(md, "x_active")
        assert cells[4] == "0 : ยกเลิกการใช้<br>1 : ใช้"

    def test_lone_fk_continuation_merged(self):  # C-2 + C-4
        md = parse_document([
            "Table Name : 1. T\n"
            f"{COLUMN_HEADER}\n"
            "7 org_id_1 Number(10) Y ต่ำกว่าหน่วยงาน 1 ระดับ\n"
            "(ใหม่)\n"
            "FK5 tb_org.org_id\n"
        ])
        cells = row_named(md, "org_id_1")
        assert cells[4] == "ต่ำกว่าหน่วยงาน 1 ระดับ<br>(ใหม่)"
        assert cells[5] == "FK5"
        assert cells[6] == "tb_org.org_id"


class TestPageSpanning:
    def test_table_continues_across_page_break(self):  # C-1
        page1 = (
            "Table Name : 23. T_EMPLOYEE\n"
            "Description : ข้อมูลบุคคล\n"
            f"{COLUMN_HEADER}\n"
            "31 emp_fathersurname Varchar2(100) Y นามสกุลบิดา(ไทย)\n"
        )
        page2 = (
            f"{PAGE_HEADER}\n"
            f"{COLUMN_HEADER}\n"
            "32 pf_code_m Char(3) Y คำนำหน้าชื่อมารดา FK10 tb_prefix.pf_code\n"
            "33 emp_mothername Varchar2(100) Y ชื่อมารดา\n"
        )
        md = parse_document([page1, page2])
        assert md.count("### 23. T_EMPLOYEE") == 1
        assert len(table_rows(md)) == 3
        cells = row_named(md, "pf_code_m")
        assert cells[5] == "FK10"
        assert cells[6] == "tb_prefix.pf_code"
        # page furniture must not leak into the table
        assert "การส่งมอบงาน" not in md

    def test_non_table_pages_pass_through(self):
        md = parse_document(["สารบัญ\n74 T_HISTORY 34 18 ประวัติตัวอย่าง\n"])
        assert "## หน้า 1" in md
        assert "T_HISTORY" in md
        assert "###" not in md

    def test_empty_page_gets_marker(self):
        md = parse_document(["เนื้อหา\n", "", "ท้ายเล่ม\n"])
        assert NO_TEXT_MARKER in md
        assert "## หน้า 2" in md


class TestThaiEncoding:
    def test_sara_am_repair(self):
        assert fix_thai_encoding("ล าดับ") == "ลำดับ"
        assert fix_thai_encoding("ต่ ากว่า") == "ต่ำกว่า"

    def test_maiyamok_spacing(self):
        assert fix_thai_encoding("อื่นๆ") == "อื่น ๆ"

    def test_source_misspellings_corrected(self):
        # ยืนยันคำผิดต้นฉบับที่ตรวจพบ 2026-07-26 ถูกซ่อมทุกคำ
        cases = [
            ("ประด็นการประเมิน", "ประเด็นการประเมิน"),
            ("บุลากรที่อบรม", "บุคลากรที่อบรม"),
            ("การตวจเลือก", "การตรวจเลือก"),
            ("เป้หมายของโครงการ", "เป้าหมายของโครงการ"),
            ("ข้อสังเกตุของเจ้าหน้าที่", "ข้อสังเกตของเจ้าหน้าที่"),
            ("อีเมล์", "อีเมล"),
            ("ลายเซ็นต์", "ลายเซ็น"),
        ]
        for bad, good in cases:
            assert fix_thai_encoding(bad) == good
