import { Fragment } from "react";

import { DiagnosticRow } from "@/components/DiagnosticsPanels";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatBytes } from "@/lib/formatters";
import { MAX_REWRITE_CONCURRENCY } from "@/lib/modelRoute";
import type { EnvironmentDiagnostics, EnvironmentPathSummary } from "@/types/app";

function getPathState(item: EnvironmentPathSummary): { ready: boolean; label: string } {
  if (item.key === "workspace") {
    return {
      ready: item.exists,
      label: item.exists ? item.writable ? "可读写" : "只读（正常）" : "不存在",
    };
  }
  if (item.key === "config" && !item.exists && item.writable) {
    return { ready: true, label: "可创建" };
  }
  return {
    ready: item.exists && item.writable,
    label: item.exists ? item.writable ? "可写" : "不可写" : "不存在",
  };
}

export function DiagnosticsWorkspaceAndConfigSection({
  value,
}: {
  value: EnvironmentDiagnostics;
}) {
  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_390px]">
      <Card>
        <CardHeader className="px-4 py-3">
          <CardTitle className="text-base">工作目录</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          <div className="overflow-hidden rounded-lg border bg-card">
            {value.paths.map((item, index) => {
              const pathState = getPathState(item);
              return (
                <Fragment key={item.key}>
                  {index ? <Separator /> : null}
                  <div className="grid gap-2 p-3 text-xs md:grid-cols-[150px_minmax(0,1fr)_140px] md:items-center">
                    <div>
                      <div className="font-semibold text-foreground">{item.label}</div>
                      <Badge className="mt-1" variant={pathState.ready ? "success" : "danger"}>
                        {pathState.label}
                      </Badge>
                    </div>
                    <div className="min-w-0 truncate text-muted-foreground">{item.path}</div>
                    <div className="font-semibold text-foreground md:text-right">{item.fileCount} 文件 · {formatBytes(item.sizeBytes)}</div>
                  </div>
                </Fragment>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3">
        <Card>
          <CardHeader className="px-4 py-3">
            <CardTitle className="text-base">模型配置</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 px-4 pb-4 pt-0 text-xs">
            <DiagnosticRow label="运行模式" value="远程模型" />
            <DiagnosticRow label="默认模型" value={value.config.model || "未填写"} />
            <DiagnosticRow label="接口" value={value.config.hasBaseUrl ? "已填写" : "缺少 Base URL"} />
            <DiagnosticRow label="密钥" value={value.config.hasApiKey ? "已填写" : "缺少 API Key"} />
            <DiagnosticRow label="服务商仓库" value={`保存 ${value.config.providerCount} · 启用 ${value.config.enabledProviderCount}`} />
            <DiagnosticRow label="轮次专属配置" value={`${value.config.customRoundCount} 轮`} />
            <DiagnosticRow label="轮内并发" value={`${value.config.rewriteConcurrency ?? 2}/${value.config.maxRewriteConcurrency ?? MAX_REWRITE_CONCURRENCY}`} />
            <DiagnosticRow label="超时/重试" value={`${value.config.effectiveRewriteTimeoutSeconds ?? value.config.requestTimeoutSeconds ?? "-"}s / ${value.config.maxRetries ?? "-"} 次`} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="px-4 py-3">
            <CardTitle className="text-base">运行时</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 px-4 pb-4 pt-0 text-xs">
            <DiagnosticRow label="Python" value={value.runtime.pythonVersion || "未返回"} />
            <DiagnosticRow label="解释器" value={value.runtime.pythonExecutable || "未返回"} />
            <DiagnosticRow label="平台" value={value.runtime.platform || "未返回"} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
