export function isRawHtmlErrorText(text: string): boolean {
  const lowered = text.toLowerCase();
  return lowered.includes("<!doctype html")
    || lowered.includes("<html")
    || lowered.includes("405 method not allowed")
    || lowered.includes("method not allowed</title>")
    || text.includes("本地后端接口方法不匹配（HTTP 405）")
    || text.includes("本地后端还没有加载提示词接口");
}

export function stringifyError(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : String(error ?? "");
  const lowered = rawMessage.toLowerCase();

  if (isRawHtmlErrorText(rawMessage)) {
    return lowered.includes("405") || lowered.includes("method not allowed")
      ? "本地后端接口方法不匹配（HTTP 405）。通常是前后端版本或请求方式不一致；刷新页面后再试，如果还出现就重启本地 Web 服务。"
      : "本地后端返回了 HTML 错误页。通常是前后端版本不一致或服务未正确接到 API；请刷新页面并重启本地 Web 服务。";
  }
  if (rawMessage.includes("This document already has a running task")) {
    return "当前文档已经有任务在运行。等这一轮结束后再继续，避免把状态冲乱。";
  }
  if (rawMessage.includes("Model configuration is incomplete")) {
    return "模型配置还没填完整。请补全接口地址、API Key 和模型名称。";
  }
  if (rawMessage.includes("Document release gate rejected uncertified materialization")) {
    return "内容发布门禁已阻止这次操作：当前改写的候选决策、内容完整性、学术可读性或哈希证据不一致。请保留原文或重新生成。";
  }
  if (rawMessage.includes("baseUrl is required before loading models")) {
    return "先填写接口地址，再去读取远程模型列表。";
  }
  if (rawMessage.includes("apiKey is required before loading models")) {
    return "先填写 API Key，再去读取远程模型列表。";
  }
  if (rawMessage.includes("connection refused") || rawMessage.includes("WinError 10061")) {
    return "接口拒绝连接。请检查 Base URL、代理配置，或者确认服务本身已经启动。";
  }
  if (lowered.includes("timed out") || lowered.includes("timeout")) {
    return "请求超时了。可以稍后重试，或适当调大单次超时和重试次数。";
  }
  if (rawMessage.includes("status 502")) {
    return "上游模型接口返回了 502。通常是服务不稳定，稍后重试即可，已完成的分块不会白跑。";
  }
  if (rawMessage.includes("status 503")) {
    return "上游模型接口暂时不可用（503）。建议稍后重试。";
  }
  if (rawMessage.includes("status 504")) {
    return "上游模型接口响应超时（504）。已完成的分块会保留，稍后再次执行会优先续跑。";
  }
  if (rawMessage.includes("status 429")) {
    return "上游模型接口触发了限流（429）。建议稍后重试，或减少并发使用。";
  }
  if (rawMessage.includes("interrupted by user") || rawMessage.includes("已请求中断")) {
    return "当前轮次已中断。已完成的分块会保留，再次点击“开始 / 继续”会从断点续跑。";
  }
  if (rawMessage.includes("Unknown run id")) {
    return "当前运行令牌已经失效。重新点击执行下一轮，系统会优先尝试断点续跑。";
  }
  if (rawMessage.includes("Progress channel disconnected")) {
    return "运行通道意外断开。重新点击执行下一轮即可，系统会优先续跑。";
  }
  return rawMessage;
}
