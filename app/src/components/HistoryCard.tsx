import { useState } from "react";
import { AlertTriangle, Clock3, Database, Download, FolderClock, RotateCcw, Search, Trash2, Wrench } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  DEFAULT_PROMPT_SEQUENCE,
  formatPromptSequence as formatPromptSequenceFromRegistry,
  getPromptFlowSequence,
  getPromptProfileLabel,
  isPromptSequenceCustomizable,
  normalizePromptSequence,
} from "@/lib/promptRegistry";
import { cn } from "@/lib/utils";
import type {
  DeleteHistoryOptions,
  DocumentHistory,
  HistoryArtifactGovernanceMode,
  HistoryArtifactQueryItem,
  HistoryArtifactQueryResponse,
  HistoryArtifactStats,
  HistoryDeleteImpact,
  HistoryDocumentSummary,
  HistoryOrphanScanResult,
  HistoryRound,
  ModelConfig,
  PromptId,
  PromptOption,
  PromptWorkflow,
} from "@/types/app";

type Props = {
  currentDocId: string | null;
  currentHistory: DocumentHistory | null;
  items: HistoryDocumentSummary[];
  promptProfile: ModelConfig["promptProfile"];
  promptSequence: PromptId[];
  promptOptions: PromptOption[];
  promptWorkflows?: PromptWorkflow[];
  orphanScan: HistoryOrphanScanResult | null;
  artifactQuery: HistoryArtifactQueryResponse | null;
  artifactMode: HistoryArtifactGovernanceMode;
  artifactLoading: boolean;
  open: boolean;
  busy: boolean;
  onToggle: () => void;
  onSelect: (item: HistoryDocumentSummary) => void;
  onPreviewDelete: (docId: string, options?: DeleteHistoryOptions) => Promise<HistoryDeleteImpact | null>;
  onDelete: (docId: string, options?: DeleteHistoryOptions) => void;
  onArtifactModeChange: (mode: HistoryArtifactGovernanceMode) => void;
  onRefreshArtifacts: () => void;
  onRepairHistoryDatabase: () => void;
  onScanOrphans: () => void;
  onDeleteOrphans: () => void;
  onDownload: (item: HistoryRound, format: "txt" | "docx") => void;
};

type HistoryImpactPreviewState = {
  key: string;
  impact: HistoryDeleteImpact;
};

