#!/usr/bin/env python3
"""Guard the always-on instruction surface of THIS repo.

The surface here is not a single fat CLAUDE.md: CLAUDE.md is a pointer to
AGENTS.md, and the design rules live in .claude/rules/*.md, which load every
session as project instructions. That layout has its own failure modes, and
this gate catches them:

  1. CLAUDE.md regrows from a pointer back into a brief (or stops pointing at
     AGENTS.md).
  2. A critical rule disappears from the loaded surface entirely (the emoji
     ban, token-by-intent, the 8 states) — moved somewhere nothing loads.
  3. A rule file loses its "Loaded when ..." routing header, so nobody can
     tell when it applies.
  4. A rule file references an implementation file (tokens/, accessibility/,
     workflows/, scripts/, ...) that no longer exists — a dangling pointer.

Usage:
  python3 scripts/validate_instruction_surface.py
Exit 0 = surface intact, 1 = a rule vanished, a pointer dangles, or the
brief regrew.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BRIEF = ROOT / "CLAUDE.md"
SOURCE_OF_TRUTH = ROOT / "AGENTS.md"
RULES = ROOT / ".claude" / "rules"
BRIEF_MAX_LINES = 20

# (label, regex) — must be present somewhere in the loaded surface
# (the concatenated .claude/rules/*.md), not necessarily in one named file.
ALWAYS_ON = [
    ("emoji ban, stated as absolute", r"[Nn]o emoji, anywhere"),
    ("emoji gate named",              r"check_no_emoji\.py"),
    ("hardcode lint named",           r"lint_hardcodes\.py"),
    ("contrast gate named",           r"validate_contrast\.py"),
    ("token by intent",               r"[Tt]oken BY INTENT"),
    ("single shared theme",           r"Single-Theme Consistency"),
    ("the 8 states",                  r"\|\s*8\s*\|\s*Selected"),
    ("output completeness",           r"partial output is a broken output"),
]

# Implementation files a rule may point at, repo-relative, in backticks or
# after a space — md/json tokens and the gate scripts.
REF = re.compile(r"(?<![\w./-])((?:accessibility|components|content|design-systems|frameworks"
                 r"|reference|scripts|taste|templates|tokens|workflows)/[\w./-]+\.(?:md|json|py|mjs))")


def main():
    issues = []

    # 1) the pointer stays a pointer
    brief = BRIEF.read_text(encoding="utf-8")
    n_lines = len(brief.splitlines())
    if "AGENTS.md" not in brief:
        issues.append("pointer: CLAUDE.md no longer routes to AGENTS.md")
    if n_lines > BRIEF_MAX_LINES:
        issues.append(f"size: CLAUDE.md is {n_lines} lines, over the {BRIEF_MAX_LINES}-line pointer budget")
    if not SOURCE_OF_TRUTH.is_file():
        issues.append("pointer: AGENTS.md (the file CLAUDE.md points at) does not exist")

    # 2) critical rules survive somewhere on the loaded surface
    rule_files = sorted(RULES.glob("*.md")) if RULES.is_dir() else []
    if not rule_files:
        issues.append("surface: no .claude/rules/*.md files found at all")
    surface = "\n".join(p.read_text(encoding="utf-8") for p in rule_files)
    for label, pattern in ALWAYS_ON:
        if not re.search(pattern, surface):
            issues.append(f"demoted: no rule file states the {label} anymore")

    # 3) every rule file keeps its routing header
    for p in rule_files:
        text = p.read_text(encoding="utf-8")
        if "Loaded when" not in text:
            issues.append(f"routing: .claude/rules/{p.name} lost its 'Loaded when ...' header")

    # 4) no dangling pointers from rules to implementation files
    for p in rule_files:
        for ref in sorted(set(REF.findall(p.read_text(encoding="utf-8")))):
            if not (ROOT / ref).exists():
                issues.append(f"dangling: .claude/rules/{p.name} points at {ref}, which does not exist")

    print(f"CLAUDE.md: {n_lines}/{BRIEF_MAX_LINES} lines, {len(rule_files)} rule file(s), "
          f"{len(ALWAYS_ON)} critical rules checked.")
    if issues:
        print(f"\nFAIL: {len(issues)} problem(s) on the instruction surface:")
        for i in issues:
            print("  x " + i)
        return 1
    print("OK: pointer intact, critical rules on the loaded surface, every reference resolves.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
