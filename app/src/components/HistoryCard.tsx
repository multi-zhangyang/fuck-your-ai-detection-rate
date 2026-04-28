import { Clock3, Download, FolderClock, RotateCcw, Search, ShieldCheck, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type {
  DeleteHistoryOptions,
  DocumentHistory,
  HistoryArtifactStats,
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
  open: boolean;
  busy: boolean;
  onToggle: () => void;
  onSelect: (item: HistoryDocumentSummary) => void;
  onDelete: (docId: string, options?: DeleteHistoryOptions) => void;
  onScanOrphans: () => void;
  onDeleteOrphans: () => void;
  onDownload: (item: HistoryRound, format: "txt" | "docx") => void;
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

function ArtifactStats({ stats }: { stats?: HistoryArtifactStats }) {
  const safeStats = getSafeArtifactStats(stats);
  return (
    <div className="grid gap-2 sm:grid-cols-5">
      <StatPill label="可清理文件" value={`${safeStats.existing}`} />
      <StatPill label="导出副本" value={`${safeStats.exports}`} />
      <StatPill label="中间产物" value={`${safeStats.intermediate}`} />
      <StatPill label="审计/报告" value={`${safeStats.reports}`} />
      <StatPill label="占用空间" value={formatBytes(safeStats.bytes)} />
    </div>
  );
}

function ArtifactGovernanceMap({ stats, sourcePath, compact = false }: { stats?: HistoryArtifactStats; sourcePath?: string; compact?: boolean }) {
  const safeStats = getSafeArtifactStats(stats);
  const toneClasses: Record<string, string> = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    indigo: "border-indigo-200 bg-indigo-50 text-indigo-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    orange: "border-orange-200 bg-orange-50 text-orange-800",
    sky: "border-sky-200 bg-sky-50 text-sky-800",
    slate: "border-slate-200 bg-slate-50 text-slate-700",
  };
  const items = [
    {
      label: "源文档",
      value: "保留",
      detail: sourcePath ? formatPathScope(sourcePath) : "默认保留；彻底清理时也只删除项目 origin 内副本",
      tone: "emerald",
    },
    {
      label: "历史记录",
      value: "索引",
      detail: "只移除记录只会隐藏索引，不删除项目文件",
      tone: "indigo",
    },
    {
      label: "中间产物",
      value: `${safeStats.intermediate}`,
      detail: "Diff、manifest、checkpoint、body-map 等运行链路文件",
      tone: "amber",
    },
    {
      label: "导出副本",
      value: `${safeStats.exports}`,
      detail: "仅指项目 web_exports 内副本，不影响浏览器已下载文件",
      tone: "orange",
    },
    {
      label: "审计/报告",
      value: `${safeStats.reports}`,
      detail: "导出审计、保护区报告、外部报告解析记录",
      tone: "sky",
    },
  ];
  return (
    <div className={`grid gap-2 ${compact ? "md:grid-cols-3" : "lg:grid-cols-5"}`}>
      {items.map((item) => (
        <div
          key={item.label}
          className={`rounded-2xl border px-3 py-2 ${toneClasses[item.tone] ?? toneClasses.slate}`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-black opacity-70">{item.label}</span>
            <span className="text-sm font-black">{item.value}</span>
          </div>
          {!compact ? <div className="mt-1 line-clamp-2 text-[11px] leading-5 opacity-80">{item.detail}</div> : null}
        </div>
      ))}
    </div>
  );
}

function getOrphanKindLabel(kind: string): string {
  if (kind === "sources") return "源文档副本";
  if (kind === "exports") return "项目导出";
  if (kind === "reports") return "报告文件";
  if (kind === "intermediate") return "中间产物";
  return "其他";
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
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
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
            <Search className="h-4 w-4" />
            扫描
          </Button>
          <Button
            variant="outline"
            onClick={onDelete}
            disabled={busy || !scan || !stats.existing}
            className="border-amber-200 text-amber-800 hover:bg-amber-50"
          >
            <Trash2 className="h-4 w-4" />
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
          <div className="mt-4 space-y-2">
            {previewFiles.map((file) => (
              <div key={file.relativePath} className="flex min-w-0 items-center justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-2 text-xs">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-slate-800">{file.relativePath}</div>
                  <div className="mt-0.5 text-slate-500">{getOrphanKindLabel(file.kind)} · {formatBytes(file.bytes)}</div>
                </div>
                <ShieldCheck className="h-4 w-4 shrink-0 text-slate-400" />
              </div>
            ))}
            {scan.hasMore ? <div className="text-xs font-semibold text-slate-500">仅预览前 200 个，清理时会按后端安全规则处理全部未归属文件。</div> : null}
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
            当前没有发现未归属生成文件。
          </div>
        )
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-border bg-muted/20 p-3 text-sm text-muted-foreground">
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

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-3 py-2">
      <div className="text-[10px] font-black text-slate-400">{label}</div>
      <div className="mt-0.5 truncate text-sm font-black text-slate-900">{value}</div>
    </div>
  );
}

