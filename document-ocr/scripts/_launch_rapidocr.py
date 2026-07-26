"""Launch RapidOCR fallback directly (skip Docling) as a detached process.

Critical: redirect stdin/stdout/stderr to DEVNULL or files so the parent
shell does NOT inherit pipes (which makes it wait for the child). We also
use CREATE_NEW_PROCESS_GROUP + DETACHED_PROCESS.
"""
import os
import subprocess
import sys
from pathlib import Path

WORK = Path(__file__).resolve().parent.parent
# OCR engine venv — set OCR_VENV_PYTHON (real path: internal note under research/docs-ocr/)
PY = os.environ.get("OCR_VENV_PYTHON", sys.executable)
SCRIPT = str(WORK / "scripts" / "fallback_rapidocr.py")
PDF = os.environ.get("OCR_INPUT_PDF", str(WORK / "input" / "sample.pdf"))
OUT = str(WORK / "output")
LOG = WORK / "output" / "_rapidocr.log"
ERR = WORK / "output" / "_rapidocr.err"

WORK.joinpath("output").mkdir(parents=True, exist_ok=True)
for p in (LOG, ERR):
    try:
        p.write_bytes(b"")
    except OSError:
        pass

log_fp = open(LOG, "w", encoding="utf-8", buffering=1)
err_fp = open(ERR, "w", encoding="utf-8", buffering=1)

DETACHED_PROCESS = 0x00000008
CREATE_NEW_PROCESS_GROUP = 0x00000200
CREATE_NO_WINDOW = 0x08000000

proc = subprocess.Popen(
    [PY, SCRIPT, PDF, "--output", OUT],
    cwd=str(WORK),
    stdin=subprocess.DEVNULL,
    stdout=log_fp,
    stderr=err_fp,
    creationflags=DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW,
    close_fds=True,
)
pid = proc.pid
(WORK / "output" / "_rapidocr.pid").write_text(str(pid), encoding="utf-8")
# Force flush + close our handles so the parent shell can return immediately.
log_fp.flush()
err_fp.flush()
# NOTE: do not close fps — child still writes to them.
sys.stdout.write(f"Launched RapidOCR detached PID={pid}\n")
sys.stdout.flush()
os._exit(0)  # hard exit, bypass atexit that might wait

