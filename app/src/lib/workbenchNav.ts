import { Activity, BarChart3, FileText, History, Home, Settings, ShieldCheck } from "lucide-react";

export type WorkbenchView = "home" | "quality" | "model" | "prompts" | "protection" | "history" | "diagnostics";

export const WORKBENCH_NAV_ITEMS = [
  { view: "home", label: "工作台", description: "导入文档、运行改写并审阅差异", icon: Home },
  { view: "quality", label: "降检报告", description: "对比原文与分轮风险信号，定位问题段落", icon: BarChart3 },
  { view: "model", label: "模型配置", description: "管理连接、服务商与轮次路线", icon: Settings },
  { view: "prompts", label: "提示词", description: "维护改写策略与流程模板", icon: FileText },
  { view: "protection", label: "保护区地图", description: "检查正文边界与受保护结构", icon: ShieldCheck },
  { view: "history", label: "历史记录", description: "恢复文档、轮次与导出资产", icon: History },
  { view: "diagnostics", label: "启动诊断", description: "检查本地服务与运行环境", icon: Activity },
] satisfies Array<{
  view: WorkbenchView;
  label: string;
  description: string;
  icon: typeof Home;
}>;
