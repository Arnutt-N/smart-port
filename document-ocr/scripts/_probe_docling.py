"""Probe: find docling usage in hrrag-myjobs backend (exclude venv) + check import."""
import os, sys

# 1) Find docling references in backend/app + backend/scripts (NOT venv)
print("=== docling references in backend/app + scripts ===")
roots = [
    r"D:\hr-hackathon\hrrag-myjobs\backend\app",
    r"D:\hr-hackathon\hrrag-myjobs\backend\scripts",
    r"D:\hr-hackathon\hrrag-myjobs\backend\tests",
]
keywords = ["docling", "DocumentConverter", "do_ocr", "export_to_markdown", "PdfPipelineOptions"]
hits = []
for root in roots:
    if not os.path.isdir(root):
        continue
    for dp, dn, fn in os.walk(root):
        for f in fn:
            if not f.endswith(".py"):
                continue
            p = os.path.join(dp, f)
            try:
                with open(p, encoding="utf-8", errors="replace") as fh:
                    for i, line in enumerate(fh, 1):
                        if any(k in line for k in keywords):
                            hits.append((p, i, line.rstrip()))
            except OSError:
                pass
for p, i, line in hits[:40]:
    rel = p.replace("D:\\hr-hackathon\\hrrag-myjobs\\", "")
    print(f"{rel}:{i}: {line[:120]}")
print(f"TOTAL hits: {len(hits)}")

# 2) Confirm docling importable + version
print()
print("=== docling import check ===")
try:
    import docling
    print("docling version:", getattr(docling, "__version__", "?"))
    from docling.document_converter import DocumentConverter
    print("DocumentConverter: OK")
    try:
        from docling.datamodel.pipeline_options import PdfPipelineOptions
        print("PdfPipelineOptions: OK")
    except Exception as e:
        print("PdfPipelineOptions import:", type(e).__name__, e)
    try:
        from docling.document_converter import PdfFormatOption
        print("PdfFormatOption: OK")
    except Exception as e:
        print("PdfFormatOption import:", type(e).__name__, e)
except Exception as e:
    print("docling import FAILED:", type(e).__name__, e)
