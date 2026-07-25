"""Launch convert.py as a fully detached background process.

Uses DETACHED_PROCESS + CREATE_NEW_PROCESS_GROUP so the child survives even
when the launching shell (and its session) exits — required because every
tool call here runs in a fresh shell that closes after returning.
"""
import os
import subprocess
import sys
from pathlib import Path

WORK = Path(r"D:\00 hrProject\smart-port\document-ocr")
PY = r"D:\hr-hackathon\hrrag-myjobs\backend\.venv\Scripts\python.exe"
SCRIPT = str(WORK / "scripts" / "convert.py")
PDF = str(WORK / "input" / "Data Dictionary.pdf")
OUT = str(WORK / "output")
LOG = WORK / "output" / "_run.log"
ERR = WORK / "output" / "_run.err"

WORK.joinpath("output").mkdir(parents=True, exist_ok=True)

# Truncate logs so we can tell fresh output from stale
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
    [PY, SCRIPT, PDF, "--output", OUT, "--timeout-seconds", "1800"],
    cwd=str(WORK),
    stdout=log_fp,
    stderr=err_fp,
    creationflags=DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW,
    close_fds=True,
)
print(f"Launched detached PID={proc.pid}")
print(f"Logs: {LOG}")
print(f"     {ERR}")
# Write a pidfile so we can poll status later
(WORK / "output" / "_run.pid").write_text(str(proc.pid), encoding="utf-8")
