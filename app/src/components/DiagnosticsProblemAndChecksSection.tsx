import { AlertCircle, AlertTriangle, CheckCircle2 } from "lucide-react";

import { DiagnosticCheckCard } from "@/components/DiagnosticsPanels";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Progress } from "@/components/ui/progress";
import { getDiagnosticBadgeVariant } from "@/lib/diagnosticsHelpers";
import { cn } from "@/lib/utils";
import type { EnvironmentDiagnostics } from "@/types/app";

export function DiagnosticsProblemAndChecksSection({
  problemChecks,
  checks,
  healthPercent,
}: {
  problemChecks: NonNullable<EnvironmentDiagnostics["checks"]>;
  checks: NonNullable<EnvironmentDiagnostics["checks"]>;
  healthPercent: number;
}) {
  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
      <Card>
        <CardHeader className="px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">需要处理</CardTitle>
            <Badge variant={problemChecks.length ? "warning" : "success"}>{problemChecks.length ? `${problemChecks.length} 项` : "干净"}</Badge>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          {problemChecks.length ? (
            <div className="grid gap-2">
              {problemChecks.map((item) => (
                <Alert key={item.key} variant={item.level === "error" ? "destructive" : undefined} className={cn("py-3", item.level === "warning" && "border-primary/25 bg-muted/60")}>
                  {item.level === "error" ? <AlertCircle /> : <AlertTriangle />}
                  <AlertTitle className="flex flex-wrap items-center justify-between gap-2">
                    <span>{item.label}</span>
                    <Badge variant={getDiagnosticBadgeVariant(item.level)}>{item.level === "error" ? "错误" : "提示"}</Badge>
                  </AlertTitle>
                  <AlertDescription>{item.message}</AlertDescription>
                </Alert>
              ))}
            </div>
          ) : (
            <Empty className="min-h-[8rem] border">
              <EmptyHeader>
                <EmptyMedia variant="icon"><CheckCircle2 /></EmptyMedia>
                <EmptyTitle>没有待处理项</EmptyTitle>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">自检明细</CardTitle>
            <Badge variant="outline">{healthPercent}%</Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 px-4 pb-4 pt-0">
          <Progress value={healthPercent} className="h-2" />
          <div className="grid gap-2 sm:grid-cols-2">
            {checks.map((item) => (
              <DiagnosticCheckCard key={item.key} item={item} />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