function ImpactCard({ title, value, text, tone = "slate" }: { title: string; value: string; text: string; tone?: "slate" | "amber" | "red" | "emerald" }) {
  const toneClass = {
    slate: "border-slate-200 bg-slate-50 text-slate-700",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    red: "border-red-200 bg-red-50 text-red-800",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
  }[tone];
  return (
    <div className={`rounded-2xl border p-3 ${toneClass}`}>
      <div className="text-[10px] font-black opacity-70">{title}</div>
      <div className="mt-1 text-lg font-black">{value}</div>
      <div className="mt-1 text-xs leading-5 opacity-80">{text}</div>
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
  open,
  busy,
  onToggle,
  onSelect,
  onDelete,
  onScanOrphans,
  onDeleteOrphans,
  onDownload,
}: Props) {
  const maxRounds = getMaxRounds(promptProfile, promptSequence);
  const promptOptions = getPromptOptions(promptProfile, promptSequence);
  const totalStats = mergeArtifactStats(items.map((item) => item.artifactStats));
  const currentItem = items.find((item) => item.docId === currentDocId);
  const currentStats = currentItem?.artifactStats;

  return (
    <Card className="min-h-full overflow-visible">
      <CardHeader className="space-y-3 pb-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">历史记录</Badge>
              <Badge variant="outline">{getProfileLabel(promptProfile)}</Badge>
            </div>
            <CardTitle className="text-xl">文档与生成物管理</CardTitle>
            <CardDescription>历史索引、轮次链、项目导出副本和中间生成物分开处理；源文档不在清理范围内。</CardDescription>
          </div>
          <Button variant="outline" onClick={onToggle} disabled={busy}>
            <FolderClock className="h-4 w-4" />
            {open ? "收起列表" : `展开列表（${items.length}）`}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="grid gap-3 lg:grid-cols-4">
          <ImpactCard
            title="项目生成物"
            value={`${totalStats.existing} 个`}
            text={`项目导出 ${totalStats.exports}，中间/报告 ${totalStats.intermediate + totalStats.reports}`}
          />
          <ImpactCard
            title="占用空间"
            value={formatBytes(totalStats.bytes)}
            text="只统计项目内文件，不影响浏览器已下载副本。"
            tone="amber"
          />
          <ImpactCard
            title="当前文档"
            value={currentStats ? `${currentStats.existing} 个` : "未选中"}
            text={currentStats ? `占用 ${formatBytes(currentStats.bytes)}` : "切换到某篇后单独管理它的衍生物。"}
            tone="emerald"
          />
          <ImpactCard
            title="源文档"
            value="保留"
            text="默认保留；源副本清理只作用于项目 origin。"
          />
        </div>

        {!open ? (
          <div className="rounded-2xl border border-border/70 bg-muted/30 p-6 text-sm leading-6 text-muted-foreground">
            历史面板已收起。这里按当前提示词模式展示匹配轮次，不把不同模式的结果混在一起。
          </div>
        ) : items.length ? (
          <div className="space-y-5 pb-4">
              {items.map((item) => {
                const isActive = currentDocId === item.docId;
                const profileRounds = getRoundsForProfile(item.rounds, promptProfile, promptSequence);
                const activeRounds = isActive && currentHistory ? getRoundsForProfile(currentHistory.rounds, promptProfile, promptSequence) : profileRounds;
                const visibleRounds = activeRounds.length ? activeRounds : item.rounds;
                const completedRounds = getCompletedRounds(activeRounds, promptProfile, promptSequence);

                return (
                  <div
                    key={`${item.docId}-${promptProfile}-${formatPromptSequence(promptSequence)}`}
                    className={`relative rounded-[2rem] p-6 shadow-sm transition-colors ${
                      isActive
                        ? "rainbow-marquee-card"
                        : "border border-border/70 bg-background/80 hover:border-slate-300 hover:bg-white"
                    }`}
                  >
                    <div className="space-y-4">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="min-w-0 truncate text-lg font-semibold">{formatDocName(item)}</h3>
                            {isActive ? <Badge className="border-slate-900 bg-slate-950 text-white shadow-sm">当前选用</Badge> : null}
                            <Badge variant="outline">{completedRounds.length}/{maxRounds} 轮</Badge>
                          </div>
                          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                            <span className="inline-flex items-center gap-1.5">
                              <Clock3 className="h-4 w-4" />
                              {item.lastTimestamp ? formatTimestamp(item.lastTimestamp) : "暂无时间记录"}
                            </span>
                            <span>下一轮：{getNextRoundText(completedRounds, promptProfile, promptSequence)}</span>
                          </div>
                          <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">{formatPathScope(item.originPath || item.sourcePath || item.docId)}</p>
                        </div>

                        <div className="flex flex-wrap gap-2 lg:justify-end">
                          <Button variant={isActive ? "secondary" : "outline"} onClick={() => onSelect(item)} disabled={busy}>
                            <RotateCcw className="h-4 w-4" />
                            {isActive ? "重新载入" : "切到这篇"}
                          </Button>
                        </div>
                      </div>

                      <ArtifactStats stats={item.artifactStats} />
                      <ArtifactGovernanceMap stats={item.artifactStats} sourcePath={item.originPath || item.sourcePath} />
                      <div className="grid gap-3 rounded-3xl border border-border/70 bg-muted/20 p-4 md:grid-cols-4">
                        <Button
                          variant="outline"
                          onClick={() => onDelete(item.docId, { mode: "records_only" })}
                          disabled={busy}
                          className="h-12 justify-start rounded-2xl"
                        >
                          只移除记录
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => onDelete(item.docId, { mode: "exports_only" })}
                          disabled={busy}
                          className="h-12 justify-start rounded-2xl border-amber-200 text-amber-800 hover:bg-amber-50"
                        >
                          清理项目导出
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={() => onDelete(item.docId, { mode: "records_and_artifacts" })}
                          disabled={busy}
                          className="h-12 justify-start rounded-2xl"
                        >
                          <Trash2 className="h-4 w-4" />
                          删除生成链路
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => onDelete(item.docId, { mode: "records_artifacts_and_source" })}
                          disabled={busy}
                          className="h-12 justify-start rounded-2xl border-red-200 text-red-700 hover:bg-red-50"
                        >
                          清理源副本
                        </Button>
                      </div>
                    </div>

                    {visibleRounds.length ? (
                      <>
                        <Separator className="my-5" />
                        {!activeRounds.length ? (
                          <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                            当前模式没有轮次，下面展示这篇文档在其他模式下的历史轮次。
                          </div>
                        ) : null}
                        <div className="grid gap-3">
                          {visibleRounds.map((roundItem) => {
                            const roundPromptProfile = (roundItem.promptProfile || "cn") as ModelConfig["promptProfile"];
                            const roundPromptOptions = getPromptOptions(roundPromptProfile, roundItem.promptSequence ?? promptSequence);
                            return (
                              <div key={`${item.docId}-${roundItem.promptProfile}-${roundItem.round}-${formatPromptSequence(roundItem.promptSequence)}`} className="rounded-3xl border border-violet-200 bg-violet-50/60 p-5">
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                  <div className="min-w-0 space-y-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <Badge variant="secondary">第 {roundItem.round} 轮</Badge>
                                      <Badge variant="outline">{getProfileLabel(roundPromptProfile)}</Badge>
                                      {roundPromptProfile === "cn_custom" ? <Badge variant="outline">{formatPromptSequence(roundItem.promptSequence)}</Badge> : null}
                                      <Badge variant="outline">{formatTimestamp(roundItem.timestamp)}</Badge>
                                    </div>
                                    <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                                      <span>输入分块：{roundItem.inputSegmentCount ?? "-"}</span>
                                      <span>输出分块：{roundItem.outputSegmentCount ?? "-"}</span>
                                      <span>分块上限：{roundItem.chunkLimit ?? "-"}</span>
                                    </div>
                                    <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">{roundItem.outputPath ? formatPathScope(roundItem.outputPath) : "暂无输出路径"}</p>
                                    <ArtifactStats stats={roundItem.artifactStats} />
                                    <ArtifactGovernanceMap stats={roundItem.artifactStats} sourcePath={item.originPath || item.sourcePath} compact />
                                  </div>

                                  <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
                                    <Button variant="outline" size="sm" onClick={() => onDownload(roundItem, "txt")} disabled={busy || !roundItem.outputPath}>
                                      <Download className="h-4 w-4" />
                                      TXT
                                    </Button>
                                    <Button size="sm" onClick={() => onDownload(roundItem, "docx")} disabled={busy || !roundItem.outputPath}>
                                      <Download className="h-4 w-4" />
                                      Word
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => onDelete(item.docId, { ...roundPromptOptions, fromRound: roundItem.round, mode: "exports_only" })}
                                      disabled={busy}
                                    >
                                      清理项目导出
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => onDelete(item.docId, { ...roundPromptOptions, fromRound: roundItem.round, mode: "records_and_artifacts" })}
                                      disabled={busy}
                                    >
                                      回滚到本轮前
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    ) : (
                      <div className="mt-5 rounded-2xl border border-dashed border-border bg-muted/20 p-4 text-sm leading-6 text-muted-foreground">
                        这篇文档在当前模式下还没有轮次记录。可能是在别的提示词模式下处理过。
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-6 text-center">
            <h3 className="text-base font-semibold">还没有历史记录</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">跑过的文档会自动出现在这里，之后可以直接回来继续处理或导出。</p>
          </div>
        )}

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="rounded-3xl border border-border/70 bg-muted/20 p-4">
            <div className="grid gap-3 text-sm md:grid-cols-4">
              <div className="rounded-2xl bg-white/80 p-3">
                <div className="font-black text-foreground">只移除记录</div>
                <div className="mt-1 leading-6 text-muted-foreground">只隐藏索引，不删除生成文件。</div>
              </div>
              <div className="rounded-2xl bg-white/80 p-3">
                <div className="font-black text-foreground">清理项目导出</div>
                <div className="mt-1 leading-6 text-muted-foreground">只删项目内 Word/TXT 副本。</div>
              </div>
              <div className="rounded-2xl bg-white/80 p-3">
                <div className="font-black text-foreground">删除生成链路</div>
                <div className="mt-1 leading-6 text-muted-foreground">删除轮次和中间产物，源文档保留。</div>
              </div>
              <div className="rounded-2xl bg-white/80 p-3">
                <div className="font-black text-foreground">清理源副本</div>
                <div className="mt-1 leading-6 text-muted-foreground">只删除项目 origin 内源文件副本，外部路径不碰。</div>
              </div>
            </div>
          </div>
          <OrphanGovernancePanel
            scan={orphanScan}
            busy={busy}
            onScan={onScanOrphans}
            onDelete={onDeleteOrphans}
          />
        </div>
      </CardContent>
    </Card>
  );
}
