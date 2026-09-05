"""Private structural worker; invoked only by graphify-safe.py in a fresh snapshot."""
import json
from pathlib import Path
import sys


def offline(event, args):
    # Deny network operations and child processes before importing Graphify.
    if event.startswith('socket.') or event in {'subprocess.Popen', 'os.system', 'os.posix_spawn', 'os.exec', 'os.fork'}:
        raise PermissionError('Network and subprocesses are disabled in the structural worker')


sys.addaudithook(offline)
from graphify.extract import extract
from graphify.build import build_from_json
from graphify.export import to_json

root = Path(sys.argv[1]).resolve()
if root != Path.cwd().resolve() or not root.name.startswith('smart-port-graphify-safe-'):
    raise ValueError('Expected isolated snapshot')
paths = sorted(p for p in root.rglob('*') if p.is_file())
result = extract(paths, root=root, cache_root=root, parallel=False)
if result.get('errors'):
    raise ValueError('Extraction errors')
graph = build_from_json(result, root=root)
out = root / 'safe-output'
out.mkdir(exist_ok=True)
if not to_json(graph, {}, str(out / 'graph.json')):
    raise ValueError('Graph export refused')
# Extraction caches remain in the disposable snapshot, outside safe-output.
(out / 'GRAPH_REPORT.md').write_text(f'# Structural graph\n\nNodes: {len(graph.nodes)}\nEdges: {len(graph.edges)}\n\nNo semantic extraction. Built through scripts/graphify-safe.py.\n', encoding='utf-8')
