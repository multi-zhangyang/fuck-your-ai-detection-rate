from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "app" / "src"
PATTERNS = [
    re.compile(r'["`>][^\n]*\?\?\?+'),
    re.compile(r"\\u[0-9a-fA-F]{4}"),
]


def main() -> int:
    issues: list[str] = []
    for path in SRC.rglob("*.tsx"):
        text = path.read_text(encoding="utf-8-sig")
        for line_no, line in enumerate(text.splitlines(), 1):
            if any(pattern.search(line) for pattern in PATTERNS):
                issues.append(f"{path.relative_to(ROOT)}:{line_no}: {line.strip()}")
    if issues:
        print("Frontend text check failed. Suspicious mojibake/escaped unicode found:")
        print("\n".join(issues))
        return 1
    print("Frontend text check passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
