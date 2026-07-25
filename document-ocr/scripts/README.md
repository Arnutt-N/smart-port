# scripts/ — สคริปต์แปลงเอกสาร

Pipeline: **Docling** (text layer) → **RapidOCR** (auto-OCR fallback)

> smart-port อนุญาต auto-OCR fallback (ต่างจาก hrrag-myjobs ที่ fail-closed)
> ใช้ `--no-fallback` ถ้าต้องการ fail-closed เป็นรายไฟล์

## Engine location

Engine อยู่ใน venv ของโปรเจกต์ **hrrag-myjobs** (ไม่ใช่ smart-port):

```
Python venv:  D:\hr-hackathon\hrrag-myjobs\backend\.venv\Scripts\python.exe
```

## สคริปต์

| สคริปต์ | สถานะ | หน้าที่ |
|---|---|---|
| `convert.py` | พร้อมใช้ | แปลงเอกสารเดียว — Docling → RapidOCR fallback + เขียน `_meta.json` |
| `fallback_rapidocr.py` | พร้อมใช้ | RapidOCR standalone (pypdfium2 render → OCR) |
| `convert_server.py` | พร้อมใช้ | FastAPI server ให้ PHP backend เรียกผ่าน HTTP |
| `batch_convert.py` | ยังไม่สร้าง | แปลงทั้งโฟลเดอร์ `input/` → `output/` |

## วิธีรัน

```bash
VENV="D:\hr-hackathon\hrrag-myjobs\backend\.venv\Scripts\python.exe"

# แปลงเอกสารเดียว (Docling → RapidOCR fallback อัตโนมัติ)
$VENV scripts/convert.py "input/Data Dictionary.pdf" --output output/

# ปิด fallback (fail-closed — route ไป human review)
$VENV scripts/convert.py "input/some.pdf" --no-fallback

# รัน RapidOCR ตรงๆ (ข้าม Docling)
$VENV scripts/fallback_rapidocr.py "input/Data Dictionary.pdf" --output output/

# เปิด HTTP server (default port 8100)
$VENV scripts/convert_server.py --port 8100
```

## HTTP API (convert_server.py)

```
GET  /health   → {"ok": true}
POST /convert  → raw body = PDF bytes, header X-Filename: name.pdf
               ← JSON {status, engine, markdown, meta}
```

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
// $result['status'] = "success" | "used_rapidocr_fallback" | "needs_review"
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
  "source": "Data Dictionary.pdf",
  "engine": "rapidocr",
  "status": "used_rapidocr_fallback",
  "output_chars": 137188,
  "warnings": ["docling_ConversionError: ..."]
}
```
