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

> ⚠️ **อัปเดต 2026-07-26:** smart-port ใช้ **fallback chain 3 ชั้นอัตโนมัติ**
> (ต่างจาก pipeline โปรเจกต์พี่น้องที่ fail-closed) — ใส่ `--no-fallback` ถ้าต้องการ
> fail-closed เป็นรายไฟล์ ทุกชั้นมี quality gate; ถ้าไม่ผ่านทุกชั้น → `needs_review`

```
                ┌──────────────────────────────────┐
                │  เอกสารเข้า (PDF)                  │
                └───────────────┬──────────────────┘
                                ▼
                ┌──────────────────────────────────┐
                │ Tier 1 · Docling (do_ocr=False)   │  โครงสร้างดีสุด แต่ช้า/timeout ได้
                └───────────────┬──────────────────┘
                                │ ล้มเหลว / text layer เสีย
                                ▼
                ┌──────────────────────────────────┐
                │ Tier 2 · pypdfium2 text layer     │  เร็ว, ไทยสมบูรณ์, parse ตาราง
                │ (extract_textlayer.py)            │  นิยามคอลัมน์ ← ใช้ชั้นนี้จริง
                └───────────────┬──────────────────┘
                                │ ไม่มี text layer (สแกนล้วน)
                                ▼
                ┌──────────────────────────────────┐
                │ Tier 3 · RapidOCR (โมเดลไทย)       │  th_PP-OCRv5_rec_mobile
                └───────────────┬──────────────────┘
                                │ ทุกชั้นล้มเหลว
                                ▼
                ┌──────────────────────────────────┐
                │ needs_review → Human Review        │
                │ (แนบ reviewed .md ผ่าน               │
                │  --fallback-markdown ได้)           │
                └──────────────────────────────────┘
```

**Format routing:**
- **PDF** → chain ข้างบน
- **DOCX/PPTX/XLSX/CSV** → Unstructured (scope ต่างจาก Docling — ยังไม่ทดสอบ)

---

## สถานะการติดตั้ง Engine

Engine ทุกตัวอยู่ใน venv ภายนอกโปรเจกต์ (`<OCR_VENV>` — path จริงดูโน้ตภายในที่ `research/docs-ocr/` ซึ่งไม่เข้า git)

| Engine | ตำแหน่ง venv | สถานะ (2026-07-26) | บทบาท |
|---|---|---|---|
| **Docling** (`docling`) | `<OCR_VENV>` | ✅ ติดตั้งแล้ว (2.114.0) | Tier 1 (ช้า — เอกสารจริงขนาดร้อยหน้า timeout) |
| **pypdfium2** | `<OCR_VENV>` | ✅ ใช้งานจริง | **Tier 2 — engine หลักที่ใช้งานจริง** |
| **RapidOCR** (`rapidocr`) | `<OCR_VENV>` | ✅ pin โมเดลไทย `th_PP-OCRv5_rec_mobile` | Tier 3 (สแกนล้วน; ดาวน์โหลดโมเดลรอบแรกจาก modelscope.cn) |
| Unstructured | `<OCR_VENV>` | ⏳ ยังไม่ทดสอบ | DOCX/PPTX/XLSX/CSV |
| ~~Marker~~ | — | ❌ **ปิดประเด็น** (ช้ากว่า Docling มากบน CPU) | — |
| ~~PaddleOCR~~ | — | ❌ **ปิดประเด็น** (ใช้ RapidOCR ONNX แทน) | — |
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

## วิธีใช้งาน

1. วางเอกสารต้นฉบับใน `input/`
2. รันสคริปต์ใน `scripts/` (ดู `scripts/README.md`)
3. ผลลัพธ์จะออกที่ `output/<stem>/<stem>.md` + `_meta.json`

```bash
VENV="<OCR_VENV_PYTHON>"   # path จริง: ดูโน้ตภายใน research/docs-ocr/ (ไม่เข้า git)
$VENV scripts/convert.py "input/sample.pdf" --output output/
# ข้ามการแปลงซ้ำอัตโนมัติถ้า output ใหม่กว่าต้นฉบับ — ใช้ --force เพื่อแปลงใหม่
```

---

## หมายเหตุด้านความปลอดภัย

- เอกสารใน `input/` อาจมีข้อมูลส่วนบุคคล (HR) — **ห้าม commit ขึ้น git** (ดู `.gitignore`)
- ผลลัพธ์ใน `output/` ตรวจสอบก่อนเก็บลง MySQL
- ตรวจสอบ mime type + ขนาดไฟล์ก่อนส่งเข้า engine
