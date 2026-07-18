import type { ExportIssueSample } from "@/types/app";

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function decodeHeaderValue(value: string | null): string {
  if (!value) {
    return "";
  }
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function decodeHeaderJson(value: string | null): unknown {
  const decoded = decodeHeaderValue(value);
  if (!decoded) {
    return null;
  }
  try {
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

export function parseExportIssueSamples(value: string | null): ExportIssueSample[] {
  const decoded = decodeHeaderJson(value);
  if (!Array.isArray(decoded)) {
    return [];
  }
  return decoded
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    .map((item) => ({
      code: typeof item.code === "string" ? item.code : undefined,
      severity: typeof item.severity === "string" ? item.severity : undefined,
      message: typeof item.message === "string" ? item.message : "检查项",
      location: typeof item.location === "string" ? item.location : undefined,
      sample: typeof item.sample === "string" ? item.sample : undefined,
    }))
    .slice(0, 5);
}

export function extractDownloadFilename(contentDisposition: string | null, fallback: string): string {
  if (!contentDisposition) {
    return fallback;
  }

  const utf8Match = contentDisposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeHeaderValue(utf8Match[1]);
  }

  const plainMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
  if (plainMatch?.[1]) {
    return decodeHeaderValue(plainMatch[1]);
  }

  return fallback;
}
