# document-ocr — FastAPI server สำหรับ Render (Issue #147)
# Chain: Docling (ไม่ติดตั้ง — ตกไป tier ถัดไปเอง) -> pypdfium2 text-layer -> RapidOCR
FROM python:3.11-slim

# RapidOCR/onnxruntime ต้องการ libgomp; curl ไว้ให้ health check ใน container ตรวจเองได้
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY scripts/convert_server.py scripts/convert.py scripts/extract_textlayer.py \
     scripts/fallback_rapidocr.py scripts/

# โมเดล RapidOCR โหลดครั้งแรกตอนใช้งาน — ให้ tmp ของเราอยู่ใน volume ที่เขียนได้
ENV TMPDIR=/app/tmp
RUN mkdir -p /app/tmp && chown -R nobody:nogroup /app
USER nobody

# Render ใส่ PORT มาให้ (argparse อ่านจาก env); ใน container ต้อง bind 0.0.0.0
EXPOSE 8100
CMD ["python", "scripts/convert_server.py", "--host", "0.0.0.0"]
