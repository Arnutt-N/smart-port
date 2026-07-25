"""Check what OCR/fallback tooling is actually available for auto-OCR fallback."""
import importlib.util
import shutil

candidates = {
    # OCR engines
    "paddleocr": "PaddleOCR (Thai+EN)",
    "rapidocr": "RapidOCR (multilingual, ONNX)",
    "rapidocr_onnxruntime": "RapidOCR onnxruntime",
    "easyocr": "EasyOCR",
    "tesseract": "pytesseract",
    "surya": "surya-ocr (Marker backend)",
    # PDF → image renderers
    "pdf2image": "pdf2image (needs poppler)",
    "fitz": "PyMuPDF (render + text)",
    "pypdfium2": "pypdfium2 (render + text)",
    "pdfplumber": "pdfplumber (text)",
    # image/numpy
    "numpy": "numpy",
    "PIL": "Pillow",
    "cv2": "opencv",
}

print("=== Python packages ===")
for mod, label in candidates.items():
    spec = importlib.util.find_spec(mod)
    print(f"  {'OK ' if spec else 'MISS'}  {mod:<22} {label}")

print("\n=== CLI binaries on PATH ===")
for cli in ["tesseract", "pdftoppm", "gswin64c"]:
    p = shutil.which(cli)
    print(f"  {'OK ' if p else 'MISS'}  {cli:<10} {p or ''}")

# rapidocr quick import test (doesn't load models)
print("\n=== rapidocr import test ===")
try:
    from rapidocr import RapidOCR
    print("  RapidOCR class: importable")
    # Don't instantiate — would download models. Just confirm API surface.
    import rapidocr
    print(f"  rapidocr version: {getattr(rapidocr, '__version__', '?')}")
except Exception as e:
    print(f"  RapidOCR import FAILED: {type(e).__name__}: {e}")
