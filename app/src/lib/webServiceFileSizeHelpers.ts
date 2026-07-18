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

export function readFileWithFallback(file: File): Promise<string> {
  if (file.name.toLowerCase().endsWith(".txt")) {
    return file.text();
  }
  throw new Error("当前文件类型不支持按纯文本读取。");
}

export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("读取文件失败。"));
        return;
      }
      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = () => reject(new Error("读取文件失败。"));
    reader.readAsDataURL(file);
  });
}
