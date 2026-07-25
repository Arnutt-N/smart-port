"""Poll the running detached convert.py and print status."""
import ctypes
import os
import time
from pathlib import Path

WORK = Path(r"D:\00 hrProject\smart-port\document-ocr")
OUT = WORK / "output"
PID_FILE = OUT / "_run.pid"
LOG = OUT / "_run.log"
ERR = OUT / "_run.err"

pid = int(PID_FILE.read_text(encoding="utf-8").strip()) if PID_FILE.exists() else None
print("now:", time.strftime("%H:%M:%S"))
if pid is None:
    print("No pidfile")
else:
    kernel32 = ctypes.windll.kernel32
    PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
    handle = kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
    exit_code = ctypes.c_ulong(0)
    if handle:
        kernel32.GetExitCodeProcess(handle, ctypes.byref(exit_code))
        kernel32.CloseHandle(handle)
        still_active = (exit_code.value == 259)  # STILL_ACTIVE
        print(f"PID {pid}: {'RUNNING' if still_active else f'EXITED code={exit_code.value}'}")
    else:
        print(f"PID {pid}: not found (already exited)")

# Logs
for label, p in [("log", LOG), ("err", ERR)]:
    if p.exists():
        size = p.stat().st_size
        print(f"\n_run.{label}: {size} bytes")
        if size:
            content = p.read_text(encoding="utf-8", errors="replace")
            print("--- last 1800 chars ---")
            print(content[-1800:])
    else:
        print(f"\n_run.{label}: missing")

# Output products (besides logs)
print("\n=== output/ products ===")
for d, _, fns in os.walk(OUT):
    for fn in fns:
        if fn.startswith("_run"):
            continue
        p = Path(d) / fn
        print(f"  {p.stat().st_size:>10}  {p.relative_to(OUT)}")

# HF cache activity
hf = Path(r"C:\Users\arnutt.n\.cache\huggingface")
if hf.is_dir():
    total, newest = 0, 0.0
    for d, _, fns in os.walk(hf):
        for fn in fns:
            p = Path(d) / fn
            try:
                total += p.stat().st_size
                newest = max(newest, p.stat().st_mtime)
            except OSError:
                pass
    print(f"\nHF cache: {total/1e6:.1f} MB, newest "
          f"{time.strftime('%H:%M:%S', time.localtime(newest)) if newest else 'n/a'}")
