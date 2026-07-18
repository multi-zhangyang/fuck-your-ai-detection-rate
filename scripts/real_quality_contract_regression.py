from __future__ import annotations

import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = ROOT_DIR / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from real_quality_contract import (  # noqa: E402
    assess_conservative_edit,
    describe_external_unavailability,
    is_external_unavailability,
)
from llm_client import LLMRequestError  # noqa: E402


SOURCE = (
    "ResNet-50在验证集上的准确率为91.2%，召回率为88.7%，平均延迟为128 ms[3]。"
    "该系统不支持离线写入，因此缓存模块不得绕过一致性校验。"
)
SAFE_OUTPUT = (
    "验证集结果显示，ResNet-50的准确率为91.2%，召回率为88.7%，平均延迟为128 ms[3]。"
    "由于该系统不支持离线写入，缓存模块不得绕过一致性校验。"
)


def main() -> int:
    required = ("ResNet-50", "91.2%", "88.7%", "128 ms", "[3]")
    safe = assess_conservative_edit(SOURCE, SAFE_OUTPUT, required_literals=required)
    if not safe["ok"]:
        raise AssertionError(f"valid conservative edit was rejected: {safe['failures']}")

    swapped = SAFE_OUTPUT.replace("91.2%", "__A__").replace("88.7%", "91.2%").replace("__A__", "88.7%")
    swapped_result = assess_conservative_edit(SOURCE, swapped, required_literals=required)
    if swapped_result["ok"]:
        raise AssertionError("swapped metric values must fail the real-quality contract")

    invented = SAFE_OUTPUT + "综上所述，该方法具有广阔的应用前景。"
    invented_result = assess_conservative_edit(SOURCE, invented, required_literals=required)
    if invented_result["ok"]:
        raise AssertionError("invented generic conclusions must fail the real-quality contract")

    network = LLMRequestError("service unavailable", category="server", status_code=503, retryable=True)
    wrapped_network = RuntimeError("chunk failed")
    wrapped_network.__cause__ = network
    auth = LLMRequestError("unauthorized", category="auth", status_code=401, retryable=False)
    malformed = RuntimeError("Unexpected LLM response payload")
    if not is_external_unavailability(network) or not is_external_unavailability(wrapped_network):
        raise AssertionError("transient provider outage must remain skippable through pipeline wrapping")
    if describe_external_unavailability(wrapped_network) != "category=server, status=503":
        raise AssertionError("external skip reasons must be provider-neutral")
    if is_external_unavailability(auth) or is_external_unavailability(malformed):
        raise AssertionError("authentication and malformed-response failures must not be hidden as skips")

    print("real quality contract regression passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
