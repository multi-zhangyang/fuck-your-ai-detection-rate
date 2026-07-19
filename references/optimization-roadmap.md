# FYADR 优化路线图

## 当前事实快照（最终质量审计后）

> 本节优先级高于下方按轮次记录的历史条目。下方关于“知网 4.0 对标”、
> 强制句长比例、短句配额、被动句/长定语配额、结构 OOD 强制收敛、
> 逗号改句号和具体检测平台分数的内容属于已经撤回的实验记录，不能用于描述当前产品，
> 也不构成任何第三方检测通过承诺。

- 当前主线是保守型学术编辑：事实、否定范围、因果关系、术语、数值、单位、引用、公式、代码和段落角色优先于风格变化；自然文本可以少改或不改。
- 风格统计仅作相对诊断和人工审阅提示。P90/P10、变异系数、短碎句率、重复开句与连接词密度不能判断作者身份，也不得驱动无信息变形。
- 无解析器的确定性标点改写已禁用；兼容函数始终返回原文。定向重跑不得强塞短句、被动句、长“的”链或删除必要逻辑连接词。
- `chunk_limit` 重新成为真实分块合同；普通段落完整送入模型，只有超长段落才在完整句界切分。
- DOCX `preserve_original` 已升级为 snapshot v10 与阻断式 OOXML 格式锁；快照额外绑定源文件 SHA-256，避免仅恢复大小/mtime 时绕过范围冻结；超链接、字段、OMML、VML/OLE、表格、关系、section、样式、编号、页眉页脚、复杂内容控件与修订结构均有保护或硬失败边界。
- 同名文档采用内容寻址源文件目录与规范化文档身份哈希中间产物；旧产物只有在唯一归属可证明时只读兼容，歧义路径拒绝恢复。
- 前端已经完成响应式、错误恢复、无障碍、状态一致性、安全存储、草稿离开保护、模型配置验证与审阅保存队列；剩余优化应以真实性能测量和新回归为前提，不沿用下方旧行数或 bundle 数字。
- 外部平台分数、像素级 Word 分页、私有 OOXML 扩展渲染和未运行的真实样本均属于明确边界，不得以合成回归替代声明。
- RateAudit 已把原文基线、分轮结果、五维启发式风险、问题段落热区和 Diff 定位收成一个可执行闭环；风险点数仅用于同文相对比较，`isAiDetector=false`，不冒充第三方 AI 率。

## RateAudit 功能跃迁（2026-07）

- 新增纯分析核心 `rate_audit.py`：将现有机器式表达信号归并为“句法与节奏、衔接脚手架、模板与空泛表达、段落与枚举结构、语态与语域”五个可解释维度。
- 新增 `/api/rate-audit`：读取原文可编辑正文、同一路线历史轮次和当前 compare chunk，生成原文→各轮轨迹、维度 delta、热区排名和最多三项下一步策略，全程离线且不消耗模型 Token。
- “改写检查”升级为“降检报告”：上传后即可看原文基线，完成轮次后显示风险点变化，问题段落可直接定位到 Diff；事实、引用、数字和 Word 导出完整性继续作为独立硬边界保留在同一页面。
- 新增 `RATE_AUDIT_MAX_CHARS=300_000`、最多 12 个热区、显式截断标记、历史阶段选择和请求竞态保护；阶段风险判断复用已计算指标，避免长文本重复扫描；补齐纯算法、Flask 路径边界、前端连通性与浏览器导航回归。

## 核心目标

1. 改写结果更自然，尽量减少机械化表达痕迹。
2. Word 导出稳定，正文可改写，目录、图表、表格、公式、参考文献等保护区内容不被误改。
3. **诚实执行**：校验失败就是失败，禁止“回落原文后装作本轮成功”。

## 当前主线

- 段落级生成：正文按自然段处理，避免把多个自然段合成大块后统一改写。
- Prompt 编排：润色 / 规范 / 专家分层，并支持自定义追加轮次与模型。
- 模型编排：服务商先集中配置，主页按轮次选择模型。
- 差异反馈：Diff 区优先展示正文变化、需处理、高风险和失败块。
- 导出审计：导出前后检查段落数量、引用、数字、保护占位符、表格和样式应用情况。
- **硬失败语义**：轮次校验耗尽、定向重跑校验耗尽，直接失败并保留 checkpoint / 诊断，不再静默 source-fallback。

## 已完成的硬改

- 拆掉 `source-fallback` 伪装成功路径。
- 拆掉 targeted rerun “fallback 也算成功继续推进”的假门禁。
- 扩展模板/连接词/空泛填充/句长整齐度检测，风格门禁真正拦截。
- 升级内置 prompt：更强 burstiness、去模板、具体动词、禁检测友好套话。
- 前端视觉系统：更清晰的卡片层次、玻璃顶栏、Diff/控制台阴影层次。

