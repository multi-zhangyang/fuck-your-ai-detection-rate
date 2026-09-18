from __future__ import annotations

import json
import os
import tempfile
import unittest
from pathlib import Path

from core_config import (
    BUILTIN_PLAN_ID,
    BUILTIN_PLANS,
    BUILTIN_TEMPLATE_ID,
    BUILTIN_TEMPLATES,
    DEEPSEEK_BASE_URL,
    DEEPSEEK_PROFILE_ID,
    SCHEMA_VERSION,
    SECRET_PLACEHOLDER,
    delete_profile,
    get_config_path,
    load_config,
    public_config,
    save_config,
    set_preferences,
    upsert_profile,
)


class CoreConfigRegression(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.previous = os.environ.get("FYADR_CONFIG_DIR")
        os.environ["FYADR_CONFIG_DIR"] = self.temporary.name

    def tearDown(self) -> None:
        if self.previous is None:
            os.environ.pop("FYADR_CONFIG_DIR", None)
        else:
            os.environ["FYADR_CONFIG_DIR"] = self.previous
        self.temporary.cleanup()

    def test_legacy_config_migrates_once_and_keeps_backup(self) -> None:
        path = get_config_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        legacy = {
            "baseUrl": "https://one.example/v1",
            "apiKey": "top-secret",
            "model": "model-a",
            "apiType": "responses",
            "promptSequence": ["prewrite", "round1", "round2"],
            "rewriteConcurrency": 4,
            "modelProviders": [
                {
                    "id": "provider-two",
                    "name": "第二连接",
                    "baseUrl": "https://two.example/v1",
                    "apiKey": "provider-secret",
                    "defaultModel": "model-b",
                    "apiType": "chat_completions",
                    "models": ["model-b", "model-c"],
                }
            ],
            "roundModels": {"round1": {"model": "must-not-survive"}},
        }
        path.write_text(json.dumps(legacy, ensure_ascii=False), encoding="utf-8")
        migrated = load_config()
        self.assertEqual(migrated["schemaVersion"], SCHEMA_VERSION)
        self.assertEqual(len(migrated["modelProfiles"]), 3)
        self.assertEqual(migrated["modelProfiles"][0]["id"], DEEPSEEK_PROFILE_ID)
        self.assertTrue(migrated["defaultModelProfileId"])
        self.assertIn("https://one.example/v1", json.dumps(migrated, ensure_ascii=False))
        self.assertIn("https://two.example/v1", json.dumps(migrated, ensure_ascii=False))
        self.assertNotIn("roundModels", migrated)
        self.assertEqual(
            [item["name"] for item in migrated["promptTemplates"] if item["builtIn"]],
            ["经典改写"],
        )
        migrated_plan = next(
            item for item in migrated["promptPlans"] if item["id"] == migrated["defaultPromptPlanId"]
        )
        self.assertFalse(migrated_plan["builtIn"])
        self.assertEqual(
            [
                next(template["name"] for template in migrated["promptTemplates"] if template["id"] == template_id)
                for template_id in migrated_plan["templateIds"]
            ],
            ["原有润色步骤", "原有改写步骤一", "原有改写步骤二"],
        )
        backup = path.with_name(f"config.before-v{SCHEMA_VERSION}.json")
        self.assertTrue(backup.exists())
        self.assertEqual(json.loads(backup.read_text(encoding="utf-8"))["apiKey"], "top-secret")

        public = public_config(migrated)
        self.assertEqual(
            sum(item["apiKey"] == SECRET_PLACEHOLDER for item in public["modelProfiles"]),
            2,
        )
        self.assertNotIn("top-secret", json.dumps(public, ensure_ascii=False))
        self.assertEqual(migrated["preferences"]["chunkPreset"], "standard")
        self.assertEqual(migrated["preferences"]["singleTemplateRounds"], 2)

        backup_before = backup.read_bytes()
        load_config()
        self.assertEqual(backup.read_bytes(), backup_before)

    def test_single_builtin_prompt_is_idempotent_without_replacing_custom_items(self) -> None:
        config = load_config()
        custom_template = {
            "id": "template-user-kept",
            "name": "我的提示词",
            "description": "用户内容",
            "content": "保留用户内容\n\n{{text}}",
            "builtIn": False,
            "readOnly": False,
        }
        custom_plan = {
            "id": "plan-user-kept",
            "name": "我的方案",
            "description": "用户方案",
            "templateIds": [custom_template["id"]],
            "builtIn": False,
            "readOnly": False,
        }
        config["promptTemplates"].append(custom_template)
        config["promptPlans"].append(custom_plan)
        save_config(config)

        first = load_config()
        second = load_config()
        self.assertEqual(
            [item["id"] for item in first["promptTemplates"]],
            [item["id"] for item in second["promptTemplates"]],
        )
        self.assertEqual(
            {item["id"] for item in first["promptTemplates"] if item["builtIn"]},
            {item["id"] for item in BUILTIN_TEMPLATES},
        )
        self.assertEqual(
            {item["id"] for item in first["promptPlans"] if item["builtIn"]},
            {item["id"] for item in BUILTIN_PLANS},
        )
        self.assertEqual(len(BUILTIN_TEMPLATES), 1)
        self.assertEqual(len(BUILTIN_PLANS), 1)
        self.assertEqual(BUILTIN_TEMPLATES[0]["id"], BUILTIN_TEMPLATE_ID)
        self.assertEqual(BUILTIN_TEMPLATES[0]["name"], "经典改写")
        self.assertEqual(
            next(item for item in first["promptTemplates"] if item["id"] == custom_template["id"])["content"],
            custom_template["content"],
        )
        self.assertEqual(
            next(item for item in first["promptPlans"] if item["id"] == custom_plan["id"])["templateIds"],
            custom_plan["templateIds"],
        )

    def test_multiple_openai_compatible_profiles_can_be_created(self) -> None:
        saved = upsert_profile(
            {
                "name": "",
                "baseUrl": "http://127.0.0.1:11434/v1",
                "apiKey": "",
                "model": "local-model",
            }
        )
        second = upsert_profile(
            {
                "name": "第二渠道",
                "baseUrl": "http://localhost:11435/v1",
                "apiKey": "",
                "model": "second-model",
            }
        )
        self.assertNotEqual(saved["id"], second["id"])
        self.assertEqual(saved["name"], "local-model")
        self.assertEqual(saved["model"], "local-model")
        self.assertEqual(saved["provider"], "custom")
        self.assertFalse(saved["hasApiKey"])
        self.assertTrue(saved["configured"])
        self.assertEqual(len(load_config()["modelProfiles"]), 3)

    def test_default_model_profile_can_be_selected_and_cleared(self) -> None:
        value = {
            "name": "可切换默认连接",
            "baseUrl": "http://127.0.0.1:11434/v1",
            "apiKey": "",
            "model": "local-model",
            "makeDefault": True,
        }
        saved = upsert_profile(value)
        self.assertEqual(load_config()["defaultModelProfileId"], saved["id"])

        upsert_profile({**value, "makeDefault": False}, saved["id"])
        self.assertEqual(load_config()["defaultModelProfileId"], "")
        self.assertEqual(load_config()["defaultModelProfileId"], "")

    def test_deepseek_official_profile_is_fixed_and_not_deletable(self) -> None:
        config = load_config()
        official = next(item for item in config["modelProfiles"] if item["id"] == DEEPSEEK_PROFILE_ID)
        self.assertEqual(official["baseUrl"], DEEPSEEK_BASE_URL)
        self.assertEqual(official["model"], "")
        self.assertEqual(official["knownModels"], [])
        self.assertEqual(official["reasoningEffort"], "high")

        saved = upsert_profile(
            {
                "name": "不能覆盖",
                "baseUrl": "https://third-party.example/v1",
                "apiKey": "deepseek-secret",
                "model": "deepseek-model-from-api",
                "knownModels": ["deepseek-model-from-api", "deepseek-model-next"],
                "protocol": "responses",
                "reasoningEffort": "max",
            },
            DEEPSEEK_PROFILE_ID,
        )
        self.assertEqual(saved["name"], "DeepSeek 官方")
        self.assertEqual(saved["baseUrl"], DEEPSEEK_BASE_URL)
        self.assertEqual(saved["model"], "deepseek-model-from-api")
        self.assertEqual(saved["knownModels"], ["deepseek-model-from-api", "deepseek-model-next"])
        self.assertEqual(saved["protocol"], "responses")
        self.assertEqual(saved["reasoningEffort"], "max")
        with self.assertRaisesRegex(ValueError, "不能删除"):
            delete_profile(DEEPSEEK_PROFILE_ID)

    def test_v2_deepseek_profile_is_adopted_without_duplicate_or_key_loss(self) -> None:
        path = get_config_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(
                {
                    "schemaVersion": 2,
                    "defaultModelProfileId": "legacy-deepseek",
                    "defaultPromptPlanId": BUILTIN_PLAN_ID,
                    "modelProfiles": [
                        {
                            "id": "legacy-deepseek",
                            "name": "DeepSeek官方",
                            "baseUrl": DEEPSEEK_BASE_URL,
                            "apiKey": "kept-secret",
                            "model": "deepseek-v4-pro",
                            "protocol": "chat_completions",
                            "temperature": 0.7,
                            "connectTimeoutSeconds": 15,
                            "firstEventTimeoutSeconds": 300,
                            "idleTimeoutSeconds": 180,
                            "maxRetries": 2,
                        },
                        {
                            "id": "old-custom-profile",
                            "name": "必须删除的旧连接",
                            "baseUrl": "https://old.example/v1",
                            "apiKey": "old-secret",
                            "model": "old-model",
                            "protocol": "chat_completions",
                        },
                    ],
                    "promptTemplates": BUILTIN_TEMPLATES,
                    "promptPlans": BUILTIN_PLANS,
                    "preferences": {"rewriteConcurrency": 1, "protectedTerms": []},
                },
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
        migrated = load_config()
        official = [item for item in migrated["modelProfiles"] if item["id"] == DEEPSEEK_PROFILE_ID]
        self.assertEqual(len(official), 1)
        self.assertEqual(official[0]["apiKey"], "kept-secret")
        self.assertEqual(official[0]["model"], "deepseek-v4-pro")
        self.assertEqual(official[0]["knownModels"], [])
        self.assertEqual(migrated["defaultModelProfileId"], DEEPSEEK_PROFILE_ID)
        self.assertEqual(
            [item["id"] for item in migrated["modelProfiles"]],
            [DEEPSEEK_PROFILE_ID, "old-custom-profile"],
        )
        self.assertIn("old-secret", json.dumps(migrated, ensure_ascii=False))

    def test_v4_upgrade_keeps_all_profiles_and_deepseek_model_cache(self) -> None:
        path = get_config_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        config = {
            "schemaVersion": 4,
            "defaultModelProfileId": "custom-kept",
            "defaultPromptPlanId": BUILTIN_PLAN_ID,
            "modelProfiles": [
                {
                    "id": DEEPSEEK_PROFILE_ID,
                    "provider": "deepseek",
                    "name": "DeepSeek 官方",
                    "baseUrl": DEEPSEEK_BASE_URL,
                    "apiKey": "deepseek-key",
                    "model": "cached-model",
                    "knownModels": ["cached-model"],
                    "protocol": "chat_completions",
                },
                {
                    "id": "custom-kept",
                    "provider": "custom",
                    "name": "用户新建连接",
                    "baseUrl": "https://custom.example/v1",
                    "apiKey": "custom-key",
                    "model": "custom-model",
                    "knownModels": ["custom-model"],
                    "protocol": "responses",
                },
            ],
            "promptTemplates": BUILTIN_TEMPLATES,
            "promptPlans": BUILTIN_PLANS,
            "preferences": {"rewriteConcurrency": 1, "protectedTerms": []},
        }
        path.write_text(json.dumps(config, ensure_ascii=False), encoding="utf-8")

        migrated = load_config()
        official = next(item for item in migrated["modelProfiles"] if item["id"] == DEEPSEEK_PROFILE_ID)
        custom = next(item for item in migrated["modelProfiles"] if item["id"] == "custom-kept")
        self.assertEqual(official["model"], "cached-model")
        self.assertEqual(official["knownModels"], ["cached-model"])
        self.assertEqual(custom["apiKey"], "custom-key")
        self.assertEqual(custom["model"], "custom-model")
        self.assertEqual(migrated["defaultModelProfileId"], "custom-kept")
        self.assertTrue(path.with_name(f"config.before-v{SCHEMA_VERSION}.json").exists())

    def test_v5_upgrade_keeps_custom_prompts_but_drops_retired_routing_fields(self) -> None:
        path = get_config_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        custom_template = {
            "id": "template-kept",
            "name": "保留的提示词",
            "description": "用户内容",
            "content": "请保留这段用户提示词。\n\n{{text}}",
            "builtIn": False,
            "readOnly": False,
        }
        custom_plan = {
            "id": "plan-kept",
            "name": "保留的方案",
            "description": "用户方案",
            "templateIds": [custom_template["id"]],
            "builtIn": False,
            "readOnly": False,
        }
        path.write_text(
            json.dumps(
                {
                    "schemaVersion": 5,
                    "defaultModelProfileId": "",
                    "defaultPromptPlanId": custom_plan["id"],
                    "modelProfiles": [],
                    "promptTemplates": [*BUILTIN_TEMPLATES, custom_template],
                    "promptPlans": [*BUILTIN_PLANS, custom_plan],
                    "preferences": {"rewriteConcurrency": 3, "protectedTerms": ["Transformer"]},
                    "roundModels": {"round1": {"model": "retired"}},
                    "rateLimitMaxRequests": 10,
                    "providerRoutes": [{"id": "retired"}],
                },
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )

        migrated = load_config()
        self.assertNotIn("roundModels", migrated)
        self.assertNotIn("rateLimitMaxRequests", migrated)
        self.assertNotIn("providerRoutes", migrated)
        self.assertEqual(migrated["defaultPromptPlanId"], custom_plan["id"])
        self.assertEqual(
            next(item for item in migrated["promptTemplates"] if item["id"] == custom_template["id"])["content"],
            custom_template["content"],
        )
        self.assertEqual(
            next(item for item in migrated["promptPlans"] if item["id"] == custom_plan["id"])["templateIds"],
            custom_plan["templateIds"],
        )
        self.assertEqual(migrated["preferences"]["rewriteConcurrency"], 3)
        self.assertEqual(migrated["preferences"]["protectedTerms"], ["Transformer"])

    def test_preferences_default_to_standard_two_rounds_and_are_clamped(self) -> None:
        preferences = load_config()["preferences"]
        self.assertEqual(preferences["chunkPreset"], "standard")
        self.assertEqual(preferences["singleTemplateRounds"], 2)
        saved = set_preferences(
            {
                "chunkPreset": "fine",
                "singleTemplateRounds": 99,
                "rewriteConcurrency": 16,
                "protectedTerms": ["Transformer"],
            }
        )
        self.assertEqual(saved["chunkPreset"], "fine")
        self.assertEqual(saved["singleTemplateRounds"], 3)
        self.assertEqual(saved["rewriteConcurrency"], 16)

if __name__ == "__main__":
    unittest.main()
