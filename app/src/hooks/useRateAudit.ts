import { useCallback, useEffect, useRef, useState } from "react";

import type { AppService } from "@/lib/appService";
import { stringifyError } from "@/lib/errorText";
import { normalizeRateAuditReport } from "@/lib/rateAuditCompat";
import type { RateAuditReport } from "@/types/app";

export function useRateAudit({
  service,
  sourcePath,
  outputPath,
  compareRevision,
}: {
  service: AppService;
  sourcePath?: string | null;
  outputPath?: string | null;
  compareRevision?: string | null;
}) {
  const [value, setValue] = useState<RateAuditReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const normalizedSourcePath = String(sourcePath ?? "").trim();
    if (!normalizedSourcePath) {
      requestIdRef.current += 1;
      setValue(null);
      setLoading(false);
      setError("");
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    // Never keep an executable plan visible while a different source/output
    // identity (or a new compare revision) is being diagnosed.
    setValue(null);
    setLoading(true);
    setError("");
    try {
      const nextValue = await service.getRateAudit(
        normalizedSourcePath,
        String(outputPath ?? "").trim() || undefined,
      );
      if (requestIdRef.current !== requestId) return;
      setValue(normalizeRateAuditReport(nextValue));
    } catch (nextError) {
      if (requestIdRef.current !== requestId) return;
      setError(stringifyError(nextError) || "降检诊断暂时不可用。");
    } finally {
      if (requestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }, [compareRevision, outputPath, service, sourcePath]);

  useEffect(() => {
    void refresh();
    return () => {
      requestIdRef.current += 1;
    };
  }, [refresh]);

  return {
    value,
    loading,
    error,
    refresh,
  };
}