## 待增强方向

- 历史记录：继续细分“记录、源文档、中间产物、导出副本、报告文件”的影响范围。
- 导出完整性：继续增强 DOCX 文本一致性、保护区结构、英文空格和格式锁回归。
- 学校格式说明解析/套版不在当前产品路线内；外部规则不应成为源 DOCX 之外的第二个格式真相源。
- UI 一致性：继续统一按钮颜色语义、通知中心和页面主次关系。
- 性能渲染：`App.tsx` 仍是 1722 行单体组件，`progress` 流式 tick 会触发整树重渲染；待引入 `React.memo`/`useCallback` 与按视图拆分（`HomeView`/`HistoryView` 等），把流式进度隔离到独立徽标组件，避免每次 tick 重渲染主视图。
- 开源体验：持续清理本地样例、个人路径、敏感配置和乱码文档。

## 本轮已完成的后端/前端加固（2026-07）

- 端点输入边界（`maxChars`、备份 `keep`、`roundNumber`、`mode`/`maxAgeHours`）全部加钳制与安全整型校验，消除放大响应与“`keep=0` 清空全部备份”隐患。
- `recover_history_database_governance` 改用上下文管理器；`WEB_HOST`/`WEB_PORT` 常量化并清理启动日志；7 个 prompt 端点错误状态统一为 400 并合并冗余 catch。
- 前端 `formatBytes` 去重、跨模块 re-export 收敛、表单字段补 `htmlFor`/`id` 关联并回归锁定。
- `App.tsx` import 区清理 116 个未用导入指示符（早期 `TaskPhase = string` 收敛、`historyHelpers` 拆分后残留的死引用）；修正 UI 一致性回归中过时的 `SidebarMenuButton` 断言——改为检查实际承载菜单项的 `AppSidebar.tsx`，反映 sidebar 拆分后的真实结构。

## 本轮性能 / UI / 算法 / 格式加固（2026-07 第 2 轮）

- **性能（health 端点瘦身）**：实测 `/api/health` 本地 0.227s（ping 的 100 倍），根因 `summarize_workspace_path(ROOT_DIR)` 用 `rglob("*")` 遍历整个项目（含 `.git/.venv/node_modules/dist` 数万文件）= 188ms。改为手动遍历 + 剪枝 `WORKSPACE_STAT_SKIP_DIRS`，跳过 git/venv/node_modules/dist 等数据无关重目录，耗时降到 ~0.025s（9 倍），且 `fileCount` 更准（只统计真实源文件，不再把 node_modules 当 workspace 数据）。progress 走 SSE 长连接（`/api/run-round-events`）非轮询 health，故 health 不在热路径。
- **前端 UI（语义色 + a11y）**：`badge.tsx` 的 `success/warning/info/brand` 之前全是 `bg-muted text-foreground`（与 default 无法区分）；新增 `--warning`/`--info` CSS 变量（light+dark）+ tailwind 颜色映射，各变体真正着色。中断按钮 spinner 从绿色成功色改为中性色（消除"红色危险按钮配绿色 spinner"的语义错乱），并去重 `RoundRunStatusCard` 的本地 `LOADING_ICON_CLASS_NAME` 重复定义。新增 `LOADING_ICON_NEUTRAL_CLASS_NAME`，原绿色常量保留以兼容回归断言。`global.css` 加 `prefers-reduced-motion` 全局规则，关闭动效偏好下停用动画。
- **前端体积（logo）**：`brand-logo.png` 1024×1024/713KB 仅用于 44px 侧栏 + 16px favicon，改为 96px WebP 4.3KB + 32px favicon PNG 1.9KB（像素差异 1.14/255 肉眼不可辨），首屏减负 99.4%，源图归档至 `assets-source/`（不进构建）。
- **核心算法（连接词门禁补盲）**：`MECHANICAL_CONNECTOR_RE` 补 `一方面/另一方面/反之/再者/其一其二其三`；`AI_BURST_CONNECTOR_RE` 补 `第一/第二/第三`（带词边界 `[，,、是]` 防"第一部分/第二章"误伤）。实测此前 density=0 的 AI 对仗结构现被检出，且不误伤正常章节引用、不误匹配 `@@FYADR_*@@` 保护区占位符。硬失败回归（validation_fallback/single_output_retry/targeted_rerun）全绿。

## 待增强方向（第 2 轮调研产出，已有落地蓝图）

