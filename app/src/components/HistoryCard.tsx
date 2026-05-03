import { useState } from "react";
import { AlertTriangle, Clock3, Database, Download, FolderClock, RotateCcw, Search, ShieldCheck, Trash2, Wrench } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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
} from "@/types/app";

type Props = {
  currentDocId: string | null;
  currentHistory: DocumentHistory | null;
  items: HistoryDocumentSummary[];
  promptProfile: ModelConfig["promptProfile"];
  promptSequence: PromptId[];
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

const PROMPT_LABELS: Record<PromptId, string> = {
  prewrite: "预改写",
  classical: "经典改写",
  round1: "一轮",
  round2: "二轮",
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

function getMaxRounds(promptProfile: ModelConfig["promptProfile"], promptSequence?: PromptId[]): number {
  if (promptProfile === "cn_prewrite") {
    return 3;
  }
  if (promptProfile === "cn_custom") {
    return normalizePromptSequence(promptSequence).length;
  }
  return 2;
}

function getProfileLabel(promptProfile: ModelConfig["promptProfile"]): string {
  if (promptProfile === "cn_custom") {
    return "自定义组合";
  }
  if (promptProfile === "cn_prewrite") {
    return "中文三轮预改写";
  }
  return "中文双轮";
}

function normalizePromptSequence(value: PromptId[] | undefined): PromptId[] {
  const allowed = new Set(["prewrite", "classical", "round1", "round2"]);
  const normalized = (value ?? []).filter((item): item is PromptId => allowed.has(item));
  return normalized.length ? normalized : ["prewrite", "round1", "round2"];
}

function formatPromptSequence(value: PromptId[] | undefined): string {
  return normalizePromptSequence(value).map((item) => PROMPT_LABELS[item] ?? item).join(" → ");
}

function promptSequencesEqual(left: PromptId[] | undefined, right: PromptId[] | undefined): boolean {
  const a = normalizePromptSequence(left);
  const b = normalizePromptSequence(right);
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

function getRoundsForProfile(rounds: HistoryRound[], promptProfile: ModelConfig["promptProfile"], promptSequence: PromptId[]): HistoryRound[] {
  return rounds.filter((round) => {
    if ((round.promptProfile || "cn") !== promptProfile) {
      return false;
    }
    if (promptProfile !== "cn_custom") {
      return true;
    }
    return promptSequencesEqual(round.promptSequence, promptSequence);
  });
}

function getCompletedRounds(rounds: HistoryRound[], promptProfile: ModelConfig["promptProfile"], promptSequence: PromptId[]): number[] {
  const maxRounds = getMaxRounds(promptProfile, promptSequence);
  return Array.from(new Set(rounds.map((item) => item.round).filter((round) => round >= 1 && round <= maxRounds))).sort(
    (left, right) => left - right,
  );
}

function getNextRoundText(completedRounds: number[], promptProfile: ModelConfig["promptProfile"], promptSequence: PromptId[]): string {
  const maxRounds = getMaxRounds(promptProfile, promptSequence);
  for (let round = 1; round <= maxRounds; round += 1) {
    if (!completedRounds.includes(round)) {
      return `第 ${round} 轮`;
    }
  }
  return "已完成";
}

function getPromptOptions(promptProfile: ModelConfig["promptProfile"], promptSequence: PromptId[]): Pick<DeleteHistoryOptions, "promptProfile" | "promptSequence"> {
  return {
    promptProfile,
    promptSequence: promptProfile === "cn_custom" ? normalizePromptSequence(promptSequence) : undefined,
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

function getDeleteModeDescription(mode: DeleteHistoryOptions["mode"], fromRound?: number): string {
  const scope = fromRound ? `第 ${fromRound} 轮及之后` : "整篇文档";
  if (mode === "records_only") return `${scope}只从界面索引移除，文件会留在项目中。`;
  if (mode === "exports_only") return `${scope}只删除项目 web_exports 内导出副本和审计文件。`;
  if (mode === "records_artifacts_and_source") return `${scope}删除记录、生成物，并仅删除项目 origin 内源副本。`;
  return `${scope}删除轮次记录、Diff、中间产物、检查报告和项目导出副本。`;
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

function getArtifactModeCopy(mode: HistoryArtifactGovernanceMode): { title: string; detail: string } {
  if (mode === "current") {
    return {
      title: "当前文档资产",
      detail: "只看正在选中的文档，适合判断这一篇还能清理或追溯哪些生成物。",
    };
  }
  if (mode === "large") {
    return {
      title: "占用空间较大",
      detail: "只看仍存在且体积较大的项目生成物，适合优先释放空间。",
    };
  }
  return {
    title: "缺失资产",
    detail: "索引里有记录但磁盘上已不存在，通常来自旧导出、中间文件或手动删除。",
  };
}

function getArtifactQueryStateLabel(query: HistoryArtifactQueryResponse | null, loading: boolean): string {
  if (loading) return "读取中";
  if (!query) return "未读取";
  if (!query.ok) return "需检查";
  return query.total ? `${query.total} 条` : "无异常";
}

function HistoryArtifactRow({ item }: { item: HistoryArtifactQueryItem }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-xs md:flex-row md:items-center md:justify-between">
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
  const copy = getArtifactModeCopy(mode);
  const stats = getSafeArtifactStats(query?.stats);
  const previewItems = query?.items.slice(0, 6) ?? [];
  const shouldSuggestRepair = mode === "missing" && (stats.missing > 0 || query?.ok === false);
  const shouldSuggestPreview = (mode === "current" || mode === "large") && Boolean(currentDocId);
  return (
    <section data-ui-section="history-asset-governance" className="rounded-lg border border-border bg-muted/20 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">资产治理</Badge>
            <Badge variant={query?.ok === false ? "warning" : "outline"}>{getArtifactQueryStateLabel(query, loading)}</Badge>
          </div>
          <h3 className="mt-2 text-base font-semibold text-foreground">{copy.title}</h3>
          <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">{copy.detail}</p>
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

      <ToggleGroup
        type="single"
        value={mode}
        onValueChange={(value) => {
          if (value === "missing" || value === "current" || value === "large") {
            onModeChange(value);
          }
        }}
        className="mt-4 grid gap-2 md:grid-cols-3"
      >
        <ToggleGroupItem value="missing" variant="outline" className="h-auto min-h-16 flex-col items-start justify-center gap-1 px-3 py-2 text-left">
          <span className="text-sm font-semibold">缺失资产</span>
          <span className="text-xs text-muted-foreground">索引仍在，文件已不在</span>
        </ToggleGroupItem>
        <ToggleGroupItem value="current" variant="outline" disabled={!currentDocId} className="h-auto min-h-16 flex-col items-start justify-center gap-1 px-3 py-2 text-left">
          <span className="text-sm font-semibold">当前文档</span>
          <span className="text-xs text-muted-foreground">只看这一篇的生成物</span>
        </ToggleGroupItem>
        <ToggleGroupItem value="large" variant="outline" className="h-auto min-h-16 flex-col items-start justify-center gap-1 px-3 py-2 text-left">
          <span className="text-sm font-semibold">大文件</span>
          <span className="text-xs text-muted-foreground">优先定位占用空间</span>
        </ToggleGroupItem>
      </ToggleGroup>

      <div className="mt-4 grid gap-2 md:grid-cols-5">
        <StatPill label="索引资产" value={`${stats.total}`} />
        <StatPill label="仍存在" value={`${stats.existing}`} />
        <StatPill label="缺失" value={`${stats.missing}`} />
        <StatPill label="占用空间" value={formatBytes(stats.bytes)} />
        <StatPill label="外部引用" value={`${stats.external}`} />
      </div>

      {shouldSuggestRepair ? (
        <Alert className="mt-4">
          <Wrench />
          <AlertTitle>建议先修复索引</AlertTitle>
          <AlertDescription>
            缺失资产说明记录与磁盘状态可能已经不同步。修复只会重建 SQLite 索引和兼容记录，不会删除正文、导出文件或用户保存的副本。
          </AlertDescription>
        </Alert>
      ) : null}

      {shouldSuggestPreview && stats.existing > 0 ? (
        <Alert className="mt-4">
          <Search />
          <AlertTitle>先预览再清理</AlertTitle>
          <AlertDescription>
            这里先查看当前文档会受影响的项目生成物，不直接执行删除；真正清理仍需要在下方确认。
          </AlertDescription>
        </Alert>
      ) : null}

      {query?.ok === false ? (
        <Alert className="mt-4" variant="destructive">
          <AlertTriangle />
          <AlertTitle>索引读取失败</AlertTitle>
          <AlertDescription>{query.error || "SQLite 历史索引暂时不可用，请先刷新或运行历史库修复。"}</AlertDescription>
        </Alert>
      ) : previewItems.length ? (
        <div className="mt-4 flex flex-col gap-2">
          {previewItems.map((item) => <HistoryArtifactRow key={`${item.path}-${item.kind}`} item={item} />)}
          {query?.hasMore ? <div className="text-xs font-semibold text-muted-foreground">这里只展示前 {previewItems.length} 条，后端索引中还有更多匹配项。</div> : null}
        </div>
      ) : (
        <div className="mt-4 flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-3 text-sm text-muted-foreground">
          <Database className="shrink-0" />
          <div>{loading ? "正在读取 SQLite 历史索引。" : "当前视图没有需要处理的资产。"}</div>
        </div>
      )}
      {previewImpact ? <div className="mt-4"><AssetImpactPanel impact={previewImpact} /></div> : null}
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
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">未归属产物</Badge>
            {scan ? <Badge variant={stats.existing ? "secondary" : "outline"}>{stats.existing} 个</Badge> : null}
          </div>
          <div className="mt-2 text-sm leading-6 text-muted-foreground">
            扫描项目目录中不再被历史、当前文档或复盘记录引用的源文档副本和生成物；外部路径与浏览器下载文件不会被清理。
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onScan} disabled={busy}>
            <Search data-icon="inline-start" />
            扫描
          </Button>
          <Button
            variant="outline"
            onClick={onDelete}
            disabled={busy || !scan || !stats.existing}
          >
            <Trash2 data-icon="inline-start" />
            清理未归属文件
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-5">
        <StatPill label="可清理文件" value={`${stats.existing}`} />
        <StatPill label="占用空间" value={formatBytes(stats.bytes)} />
        <StatPill label="源文档副本" value={`${scan?.orphanKindStats.sources.files ?? 0}`} />
        <StatPill label="项目导出" value={`${scan?.orphanKindStats.exports.files ?? 0}`} />
        <StatPill label="报告文件" value={`${scan?.orphanKindStats.reports.files ?? 0}`} />
      </div>

      {scan ? (
        previewFiles.length ? (
          <div className="mt-4 flex flex-col gap-2">
            {previewFiles.map((file) => (
              <div key={file.relativePath} className="flex min-w-0 items-center justify-between gap-3 rounded-lg border bg-muted/40 px-3 py-2 text-xs">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-foreground">{file.relativePath}</div>
                  <div className="mt-0.5 text-muted-foreground">{getOrphanKindLabel(file.kind)} · {formatBytes(file.bytes)}</div>
                </div>
                <ShieldCheck className="shrink-0 text-muted-foreground" />
              </div>
            ))}
            {scan.hasMore ? <div className="text-xs font-semibold text-muted-foreground">仅预览前 200 个，清理时会按后端安全规则处理全部未归属文件。</div> : null}
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-border bg-muted/40 p-3 text-sm font-semibold text-foreground">
            当前没有发现未归属生成文件。
          </div>
        )
      ) : (
        <div className="mt-4 rounded-lg border border-dashed border-border bg-muted/20 p-3 text-sm text-muted-foreground">
          点击扫描后再决定是否清理，清理动作会二次确认。
        </div>
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
  return hasExportableOutput(item, rounds) ? "可导出" : "暂无输出";
}

function getCleanupStateText(stats?: HistoryArtifactStats): string {
  const safeStats = getSafeArtifactStats(stats);
  if (!safeStats.existing) {
    return "很干净";
  }
  return formatBytes(safeStats.bytes);
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/40 px-3 py-2">
      <div className="text-[10px] font-semibold text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}

function ImpactCard({ title, value, text, tone = "slate" }: { title: string; value: string; text: string; tone?: "slate" | "amber" | "red" | "emerald" }) {
  const toneClass = {
    slate: "border-border bg-muted/40 text-foreground",
    amber: "border-border bg-muted/40 text-foreground",
    red: "border-destructive/30 bg-destructive/5 text-destructive",
    emerald: "border-border bg-muted/40 text-foreground",
  }[tone];
  return (
    <div className={`rounded-lg border p-3 ${toneClass}`}>
      <div className="text-[10px] font-black opacity-70">{title}</div>
      <div className="mt-1 text-lg font-black">{value}</div>
      <div className="mt-1 text-xs leading-5 opacity-80">{text}</div>
    </div>
  );
}

function AssetImpactPanel({ impact }: { impact: HistoryDeleteImpact }) {
  const stats = impact.fileStats;
  const candidateStats = impact.candidateStats;
  const previewFiles = impact.files.filter((file) => file.exists).slice(0, 8);
  const sourceTone = impact.willDeleteSource
    ? "border-destructive/30 bg-destructive/5 text-destructive"
    : "border-border bg-muted/40 text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">删除影响预览</Badge>
            <Badge variant="outline">{getDeleteModeLabel(impact.mode)}</Badge>
            {impact.fromRound ? <Badge variant="outline">从第 {impact.fromRound} 轮开始</Badge> : null}
          </div>
          <div className="mt-2 text-sm leading-6 text-muted-foreground">
            这是执行前的资产审计结果；预览不会删除任何文件。
          </div>
        </div>
        <Badge variant={stats.existing ? "warning" : "success"}>
          将删除 {stats.existing} 个文件 · {formatBytes(stats.bytes)}
        </Badge>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-5">
        <StatPill label="源文档副本" value={`${stats.sources ?? 0}`} />
        <StatPill label="中间产物" value={`${stats.intermediate}`} />
        <StatPill label="项目导出" value={`${stats.exports}`} />
        <StatPill label="报告/审计" value={`${stats.reports}`} />
        <StatPill label="候选文件" value={`${candidateStats.existing}`} />
      </div>

      <div className={`rounded-lg border px-3 py-2 text-xs leading-5 mt-4 ${sourceTone}`}>
        <span className="font-black">源文档策略：</span>
        {impact.willDeleteSource
          ? "会删除项目 origin 目录下的源文档副本；不会删除浏览器下载目录或外部路径文件。"
          : impact.sourceOwnedByProject
            ? "源文档副本会保留；只处理记录或生成产物。"
            : "源文档位于外部路径，系统不会删除。"}
        {impact.sourcePath ? <span className="ml-1 opacity-80">{formatPathScope(impact.sourcePath)}</span> : null}
      </div>

      {impact.affectedRounds.length ? (
        <div className="mt-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs leading-5 text-foreground">
          影响轮次：{impact.affectedRounds.join(", ")}
        </div>
      ) : null}

      {previewFiles.length ? (
        <div className="mt-4 flex flex-col gap-2">
          {previewFiles.map((file) => (
            <div key={`${file.relativePath}-${file.kind}`} className="flex min-w-0 items-center justify-between gap-3 rounded-lg border bg-muted/40 px-3 py-2 text-xs">
              <div className="min-w-0">
                <div className="truncate font-semibold text-foreground">{file.relativePath}</div>
                <div className="mt-0.5 text-muted-foreground">{getOrphanKindLabel(file.kind)} · {formatBytes(file.bytes)}</div>
              </div>
              <Badge variant="outline">将删除</Badge>
            </div>
          ))}
          {impact.hasMoreFiles ? <div className="text-xs font-semibold text-muted-foreground">仅展示前 80 个候选文件中的一部分，执行时按同一安全规则处理。</div> : null}
        </div>
      ) : (
          <div className="mt-4 rounded-lg border border-border bg-muted/40 p-3 text-sm font-semibold">
          此操作不会删除项目文件，只会改变历史索引或没有匹配到文件。
        </div>
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
      <div className="mt-1 min-h-10 text-xs leading-5 text-muted-foreground">{getDeleteModeDescription(options.mode, options.fromRound)}</div>
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

function HistoryGovernanceBoundary() {
  const cards = [
    {
      title: "先预览再执行",
      text: "删除、回滚、清理前先生成影响预览；预览不会改动任何文件。",
    },
    {
      title: "只治理项目内文件",
      text: "清理对象限定在项目记录、origin、finish、审计报告和运行中间产物。",
    },
    {
      title: "外部文件不碰",
      text: "浏览器下载目录、外部原始路径和用户自己保存的 Word/PDF 不会被删除。",
    },
  ];
  return (
    <div data-ui-section="history-governance-boundary" className="grid gap-3 lg:grid-cols-3">
      {cards.map((card) => (
        <div key={card.title} className="rounded-lg border border-border bg-muted/40 p-3">
          <div className="text-sm font-semibold text-foreground">{card.title}</div>
          <div className="mt-1 text-xs leading-5 text-muted-foreground">{card.text}</div>
        </div>
      ))}
    </div>
  );
}

export function HistoryCard({
  currentDocId,
  currentHistory,
  items,
  promptProfile,
  promptSequence,
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
  const maxRounds = getMaxRounds(promptProfile, promptSequence);
  const totalStats = mergeArtifactStats(items.map((item) => item.artifactStats));
  const continuationCount = items.filter((item) => {
    const completedRounds = getCompletedRounds(getRoundsForProfile(item.rounds, promptProfile, promptSequence), promptProfile, promptSequence);
    return completedRounds.length < maxRounds;
  }).length;
  const exportableCount = items.filter((item) => hasExportableOutput(item, getRoundsForProfile(item.rounds, promptProfile, promptSequence))).length;
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
      <CardHeader className="flex flex-col gap-3 pb-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">历史记录</Badge>
              <Badge variant="outline">{getProfileLabel(promptProfile)}</Badge>
            </div>
            <CardTitle className="text-xl">继续处理与导出</CardTitle>
            <CardDescription>选择历史文档继续下一轮、导出最新结果；清理和修复放在高级维护里。</CardDescription>
          </div>
          <Button variant="outline" onClick={onToggle} disabled={busy}>
            <FolderClock data-icon="inline-start" />
            {open ? "收起列表" : `展开列表（${items.length}）`}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        <div data-ui-section="history-user-summary" className="grid gap-3 lg:grid-cols-3">
          <ImpactCard
            title="可继续"
            value={`${continuationCount} 篇`}
            text={`当前流程最多 ${maxRounds} 轮，未完成的文档可直接接着跑。`}
          />
          <ImpactCard
            title="可导出"
            value={`${exportableCount} 篇`}
            text="已有输出的文档可打开后导出 Word 或 TXT。"
            tone="emerald"
          />
          <ImpactCard
            title="可释放"
            value={formatBytes(totalStats.bytes)}
            text={`${totalStats.existing} 个项目内生成文件；日常不用处理，需要时打开高级维护。`}
            tone="amber"
          />
        </div>
        <section data-ui-section="history-advanced-maintenance" className="rounded-lg border border-border bg-muted/20 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">高级维护</Badge>
                {artifactQuery?.ok === false ? <Badge variant="warning">需要检查</Badge> : null}
                {orphanScan?.orphanStats.existing ? <Badge variant="outline">可清理 {orphanScan.orphanStats.existing}</Badge> : null}
              </div>
              <div className="mt-1 text-sm leading-6 text-muted-foreground">
                项目体检、空间清理和异常修复都收在这里；日常继续写或导出不用打开。
              </div>
            </div>
            <Button variant="outline" onClick={() => setMaintenanceOpen((value) => !value)} disabled={busy}>
              <Wrench data-icon="inline-start" />
              {maintenanceOpen ? "收起高级工具" : "展开高级工具"}
            </Button>
          </div>
          {maintenanceOpen ? (
            <div className="mt-4 flex flex-col gap-4">
              <HistoryGovernanceBoundary />
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

        {!open ? (
          <div className="rounded-lg border border-border bg-muted/30 p-5 text-sm leading-6 text-muted-foreground">
            历史面板已收起。这里按当前提示词模式展示匹配轮次，不把不同模式的结果混在一起。
          </div>
        ) : items.length ? (
          <div className="flex flex-col gap-5 pb-4">
              {items.map((item) => {
                const isActive = currentDocId === item.docId;
                const cleanupOpen = cleanupDocId === item.docId;
                const shouldShowRounds = isActive || items.length === 1;
                const profileRounds = getRoundsForProfile(item.rounds, promptProfile, promptSequence);
                const activeRounds = isActive && currentHistory ? getRoundsForProfile(currentHistory.rounds, promptProfile, promptSequence) : profileRounds;
                const visibleRounds = activeRounds.length ? activeRounds : item.rounds;
                const completedRounds = getCompletedRounds(activeRounds, promptProfile, promptSequence);
                const latestRound = getLatestRound(visibleRounds);
                const nextStepText = getNextRoundText(completedRounds, promptProfile, promptSequence);
                const latestResultText = latestRound?.outputPath ? `第 ${latestRound.round} 轮` : "未生成";
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
                    key={`${item.docId}-${promptProfile}-${formatPromptSequence(promptSequence)}`}
                    className={`relative rounded-lg border p-5 shadow-sm transition-colors ${
                      isActive
                        ? "border-primary/30 bg-card"
                        : "border-border bg-card hover:bg-muted/20"
                    }`}
                  >
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex min-w-0 flex-col gap-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="min-w-0 truncate text-lg font-semibold">{formatDocName(item)}</h3>
                            {isActive ? <Badge variant="neutral">当前选用</Badge> : null}
                            <Badge variant="outline">{completedRounds.length}/{maxRounds} 轮</Badge>
                          </div>
                          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                            <span className="inline-flex items-center gap-1.5">
                              <Clock3 className="size-4" />
                              {item.lastTimestamp ? formatTimestamp(item.lastTimestamp) : "暂无时间记录"}
                            </span>
                            <span>下一步：{nextStepText}</span>
                          </div>
                          <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">{formatPathScope(item.originPath || item.sourcePath || item.docId)}</p>
                        </div>

                        <div className="flex flex-wrap gap-2 lg:justify-end">
                          <Button
                            variant="outline"
                            onClick={() => setCleanupDocId((value) => value === item.docId ? null : item.docId)}
                            disabled={busy}
                          >
                            <Trash2 data-icon="inline-start" />
                            {cleanupOpen ? "收起清理" : "清理选项"}
                          </Button>
                          <Button variant={isActive ? "secondary" : "outline"} onClick={() => onSelect(item)} disabled={busy}>
                            <RotateCcw data-icon="inline-start" />
                            {isActive ? "重新载入" : "切到这篇"}
                          </Button>
                        </div>
                      </div>

                      <div className="grid gap-2 rounded-lg border border-border bg-muted/20 p-3 text-xs md:grid-cols-4">
                        <StatPill label="下一步" value={nextStepText} />
                        <StatPill label="最新结果" value={latestResultText} />
                        <StatPill label="导出" value={getExportStateText(item, visibleRounds)} />
                        <StatPill label="可释放" value={getCleanupStateText(item.artifactStats)} />
                      </div>
                      {cleanupOpen ? (
                        <div className="grid gap-3 rounded-lg border border-border bg-muted/20 p-4 md:grid-cols-2 xl:grid-cols-4">
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
                        <Separator className="my-5" />
                        {!activeRounds.length ? (
                          <div className="mb-3 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                            当前模式没有轮次，下面展示这篇文档在其他模式下的历史轮次。
                          </div>
                        ) : null}
                        <div className="grid gap-3">
                          {visibleRounds.map((roundItem) => {
                            const roundPromptProfile = (roundItem.promptProfile || "cn") as ModelConfig["promptProfile"];
                            const roundPromptOptions = getPromptOptions(roundPromptProfile, roundItem.promptSequence ?? promptSequence);
                            const roundDeleteActions: Array<{ title: string; options: DeleteHistoryOptions; destructive?: boolean }> = [
                              { title: "清理本轮导出", options: { ...roundPromptOptions, fromRound: roundItem.round, mode: "exports_only" } },
                              { title: "回滚到本轮前", options: { ...roundPromptOptions, fromRound: roundItem.round, mode: "records_and_artifacts" }, destructive: true },
                            ];
                            const roundImpactPreview = impactPreview
                              && roundDeleteActions.some((action) => makeDeleteActionKey(item.docId, action.options) === impactPreview.key)
                              ? impactPreview.impact
                              : null;
                            return (
                              <div key={`${item.docId}-${roundItem.promptProfile}-${roundItem.round}-${formatPromptSequence(roundItem.promptSequence)}`} className="rounded-lg border border-border bg-muted/20 p-4">
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                  <div className="flex min-w-0 flex-col gap-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <Badge variant="secondary">第 {roundItem.round} 轮</Badge>
                                      <Badge variant="outline">{getProfileLabel(roundPromptProfile)}</Badge>
                                      {roundPromptProfile === "cn_custom" ? <Badge variant="outline">{formatPromptSequence(roundItem.promptSequence)}</Badge> : null}
                                      <Badge variant="outline">{formatTimestamp(roundItem.timestamp)}</Badge>
                                    </div>
                                    <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">{roundItem.outputPath ? formatPathScope(roundItem.outputPath) : "暂无输出路径"}</p>
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
                      <div className="mt-5 rounded-lg border border-dashed border-border bg-muted/20 p-4 text-sm leading-6 text-muted-foreground">
                        这篇文档在当前模式下还没有轮次记录。可能是在别的提示词模式下处理过。
                      </div>
                    ) : null}
                  </div>
                );
              })}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center">
            <h3 className="text-base font-semibold">还没有历史记录</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">跑过的文档会自动出现在这里，之后可以直接回来继续处理或导出。</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