function formatTimestamp(value: string): string {
  if (!value) {
    return "时间未知";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDocName(item: HistoryDocumentSummary): string {
  const rawValue = item.originPath || item.sourcePath || item.docId;
  const parts = rawValue.split(/[\\/]/);
  return parts[parts.length - 1] || rawValue;
}

function formatPathScope(value: string | undefined): string {
  const rawValue = String(value || "").trim();
  if (!rawValue) {
    return "来源未知";
  }
  const normalized = rawValue.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  const filename = parts[parts.length - 1] || normalized;
  if (normalized.startsWith("origin/")) {
    return `项目源文档 · ${filename}`;
  }
  if (normalized.startsWith("finish/")) {
    return `项目生成物 · ${filename}`;
  }
  if (/^[a-zA-Z]:\//.test(normalized) || normalized.startsWith("//")) {
    return `本地文件 · ${filename}`;
  }
  return `文档索引 · ${filename}`;
}

function formatBytes(value?: number): string {
  const bytes = Number(value ?? 0);
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function getMaxRounds(promptProfile: ModelConfig["promptProfile"], promptSequence?: PromptId[], promptOptions?: PromptOption[], promptWorkflows?: PromptWorkflow[]): number {
  return getPlannedRounds(promptProfile, promptSequence, promptOptions, promptWorkflows);
}

function getPlannedRounds(promptProfile: ModelConfig["promptProfile"], promptSequence?: PromptId[], promptOptions?: PromptOption[], promptWorkflows?: PromptWorkflow[]): number {
  return getPromptFlowSequence(promptProfile, promptSequence, promptOptions, promptWorkflows).length;
}

function getRoundStateText(completedRounds: number[], promptProfile: ModelConfig["promptProfile"], promptSequence: PromptId[], promptOptions?: PromptOption[], promptWorkflows?: PromptWorkflow[]): string {
  const plannedRounds = getPlannedRounds(promptProfile, promptSequence, promptOptions, promptWorkflows);
  const plannedDone = completedRounds.filter((round) => round <= plannedRounds).length;
  if (plannedDone < plannedRounds) {
    return `${plannedDone}/${plannedRounds} 轮`;
  }
  return "可导出";
}

function getProfileLabel(promptProfile: ModelConfig["promptProfile"], promptWorkflows?: PromptWorkflow[]): string {
  return getPromptProfileLabel(promptProfile, promptWorkflows);
}

function formatPromptSequence(value: PromptId[] | undefined, promptOptions?: PromptOption[], promptProfile?: ModelConfig["promptProfile"], promptWorkflows?: PromptWorkflow[]): string {
  return formatPromptSequenceFromRegistry(value ?? DEFAULT_PROMPT_SEQUENCE, promptOptions, promptProfile, promptWorkflows);
}

function promptSequencesEqual(
  left: PromptId[] | undefined,
  right: PromptId[] | undefined,
  promptOptions?: PromptOption[],
  promptProfile?: ModelConfig["promptProfile"],
  promptWorkflows?: PromptWorkflow[],
): boolean {
  const a = normalizePromptSequence(left, promptOptions, promptProfile, promptWorkflows);
  const b = normalizePromptSequence(right, promptOptions, promptProfile, promptWorkflows);
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

function getRoundsForProfile(rounds: HistoryRound[], promptProfile: ModelConfig["promptProfile"], promptSequence: PromptId[], promptOptions?: PromptOption[], promptWorkflows?: PromptWorkflow[]): HistoryRound[] {
  return rounds.filter((round) => {
    if ((round.promptProfile || "cn") !== promptProfile) {
      return false;
    }
    if (!isPromptSequenceCustomizable(promptProfile, promptWorkflows)) {
      return true;
    }
    return promptSequencesEqual(round.promptSequence, promptSequence, promptOptions, promptProfile, promptWorkflows);
  });
}

function getCompletedRounds(rounds: HistoryRound[], promptProfile: ModelConfig["promptProfile"], promptSequence: PromptId[], promptOptions?: PromptOption[], promptWorkflows?: PromptWorkflow[]): number[] {
  const maxRounds = getMaxRounds(promptProfile, promptSequence, promptOptions, promptWorkflows);
  return Array.from(new Set(rounds.map((item) => item.round).filter((round) => round >= 1 && round <= maxRounds))).sort(
    (left, right) => left - right,
  );
}

function getNextRoundText(completedRounds: number[], promptProfile: ModelConfig["promptProfile"], promptSequence: PromptId[], promptOptions?: PromptOption[], promptWorkflows?: PromptWorkflow[]): string {
  const maxRounds = getMaxRounds(promptProfile, promptSequence, promptOptions, promptWorkflows);
  for (let round = 1; round <= maxRounds; round += 1) {
    if (!completedRounds.includes(round)) {
      return `第 ${round} 轮`;
    }
  }
  return "可导出";
}

function getPromptOptions(promptProfile: ModelConfig["promptProfile"], promptSequence: PromptId[], promptOptions?: PromptOption[], promptWorkflows?: PromptWorkflow[]): Pick<DeleteHistoryOptions, "promptProfile" | "promptSequence"> {
  return {
    promptProfile,
    promptSequence: isPromptSequenceCustomizable(promptProfile, promptWorkflows) ? normalizePromptSequence(promptSequence, promptOptions, promptProfile, promptWorkflows) : undefined,
  };
}

function makeDeleteActionKey(docId: string, options?: DeleteHistoryOptions): string {
  return JSON.stringify({
    docId,
    mode: options?.mode ?? "records_and_artifacts",
    fromRound: options?.fromRound ?? null,
    promptProfile: options?.promptProfile ?? null,
    promptSequence: options?.promptSequence ?? null,
  });
}

function getDeleteModeLabel(mode: DeleteHistoryOptions["mode"]): string {
  if (mode === "records_only") return "只移除记录";
  if (mode === "exports_only") return "只清理项目导出";
  if (mode === "records_artifacts_and_source") return "彻底清理项目副本";
  return "删除生成链路";
}

function getDeleteModeScope(fromRound?: number): string {
  return fromRound ? `第 ${fromRound} 轮起` : "整篇文档";
}

function getSafeArtifactStats(stats?: HistoryArtifactStats): HistoryArtifactStats {
  return stats ?? {
    total: 0,
    existing: 0,
    intermediate: 0,
    exports: 0,
    reports: 0,
    sources: 0,
    external: 0,
    missing: 0,
    bytes: 0,
  };
}

function getOrphanKindLabel(kind: string): string {
  if (kind === "sources") return "源文档副本";
  if (kind === "exports") return "项目导出";
  if (kind === "reports") return "报告文件";
  if (kind === "intermediate") return "中间产物";
  return "其他";
}

function getArtifactQueryStateLabel(query: HistoryArtifactQueryResponse | null, loading: boolean): string {
  if (loading) return "读取中";
  if (!query) return "未读取";
  if (!query.ok) return "需检查";
  return query.total ? `${query.total} 条` : "无异常";
}

function HistoryArtifactRow({ item }: { item: HistoryArtifactQueryItem }) {
  return (
    <div className="grid min-w-0 gap-2 border-b px-3 py-2 text-xs last:border-b-0 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div className="min-w-0">
        <div className="truncate font-semibold text-foreground">{item.path}</div>
        <div className="mt-0.5 flex flex-wrap gap-2 text-muted-foreground">
          <span>{getOrphanKindLabel(item.kind)}</span>
          <span>{item.documentCount} 篇文档</span>
          <span>{item.roundCount} 个轮次</span>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <Badge variant={item.exists ? "outline" : "warning"}>{item.exists ? "仍存在" : "已缺失"}</Badge>
        <Badge variant="outline">{formatBytes(item.bytes)}</Badge>
      </div>
    </div>
  );
}

function HistoryArtifactGovernancePanel({
  query,
  mode,
  loading,
  previewImpact,
  previewLoading,
  currentDocId,
  busy,
  onModeChange,
  onRefresh,
  onRepairIndex,
  onPreviewCurrentCleanup,
}: {
  query: HistoryArtifactQueryResponse | null;
  mode: HistoryArtifactGovernanceMode;
  loading: boolean;
  previewImpact: HistoryDeleteImpact | null;
  previewLoading: boolean;
  currentDocId: string | null;
  busy: boolean;
  onModeChange: (mode: HistoryArtifactGovernanceMode) => void;
  onRefresh: () => void;
  onRepairIndex: () => void;
  onPreviewCurrentCleanup: () => void;
}) {
  const stats = getSafeArtifactStats(query?.stats);
  const previewItems = query?.items.slice(0, 6) ?? [];
  const shouldSuggestRepair = mode === "missing" && (stats.missing > 0 || query?.ok === false);
  const shouldSuggestPreview = (mode === "current" || mode === "large") && Boolean(currentDocId);
  return (
    <section data-ui-section="history-asset-governance" className="rounded-lg border border-border bg-card p-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">资产治理</Badge>
            <Badge variant={query?.ok === false ? "warning" : "outline"}>{getArtifactQueryStateLabel(query, loading)}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={busy || loading}>
            <Search data-icon="inline-start" />
            {loading ? "读取中" : "刷新"}
          </Button>
          {shouldSuggestRepair ? (
            <Button variant="outline" size="sm" onClick={onRepairIndex} disabled={busy || loading}>
              <Wrench data-icon="inline-start" />
              修复索引
            </Button>
          ) : null}
          {shouldSuggestPreview ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onPreviewCurrentCleanup}
              disabled={busy || loading || previewLoading || !stats.existing}
            >
              <Search data-icon="inline-start" />
              {previewLoading ? "预览中" : "先看影响"}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Badge variant="outline">索引 {stats.total}</Badge>
        <Badge variant="outline">存在 {stats.existing}</Badge>
        <Badge variant={stats.missing ? "warning" : "outline"}>缺失 {stats.missing}</Badge>
        <Badge variant="outline">占用 {formatBytes(stats.bytes)}</Badge>
        <Badge variant="outline">外部 {stats.external}</Badge>
      </div>

      <ToggleGroup
        type="single"
        value={mode}
        onValueChange={(value) => {
          if (value === "missing" || value === "current" || value === "large") {
            onModeChange(value);
          }
        }}
        className="mt-3 grid gap-2 md:grid-cols-3"
      >
        <ToggleGroupItem value="missing" variant="outline" className="h-10 justify-center px-3">
          <span className="text-sm font-semibold">缺失资产</span>
        </ToggleGroupItem>
        <ToggleGroupItem value="current" variant="outline" disabled={!currentDocId} className="h-10 justify-center px-3">
          <span className="text-sm font-semibold">当前文档</span>
        </ToggleGroupItem>
        <ToggleGroupItem value="large" variant="outline" className="h-10 justify-center px-3">
          <span className="text-sm font-semibold">大文件</span>
        </ToggleGroupItem>
      </ToggleGroup>

      {query?.ok === false ? (
        <Alert className="mt-3" variant="destructive">
          <AlertTriangle />
          <AlertTitle>索引读取失败</AlertTitle>
          <AlertDescription>{query.error || "SQLite 历史索引暂时不可用，请先刷新或运行历史库修复。"}</AlertDescription>
        </Alert>
      ) : previewItems.length ? (
        <div className="mt-3 overflow-hidden rounded-lg border bg-background">
          {previewItems.map((item) => <HistoryArtifactRow key={`${item.path}-${item.kind}`} item={item} />)}
          {query?.hasMore ? <div className="px-3 py-2 text-xs font-semibold text-muted-foreground">还有更多</div> : null}
        </div>
      ) : (
        <Empty className="mt-3 min-h-[6rem] border bg-background">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Database />
            </EmptyMedia>
            <EmptyTitle>{loading ? "读取中" : "无资产"}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      )}
      {previewImpact ? <div className="mt-3"><AssetImpactPanel impact={previewImpact} /></div> : null}
    </section>
  );
}

function OrphanGovernancePanel({
  scan,
  busy,
  onScan,
  onDelete,
}: {
  scan: HistoryOrphanScanResult | null;
  busy: boolean;
  onScan: () => void;
  onDelete: () => void;
}) {
  const stats = scan?.orphanStats ?? getSafeArtifactStats();
  const previewFiles = scan?.orphanFiles.slice(0, 6) ?? [];
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">未归属产物</Badge>
            {scan ? <Badge variant={stats.existing ? "secondary" : "outline"}>{stats.existing} 个</Badge> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onScan} disabled={busy}>
            <Search data-icon="inline-start" />
            扫描
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onDelete}
            disabled={busy || !scan || !stats.existing}
          >
            <Trash2 data-icon="inline-start" />
            清理未归属文件
          </Button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Badge variant={stats.existing ? "secondary" : "outline"}>可清理 {stats.existing}</Badge>
        <Badge variant="outline">占用 {formatBytes(stats.bytes)}</Badge>
        <Badge variant="outline">源副本 {scan?.orphanKindStats.sources.files ?? 0}</Badge>
        <Badge variant="outline">导出 {scan?.orphanKindStats.exports.files ?? 0}</Badge>
        <Badge variant="outline">报告 {scan?.orphanKindStats.reports.files ?? 0}</Badge>
      </div>

      {scan ? (
        previewFiles.length ? (
          <div className="mt-3 overflow-hidden rounded-lg border bg-background">
            {previewFiles.map((file) => (
              <div key={file.relativePath} className="grid min-w-0 gap-2 border-b px-3 py-2 text-xs last:border-b-0 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-foreground">{file.relativePath}</div>
                  <div className="mt-0.5 text-muted-foreground">{getOrphanKindLabel(file.kind)} · {formatBytes(file.bytes)}</div>
                </div>
                <Badge variant="outline">可清理</Badge>
              </div>
            ))}
            {scan.hasMore ? <div className="px-3 py-2 text-xs font-semibold text-muted-foreground">还有更多</div> : null}
          </div>
        ) : (
          <Empty className="mt-3 min-h-[6rem] border bg-background">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Trash2 />
              </EmptyMedia>
              <EmptyTitle>未发现未归属文件</EmptyTitle>
            </EmptyHeader>
          </Empty>
        )
      ) : (
        <Empty className="mt-3 min-h-[6rem] border bg-background">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Search />
            </EmptyMedia>
            <EmptyTitle>未扫描</EmptyTitle>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
}

function mergeArtifactStats(items: Array<HistoryArtifactStats | undefined>): HistoryArtifactStats {
  return items.reduce<HistoryArtifactStats>((total, item) => ({
    total: total.total + (item?.total ?? 0),
    existing: total.existing + (item?.existing ?? 0),
    intermediate: total.intermediate + (item?.intermediate ?? 0),
    exports: total.exports + (item?.exports ?? 0),
    reports: total.reports + (item?.reports ?? 0),
    sources: (total.sources ?? 0) + (item?.sources ?? 0),
    external: total.external + (item?.external ?? 0),
    missing: total.missing + (item?.missing ?? 0),
    bytes: total.bytes + (item?.bytes ?? 0),
  }), {
    total: 0,
    existing: 0,
    intermediate: 0,
    exports: 0,
    reports: 0,
    sources: 0,
    external: 0,
    missing: 0,
    bytes: 0,
  });
}

function getLatestRound(rounds: HistoryRound[]): HistoryRound | null {
  if (!rounds.length) {
    return null;
  }
  return [...rounds].sort((left, right) => {
    const leftTime = new Date(left.timestamp || "").getTime();
    const rightTime = new Date(right.timestamp || "").getTime();
    const normalizedLeft = Number.isFinite(leftTime) ? leftTime : 0;
    const normalizedRight = Number.isFinite(rightTime) ? rightTime : 0;
    return normalizedRight - normalizedLeft;
  })[0] ?? null;
}

function hasExportableOutput(item: HistoryDocumentSummary, rounds: HistoryRound[]): boolean {
  return Boolean(item.latestOutputPath || rounds.some((round) => round.outputPath));
}

function getExportStateText(item: HistoryDocumentSummary, rounds: HistoryRound[]): string {
  if (!hasExportableOutput(item, rounds)) {
    return "暂无输出";
  }
  const missingCount = getSafeArtifactStats(item.artifactStats).missing
    + rounds.reduce((total, round) => total + getSafeArtifactStats(round.artifactStats).missing, 0);
  return missingCount ? "需检查" : "可导出";
}

function getCleanupStateText(stats?: HistoryArtifactStats): string {
  const safeStats = getSafeArtifactStats(stats);
  if (!safeStats.existing) {
    return "很干净";
  }
  return formatBytes(safeStats.bytes);
}

function getMaintenanceStateLabel(input: {
  missingDocumentCount: number;
  orphanCount: number;
  query: HistoryArtifactQueryResponse | null;
  loading: boolean;
}): string {
  if (input.loading) {
    return "读取中";
  }
  if (input.query?.ok === false) {
    return "需修复索引";
  }
  if (input.missingDocumentCount) {
    return `${input.missingDocumentCount} 篇需检查`;
  }
  if (input.orphanCount) {
    return `${input.orphanCount} 个可清理`;
  }
  return "已整理";
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/40 px-3 py-2">
      <div className="text-[10px] font-semibold text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}

function AssetImpactPanel({ impact }: { impact: HistoryDeleteImpact }) {
  const stats = impact.fileStats;
  const previewFiles = impact.files.filter((file) => file.exists).slice(0, 8);
  const sourceState = impact.willDeleteSource ? "含源副本" : impact.sourceOwnedByProject ? "保留源副本" : "外部源文件";
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">删除影响预览</Badge>
            <Badge variant="outline">{getDeleteModeLabel(impact.mode)}</Badge>
            {impact.fromRound ? <Badge variant="outline">从第 {impact.fromRound} 轮开始</Badge> : null}
          </div>
        </div>
        <Badge variant={stats.existing ? "warning" : "success"}>
          将删除 {stats.existing} 个文件 · {formatBytes(stats.bytes)}
        </Badge>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Badge variant="outline">源副本 {stats.sources ?? 0}</Badge>
        <Badge variant="outline">中间 {stats.intermediate}</Badge>
        <Badge variant="outline">导出 {stats.exports}</Badge>
        <Badge variant="outline">报告 {stats.reports}</Badge>
        <Badge variant="outline">{sourceState}</Badge>
      </div>

      {impact.affectedRounds.length ? (
        <div className="mt-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs leading-5 text-foreground">
          影响轮次：{impact.affectedRounds.join(", ")}
        </div>
      ) : null}

      {previewFiles.length ? (
        <div className="mt-3 overflow-hidden rounded-lg border bg-background">
          {previewFiles.map((file) => (
            <div key={`${file.relativePath}-${file.kind}`} className="grid min-w-0 gap-2 border-b px-3 py-2 text-xs last:border-b-0 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
              <div className="min-w-0">
                <div className="truncate font-semibold text-foreground">{file.relativePath}</div>
                <div className="mt-0.5 text-muted-foreground">{getOrphanKindLabel(file.kind)} · {formatBytes(file.bytes)}</div>
              </div>
              <Badge variant="outline">将删除</Badge>
            </div>
          ))}
          {impact.hasMoreFiles ? <div className="px-3 py-2 text-xs font-semibold text-muted-foreground">还有更多</div> : null}
        </div>
      ) : (
        <Empty className="mt-3 min-h-[6rem] border bg-background">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Trash2 />
            </EmptyMedia>
            <EmptyTitle>无项目文件删除</EmptyTitle>
          </EmptyHeader>
        </Empty>
      )}

      {impact.warnings.length ? (
        <div className="mt-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs leading-5">
          {impact.warnings.map((warning) => <div key={warning}>提醒：{warning}</div>)}
        </div>
      ) : null}
    </div>
  );
}

function HistoryDeleteAction({
  title,
  options,
  docId,
  busy,
  loading,
  destructive = false,
  onPreview,
  onDelete,
}: {
  title: string;
  options: DeleteHistoryOptions;
  docId: string;
  busy: boolean;
  loading: boolean;
  destructive?: boolean;
  onPreview: (docId: string, options: DeleteHistoryOptions) => void;
  onDelete: (docId: string, options: DeleteHistoryOptions) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className={destructive ? "text-sm font-semibold text-destructive" : "text-sm font-semibold text-foreground"}>{title}</div>
      <div className="mt-1 truncate text-xs text-muted-foreground">{getDeleteModeScope(options.fromRound)}</div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => onPreview(docId, options)} disabled={busy || loading}>
          <Search data-icon="inline-start" />
          {loading ? "预览中" : "先看影响"}
        </Button>
        <Button type="button" variant={destructive ? "outlineDanger" : "outline"} size="sm" onClick={() => onDelete(docId, options)} disabled={busy}>
          {destructive ? <Trash2 data-icon="inline-start" /> : null}
          执行
        </Button>
      </div>
    </div>
  );
}

export function HistoryCard({
  currentDocId,
  currentHistory,
  items,
  promptProfile,
  promptSequence,
  promptOptions,
  promptWorkflows,
  orphanScan,
  artifactQuery,
  artifactMode,
  artifactLoading,
  open,
  busy,
  onToggle,
  onSelect,
  onPreviewDelete,
  onDelete,
  onArtifactModeChange,
  onRefreshArtifacts,
  onRepairHistoryDatabase,
  onScanOrphans,
  onDeleteOrphans,
  onDownload,
}: Props) {
  const [impactPreview, setImpactPreview] = useState<HistoryImpactPreviewState | null>(null);
  const [impactLoadingKey, setImpactLoadingKey] = useState("");
  const [maintenanceOpen, setMaintenanceOpen] = useState(false);
  const [cleanupDocId, setCleanupDocId] = useState<string | null>(null);
  const maxRounds = getMaxRounds(promptProfile, promptSequence, promptOptions, promptWorkflows);
  const totalStats = mergeArtifactStats(items.map((item) => item.artifactStats));
  const continuationCount = items.filter((item) => {
    const completedRounds = getCompletedRounds(getRoundsForProfile(item.rounds, promptProfile, promptSequence, promptOptions, promptWorkflows), promptProfile, promptSequence, promptOptions, promptWorkflows);
    return completedRounds.length < maxRounds;
  }).length;
  const exportableCount = items.filter((item) => hasExportableOutput(item, getRoundsForProfile(item.rounds, promptProfile, promptSequence, promptOptions, promptWorkflows))).length;
  const missingDocumentCount = items.filter((item) => getSafeArtifactStats(item.artifactStats).missing > 0).length;
  const maintenanceStateLabel = getMaintenanceStateLabel({
    missingDocumentCount,
    orphanCount: orphanScan?.orphanStats.existing ?? 0,
    query: artifactQuery,
    loading: artifactLoading,
  });
  const currentCleanupOptions: DeleteHistoryOptions = { mode: "records_and_artifacts" };
  const currentCleanupKey = currentDocId ? makeDeleteActionKey(currentDocId, currentCleanupOptions) : "";
  const governanceImpactPreview = impactPreview?.key === currentCleanupKey ? impactPreview.impact : null;
  const handlePreviewDelete = async (docId: string, options: DeleteHistoryOptions) => {
    const key = makeDeleteActionKey(docId, options);
    setImpactLoadingKey(key);
    try {
      const impact = await onPreviewDelete(docId, options);
      if (impact) {
        setImpactPreview({ key, impact });
      }
    } finally {
      setImpactLoadingKey("");
    }
  };

  return (
    <Card className="min-h-full overflow-visible">
      <CardHeader className="flex flex-col gap-3 pb-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">历史记录</Badge>
              <Badge variant="outline">{getProfileLabel(promptProfile, promptWorkflows)}</Badge>
            </div>
            <CardTitle className="text-xl">继续处理与导出</CardTitle>
          </div>
          <Button variant="outline" size="sm" onClick={onToggle} disabled={busy}>
            <FolderClock data-icon="inline-start" />
            {open ? "收起" : `展开（${items.length}）`}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div data-ui-section="history-user-summary" className="grid gap-3 lg:grid-cols-3">
          <StatPill label="可继续" value={`${continuationCount} 篇`} />
          <StatPill label="可导出" value={`${exportableCount} 篇`} />
          <StatPill label="可释放" value={formatBytes(totalStats.bytes)} />
        </div>
        <section data-ui-section="history-advanced-maintenance" className="rounded-lg border border-border bg-muted/20 p-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">高级维护</Badge>
                <Badge variant={artifactQuery?.ok === false || missingDocumentCount ? "warning" : orphanScan?.orphanStats.existing ? "secondary" : "outline"}>{maintenanceStateLabel}</Badge>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => setMaintenanceOpen((value) => !value)} disabled={busy}>
              <Wrench data-icon="inline-start" />
              {maintenanceOpen ? "收起" : "维护"}
            </Button>
          </div>
          {maintenanceOpen ? (
            <div className="mt-4 flex flex-col gap-4">
              <HistoryArtifactGovernancePanel
                query={artifactQuery}
                mode={artifactMode}
                loading={artifactLoading}
                previewImpact={governanceImpactPreview}
                previewLoading={Boolean(currentCleanupKey) && impactLoadingKey === currentCleanupKey}
                currentDocId={currentDocId}
                busy={busy}
                onModeChange={onArtifactModeChange}
                onRefresh={onRefreshArtifacts}
                onRepairIndex={onRepairHistoryDatabase}
                onPreviewCurrentCleanup={() => {
                  if (currentDocId) {
                    void handlePreviewDelete(currentDocId, currentCleanupOptions);
                  }
                }}
              />
              <OrphanGovernancePanel
                scan={orphanScan}
                busy={busy}
                onScan={onScanOrphans}
                onDelete={onDeleteOrphans}
              />
            </div>
          ) : null}
        </section>

        {!open ? null : items.length ? (
          <div className="flex flex-col gap-3 pb-4">
              {items.map((item) => {
                const isActive = currentDocId === item.docId;
                const cleanupOpen = cleanupDocId === item.docId;
                const shouldShowRounds = isActive || items.length === 1;
                const profileRounds = getRoundsForProfile(item.rounds, promptProfile, promptSequence, promptOptions, promptWorkflows);
                const activeRounds = isActive && currentHistory ? getRoundsForProfile(currentHistory.rounds, promptProfile, promptSequence, promptOptions, promptWorkflows) : profileRounds;
                const visibleRounds = activeRounds.length ? activeRounds : item.rounds;
                const completedRounds = getCompletedRounds(activeRounds, promptProfile, promptSequence, promptOptions, promptWorkflows);
                const roundStateText = getRoundStateText(completedRounds, promptProfile, promptSequence, promptOptions, promptWorkflows);
                const latestRound = getLatestRound(visibleRounds);
                const nextStepText = getNextRoundText(completedRounds, promptProfile, promptSequence, promptOptions, promptWorkflows);
                const latestResultText = latestRound?.outputPath ? `第 ${latestRound.round} 轮` : "未生成";
                const exportStateText = getExportStateText(item, visibleRounds);
                const cleanupStateText = getCleanupStateText(item.artifactStats);
                const missingAssets = getSafeArtifactStats(item.artifactStats).missing > 0;
                const documentDeleteActions: Array<{ title: string; options: DeleteHistoryOptions; destructive?: boolean }> = [
                  { title: "只移除记录", options: { mode: "records_only" } },
                  { title: "清理项目导出", options: { mode: "exports_only" } },
                  { title: "删除生成链路", options: { mode: "records_and_artifacts" }, destructive: true },
                  { title: "彻底清理项目副本", options: { mode: "records_artifacts_and_source" }, destructive: true },
                ];
                const documentImpactPreview = impactPreview
                  && documentDeleteActions.some((action) => makeDeleteActionKey(item.docId, action.options) === impactPreview.key)
                  ? impactPreview.impact
                  : null;

                return (
                  <div
                    key={`${item.docId}-${promptProfile}-${formatPromptSequence(promptSequence, promptOptions, promptProfile, promptWorkflows)}`}
                    className={cn(
                      "relative rounded-lg border bg-card p-4 transition-colors",
                      isActive ? "border-primary/30" : "border-border hover:bg-muted/20",
                    )}
                  >
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="min-w-0 truncate text-base font-semibold">{formatDocName(item)}</h3>
                            {isActive ? <Badge variant="neutral">当前选用</Badge> : null}
                            <Badge variant={roundStateText === "流程已完成" ? "secondary" : "outline"}>{roundStateText}</Badge>
                            {missingAssets ? <Badge variant="warning">资产需检查</Badge> : null}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1.5">
                              <Clock3 />
                              {item.lastTimestamp ? formatTimestamp(item.lastTimestamp) : "暂无时间记录"}
                            </span>
                            <span>下一步 {nextStepText}</span>
                            <span>最新 {latestResultText}</span>
                            <span>导出 {exportStateText}</span>
                            <span>可释放 {cleanupStateText}</span>
                          </div>
                          <p className="mt-2 truncate text-xs text-muted-foreground">{formatPathScope(item.originPath || item.sourcePath || item.docId)}</p>
                        </div>

                        <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCleanupDocId((value) => value === item.docId ? null : item.docId)}
                            disabled={busy}
                          >
                            <Trash2 data-icon="inline-start" />
                            {cleanupOpen ? "收起" : "清理"}
                          </Button>
                          <Button variant={isActive ? "secondary" : "outline"} size="sm" onClick={() => onSelect(item)} disabled={busy}>
                            <RotateCcw data-icon="inline-start" />
                            {isActive ? "载入" : "切换"}
                          </Button>
                        </div>
                      </div>
                      {cleanupOpen ? (
                        <div className="grid gap-3 rounded-lg border border-border bg-muted/20 p-3 md:grid-cols-2 xl:grid-cols-4">
                          {documentDeleteActions.map((action) => {
                            const actionKey = makeDeleteActionKey(item.docId, action.options);
                            return (
                              <HistoryDeleteAction
                                key={actionKey}
                                title={action.title}
                                options={action.options}
                                docId={item.docId}
                                busy={busy}
                                loading={impactLoadingKey === actionKey}
                                destructive={action.destructive}
                                onPreview={handlePreviewDelete}
                                onDelete={onDelete}
                              />
                            );
                          })}
                        </div>
                      ) : null}
                      {documentImpactPreview ? <AssetImpactPanel impact={documentImpactPreview} /> : null}
                    </div>

                    {shouldShowRounds && visibleRounds.length ? (
                      <>
                        <Separator className="my-4" />
                        {!activeRounds.length ? (
                          <Badge variant="outline" className="mb-3 w-fit">其他模式</Badge>
                        ) : null}
                        <div className="grid gap-2">
                          {visibleRounds.map((roundItem) => {
                            const roundPromptProfile = (roundItem.promptProfile || "cn") as ModelConfig["promptProfile"];
                            const roundPromptOptions = getPromptOptions(roundPromptProfile, roundItem.promptSequence ?? promptSequence, promptOptions, promptWorkflows);
                            const roundDeleteActions: Array<{ title: string; options: DeleteHistoryOptions; destructive?: boolean }> = [
                              { title: "清理本轮导出", options: { ...roundPromptOptions, fromRound: roundItem.round, mode: "exports_only" } },
                              { title: "回滚到本轮前", options: { ...roundPromptOptions, fromRound: roundItem.round, mode: "records_and_artifacts" }, destructive: true },
                            ];
                            const roundImpactPreview = impactPreview
                              && roundDeleteActions.some((action) => makeDeleteActionKey(item.docId, action.options) === impactPreview.key)
                              ? impactPreview.impact
                              : null;
                            return (
                              <div key={`${item.docId}-${roundItem.promptProfile}-${roundItem.round}-${formatPromptSequence(roundItem.promptSequence, promptOptions, roundPromptProfile, promptWorkflows)}`} className="rounded-lg border border-border bg-muted/20 p-3">
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                  <div className="flex min-w-0 flex-col gap-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <Badge variant="secondary">第 {roundItem.round} 轮</Badge>
                                      <Badge variant="outline">{getProfileLabel(roundPromptProfile, promptWorkflows)}</Badge>
                                      {isPromptSequenceCustomizable(roundPromptProfile, promptWorkflows) ? <Badge variant="outline">{formatPromptSequence(roundItem.promptSequence, promptOptions, roundPromptProfile, promptWorkflows)}</Badge> : null}
                                      {getSafeArtifactStats(roundItem.artifactStats).missing ? <Badge variant="warning">资产需检查</Badge> : null}
                                      <Badge variant="outline">{formatTimestamp(roundItem.timestamp)}</Badge>
                                    </div>
                                    <p className="truncate text-xs text-muted-foreground">{roundItem.outputPath ? formatPathScope(roundItem.outputPath) : "暂无输出路径"}</p>
                                  </div>

                                  <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
                                    <Button variant="outline" size="sm" onClick={() => onDownload(roundItem, "txt")} disabled={busy || !roundItem.outputPath}>
                                      <Download data-icon="inline-start" />
                                      TXT
                                    </Button>
                                    <Button size="sm" onClick={() => onDownload(roundItem, "docx")} disabled={busy || !roundItem.outputPath}>
                                      <Download data-icon="inline-start" />
                                      Word
                                    </Button>
                                  </div>
                                </div>
                                {cleanupOpen ? (
                                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                                    {roundDeleteActions.map((action) => {
                                      const actionKey = makeDeleteActionKey(item.docId, action.options);
                                      return (
                                        <HistoryDeleteAction
                                          key={actionKey}
                                          title={action.title}
                                          options={action.options}
                                          docId={item.docId}
                                          busy={busy}
                                          loading={impactLoadingKey === actionKey}
                                          destructive={action.destructive}
                                          onPreview={handlePreviewDelete}
                                          onDelete={onDelete}
                                        />
                                      );
                                    })}
                                  </div>
                                ) : null}
                                {roundImpactPreview ? <div className="mt-4"><AssetImpactPanel impact={roundImpactPreview} /></div> : null}
                              </div>
                            );
                          })}
                        </div>
                      </>
                    ) : shouldShowRounds ? (
                      <div className="mt-5 rounded-lg border border-dashed border-border bg-muted/20 p-4 text-sm leading-6 text-muted-foreground">暂无轮次</div>
                    ) : null}
                  </div>
                );
              })}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center">
            <h3 className="text-base font-semibold">还没有历史记录</h3>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
