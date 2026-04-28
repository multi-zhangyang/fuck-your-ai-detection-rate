from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "app" / "src"
TARGET_SUFFIXES = {".ts", ".tsx"}
PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("question-mark-mojibake", re.compile(r'["`>][^\n]*\?\?\?+')),
    ("escaped-unicode", re.compile(r"\\u[0-9a-fA-F]{4}")),
    ("replacement-char", re.compile("\ufffd")),
    (
        "utf8-mojibake",
        re.compile(
            "|".join(
                [
                    "\u951b",  # 锛
                    "\u9286",  # 銆
                    "\u9239",  # 鈹
                    "\u9424",  # 鐤
                    "\u9234",  # 鈴
                    "\u6b35",  # 欵
                    "\u704f",  # 灏
                    "\u20ac",  # €
                ]
            )
        ),
    ),
    (
        "personal-path",
        re.compile(r"\b[A-Za-z]:[\\/](?:Users|ChromeDownloads|Downloads|Desktop|Documents)[\\/][^\s`'\"<>]+"),
    ),
    (
        "old-project-name",
        re.compile(
            r"".join(["baibai", r"\s*", "aigc"]) + "|" + "".join(["baibai", "AIGC"]),
            re.IGNORECASE,
        ),
    ),
]


def main() -> int:
    issues: list[str] = []
    for path in SRC.rglob("*"):
        if path.suffix.lower() not in TARGET_SUFFIXES:
            continue
        text = path.read_text(encoding="utf-8-sig")
        for line_no, line in enumerate(text.splitlines(), 1):
            for rule_name, pattern in PATTERNS:
                if pattern.search(line):
                    issues.append(f"{path.relative_to(ROOT)}:{line_no}: {rule_name}: {line.strip()}")
    if issues:
        print("Frontend text check failed. Suspicious text found:")
        print("\n".join(issues))
        return 1
    print("Frontend text check passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
