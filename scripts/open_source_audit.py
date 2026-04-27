from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

ROOT_DIR = Path(__file__).resolve().parents[1]
DEFAULT_REPORT_PATH = ROOT_DIR / "finish" / "regression" / "open_source_audit_report.json"

SKIP_DIRS = {
    ".git",
    ".idea",
    ".mypy_cache",
    ".pytest_cache",
    ".venv",
    "__pycache__",
    "dist",
    "finish",
    "logs",
    "node_modules",
    "origin",
}

TEXT_SUFFIXES = {
    ".bat",
    ".cfg",
    ".css",
    ".env",
    ".example",
    ".html",
    ".ini",
    ".js",
    ".json",
    ".md",
    ".mjs",
    ".ps1",
    ".py",
    ".toml",
    ".ts",
    ".tsx",
    ".txt",
    ".yaml",
    ".yml",
}

LOCAL_ARTIFACT_SUFFIXES = {
    ".doc",
    ".docm",
    ".docx",
    ".pdf",
}

LOCAL_ARTIFACT_GLOBS = {
    "app/ui-check*.png",
    "*.png",
    "*.doc",
    "*.docm",
    "*.docx",
    "*.pdf",
    "config.json",
    "*.local.json",
    "*.local.yml",
    "*.local.yaml",
}

REQUIRED_GITIGNORE_PATTERNS = {
    "app/node_modules/",
    "app/dist/",
    "finish/",
    "origin/",
    "logs/",
    "*.docx",
    "*.pdf",
    ".env",
    "app/.env",
    "!*.env.example",
    "!app/*.env.example",
}

REQUIRED_RELEASE_FILES = {
    ".env.example",
    "app/.env.example",
    ".github/ISSUE_TEMPLATE/bug_report.yml",
    ".github/ISSUE_TEMPLATE/feature_request.yml",
    ".github/PULL_REQUEST_TEMPLATE.md",
    "CONTRIBUTING.md",
    "SECURITY.md",
    "docs/RELEASE_CHECKLIST.md",
}

PLACEHOLDER_WORDS = {
    "...",
    "<",
    ">",
    "example",
    "placeholder",
    "replace",
    "your",
    "your_",
    "xxx",
}

