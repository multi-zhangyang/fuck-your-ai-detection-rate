export function resolveBackendConcurrencyGuardError(
  requestedConcurrency: number,
  backendMaxConcurrency: number,
  probeErrorMessage = "",
): string | null {
  if (backendMaxConcurrency > 0 && requestedConcurrency > backendMaxConcurrency) {
    return `当前后端最大只支持 ${backendMaxConcurrency} 并发，已选择 ${requestedConcurrency}。请重启后端后再启动。`;
  }
  if (!backendMaxConcurrency && requestedConcurrency > 8) {
    if (probeErrorMessage.includes("后端") || probeErrorMessage.includes("并发")) {
      return probeErrorMessage;
    }
    if (probeErrorMessage) {
      return `无法确认后端是否支持 ${requestedConcurrency} 并发，请重启后端后再启动。`;
    }
    return `当前后端没有返回并发上限，可能仍是旧实例。已选择 ${requestedConcurrency}，请重启后端后再启动。`;
  }
  return null;
}

export function planBackendConcurrencyReadyError(input: {
  requestedConcurrency: number;
  backendMaxConcurrency: number;
  fetchErrorMessage?: string;
}): string | null {
  if (input.fetchErrorMessage) {
    return resolveBackendConcurrencyGuardError(
      input.requestedConcurrency,
      0,
      input.fetchErrorMessage,
    );
  }
  return resolveBackendConcurrencyGuardError(
    input.requestedConcurrency,
    input.backendMaxConcurrency,
  );
}