- **格式保真锁定模式（已完成并继续收紧）**：`preserve_original` 已从“默认模式”升级为唯一产品模式；旧 `school_rules` 配置和显式参数只做兼容迁移，不再驱动解析、诊断或格式写回。正文与格式契约在每轮前后和导出前后验证标题泄漏、冻结目标、模型输入、保护区、OOXML 与段落格式签名，不再允许任何可选格式写回旁路。
- **AI 检测护城河深度**：补被动句比例、四字成语密度指标（当前零覆盖）；burstiness ratio（max/min 句长，仅方差漏检四句均匀长句）；短 chunk(<80 字符)风格校验下探；评估统计特征工程化闭环（改写→打分→定向重写）与本地困惑度代理。
- **核心算法 prompt 对齐**：连接词/套话黑名单在 prompt 与代码 4 处重复维护易漂移，需统一。
- **性能剩余项**：`list_records` 双读+sha256+可能写盘可加进程内缓存；SQLite 无 WAL/无连接复用；后端启动即全量 import docx 全家桶可改懒加载；生产构建 + nginx 反代 + gzip + 长缓存替代 dev 模式公网部署（详见 Docker 部署方案）。

## 本轮格式保真 / 核心算法 / 调研落地（2026-07 第 3 轮）

- **A 格式保真锁定模式（已落地并升级为硬契约）**：`formatMode = preserve_original` 是唯一产品路径。机制：以原 DOCX 每个 run/段落的 OOXML `pPr`/`rPr` 为唯一真相源，只回填冻结正文的 `w:t`；`_polish_rewritten_paragraph(preserve_format=True)` 不注入字体；导出后 `audit_docx_format_lock` 阻断任何格式漂移。`document_edit_contract.py` 进一步把源 SHA、范围摘要、格式摘要、标题计数、输入一致性和四类导出审计统一成 `pre_run/post_round/pre_export/post_export` 硬门；旧 `school_rules` 仅作为配置迁移别名，归一化为 `preserve_original`。
- **C 核心算法 CNKI-4.0 维度（已落地，基于 Exa 重调研 2025-2026）**：调研结论——知网 4.0 已升级到“看底层结构而非单词”，纯 LLM prompt 改写（换词/模板）2026 多数情况 AI 率反升；有效且难被封堵的是结构 OOD 偏移 + 连续可控风格迁移 + 检测器在回路诊断闭环（见 memory `ai-detection-frontier-2026`）。本轮先落地可立即用的统计维度：`PASSIVE_VOICE_RE`（被/予以/加以/为…所/受到/得以）+ `CHENGYU_RE`（至关重要/不言而喻/举足轻重/相辅相成/显而易见/日益完善/蓬勃发展…）+ 句长突发比（max/min）；`_assess_machine_like_risks` 新增 `passive_voice_overuse`/`chengyu_density_high`/`low_burstiness_ratio` 顾问风险；`prewrite` 默认流程补 5 条 CNKI-4.0 指向指令（句长突发性、连接词分布不均、论证深度起伏、被动句克制、成语减密）。新增 `style_dimensions_regression.py` 锁定。
- **调研归档**：两 Exa 子代理（护城河深度 + 通用策略）产出 2025-2026 全新证据，已入 memory `ai-detection-frontier-2026`（MASH/StyleShield/Adversarial Paraphrasing/Structural Shifts/StealthRL/知网4.0 五维/维普万方）。

## 待增强方向（第 3 轮后续）

- **中文连续可控风格迁移引擎**（对标 StyleShield/MASH，最高壁垒）：轻量 0.1–1B 风格改写模型 + 中文检测器在回路 DPO + 单参数连续控制“改写强度↔保真”+ RateAudit 定向调率。prompt 调优做不到的工程壁垒。
- **多维度诊断 + 定向改写闭环**（对标知网6维逆向 + RateAudit）：段落级诊断（句长std/AI高频词/信息熵/段落结构/过渡词/跨段一致性）→ 分维度定向改写 → 对接知网/维普/万方复检。
- **结构层 OOD 策略库**（对标 structural shifts）：历史语域/意识流/探索式逻辑 prompt 策略，最难被封堵、成本最低。
- **核心算法 prompt 对齐**：连接词/套话/被动/成语黑名单在 prompt 与代码多处重复维护易漂移，需统一为单一来源。
- **D 前端 UI（P1/P2）**：live region/aria-live、阴影 token、App.tsx 拆 HomeView/HistoryView + progress 状态隔离到独立 Provider + React.memo/useCallback 把流式 tick 重渲染范围从 ~30 组件降到 Home 内 3 个；Skeleton 列表长加载；统一 CardTitle。

## 回归底线

- 核心 prompt 变更必须明确、有意、可回滚。
- 不让模型处理目录、图表、表格、公式、参考文献等内容。
- 不在没有审计结果的情况下宣称 Word 导出安全。
- 不重新引入外部检测报告解析链路。
- **不允许再加“失败变成功”的 fallback 门禁。**
