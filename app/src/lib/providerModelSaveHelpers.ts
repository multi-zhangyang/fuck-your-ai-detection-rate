export function planModelConfigSaveSuccessFeedback(
  promptProfileLabel: string,
): { notice: string; runtimeStep: string } {
  return {
    notice: `模型配置已保存，当前模式为 ${promptProfileLabel}。`,
    runtimeStep: "模型配置已保存",
  };
}

export function planModelConfigSaveFailureRuntimeStep(): string {
  return "保存模型配置失败";
}

export function planModelConfigSaveLoadingRuntimeStep(testing: boolean): string {
  return testing ? "正在测试模型连接，测试通过后保存。" : "正在保存模型配置。";
}

export function planTestConnectionSuccessFeedback(result: {
  apiType?: string | null;
  endpoint?: string | null;
}): { notice: string; runtimeStep: string } {
  const detailParts = [
    "接口连通性测试成功。",
    result.apiType ? `接口类型：${result.apiType}` : "",
    result.endpoint ? `请求地址：${result.endpoint}` : "",
  ].filter(Boolean);
  return {
    notice: detailParts.join(" "),
    runtimeStep: "接口连通性测试成功",
  };
}
