from __future__ import annotations

import os
import tempfile
from copy import deepcopy

import app_service
from app_config import SAVED_SECRET_PLACEHOLDER, hydrate_app_config_secrets, load_app_config, redact_app_config, save_app_config
from app_service import _resolve_round_model_config, find_conflicting_history_route


def _base_config() -> dict:
    return {
        "baseUrl": "https://default.example/v1",
        "apiKey": "default-key",
        "model": "default-model",
        "apiType": "chat_completions",
        "temperature": 0.7,
        "promptProfile": "cn_prewrite",
        "promptSequence": ["prewrite", "round1", "round2"],
        "requestTimeoutSeconds": 600,
        "maxRetries": 3,
        "modelProviders": [
            {
                "id": "provider-a",
                "name": "Provider A",
                "enabled": True,
                "baseUrl": "https://provider-a.example/v1",
                "apiKey": "provider-a-key",
                "apiType": "responses",
                "temperature": 0.4,
                "requestTimeoutSeconds": 900,
                "maxRetries": 5,
                "rateLimitWindowMinutes": 5,
                "rateLimitMaxRequests": 18,
                "models": ["a-model-1", "a-model-2"],
                "defaultModel": "a-model-1",
            },
            {
                "id": "provider-b",
                "name": "Provider B",
                "enabled": False,
                "baseUrl": "https://provider-b.example/v1",
                "apiKey": "provider-b-key",
                "apiType": "chat_completions",
                "temperature": 0.8,
                "requestTimeoutSeconds": 300,
                "maxRetries": 1,
                "models": ["b-model-1"],
                "defaultModel": "b-model-1",
            },
        ],
        "roundModels": {
            "cn_prewrite:1": {
                "enabled": True,
                "providerId": "provider-a",
                "providerName": "Old Provider Name",
                "baseUrl": "https://stale.example/v1",
                "apiKey": "stale-key",
                "model": "a-model-2",
                "apiType": "chat_completions",
                "temperature": 1.4,
                "requestTimeoutSeconds": 60,
                "maxRetries": 0,
                "rateLimitWindowMinutes": 1,
                "rateLimitMaxRequests": 2,
            },
            "cn_prewrite:2": {
                "enabled": False,
                "providerId": "provider-a",
                "model": "a-model-2",
            },
        },
    }


def test_provider_repository_is_authoritative() -> None:
    resolved = _resolve_round_model_config(_base_config(), "cn_prewrite", 1)
    assert resolved["providerId"] == "provider-a"
    assert resolved["providerName"] == "Provider A"
    assert resolved["baseUrl"] == "https://provider-a.example/v1"
    assert resolved["apiKey"] == "provider-a-key"
    assert resolved["model"] == "a-model-2"
    assert resolved["apiType"] == "responses"
    assert resolved["temperature"] == 0.4
    assert resolved["requestTimeoutSeconds"] == 900
    assert resolved["maxRetries"] == 5
    assert resolved["rateLimitWindowMinutes"] == 5
    assert resolved["rateLimitMaxRequests"] == 18
    assert resolved["routeSource"] == "provider"


def test_disabled_round_inherits_default() -> None:
    resolved = _resolve_round_model_config(_base_config(), "cn_prewrite", 2)
    assert resolved["baseUrl"] == "https://default.example/v1"
    assert resolved["model"] == "default-model"


def test_missing_provider_does_not_silently_fallback() -> None:
    config = _base_config()
    config["roundModels"]["cn_prewrite:1"] = {
        "enabled": True,
        "providerId": "missing-provider",
        "model": "",
    }
    try:
        _resolve_round_model_config(config, "cn_prewrite", 1)
    except ValueError as exc:
        assert "provider no longer exists" in str(exc)
    else:
        raise AssertionError("missing provider should not silently use the default model")


def test_disabled_provider_does_not_run() -> None:
    config = _base_config()
    config["roundModels"]["cn_prewrite:1"] = {
        "enabled": True,
        "providerId": "provider-b",
        "model": "b-model-1",
    }
    try:
        _resolve_round_model_config(config, "cn_prewrite", 1)
    except ValueError as exc:
        assert "provider is disabled" in str(exc)
    else:
        raise AssertionError("disabled provider should stop the run")


def test_legacy_snapshot_still_works_without_provider_repository() -> None:
    config = deepcopy(_base_config())
    config["modelProviders"] = []
    config["roundModels"]["cn_prewrite:1"] = {
        "enabled": True,
        "providerName": "Legacy",
        "baseUrl": "https://legacy.example/v1",
        "apiKey": "legacy-key",
        "model": "legacy-model",
        "apiType": "chat_completions",
        "temperature": 0.9,
        "requestTimeoutSeconds": 120,
        "maxRetries": 2,
        "rateLimitWindowMinutes": 1,
        "rateLimitMaxRequests": 6,
    }
    resolved = _resolve_round_model_config(config, "cn_prewrite", 1)
    assert resolved["routeSource"] == "round_snapshot"
    assert resolved["providerName"] == "Legacy"
    assert resolved["baseUrl"] == "https://legacy.example/v1"
    assert resolved["model"] == "legacy-model"
    assert resolved["rateLimitWindowMinutes"] == 1
    assert resolved["rateLimitMaxRequests"] == 6


