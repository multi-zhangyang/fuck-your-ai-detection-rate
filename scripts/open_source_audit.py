from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
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


ISSUE_ACTIONS = {
    "gitignore.missing_pattern": "把缺失规则加入 .gitignore，或确认同等范围的忽略规则已经存在。",
    "release.missing_file": "补齐发布说明文件；如果暂不公开发布，可保留为后续发布前任务。",
    "secret.openai_key": "立刻移除真实 Key，改用 .env、本地 Web 配置或系统环境变量；如已推送过，请轮换密钥。",
    "secret.anthropic_key": "立刻移除真实 Key，改用 .env、本地 Web 配置或系统环境变量；如已推送过，请轮换密钥。",
    "secret.github_token": "立刻移除 Token；如已推送过，请在 GitHub 中撤销并重新生成。",
    "secret.aws_access_key": "立刻移除 Access Key；如已推送过，请在云厂商后台禁用并轮换。",
    "secret.jwt": "删除真实 JWT 或会话凭据，不要把运行时令牌写入仓库。",
    "secret.assignment": "把密钥、Token、密码改成空值或占位符，并从本地配置或环境变量读取。",
    "secret.provider_url": "把私有模型厂商地址移到本地配置或 .env；仓库里只保留 localhost、example 域名或空值。",
    "path.windows_absolute": "把个人绝对路径改成相对路径、环境变量说明或占位示例。",
    "path.user_home": "把个人用户目录改成相对路径、环境变量说明或占位示例。",
    "brand.old_project_name": "改成当前项目名、FYADR 缩写，或移入历史变更说明中。",
    "text.mojibake_replacement": "用 UTF-8 重新保存并修正文案，避免开源后出现乱码。",
    "text.mojibake_question_marks": "检查该段是否是编码损坏；确认后用正确文本替换。",
    "file.unreadable": "确认文件是否应该作为文本提交；如果不是源码说明文件，应加入忽略或移出仓库。",
    "git.tracked_ignored_file": "该文件已被 git 跟踪，即使写进 .gitignore 也不会自动消失；如是本地产物，请用 git rm --cached 移出索引。",
    "git.tracked_local_artifact": "不要跟踪本地论文、检测报告、截图、导出文件或运行产物；如确需样例，请提交脱敏后的最小样例。",
    "local.config_artifact": "确认该配置文件没有被 git 跟踪；如包含接口或 Key，只能留在本机。",
    "local.artifact": "确认该样例、截图或报告未被 git 跟踪；公开仓库只保留脱敏后的最小样例。",
    "local.runtime_dir": "运行目录可以留在本机，但发布前必须确认它们被 .gitignore 忽略且没有被 git 跟踪。",
}


RELEASE_ACTION_ORDER = [
    "secret.openai_key",
    "secret.anthropic_key",
    "secret.github_token",
    "secret.aws_access_key",
    "secret.jwt",
    "secret.assignment",
    "secret.provider_url",
    "path.windows_absolute",
    "path.user_home",
    "brand.old_project_name",
    "text.mojibake_replacement",
    "text.mojibake_question_marks",
    "gitignore.missing_pattern",
    "release.missing_file",
    "git.tracked_ignored_file",
    "git.tracked_local_artifact",
    "local.config_artifact",
    "local.artifact",
    "local.runtime_dir",
]


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


def _git_lines(args: list[str]) -> list[str]:
    try:
        completed = subprocess.run(
            ["git", *args],
            cwd=ROOT_DIR,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )
    except OSError:
        return []
    if completed.returncode != 0:
        return []
    return [line.strip() for line in completed.stdout.splitlines() if line.strip()]


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


def _is_allowed_text_rule(path: Path, rule: PatternRule, line: str) -> bool:
    relative = _relative(path)
    if rule.code == "brand.old_project_name" and relative == "README.md":
        reference_url = "https://github.com/poleHansen/baibai" + "AIGC"
        return reference_url in line and "参考" in line
    return False


