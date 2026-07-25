# Document OCR & Conversion Hub

โฟลเดอร์รวบรวมงานด้าน **การแปลงเอกสาร (Document Conversion)** และ **OCR** ของระบบ Smart Port (HR)

> สร้างเมื่อ 2026-07-24 โดย Cline (AI coding agent) · Claude (Anthropic)

---

## โครงสร้างโฟลเดอร์

```
document-ocr/
├── README.md            # ไฟล์นี้ — ภาพรวม + กลยุทธ์
├── research/            # รายงานสำรวจเครื่องมือ (จาก project-log-md)
├── input/               # เอกสารต้นฉบับที่จะประมวลผล (drop PDF/รูปที่นี่)
├── output/              # ผลลัพธ์ที่แปลงแล้ว (Markdown/JSON)
├── scripts/             # สคริปต์เรียก OCR/conversion engine
└── README ย่อยในแต่ละโฟลเดอร์
```

---

## กลยุทธ์การแปลง (Conversion Strategy)

> ⚠️ **อัปเดต 2026-07-24:** เปลี่ยนจาก Marker → **Docling** เป็น default
> (ดูเหตุผลใน `research/ENGINE-DECISION-2026-07-24.md` — benchmark จริงพิสูจน์ว่า Marker ช้ากว่า Docling มากบน CPU)

ใช้ **Docling เป็น default** โดยตั้ง `do_ocr=False` (ปรัชญา **fail-closed** — OCR ต้องผ่านคนตรวจ เพราะเป็นข้อมูล HR sensitive):

```
                ┌──────────────────────────────────┐
                │  เอกสารเข้า (PDF)                  │
                └───────────────┬──────────────────┘
                                ▼
                ┌──────────────────────────────────┐
                │  Docling (do_ocr=False)           │
                │  ดึง text layer เท่านั้น (เร็ว)        │
                └───────────────┬──────────────────┘
                                │
        text layer ใช้การ ───────┤────── text layer เสีย/ว่าง
                                │              (NeedsOCRError)
                  ผล Markdown    ▼
                   ออก → output/ ┌───────────────────────────┐
                                 │  Route → Human Review      │
                                 │  ❌ ห้าม auto-OCR           │
                                 │  ✅ fallback เดียว =         │
                                 │     reviewed .md (opt-in)   │
                                 └───────────────────────────┘
```

**Format routing:**
- **PDF** → Docling (default)
- **DOCX/PPTX/XLSX/CSV** → Unstructured (scope ต่างจาก Docling — ยังไม่ทดสอบ)

---

## สถานะการติดตั้ง Engine

| Engine | ตำแหน่ง venv | สถานะ (2026-07-24) | บทบาท |
|---|---|---|---|
| **Docling** (`docling`) | `D:\hr-hackathon\hrrag-myjobs\backend\.venv` | ✅ **ติดตั้งแล้ว** (2.114.0) | **PDF default** |
| Unstructured | `D:\hr-hackathon\hrrag-myjobs\backend\.venv` | ⏳ ยังไม่ทดสอบ | DOCX/PPTX/XLSX/CSV |
| ~~Marker~~ | — | ❌ **ปิดประเด็น** (ช้ากว่า Docling มากบน CPU) | — |
| ~~PaddleOCR~~ | — | ❌ **ปิดประเด็น** (auto-OCR ขัดปรัชญา) | — |
| ~~MinerU~~ | — | ❌ ไม่คุ้มประเมิน | — |

> 📖 เหตุผลเต็ม: `research/ENGINE-DECISION-2026-07-24.md`

> smart-port (PHP) จะเรียก Docling ผ่าน HTTP/subprocess — ดู `scripts/` สำหรับรายละเอียด

---

## เอกสารต้นทางอ้างอิง

รายงานสำรวจเครื่องมือทั้งหมดอยู่ใน `project-log-md/cline/`:

| ไฟล์ | เนื้อหา |
|---|---|
| `ENGINE-DECISION-2026-07-24.md` | ⭐ **Decision record** — เหตุผลเลือก Docling (แทน Marker) พร้อม benchmark จริง |
| `ocr-document-conversion-research-2026-07-23.md` | สำรวจ OCR + Document Conversion repos ทั้งหมด |
| `marker-survey-2026-07-24.md` | สำรวจ `datalab-to/marker` (⚠️ อิง README ไม่ใช่ benchmark — ดู caveat ใน decision record) |
| `unstract-survey-2026-07-24.md` | สำรวจ `Zipstack/unstract` (เปรียบเทียบทางเลือก IDP) |

---

## วิธีใช้งาน (เมื่อ engine พร้อม)

1. วางเอกสารต้นฉบับใน `input/`
2. รันสคริปต์ใน `scripts/` (ตัวอย่างจะเพิ่มหลัง engine ติดตั้งเสร็จ)
3. ผลลัพธ์จะออกที่ `output/` เป็น Markdown/JSON

```bash
# ตัวอย่าง (เมื่อพร้อม)
python scripts/convert.py "input/Data Dictionary.pdf" --output output/
```

---

## หมายเหตุด้านความปลอดภัย

- เอกสารใน `input/` อาจมีข้อมูลส่วนบุคคล (HR) — **ห้าม commit ขึ้น git** (ดู `.gitignore`)
- ผลลัพธ์ใน `output/` ตรวจสอบก่อนเก็บลง MySQL
- ตรวจสอบ mime type + ขนาดไฟล์ก่อนส่งเข้า engine
