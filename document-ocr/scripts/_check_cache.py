"""Check process + cache + log while convert job runs."""
import os, glob, time, subprocess

# 1) Is the python subprocess still running? (look for python.exe with our script)
print("=== python processes running ===")
try:
    out = subprocess.run(
        ["wmic", "process", "where", "name='python.exe'",
         "get", "ProcessId,CreationDate,CommandLine", "/format:list"],
        capture_output=True, text=True, timeout=15,
    ).stdout
    # Split into records separated by blank lines
    blocks = [b.strip() for b in out.split("\n\n") if b.strip()]
    relevant = [b for b in blocks if "convert.py" in b]
    if relevant:
        for b in relevant:
            print(b[:600])
            print("---")
    else:
        print("(no python process running convert.py — job may have finished or died)")
except Exception as e:
    print("wmic failed:", type(e).__name__, e)

# 2) HF cache size + newest file (active download signal)
hf = r"C:\Users\arnutt.n\.cache\huggingface"
if os.path.isdir(hf):
    total, newest = 0, 0
    for d, _, fns in os.walk(hf):
        for fn in fns:
            p = os.path.join(d, fn)
            try:
                total += os.path.getsize(p)
                newest = max(newest, os.path.getmtime(p))
            except OSError:
                pass
    print(f"\nHF cache: {total/1e6:.1f} MB, newest "
          f"{time.strftime('%H:%M:%S', time.localtime(newest)) if newest else 'n/a'}")
    print(f"now     : {time.strftime('%H:%M:%S')}")

# 3) Job log + output dir
log = r"D:\00 hrProject\smart-port\document-ocr\output\_run.log"
err = r"D:\00 hrProject\smart-port\document-ocr\output\_run.err"
for name, p in [("log", log), ("err", err)]:
    if os.path.isfile(p):
        print(f"\n_run.{name} size:", os.path.getsize(p))
        with open(p, encoding="utf-8", errors="replace") as f:
            c = f.read()
        if c:
            print(f"=== _run.{name} (last 1500 chars) ===")
            print(c[-1500:])

out_dir = r"D:\00 hrProject\smart-port\document-ocr\output"
print("\n=== output/ contents ===")
for d, _, fns in os.walk(out_dir):
    for fn in fns:
        p = os.path.join(d, fn)
        try:
            sz = os.path.getsize(p)
        except OSError:
            sz = -1
        print(f"  {sz:>10}  {os.path.relpath(p, out_dir)}")