def _issue(severity: str, code: str, message: str, *, path: Path | None = None, line: int | None = None, preview: str = "") -> dict[str, Any]:
    item: dict[str, Any] = {
        "severity": severity,
        "code": code,
        "message": message,
        "action": ISSUE_ACTIONS.get(code, "检查该项是否应进入公开仓库；不确定时先不要提交。"),
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
                if _is_allowed_text_rule(path, rule, line):
                    continue
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


def _is_allowed_local_artifact(relative_path: str) -> bool:
    return relative_path in {"app/public/brand-logo.png"}


def _is_local_artifact_relative(relative_path: str) -> bool:
    path = PurePosixPath(relative_path)
    suffix = path.suffix.lower()
    return suffix in LOCAL_ARTIFACT_SUFFIXES or any(path.match(pattern) for pattern in LOCAL_ARTIFACT_GLOBS)


def _check_tracked_release_hygiene() -> list[dict[str, Any]]:
    issues: list[dict[str, Any]] = []
    tracked_ignored = set(_git_lines(["ls-files", "-ci", "--exclude-standard"]))
    tracked_files = set(_git_lines(["ls-files"]))

    for relative_path in sorted(tracked_ignored):
        if _is_allowed_local_artifact(relative_path):
            continue
        issues.append(
            _issue(
                "error",
                "git.tracked_ignored_file",
                f"被 .gitignore 覆盖的文件仍在 git 跟踪中：{relative_path}",
                path=ROOT_DIR / relative_path,
            )
        )

    for relative_path in sorted(tracked_files):
        if relative_path in tracked_ignored or _is_allowed_local_artifact(relative_path):
            continue
        if _is_local_artifact_relative(relative_path):
            issues.append(
                _issue(
                    "error",
                    "git.tracked_local_artifact",
                    f"疑似本地产物或个人文件被 git 跟踪：{relative_path}",
                    path=ROOT_DIR / relative_path,
                )
            )
    return issues


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


def _count_by_code(items: list[dict[str, Any]]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for item in items:
        code = str(item.get("code") or "")
        if not code:
            continue
        counts[code] = counts.get(code, 0) + 1
    return counts


def _build_next_actions(errors: list[dict[str, Any]], warnings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    counts = _count_by_code([*errors, *warnings])
    actions: list[dict[str, Any]] = []
    for code in RELEASE_ACTION_ORDER:
        count = counts.get(code, 0)
        if count <= 0:
            continue
        severity = "error" if any(item.get("code") == code for item in errors) else "warning"
        actions.append(
            {
                "code": code,
                "severity": severity,
                "count": count,
                "action": ISSUE_ACTIONS.get(code, "检查该项是否应进入公开仓库；不确定时先不要提交。"),
            }
        )
    for code, count in sorted(counts.items()):
        if any(item["code"] == code for item in actions):
            continue
        severity = "error" if any(item.get("code") == code for item in errors) else "warning"
        actions.append(
            {
                "code": code,
                "severity": severity,
                "count": count,
                "action": ISSUE_ACTIONS.get(code, "检查该项是否应进入公开仓库；不确定时先不要提交。"),
            }
        )
    if not actions:
        actions.append(
            {
                "code": "release.ready",
                "severity": "info",
                "count": 0,
                "action": "未发现开源阻断项；提交前仍建议运行 pre_release_check.py 并确认 git status 干净。",
            }
        )
    return actions


def _build_release_summary(errors: list[dict[str, Any]], warnings: list[dict[str, Any]]) -> dict[str, Any]:
    error_codes = sorted({str(item.get("code") or "") for item in errors if item.get("code")})
    warning_codes = sorted({str(item.get("code") or "") for item in warnings if item.get("code")})
    blocking_secret_count = sum(1 for item in errors if str(item.get("code", "")).startswith("secret."))
    blocking_path_count = sum(1 for item in errors if str(item.get("code", "")).startswith("path."))
    local_artifact_warning_count = sum(1 for item in warnings if str(item.get("code", "")).startswith("local."))
    return {
        "readyForPublicRelease": not errors,
        "blockingSecretCount": blocking_secret_count,
        "blockingPathCount": blocking_path_count,
        "localArtifactWarningCount": local_artifact_warning_count,
        "errorCodes": error_codes,
        "warningCodes": warning_codes,
        "statusText": (
            "存在阻断项，不能公开发布。"
            if errors
            else "未发现阻断项；仍需确认本地样例和运行目录没有被 git 跟踪。"
            if warnings
            else "未发现开源卫生问题。"
        ),
    }


def run_audit(report_path: Path) -> dict[str, Any]:
    text_files = list(_iter_text_files())
    issues: list[dict[str, Any]] = []
    issues.extend(_check_gitignore())
    issues.extend(_check_required_release_files())
    issues.extend(_check_tracked_release_hygiene())
    for path in text_files:
        issues.extend(_scan_text_file(path))
    issues.extend(_scan_local_artifacts())
    issues.extend(_scan_runtime_dirs())

    errors = [item for item in issues if item["severity"] == "error"]
    warnings = [item for item in issues if item["severity"] == "warning"]
    summary = _build_release_summary(errors, warnings)
    report = {
        "ok": not errors,
        "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "reportPath": str(report_path.resolve()),
        "errorCount": len(errors),
        "warningCount": len(warnings),
        "scannedTextFileCount": len(text_files),
        "summary": summary,
        "nextActions": _build_next_actions(errors, warnings),
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
