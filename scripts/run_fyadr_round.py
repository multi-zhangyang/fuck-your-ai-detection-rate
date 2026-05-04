from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Callable, Sequence

from chunking import DEFAULT_CHUNK_LIMIT
from fyadr_round_service import build_prompt_input, get_prompt_mapping, load_prompt, normalize_prompt_profile, normalize_prompt_sequence, run_round
from llm_client import llm_completion, read_api_config


def _build_api_transform(
    api_key: str,
    model: str,
    base_url: str,
    api_type: str | None,
    temperature: float,
) -> Callable[[str, str, int, str], str]:
    def transform(_: str, prompt_input: str, __: int, ___: str) -> str:
        return llm_completion(
            prompt_input,
            model=model,
            api_key=api_key,
            base_url=base_url,
            api_type=api_type,
            temperature=temperature,
        )

    return transform


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run one segmented FYADR round")
    parser.add_argument("doc_id", help="Document id, usually origin-relative path")
    parser.add_argument("round", type=int, help="Round number for the selected prompt profile")
    parser.add_argument("input_path", type=Path, help="Input text file path")
    parser.add_argument("output_path", type=Path, help="Output text file path")
    parser.add_argument("manifest_path", type=Path, help="Manifest json output path")
    parser.add_argument("--chunk-limit", type=int, default=DEFAULT_CHUNK_LIMIT)
    parser.add_argument("--prompt-profile", default="cn_custom", help="Prompt profile: cn_custom by default; legacy cn and cn_prewrite remain supported.")
    parser.add_argument("--prompt-sequence", default="", help="Comma-separated custom prompt ids for cn_custom.")
    parser.add_argument("--score-total", type=int, default=None)
    parser.add_argument("--api-key", default=None, help="LLM API key. Defaults to FYADR_API_KEY or OPENAI_API_KEY.")
    parser.add_argument("--model", default=None, help="LLM model name. Defaults to FYADR_MODEL.")
    parser.add_argument(
        "--base-url",
        default=None,
        help="OpenAI-compatible base URL or chat/completions endpoint. Defaults to FYADR_BASE_URL or OPENAI_BASE_URL.",
    )
    parser.add_argument("--api-type", default=None, help="API type: chat_completions or responses.")
    parser.add_argument("--temperature", type=float, default=0.7, help="Sampling temperature for API mode.")
    parser.add_argument(
        "--echo-prompt-inputs",
        action="store_true",
        help="Write the exact per-chunk prompt inputs into the result for integration debugging.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Build chunks and prompt inputs without calling the model. Output text will match input text.",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> None:
    parser = _build_parser()
    args = parser.parse_args(argv)
    debug_payload: dict[str, str] = {}
    prompt_profile = normalize_prompt_profile(args.prompt_profile)
    prompt_sequence = normalize_prompt_sequence(prompt_profile, args.prompt_sequence)
    supported_rounds = sorted(get_prompt_mapping(prompt_profile, prompt_sequence))
    if args.round not in supported_rounds:
        parser.error(
            f"Round {args.round} is not available for prompt profile {prompt_profile}. "
            f"Supported rounds: {supported_rounds}."
        )
    resolved_api_key, resolved_model, resolved_base_url, resolved_api_type = read_api_config(
        args.api_key,
        args.model,
        args.base_url,
        args.api_type,
    )

    if resolved_api_key and resolved_model and resolved_base_url:
        base_transform = _build_api_transform(
            api_key=resolved_api_key,
            model=resolved_model,
            base_url=resolved_base_url,
            api_type=resolved_api_type,
            temperature=args.temperature,
        )
    elif args.api_key or args.model or args.base_url or args.api_type:
        parser.error("API mode requires api_key, model, and base_url together, either by args or environment variables.")
    elif args.dry_run:
        def base_transform(chunk_text: str, _: str, __: int, ___: str) -> str:
            return chunk_text
    else:
        parser.error("No API configuration found. Provide api_key, model, and base_url, or use --dry-run for chunk verification only.")

    prompt_text = load_prompt(prompt_profile, args.round, prompt_sequence)
    checkpoint_metadata = {
        "base_url": resolved_base_url or "",
        "model": resolved_model or "",
        "api_type": resolved_api_type or "",
        "temperature": args.temperature,
        "dry_run": bool(args.dry_run),
        "prompt_profile": prompt_profile,
        "prompt_sequence": prompt_sequence,
    }

    def transform(chunk_text: str, prompt_input: str, round_number: int, chunk_id: str) -> str:
        if args.echo_prompt_inputs:
            debug_payload[chunk_id] = build_prompt_input(prompt_text, chunk_text, round_number, chunk_id)
        return base_transform(chunk_text, prompt_input, round_number, chunk_id)

    result = run_round(
        doc_id=args.doc_id,
        round_number=args.round,
        input_path=args.input_path,
        output_path=args.output_path,
        manifest_path=args.manifest_path,
        chunk_limit=args.chunk_limit,
        score_total=args.score_total,
        transform=transform,
        prompt_profile=prompt_profile,
        prompt_sequence=prompt_sequence,
        checkpoint_metadata=checkpoint_metadata,
    )
    if debug_payload:
        result["prompt_inputs"] = debug_payload
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
