export function formatNotificationTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

export function formatDateTime(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN");
}

export function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size >= 10 || unitIndex === 0 ? Math.round(size) : size.toFixed(1)} ${units[unitIndex]}`;
}

export function redactLocalPath(value: string): string {
  return value
    .replace(/([A-Za-z]:\\Users\\)[^\\]+/g, "$1<user>")
    .replace(/(\/Users\/)[^/]+/g, "$1<user>")
    .replace(/(\/home\/)[^/]+/g, "$1<user>");
}

export function formatDocLabel(docId: string | null | undefined): string {
  if (!docId) {
    return "未载入文档";
  }
  const normalized = docId.replace(/\\/g, "/");
  const segments = normalized.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? docId;
}

export function formatFileScopeLabel(path: string | null | undefined): string {
  if (!path) {
    return "文件未生成";
  }
  const normalized = path.replace(/\\/g, "/");
  const filename = formatDocLabel(normalized);
  if (normalized.includes("/finish/web_exports/") || normalized.startsWith("finish/web_exports/")) {
    return `导出文件 · ${filename}`;
  }
  if (normalized.includes("/finish/intermediate/") || normalized.startsWith("finish/intermediate/")) {
    return `中间文件 · ${filename}`;
  }
  if (normalized.includes("/origin/") || normalized.startsWith("origin/")) {
    return `源文档 · ${filename}`;
  }
  return filename;
}
