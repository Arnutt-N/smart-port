"""Build a fresh structural graph from selected tracked sources, never the live tree."""
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import subprocess
import sys
import uuid
from contextlib import contextmanager


@contextmanager
def isolated_directory(parent):
    path = parent / ('smart-port-graphify-safe-' + uuid.uuid4().hex)
    no_links(path)
    path.mkdir()
    try:
        yield path
    finally:
        # Verify exact absolute cleanup target before any recursive removal.
        no_links(path)
        if path.absolute().parent != parent.absolute() or not path.name.startswith('smart-port-graphify-safe-'):
            raise ValueError('Unsafe cleanup target')
        shutil.rmtree(path)


def allowed(relative):
    if '\\' in relative or ':' in relative:
        return False
    parts = relative.split('/')
    if any(not p or p.startswith('.') for p in parts):
        return False
    if not (relative.startswith('backend/') or relative.startswith('frontend/src/') or relative.startswith('scripts/')):
        return False
    if any(p.lower() in {'secrets', 'credentials', 'uploads', 'storage', 'vendor', 'node_modules', 'fixtures', 'data', 'backups'} for p in parts):
        return False
    return (PurePosixPath(relative).suffix.lower() in {'.php', '.js', '.mjs', '.vue', '.ts', '.css'}
            and not re.search(r'credential|private[-_]?key|secret', parts[-1], re.I))


def no_links(path):
    # lstat every ancestor; Windows junctions are reparse points too.
    for item in [path, *path.parents]:
        try:
            info = item.lstat()
        except FileNotFoundError:
            continue
        if stat.S_ISLNK(info.st_mode) or getattr(info, 'st_file_attributes', 0) & 0x400:
            raise ValueError('Links and reparse points are forbidden')


def child_env():
    # Allowlist, rather than trying to enumerate every possible provider secret.
    env = {k: v for k, v in os.environ.items() if k.upper() in {'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'LANG', 'LC_ALL'}}
    env.update(PYTHONHASHSEED='0', PYTHONUTF8='1', GRAPHIFY_MAX_WORKERS='1')
    return env


def snapshot(root, target, paths):
    count = 0
    for relative in paths:
        # Reject before touching the path, including stat: secrets are never visited.
        if not allowed(relative):
            continue
        source = root / relative
        no_links(source)
        if not source.exists():
            continue
        if not source.is_file():
            raise ValueError('Source is not a regular file')
        destination = target / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, destination)
        count += 1
    return count


def main(args):
    if args not in (['build'], ['build', '.']):
        raise ValueError('Only build or build . is permitted')
    root = Path(__file__).absolute().parent.parent
    no_links(root)
    git = shutil.which('git')
    result = subprocess.run([git, '-C', str(root), 'rev-parse', '--show-toplevel'], capture_output=True, check=True)
    if Path(os.fsdecode(result.stdout).strip()).resolve() != root.resolve():
        raise ValueError('Unexpected repository root')
    worker = root / 'scripts/graphify_ast_worker.py'
    no_links(worker)
    # Never trust interpreter or root sidecars from a previously generated graph.
    python = (Path.home() / 'AppData/Roaming/uv/tools/graphifyy/Scripts/python.exe' if os.name == 'nt'
              else Path.home() / '.local/share/uv/tools/graphifyy/bin/python')
    if not python.is_file():
        raise ValueError('Install graphifyy with uv tool before building')
    output = root / 'graphify-out'
    no_links(output)
    lock = root / '.graphify-safe.lock'
    no_links(lock)
    # Fail closed on concurrent builds; a crashed build leaves a visible lock.
    with lock.open('x'):
        pass
    try:
        result = subprocess.run([git, '-C', str(root), 'ls-files', '-z'], capture_output=True, check=True)
        paths = [os.fsdecode(p) for p in result.stdout.split(b'\0') if p]
        with isolated_directory(root) as target:
            no_links(target)
            count = snapshot(root, target, paths)
            if not count:
                raise ValueError('No approved sources')
            result = subprocess.run([str(python), '-I', str(worker), str(target)], cwd=target,
                                    env=child_env(), capture_output=True, timeout=600)
            if result.returncode:
                # Worker output can contain source snippets; never relay it.
                kinds = re.findall(rb'^([A-Za-z][A-Za-z0-9]*(?:Error|Exception)):', result.stderr, re.M)
                print('Worker failure type: ' + (kinds[-1].decode('ascii') if kinds else 'unknown'), file=sys.stderr)
                raise RuntimeError('Structural worker failed; source output suppressed')
            generated = target / 'safe-output'
            graph = json.loads((generated / 'graph.json').read_text(encoding='utf-8'))
            if not graph.get('nodes'):
                raise ValueError('Empty graph rejected')
            (generated / 'SAFE_BUILD.json').write_text(json.dumps({'mode': 'structural-only', 'source_files': count,
                'nodes': len(graph['nodes']), 'edges': len(graph.get('links', graph.get('edges', [])))}, indent=2), encoding='utf-8')
            # Verify absolute targets before moving. Preserve old cache/history without reading it.
            quarantine = root / ('.graphify-quarantine-' + uuid.uuid4().hex)
            no_links(output)
            no_links(quarantine)
            if output.parent != root or quarantine.parent != root:
                raise ValueError('Unexpected output path')
            had_output = output.exists()
            if had_output:
                output.rename(quarantine)
            try:
                shutil.copytree(generated, output)
            except Exception:
                # Keep both partial output and old graph for recovery; never delete user data.
                raise RuntimeError('Publication failed; prior output remains quarantined') from None
            print(f'PASS: structural graph built from {count} tracked source files; prior output quarantined={had_output}')
    finally:
        lock.unlink()


if __name__ == '__main__':
    try:
        main(sys.argv[1:])
    except Exception as exc:
        print(f'Graphify safe build stopped ({type(exc).__name__}); no provider output disclosed.', file=sys.stderr)
        sys.exit(1)
