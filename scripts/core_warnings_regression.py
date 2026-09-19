from __future__ import annotations

import unittest

from core_warnings import generate_rewrite_warnings


class CoreWarningsRegression(unittest.TestCase):
    def test_numbers_are_reported_without_guessing_technical_terms(self) -> None:
        warnings = generate_rewrite_warnings(
            "本文使用BERT模型和ResNet50网络，准确率为95.2%。",
            "本文使用RoBERTa模型和ResNet101网络，准确率为96.1%。",
        )

        by_category = {item["category"]: item for item in warnings}
        self.assertEqual(set(by_category), {"number"})
        self.assertIn("95.2%", by_category["number"]["removed"])
        self.assertIn("96.1%", by_category["number"]["added"])

    def test_user_protected_terms_are_explicit_reminders(self) -> None:
        warnings = generate_rewrite_warnings(
            "本文使用Transformer模型。",
            "本文使用注意力模型。",
            ["Transformer"],
        )

        self.assertEqual([item["category"] for item in warnings], ["protected_term"])
        self.assertIn("Transformer", warnings[0]["removed"])

    def test_full_width_citations_and_scientific_numbers_are_reported(self) -> None:
        warnings = generate_rewrite_warnings(
            "结果为-1.25e-3，详见［3-5］。",
            "结果为-1.30e-3，详见［3-6］。",
        )

        self.assertEqual(
            {item["category"] for item in warnings},
            {"number", "citation"},
        )

    def test_unchanged_values_do_not_create_advisory_noise(self) -> None:
        text = "本文使用BERT模型，结果为1,024，引用见［1］。"
        self.assertEqual(generate_rewrite_warnings(text, text, ["BERT"]), [])

    def test_language_change_does_not_add_a_mechanical_warning(self) -> None:
        original = " ".join(["This paragraph explains the access control system and its implementation details."] * 8)
        rewritten = "。".join(["本段介绍门禁系统及其实现细节"] * 12)

        warnings = generate_rewrite_warnings(original, rewritten)

        self.assertNotIn("language", {item["category"] for item in warnings})

    def test_mixed_technical_chinese_does_not_create_language_noise(self) -> None:
        original = ("本文使用 Java Web、Spring MVC 和 MySQL 完成二维码门禁系统开发。" * 10)
        rewritten = ("该系统借助 Java Web、Spring MVC 以及 MySQL 开展二维码门禁功能的实现工作。" * 10)

        self.assertNotIn(
            "language",
            {item["category"] for item in generate_rewrite_warnings(original, rewritten)},
        )


if __name__ == "__main__":
    unittest.main()
