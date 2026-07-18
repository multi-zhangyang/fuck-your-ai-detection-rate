export function parseJsonErrorPayload(responseText: string): (Record<string, unknown> & { message?: string }) | null {
  try {
    const parsed = JSON.parse(responseText) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown> & { message?: string })
      : null;
  } catch {
    return null;
  }
}

export function isHtmlErrorPage(responseText: string): boolean {
  const trimmed = responseText.trim().toLowerCase();
  return trimmed.startsWith("<!doctype") || trimmed.startsWith("<html") || trimmed.includes("<title>") || trimmed.includes("<body");
}

export function getPlainHttpErrorText(responseText: string): string {
  const text = responseText.replace(/\s+/g, " ").trim();
  if (!text || isHtmlErrorPage(text)) {
    return "";
  }
  return text.length > 240 ? `${text.slice(0, 240)}...` : text;
}

export function formatHttpErrorMessage(
  status: number,
  responseText: string,
  errorPayload: (Record<string, unknown> & { message?: string }) | null,
): string {
  const payloadMessage = typeof errorPayload?.message === "string" ? errorPayload.message.trim() : "";
  if (payloadMessage) {
    return payloadMessage;
  }
  if (status === 405) {
    return "本地后端接口方法不匹配（HTTP 405）。请刷新页面；如果仍出现，请重启本地 Web 服务，确认前后端是同一版本。";
  }
  if (isHtmlErrorPage(responseText)) {
    return `本地后端返回了 HTML 错误页（HTTP ${status}）。请刷新页面；如果仍出现，请重启本地 Web 服务，确认前后端是同一版本。`;
  }
  return getPlainHttpErrorText(responseText) || `请求失败（HTTP ${status}）。`;
}

export function createHttpRequestError(response: Response, responseText: string): Error & {
  payload?: Record<string, unknown> | null;
  status?: number;
} {
  const errorPayload = parseJsonErrorPayload(responseText);
  const requestError = new Error(formatHttpErrorMessage(response.status, responseText, errorPayload)) as Error & {
    payload?: Record<string, unknown> | null;
    status?: number;
  };
  requestError.payload = errorPayload;
  requestError.status = response.status;
  return requestError;
}
