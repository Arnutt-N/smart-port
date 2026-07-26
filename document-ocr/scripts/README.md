# scripts/ — สคริปต์แปลงเอกสาร

Pipeline 3 ชั้น: **Docling** → **pypdfium2 text layer** → **RapidOCR** (โมเดลไทย)

> smart-port อนุญาต auto fallback (ต่างจาก pipeline โปรเจกต์พี่น้องที่ fail-closed)
> ใช้ `--no-fallback` ถ้าต้องการ fail-closed เป็นรายไฟล์
>
> Tier 3 pin recognition model ภาษาไทย `th_PP-OCRv5_rec_mobile` เสมอ —
> โมเดล multilingual ค่าเริ่มต้นของ RapidOCR **ไม่มีอักษรไทยใน charset**
> (จะทับศัพท์เป็นละตินเงียบ ๆ) โมเดลไทยดาวน์โหลดอัตโนมัติรอบแรกจาก modelscope.cn

## Engine location

Engine อยู่ใน venv ภายนอกโปรเจกต์ (ไม่ใช่ของ smart-port):

```
Python venv:  <OCR_VENV_PYTHON>   (path จริง: ดูโน้ตภายใน research/docs-ocr/ — ไม่เข้า git)
```

## สคริปต์

| สคริปต์ | สถานะ | หน้าที่ |
|---|---|---|
| `convert.py` | พร้อมใช้ | แปลงเอกสารเดียวผ่าน chain 3 ชั้น + freshness guard + เขียน `_meta.json` |
| `extract_textlayer.py` | พร้อมใช้ | Tier 2 — text layer + parse ตารางนิยามคอลัมน์แบบข้ามหน้า + ซ่อมสระอำ |
| `fallback_rapidocr.py` | พร้อมใช้ | Tier 3 — RapidOCR (โมเดลไทย, quality gate ในตัว) |
| `convert_server.py` | พร้อมใช้ | FastAPI server ให้ PHP backend เรียกผ่าน HTTP (chain เดียวกับ convert.py) |
| `batch_convert.py` | พร้อมใช้ | แปลงทั้งโฟลเดอร์ `input/` → `output/` |

## วิธีรัน

```bash
VENV="<OCR_VENV_PYTHON>"   # path จริง: ดูโน้ตภายใน research/docs-ocr/ (ไม่เข้า git)

# แปลงเอกสารเดียว (Docling → RapidOCR fallback อัตโนมัติ)
$VENV scripts/convert.py "input/sample.pdf" --output output/

# ปิด fallback (fail-closed — route ไป human review)
$VENV scripts/convert.py "input/some.pdf" --no-fallback

# รัน RapidOCR ตรงๆ (ข้าม Docling)
$VENV scripts/fallback_rapidocr.py "input/sample.pdf" --output output/

# เปิด HTTP server (default port 8100)
$VENV scripts/convert_server.py --port 8100
```

## HTTP API (convert_server.py)

```
GET  /health   → {"ok": true}
POST /convert  → raw body = PDF bytes (สูงสุด 50MB), header X-Filename: name.pdf
               ← JSON {status, engine, markdown, meta}
```

ข้อจำกัด: body 50MB (ตรงกับ `backend/routes/ocr.php`) · OCR time budget 600s ·
การแปลงรันใน worker thread — `/health` ตอบได้ระหว่างแปลง

ตัวอย่าง PHP:
```php
$ch = curl_init("http://127.0.0.1:8100/convert");
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => file_get_contents($pdfPath),
    CURLOPT_HTTPHEADER => ["X-Filename: " . basename($pdfPath)],
    CURLOPT_RETURNTRANSFER => true,
]);
$result = json_decode(curl_exec($ch), true);
// $result['status'] = "success" | "used_textlayer_fallback" | "used_rapidocr_fallback" | "needs_review"
// $result['markdown'] = converted Markdown text
```

## ทดสอบ

```bash
cd document-ocr
$VENV -m pytest tests/ -v
```

## ผลลัพธ์ที่ได้

`output/<stem>/<stem>.md` + `output/<stem>/_meta.json`:
```json
{
  "source": "sample.pdf",
  "engine": "pypdfium2_textlayer",
  "status": "used_textlayer_fallback",
  "output_chars": 234302,
  "warnings": ["docling_ConversionError: Docling timed out after 60s ..."]
}
```
