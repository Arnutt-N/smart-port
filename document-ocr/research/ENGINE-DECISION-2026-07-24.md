# Engine Decision Record — Docling as Default (revised 2026-07-24)

| | |
|---|---|
| **Decision** | ใช้ **Docling** เป็น default PDF engine (แทน Marker) |
| **Date** | 2026-07-24 (ปรับจากแผนเดิม Marker → Docling) |
| **Status** | ✅ อนุมัติ — สอดคล้องกับมติทีม `hrrag-myjobs` |
| **Source evidence** | `D:\hr-hackathon\hrrag-myjobs\project-log-md\claude-code\2026-07-24_1900_pdf-ocr-conversion-comparison_claude-code_sonnet-5.md` |

---

## 1. เหตุผลที่เปลี่ยนจาก Marker เป็น Docling

### 1.1 Benchmark จริงพิสูจน์ว่า Marker ช้ากว่า Docling มากบน CPU

ทดสอบบนเครื่อง **Intel Core 5 120U, 10 cores/12 threads** (แรงกว่า VPS production 5-6 เท่า ที่มีแค่ 2 vCPU):

| ขั้นตอนของ Marker | เวลา |
|---|---|
| import + ติดตั้ง torch/deps | 298.9 วินาที |
| โหลดโมเดล (layout/OCR/table/reading-order/error-detect) | 1,030.6 วินาที (~17.2 นาที) |
| แปลงจริง — ถึง 21% ของขั้น "Recognizing Layout" ขั้นเดียว ก่อนสั่งหยุด | 637 วินาที |
| **รวมก่อนหยุด** | **32.8 นาที ยังไม่ถึง 1 ใน 4 ของขั้นตอนแรก** |

> เป้าหมายเดิม: Marker จะมา "แก้ปัญหา" ไฟล์ที่ Docling timeout ที่ 15 นาที → **ผิด** Marker กลับช้ากว่า

**สาเหตุ:** Marker (`marker-pdf`) ออกแบบมาเพื่อ **GPU** (surya VLM) แต่ venv ของเรามี `torch 2.13.0+cpu` → Marker ไม่เหมาะกับสภาพแวดล้อม CPU-only เลย

### 1.2 ปรัชญา fail-closed: "OCR ต้องผ่านคนตรวจ"

| ปรัชญา | Docling | Marker/PaddleOCR fallback |
|---|---|---|
| เมื่อไม่มี text layer ใช้การ | `do_ocr=False` → route ไป **human review** | auto-OCR → **ขัดปรัชญา** |
| เหตุผล | ข้อมูล HR sensitive — ต้องมีคนตรวจทุกครั้ง | OCR อัตโนมัติเสี่ยงต่อข้อมูลผิดเข้าระบบโดยไม่มีคนดู |

---

## 2. Engine ที่เลือก (สรุป)

| Engine | สถานะ | บทบาท | หมายเหตุ |
|---|---|---|---|
| **Docling** ✅ 2.114.0 | **ติดตั้งแล้ว** | **PDF default** | deploy จริงใน hrrag-myjobs prod (PR #91), hardened |
| **Unstructured** | ยังไม่ทดสอบ | DOCX/PPTX/XLSX/CSV | scope ต่างจาก Docling (ไม่ทับซ้อน) |
| ~~Marker~~ ❌ | **ปิดประเด็นถาวร** | — | ช้ากว่า Docling มากบน CPU |
| ~~PaddleOCR~~ ❌ | **ปิดประเด็นถาวร** | — | auto-OCR ขัดปรัชญา fail-closed |
| ~~MinerU/magic-pdf~~ ❌ | ไม่คุ้มประเมิน | — | ไม่มี prior art, เหลือ 10 วันก่อน pitch |

---

## 3. Strategy ใหม่ (แทนที่ Marker→MinerU→PaddleOCR chain)

```
                ┌──────────────────────────────────┐
                │  PDF เข้า                          │
                └───────────────┬──────────────────┘
                                ▼
                ┌──────────────────────────────────┐
                │  Docling (do_ocr=False)           │
                │  — ดึง text layer เท่านั้น (เร็ว)     │
                └───────────────┬──────────────────┘
                                │
            text layer ใช้การ ───┤─── text layer เสีย/ว่าง
                                │            (NeedsOCRError)
                       ผล ออก    ▼
                       Markdown  ┌──────────────────────────┐
                                 │  Route → Human Review     │
                                 │  (NOT auto-OCR)           │
                                 │  fallback = reviewed .md  │
                                 │  ที่ approve แล้วเท่านั้น      │
                                 └──────────────────────────┘
```

**กฎเหล็ก:**
- ❌ ห้าม fallback auto-OCR (เช่น PaddleOCR) — ขัดปรัชญา
- ✅ fallback เดียวที่ยอม = **reviewed-Markdown ที่คน approve แล้ว** (explicit opt-in เฉพาะไฟล์)

---

## 4. การแก้ไขเอกสารที่กระทบ

เอกสารต่อไปนี้ถูกปรับให้สอดคล้องกับ decision นี้:
- `document-ocr/README.md` — กลยุทธ์ → Docling default + human review route
- `document-ocr/scripts/README.md` — engine chain → Docling (ไม่มี Marker/PaddleOCR)
- `document-ocr/research/README.md` — สรุป engine → Docling default

> 📝 **หมายเหตุเกี่ยวกับ `marker-survey-2026-07-24.md`:** รายงานสำรวจ Marker นั้นอิงคำกล่าวอ้างความเร็วจาก README ของ Marker (ซึ่งทดสอบบน GPU) ไม่ใช่ benchmark จริงบน CPU ของเรา → คำว่า "เร็ว/แม่น" ในรายงานนั้น **ใช้ไม่ได้กับสภาพแวดล้อม CPU-only** ให้อ้างอิง decision record นี้แทน
