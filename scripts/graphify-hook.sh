#!/bin/sh
# Synchronous, bounded safe build: no detached process survives the hook.
[ "${GRAPHIFY_SKIP_HOOK:-0}" = "1" ] && exit 0
root=$(git rev-parse --show-toplevel) || exit 1
gitdir=$(git rev-parse --absolute-git-dir) || exit 1
common=$(git rev-parse --git-common-dir) || exit 1
[ "$(cd "$gitdir" && pwd)" = "$(cd "$common" && pwd)" ] || exit 0
for state in rebase-merge rebase-apply MERGE_HEAD CHERRY_PICK_HEAD; do
    [ -e "$gitdir/$state" ] && exit 0
done
[ -d "$root/graphify-out" ] || exit 0
if command -v python >/dev/null 2>&1; then
    exec python -I "$root/scripts/graphify-safe.py" build .
fi
exec python3 -I "$root/scripts/graphify-safe.py" build .
