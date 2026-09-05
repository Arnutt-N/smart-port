"""Replace Graphify-only hooks; refuse to overwrite unrelated hook logic."""
from pathlib import Path
import importlib.util

root = Path(__file__).absolute().parent.parent
spec = importlib.util.spec_from_file_location('guard', root / 'scripts/graphify-safe.py')
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)
hooks = {
    'post-commit': '#!/bin/sh\n# smart-port-graphify-safe\n[ "${GRAPHIFY_SKIP_HOOK:-0}" = "1" ] && exit 0\nroot=$(git rev-parse --show-toplevel) || exit 1\n[ -f "$root/scripts/graphify-hook.sh" ] || exit 0\nexec sh "$root/scripts/graphify-hook.sh" commit\n',
    'post-checkout': '#!/bin/sh\n# smart-port-graphify-safe\n[ "${GRAPHIFY_SKIP_HOOK:-0}" = "1" ] && exit 0\n[ "$3" = "1" ] && [ "$1" != "$2" ] || exit 0\nroot=$(git rev-parse --show-toplevel) || exit 1\n[ -f "$root/scripts/graphify-hook.sh" ] || exit 0\nexec sh "$root/scripts/graphify-hook.sh" checkout\n',
}
for name in hooks:
    path = root / '.githooks' / name
    guard.no_links(path)
    if path.exists():
        old = path.read_text(encoding='utf-8')
        marker = 'graphify-hook' if name == 'post-commit' else 'graphify-checkout-hook'
        if '# smart-port-graphify-safe' not in old:
            start, end = f'# {marker}-start', f'# {marker}-end'
            if start not in old or end not in old:
                raise ValueError('Unrecognized hook; refusing replacement')
            before, rest = old.split(start, 1)
            _, after = rest.split(end, 1)
            if before.strip() != '#!/bin/sh' or after.strip():
                raise ValueError('Additional hook logic; refusing replacement')
for name, content in hooks.items():
    path = root / '.githooks' / name
    path.write_text(content, encoding='utf-8', newline='\n')
    path.chmod(0o755)
print('PASS: Graphify hooks delegate to the repository safe wrapper')