def test_provider_repository_is_not_capped_at_fifty() -> None:
    original_appdata = os.environ.get("APPDATA")
    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            os.environ["APPDATA"] = temp_dir
            providers = []
            for index in range(75):
                providers.append({
                    "id": f"provider-{index + 1}",
                    "name": f"Provider {index + 1}",
                    "enabled": True,
                    "baseUrl": f"https://provider-{index + 1}.example/v1",
                    "apiKey": f"provider-{index + 1}-key",
                    "apiType": "chat_completions",
                    "models": [f"model-{index + 1}"],
                    "defaultModel": f"model-{index + 1}",
                })
            saved = save_app_config({**_base_config(), "modelProviders": providers})
            loaded = load_app_config()
            assert len(saved["modelProviders"]) == 75
            assert len(loaded["modelProviders"]) == 75
            assert loaded["modelProviders"][74]["id"] == "provider-75"
    finally:
        if original_appdata is None:
            os.environ.pop("APPDATA", None)
        else:
            os.environ["APPDATA"] = original_appdata


def test_redacted_config_preserves_saved_secrets() -> None:
    original_appdata = os.environ.get("APPDATA")
    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            os.environ["APPDATA"] = temp_dir
            saved = save_app_config(_base_config())
            redacted = redact_app_config(saved)
            assert redacted["apiKey"] == SAVED_SECRET_PLACEHOLDER
            assert redacted["hasApiKey"] is True
            assert redacted["modelProviders"][0]["apiKey"] == SAVED_SECRET_PLACEHOLDER
            assert "default-key" not in json_dump(redacted)
            save_app_config(redacted)
            loaded = load_app_config()
            assert loaded["apiKey"] == "default-key"
            assert loaded["modelProviders"][0]["apiKey"] == "provider-a-key"
            hydrated = hydrate_app_config_secrets(redacted)
            assert hydrated["apiKey"] == "default-key"
            assert hydrated["modelProviders"][0]["apiKey"] == "provider-a-key"

            cleared = deepcopy(redacted)
            cleared["apiKey"] = ""
            cleared["modelProviders"][0]["apiKey"] = ""
            cleared["roundModels"]["cn_prewrite:1"]["apiKey"] = ""
            save_app_config(cleared)
            loaded_after_clear = load_app_config()
            assert loaded_after_clear["apiKey"] == ""
            assert loaded_after_clear["modelProviders"][0]["apiKey"] == ""
            assert loaded_after_clear["roundModels"]["cn_prewrite:1"]["apiKey"] == ""
    finally:
        if original_appdata is None:
            os.environ.pop("APPDATA", None)
        else:
            os.environ["APPDATA"] = original_appdata


def test_route_conflict_detects_stale_custom_sequence() -> None:
    original_list_records = app_service.list_records
    source_path = str(app_service.ROOT_DIR / "origin" / "route-conflict.docx")
    try:
        app_service.list_records = lambda: {
            "origin/route-conflict.docx": {
                "origin_path": "origin/route-conflict.docx",
                "rounds": [
                    {
                        "round": 1,
                        "prompt_profile": "cn_custom",
                        "prompt_sequence": ["classical", "round1"],
                        "output_path": "finish/intermediate/route-conflict_custom_classical_round1_round1.txt",
                    },
                    {
                        "round": 2,
                        "prompt_profile": "cn_custom",
                        "prompt_sequence": ["classical", "round1"],
                        "output_path": "finish/intermediate/route-conflict_custom_classical_round1_round2.txt",
                    },
                ],
            }
        }
        conflict = find_conflicting_history_route(
            source_path,
            {"promptProfile": "cn_custom", "promptSequence": ["classical"]},
        )
        assert conflict is not None
        assert conflict["promptProfile"] == "cn_custom"
        assert conflict["promptSequence"] == ["classical", "round1"]
        assert conflict["completedRounds"] == [1, 2]
        assert conflict["requestedPromptSequence"] == ["classical"]
        assert find_conflicting_history_route(
            source_path,
            {"promptProfile": "cn_custom", "promptSequence": ["classical", "round1"]},
        ) is None
    finally:
        app_service.list_records = original_list_records


def json_dump(value: object) -> str:
    import json

    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def main() -> int:
    test_provider_repository_is_authoritative()
    test_disabled_round_inherits_default()
    test_missing_provider_does_not_silently_fallback()
    test_disabled_provider_does_not_run()
    test_legacy_snapshot_still_works_without_provider_repository()
    test_provider_repository_is_not_capped_at_fifty()
    test_redacted_config_preserves_saved_secrets()
    test_route_conflict_detects_stale_custom_sequence()
    print("model route regression passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