LOCAL_OR_PLACEHOLDER_URL_RE = re.compile(
    r"^(?:https?://)?(?:127\.0\.0\.1|localhost|0\.0\.0\.0)(?::\d+)?(?:/.*)?$|"
    r"^(?:https?://)?(?:example\.com|example\.org|example\.net)(?:/.*)?$",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class PatternRule:
    code: str
    regex: re.Pattern[str]
    message: str


SECRET_RULES = [
    PatternRule("secret.openai_key", re.compile(r"\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b"), "疑似 OpenAI 兼容 API Key。"),
    PatternRule("secret.anthropic_key", re.compile(r"\bsk-ant-[A-Za-z0-9_-]{20,}\b"), "疑似 Anthropic API Key。"),
    PatternRule("secret.github_token", re.compile(r"\bgh[pousr]_[A-Za-z0-9_]{30,}\b"), "疑似 GitHub Token。"),
    PatternRule("secret.aws_access_key", re.compile(r"\bAKIA[0-9A-Z]{16}\b"), "疑似 AWS Access Key。"),
    PatternRule("secret.jwt", re.compile(r"\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b"), "疑似 JWT。"),
    PatternRule(
        "secret.assignment",
        re.compile(r"""(?ix)(?:^|[^\w])(?:[A-Z0-9_]*?(?:api[_-]?key|secret|token|password))\s*[:=]\s*['"](?P<value>[^'"]{16,})['"]"""),
        "疑似把密钥或口令写入了源码配置。",
    ),
    PatternRule(
        "secret.provider_url",
        re.compile(
            r"""(?ix)(?:^|[^\w])(?:[A-Z0-9_]*?(?:base[_-]?url|api[_-]?base|provider[_-]?url|model[_-]?endpoint|endpoint)|baseUrl|apiBase|providerUrl|modelEndpoint)\s*[:=]\s*['"]?(?P<value>https?://[^\s,'"}]+)"""
        ),
        "疑似把私有模型厂商地址或转发地址写入了仓库。",
    ),
]

OLD_PROJECT_NAME_RE = re.compile("|".join(["baibai" + "AIGC", "baibai" + "aigc"]), re.IGNORECASE)
MOJIBAKE_REPLACEMENT_RE = re.compile("\ufffd|" + "\u951f\u65a4\u62f7")

TEXT_RULES = [
    PatternRule(
        "path.windows_absolute",
        re.compile(r"\b[A-Za-z]:[\\/](?:Users|ChromeDownloads|Downloads|Desktop|Documents)[\\/][^\s`'\"<>]+"),
        "疑似个人 Windows 绝对路径。",
    ),
    PatternRule("path.user_home", re.compile(r"(?<![%$])(?:/Users|/home)/[^\s`'\"<>]+"), "疑似个人用户目录绝对路径。"),
    PatternRule("brand.old_project_name", OLD_PROJECT_NAME_RE, "疑似旧项目名残留。"),
    PatternRule("text.mojibake_replacement", MOJIBAKE_REPLACEMENT_RE, "疑似乱码替换字符。"),
]

DOC_MOJIBAKE_RE = re.compile(r"\?{4,}")


def _relative(path: Path) -> str:
    return path.relative_to(ROOT_DIR).as_posix()


def _is_under_skipped_dir(path: Path) -> bool:
    try:
        relative = path.relative_to(ROOT_DIR)
    except ValueError:
        return True
    return any(part in SKIP_DIRS for part in relative.parts[:-1])


def _iter_files() -> Iterable[Path]:
    for path in ROOT_DIR.rglob("*"):
        if not path.is_file():
            continue
        if _is_under_skipped_dir(path):
            continue
        yield path


def _iter_text_files() -> Iterable[Path]:
    for path in _iter_files():
        if path.suffix.lower() in TEXT_SUFFIXES or path.name in {".gitignore"}:
            yield path


def _read_text(path: Path) -> str | None:
    try:
        return path.read_text(encoding="utf-8-sig", errors="replace")
    except OSError:
        return None


def _redact(value: str) -> str:
    value = value.strip()
    if len(value) <= 10:
        return "***"
    return f"{value[:4]}…{value[-4:]}"


def _looks_like_placeholder(value: str) -> bool:
    lowered = value.lower()
    return any(word in lowered for word in PLACEHOLDER_WORDS)


def _is_safe_public_url(value: str) -> bool:
    normalized = value.strip().strip("'\"`<>.,;")
    return not normalized or bool(LOCAL_OR_PLACEHOLDER_URL_RE.match(normalized))


def _issue(severity: str, code: str, message: str, *, path: Path | None = None, line: int | None = None, preview: str = "") -> dict[str, Any]:
    item: dict[str, Any] = {
        "severity": severity,
        "code": code,
        "message": message,
    }
    if path is not None:
        item["path"] = _relative(path)
    if line is not None:
        item["line"] = line
    if preview:
        item["preview"] = preview[:180]
    return item


def _scan_text_file(path: Path) -> list[dict[str, Any]]:
    text = _read_text(path)
    if text is None:
        return [_issue("warning", "file.unreadable", "文件无法按 UTF-8 文本读取。", path=path)]

    issues: list[dict[str, Any]] = []
    for line_number, line in enumerate(text.splitlines(), 1):
        for rule in SECRET_RULES:
            for match in rule.regex.finditer(line):
                secret_value = match.groupdict().get("value") or match.group(0)
                if rule.code != "secret.provider_url" and _looks_like_placeholder(secret_value):
                    continue
                if rule.code == "secret.provider_url" and _is_safe_public_url(secret_value):
                    continue
                issues.append(
                    _issue(
                        "error",
                        rule.code,
                        rule.message,
                        path=path,
                        line=line_number,
                        preview=line.replace(secret_value, _redact(secret_value)).strip(),
                    )
                )
        for rule in TEXT_RULES:
            if rule.regex.search(line):
                issues.append(_issue("error", rule.code, rule.message, path=path, line=line_number, preview=line.strip()))
        if path.suffix.lower() in {".md", ".txt"} and DOC_MOJIBAKE_RE.search(line):
            issues.append(_issue("error", "text.mojibake_question_marks", "疑似问号型乱码。", path=path, line=line_number, preview=line.strip()))
    return issues


def _gitignore_patterns() -> set[str]:
    path = ROOT_DIR / ".gitignore"
    text = _read_text(path)
    if text is None:
        return set()
    return {line.strip() for line in text.splitlines() if line.strip() and not line.strip().startswith("#")}


def _check_gitignore() -> list[dict[str, Any]]:
    existing = _gitignore_patterns()
    return [
        _issue("error", "gitignore.missing_pattern", f".gitignore 缺少必要规则：{pattern}")
        for pattern in sorted(REQUIRED_GITIGNORE_PATTERNS - existing)
    ]


def _check_required_release_files() -> list[dict[str, Any]]:
    return [
        _issue("error", "release.missing_file", f"开源发布缺少必要文件：{relative_path}")
        for relative_path in sorted(REQUIRED_RELEASE_FILES)
        if not (ROOT_DIR / relative_path).exists()
    ]


def _scan_local_artifacts() -> list[dict[str, Any]]:
    warnings: list[dict[str, Any]] = []
    for path in _iter_files():
        relative = _relative(path)
        suffix = path.suffix.lower()
        if suffix in LOCAL_ARTIFACT_SUFFIXES or any(path.match(pattern) for pattern in LOCAL_ARTIFACT_GLOBS):
            if _relative(path) in {"Fuck your AI detection rate.png", "app/public/brand-logo.png"}:
                continue
            code = "local.config_artifact" if path.name == "config.json" or ".local." in path.name else "local.artifact"
            message = (
                "疑似本地配置文件存在；如果包含模型厂商、Base URL、API Key 或个人路径，必须留在本机。"
                if code == "local.config_artifact"
                else "本地样例、截图或报告文件存在；如果准备开源，请确认它不会被提交。"
            )
            warnings.append(
                _issue(
                    "warning",
                    code,
                    message,
                    path=path,
                    preview=f"{path.stat().st_size} bytes",
                )
            )
    return warnings


def _scan_runtime_dirs() -> list[dict[str, Any]]:
    warnings: list[dict[str, Any]] = []
    for dirname in ["finish", "origin", "logs", "app/dist", "app/node_modules"]:
        path = ROOT_DIR / dirname
        if not path.exists():
            continue
        try:
            file_count = sum(1 for item in path.rglob("*") if item.is_file())
        except OSError:
            file_count = 0
        if file_count:
            warnings.append(
                _issue(
                    "warning",
                    "local.runtime_dir",
                    "本地运行目录存在文件；通常应保留在本机，不提交到仓库。",
                    path=path,
                    preview=f"{file_count} files",
                )
            )
    return warnings


def run_audit(report_path: Path) -> dict[str, Any]:
    text_files = list(_iter_text_files())
    issues: list[dict[str, Any]] = []
    issues.extend(_check_gitignore())
    issues.extend(_check_required_release_files())
    for path in text_files:
        issues.extend(_scan_text_file(path))
    issues.extend(_scan_local_artifacts())
    issues.extend(_scan_runtime_dirs())

    errors = [item for item in issues if item["severity"] == "error"]
    warnings = [item for item in issues if item["severity"] == "warning"]
    report = {
        "ok": not errors,
        "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "reportPath": str(report_path.resolve()),
        "errorCount": len(errors),
        "warningCount": len(warnings),
        "scannedTextFileCount": len(text_files),
        "errors": errors,
        "warnings": warnings,
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="Audit FYADR for open-source release hygiene.")
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT_PATH)
    args = parser.parse_args(argv)
    report = run_audit(args.report.resolve())
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
