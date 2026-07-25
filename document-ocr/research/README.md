# research/ — รายงานสำรวจเครื่องมือ

รายงานสำรวจเครื่องมือ OCR/Document Conversion ทั้งหมด

> ไฟล์ต้นฉบับอยู่ที่ `D:\00 hrProject\smart-port\project-log-md\cline\`

## รายการรายงาน

| ไฟล์ | วันที่ | เนื้อหา |
|---|---|---|
| ⭐ `ENGINE-DECISION-2026-07-24.md` | 2026-07-24 | **Decision record** — เหตุผลเลือก Docling (แทน Marker) พร้อม benchmark จริง |
| `ocr-document-conversion-research-2026-07-23.md` | 2026-07-23 | สำรวจ OCR + Document Conversion repos ทั้งหมด (PaddleOCR, MinerU, Tesseract, Marker, ฯลฯ) |
| `marker-survey-2026-07-24.md` | 2026-07-24 | สำรวจ `datalab-to/marker` ⚠️ (อิง README ไม่ใช่ benchmark — ดู caveat ใน decision record) |
| `unstract-survey-2026-07-24.md` | 2026-07-24 | สำรวจ `Zipstack/unstract` — ทางเลือก IDP (เปรียบเทียบ) |

## สรุปการตัดสินใจเลือก engine (อัปเดต 2026-07-24)

| Engine | บทบาท | สถานะ | เหตุผล |
|---|---|---|---|
| **Docling** ✅ | **PDF default** | ติดตั้งแล้ว (2.114.0) | deploy จริง prod, เร็วกว่า Marker บน CPU, fail-closed (`do_ocr=False`) |
| Unstructured | DOCX/PPTX/XLSX/CSV | ยังไม่ทดสอบ | scope ต่างจาก Docling (ไม่ทับซ้อน) |
| ~~Marker~~ ❌ | — | **ปิดประเด็นถาวร** | ช้ากว่า Docling มากบน CPU (benchmark จริง 32.8 นาที ยังไม่จบ) |
| ~~PaddleOCR~~ ❌ | — | **ปิดประเด็นถาวร** | auto-OCR ขัดปรัชญา fail-closed |
| ~~MinerU~~ ❌ | — | ไม่คุ้มประเมิน | ไม่มี prior art ก่อน pitch |

ดูรายละเอียดเต็มที่ `ENGINE-DECISION-2026-07-24.md`
