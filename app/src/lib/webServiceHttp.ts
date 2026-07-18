import {
  createHttpRequestError,
} from "@/lib/webServiceHttpErrorHelpers";

export type RequestJsonInit = RequestInit & {
  timeoutMs?: number;
};

export {
  parseJsonErrorPayload,
  isHtmlErrorPage,
  getPlainHttpErrorText,
  formatHttpErrorMessage,
  createHttpRequestError,
} from "@/lib/webServiceHttpErrorHelpers";

const WEB_API_GLOBALS = globalThis as { __FYADR_WEB_API__?: string };
export const WEB_API_BASE = WEB_API_GLOBALS.__FYADR_WEB_API__ ?? import.meta.env.VITE_FYADR_API_BASE ?? "";

export async function fetchWithFriendlyError(input: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(`${WEB_API_BASE}${input}`, init);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      const reason = String((init?.signal as AbortSignal & { reason?: unknown } | undefined)?.reason ?? "");
      if (reason === "fyadr-user-cancel") {
        throw new Error("操作已停止。");
      }
      throw new Error("请求超时：本次操作已自动停止，请换用响应更快的模型或稍后重试。");
    }
    throw new Error("无法连接到本地 Web 服务，请确认后端已启动并监听 http://127.0.0.1:8765。");
  }
}

export async function requestJson<T>(input: string, init?: RequestJsonInit): Promise<T> {
  const { timeoutMs, signal, ...requestInit } = init ?? {};
  const controller = timeoutMs || signal ? new AbortController() : null;
  const abortFromExternalSignal = () => controller?.abort((signal as AbortSignal & { reason?: unknown }).reason ?? "fyadr-user-cancel");
  if (signal?.aborted) {
    abortFromExternalSignal();
  } else if (signal && controller) {
    signal.addEventListener("abort", abortFromExternalSignal, { once: true });
  }
  const timeoutId = timeoutMs && controller ? globalThis.setTimeout(() => controller.abort("fyadr-timeout"), timeoutMs) : null;
  try {
    const response = await fetchWithFriendlyError(input, {
      ...requestInit,
      signal: controller?.signal,
      headers: {
        "Content-Type": "application/json",
        ...(requestInit.headers ?? {}),
      },
    });
    const responseText = await response.text();
    if (!response.ok) {
      throw createHttpRequestError(response, responseText);
    }
    return JSON.parse(responseText) as T;
  } finally {
    if (timeoutId) {
      globalThis.clearTimeout(timeoutId);
    }
    if (signal && controller) {
      signal.removeEventListener("abort", abortFromExternalSignal);
    }
  }
}
