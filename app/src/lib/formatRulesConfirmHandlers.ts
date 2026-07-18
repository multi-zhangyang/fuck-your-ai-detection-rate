import { saveStoredFormatRules } from "@/lib/formatStorage";
import type { FormatRulesHandlersDeps } from "@/lib/formatRulesHandlerTypes";
import { FORMAT_RULE_ACTIVE_KEY, FORMAT_RULE_PENDING_KEY } from "@/lib/storageKeys";

export function createFormatRulesConfirmHandlers(deps: FormatRulesHandlersDeps) {
  async function handleConfirmFormatRules() {
    const pendingFormatRules = deps.getPendingFormatRules();
    if (!pendingFormatRules) {
      deps.setNotice("没有待确认的学校规范对照。");
      return;
    }
    const taskTicket = deps.beginTask("applying-format", { runtimeStep: "正在保存学校规范对照。" });
    try {
      const rules = (await deps.service.activateFormatRules(pendingFormatRules)).rules;
      deps.setActiveFormatRules(rules);
      deps.setPendingFormatRules(null);
      saveStoredFormatRules(FORMAT_RULE_ACTIVE_KEY, rules);
      saveStoredFormatRules(FORMAT_RULE_PENDING_KEY, null);
      deps.setNotice(`学校规范对照已保存：${rules.schoolName || "自定义规范"}。导出仍保持原 Word 格式。`);
      deps.setRuntimeStep("学校规范对照已保存");
    } catch (appError) {
      deps.applyErrorRuntimeStep(appError, "保存学校规范对照失败");
    } finally {
      deps.finishTask(taskTicket);
    }
  }

  async function handleResetFormatRules() {
    const taskTicket = deps.beginTask("applying-format", { runtimeStep: "正在恢复默认规范对照。" });
    try {
      const rules = (await deps.service.resetFormatRules()).rules;
      deps.setActiveFormatRules(rules);
      deps.setPendingFormatRules(null);
      saveStoredFormatRules(FORMAT_RULE_ACTIVE_KEY, rules);
      saveStoredFormatRules(FORMAT_RULE_PENDING_KEY, null);
      deps.setNotice("已恢复默认学校规范对照；不会改动原 Word 格式。");
      deps.setRuntimeStep("默认规范对照已恢复");
    } catch (appError) {
      deps.applyErrorRuntimeStep(appError, "恢复默认规范对照失败");
    } finally {
      deps.finishTask(taskTicket);
    }
  }

  return {
    handleConfirmFormatRules,
    handleResetFormatRules,
  };
}
