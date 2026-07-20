import { formatBytes } from "@/lib/formatters";

const MAX_UPLOAD_BYTES = 40 * 1024 * 1024;

export { formatBytes };

export function getUtf8Size(value: string): number {
  try {
    return new TextEncoder().encode(value).length;
  } catch {
    return value.length;
  }
}

export function assertFileSize(file: File, label: string): void {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`${label}过大（${formatBytes(file.size)}），当前上限为 ${formatBytes(MAX_UPLOAD_BYTES)}。`);
  }
}
