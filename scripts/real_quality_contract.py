"""Shared helpers for optional real-provider conservative-editing checks.

The real-provider regressions use synthetic paragraphs only.  They validate
FYADR's factual/editing contract and report style metrics for observation;
they do not claim authorship detection or require a model to game a score.
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any

import app_config
import fyadr_round_service as round_service
import llm_client
import prompt_library
from factual_guards import NEGATION_MARKER_RE, collect_factual_relation_issues


PROFILE = "cn_custom"
PROMPT_SEQUENCE = prompt_library.DEFAULT_PROMPT_SEQUENCES[PROFILE]
REAL_RUN_ENV = "FYADR_RUN_REAL_LLM"
META_PREFIX_RE = re.compile(r"^\s*(?:改写后|润色后|修改后|说明|分析|输出)\s*[:：]", re.IGNORECASE)
GENERIC_ADDED_CONCLUSION_RE = re.compile(
    r"(?:综上所述|总而言之|具有广阔的应用前景|奠定了坚实基础|具有重要意义|提供了有力支撑)"
)


def real_calls_enabled() -> bool:
    return os.environ.get(REAL_RUN_ENV, "").strip() == "1"


def resolve_provider() -> dict[str, Any] | None:
    """Load one configured provider without logging or returning its secret."""

    config = app_config.load_app_config()
    try:
        hydrated = app_config.hydrate_app_config_secrets(config)
    except Exception:
        hydrated = config
    base_url = str(hydrated.get("baseUrl", "")).strip()
    api_key = str(hydrated.get("apiKey", "")).strip()
    model = str(hydrated.get("model", "")).strip()
    if not base_url or not model or not api_key or api_key.startswith("__"):
        return None
    return {
        "baseUrl": base_url,
        "apiKey": api_key,
        "model": model,
        "apiType": str(hydrated.get("apiType", "chat_completions")).strip() or "chat_completions",
        "temperature": min(0.7, max(0.1, float(hydrated.get("temperature", 0.5) or 0.5))),
        "requestTimeoutSeconds": min(360, max(60, int(hydrated.get("requestTimeoutSeconds", 180) or 180))),
        # Provider transport retries are disabled for bounded verification.
        # FYADR's two validation attempts remain active, so one two-round script
        # normally makes 2 completions and makes at most 4 completions.
        "maxRetries": 0,
    }


def is_external_unavailability(error: BaseException) -> bool:
    """Return True only for transient external conditions suitable for skip."""

    for current in _exception_chain(error):
        if isinstance(current, (TimeoutError, ConnectionError, OSError)):
            return True
        if isinstance(current, llm_client.LLMRequestError):
            status_code = current.status_code
            if (
                current.category in {"network", "timeout", "rate_limit", "server"}
                or status_code in {408, 409, 425, 429}
                or isinstance(status_code, int) and status_code >= 500
            ):
                return True
    return False


def describe_external_unavailability(error: BaseException) -> str:
    """Return a provider-neutral reason without endpoint, model, or payload."""

    for current in _exception_chain(error):
        if isinstance(current, llm_client.LLMRequestError):
            status = f", status={current.status_code}" if current.status_code is not None else ""
            return f"category={current.category or 'unknown'}{status}"
        if isinstance(current, TimeoutError):
            return "category=timeout"
        if isinstance(current, (ConnectionError, OSError)):
            return "category=network"
    return "category=external-unavailable"


def _exception_chain(error: BaseException):
    seen: set[int] = set()
    current: BaseException | None = error
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        yield current
        current = current.__cause__ or current.__context__


def build_real_transform(provider: dict[str, Any]):
    def transform(_input_text: str, prompt_input: str, _round_number: int, _chunk_id: str) -> str:
        return llm_client.llm_completion(
            prompt_input,
            model=str(provider["model"]),
            api_key=str(provider["apiKey"]),
            base_url=str(provider["baseUrl"]),
            api_type=str(provider["apiType"]),
            temperature=float(provider["temperature"]),
            timeout=int(provider["requestTimeoutSeconds"]),
            max_retries=0,
            stream=False,
        )

    return transform


def run_real_round(
    tmpdir: Path,
    *,
    case_id: str,
    round_number: int,
    input_text: str,
    provider: dict[str, Any],
) -> dict[str, Any]:
    input_path = tmpdir / f"{case_id}_r{round_number}_input.txt"
    output_path = tmpdir / f"{case_id}_r{round_number}_output.txt"
    manifest_path = tmpdir / f"{case_id}_r{round_number}_manifest.json"
    input_path.write_text(input_text, encoding="utf-8")
    result = round_service.run_round(
        doc_id=f"real-quality/{case_id}.txt",
        round_number=round_number,
        input_path=input_path,
        output_path=output_path,
        manifest_path=manifest_path,
        transform=build_real_transform(provider),
        prompt_profile=PROFILE,
        prompt_sequence=PROMPT_SEQUENCE,
        chunk_limit=1_200,
        max_concurrency=1,
    )
    output_text = output_path.read_text(encoding="utf-8") if output_path.exists() else ""
    compare_path = round_service.get_round_compare_path(output_path)
    compare = json.loads(compare_path.read_text(encoding="utf-8")) if compare_path.exists() else {}
    return {"result": result, "output": output_text.strip(), "compare": compare}


def assess_conservative_edit(
    source_text: str,
    output_text: str,
    *,
    required_literals: tuple[str, ...] = (),
    require_change: bool = True,
) -> dict[str, Any]:
    """Assess a real output against facts and conservative-editing boundaries."""

    failures: list[str] = []
    source = source_text.strip()
    output = output_text.strip()
    if not output:
        return {"ok": False, "failures": ["model returned an empty output"]}
    if require_change and output == source:
        failures.append("output is identical to the deliberately mechanical source")
    if META_PREFIX_RE.search(output):
        failures.append("output added an explanatory prefix instead of returning plain正文")
    if "\n\n" in output or "\r" in output:
        failures.append("one input paragraph was split into multiple output paragraphs")

    length_ratio = len(output) / max(len(source), 1)
    if length_ratio < 0.70 or length_ratio > 1.30:
        failures.append(f"length ratio left the conservative 0.70–1.30 band: {length_ratio:.3f}")

    for literal in required_literals:
        output_count = output.count(literal)
        source_count = source.count(literal)
        if output_count < 1:
            failures.append(f"required term/value disappeared: {literal}")
        elif re.match(r"^\s*(?:\[|\d)", literal) and output_count != source_count:
            failures.append(f"protected numeric/reference literal count changed: {literal}")

    source_negations = NEGATION_MARKER_RE.findall(source)
    output_negations = NEGATION_MARKER_RE.findall(output)
    if source_negations and not output_negations:
        failures.append("source negation disappeared from the output")

    relation_issues = collect_factual_relation_issues(source, output)
    if relation_issues:
        failures.append(f"factual order or metric-value binding changed: {relation_issues[0].get('code')}")

    try:
        round_service.validate_chunk_output(source, output, "real-quality-contract")
    except ValueError as error:
        failures.append(f"hard rewrite contract failed: {error}")

    source_generic = set(GENERIC_ADDED_CONCLUSION_RE.findall(source))
    added_generic = sorted(set(GENERIC_ADDED_CONCLUSION_RE.findall(output)) - source_generic)
    if added_generic:
        failures.append(f"output invented generic conclusion/template phrases: {added_generic}")

    surface_issues = round_service.find_sentence_surface_issues(source, output, limit=4)
    if surface_issues:
        failures.append(
            "sentence surface became incomplete or malformed: "
            + ", ".join(str(item.get("code", "")) for item in surface_issues)
        )

    source_metrics = round_service._style_risk_metrics(source)
    output_metrics = round_service._style_risk_metrics(output)
    source_short = int(source_metrics.get("shortSentenceCount", 0) or 0)
    output_short = int(output_metrics.get("shortSentenceCount", 0) or 0)
    output_short_rate = float(output_metrics.get("shortSentenceRate", 0) or 0)
    if output_short >= source_short + 2 and output_short_rate >= 0.20:
        failures.append("output introduced multiple very short fragments")

    return {
        "ok": not failures,
        "failures": failures,
        "changed": output != source,
        "lengthRatio": round(length_ratio, 3),
        "relationIssueCodes": [str(item.get("code", "")) for item in relation_issues],
        "sourceMetrics": _diagnostic_metrics(source_metrics),
        "outputMetrics": _diagnostic_metrics(output_metrics),
    }


def _diagnostic_metrics(metrics: dict[str, Any]) -> dict[str, Any]:
    return {
        key: metrics.get(key)
        for key in (
            "sentenceCount",
            "burstinessRatio",
            "sentenceLengthVariation",
            "shortSentenceCount",
            "shortSentenceRate",
            "connectorDensity",
            "templateDensity",
            "structureConcentration",
            "dominantStructureType",
        )
    }
