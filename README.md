# FYADR

Fuck your AI detection rate 是一个本地运行的中文论文改写、审阅和 Word 导出辅助工具。

项目重点不是“生成一篇新论文”，而是把用户已经写好的论文或技术文档按段落进行多轮自然化改写，并尽量守住事实、术语、编号、引用、正文范围和 Word 版式。

> 本项目不提供 AIGC 检测服务，也不保证通过任何学校、期刊或第三方平台检测。

## 适用场景

- 中文毕业论文、课程论文、摘要、技术文档的段落级改写。
- 使用长思考模型或自建 AI 中转站做慢速但质量更高的改写。
- 对 DOCX 做“只改正文、保护版式”的导出。
- 管理多轮历史、断点续跑、导出文件和提示词版本。

## 它不会做什么

- 不内置检测平台，不声称能测出真实 AI 率。
- 不自动改目录、图表、表格、公式、参考文献、封面等保护区内容。
- 不把 API Key 写入仓库；Web 配置保存在本机用户目录。
- 不重复调用同一段生成多份结果做自动竞赛，避免浪费 token。
- 不替代学校、导师、期刊的学术诚信要求。

## 功能概览

- 本地 Web UI：React、Vite、Tailwind、shadcn/ui 风格组件。
- 暗黑 / 浅色 / 系统主题：默认暗黑模式。
- 模型配置：支持 OpenAI 兼容的 Chat Completions 和 Responses 风格接口。
- 多服务商管理：可配置多个 provider，并为不同轮次指定不同模型。
- 自定义改写流程：默认支持“润色改写 -> 规范改写 -> 专家改写”，可调整流程组合。
- 提示词 CRUD：可新建、修改、删除自定义 prompt；内置 prompt 支持恢复默认。
- 并发改写：后端按 chunk 并行请求模型，最高并发 16，结果按原文顺序恢复。
- 长请求容错：默认请求超时 600 秒，失败重试默认 3 次，带指数退避和随机抖动。
- 断点续跑：中断或异常后保留已完成 chunk，下次优先从 checkpoint 继续。
- 高风险审阅：模型输出未通过硬校验时，如果有可读输出，会进入高风险审阅而不是静默丢弃。
- Word 导出保护：DOCX 导出只回写可编辑正文，保护目录、图表、表格、公式、参考文献等。
- 学校规范辅助：解析学校格式要求，导出时生成审计、预检和保护区报告。
- 导出健康状态：前端汇总保护、审计、预检和 Word 结构状态，并区分阻断问题和非阻断提示。
- SQLite 历史治理：用 SQLite 做历史索引，保留 JSON 兼容记录，并支持修复、备份、压缩、孤儿文件扫描。

## 系统要求

建议环境：

- Windows 10/11
- Python 3.10+
- Node.js 18+
- npm

项目当前主要按 Windows 本地工具使用设计。macOS / Linux 可以手动启动后端和前端，但启动脚本主要服务 Windows。

## 快速开始

在项目根目录执行：

```powershell
pip install -r requirements.txt
cd app
npm install
cd ..
.\start_web.ps1
```

也可以直接双击：

```text
start_web.bat
```

默认地址：

- 前端页面：http://127.0.0.1:1420
- 后端 API：http://127.0.0.1:8765
- 后端探针：http://127.0.0.1:8765/api/ping
- 后端诊断：http://127.0.0.1:8765/api/health

如果不想自动打开浏览器：

```powershell
.\start_web.ps1 -NoBrowser
```

## 手动启动

开两个终端。

终端 1，启动后端：

```powershell
python scripts/web_app.py
```

终端 2，启动前端：

```powershell
cd app
npm run dev:web
```

## 基本使用流程

1. 打开 Web 页面。
2. 进入模型配置，填写 Base URL、API Key、模型名和接口类型。
3. 点击连通性测试，确认本地服务可以访问模型服务商。
4. 上传 TXT 或 DOCX。
5. 选择改写流程和轮次数。
6. 设置并发、超时、重试等参数。
7. 开始改写。
8. 运行中断时，直接继续当前轮；系统会优先复用 checkpoint。
9. 轮次完成后，在 Diff 区审阅需处理和高风险内容。
10. 满意后导出 TXT 或 DOCX。
11. 不满意时，可以继续追加后续轮次，不会强制把当前轮认定为最终结果。

## 模型配置

Web 端模型配置保存在本机，不写入仓库：

- Windows：`%APPDATA%\FYADR\config.json`
- 其他系统：`~/.fyadr/config.json`

配置项包括：

- `baseUrl`：模型服务地址。
- `apiKey`：模型密钥。
- `model`：默认模型名。
- `apiType`：`chat_completions` 或 `responses`。
- `temperature`：温度。
- `requestTimeoutSeconds`：单次请求超时，默认 `600`，范围 `30` 到 `3600`。
- `maxRetries`：失败重试次数，默认 `3`，范围 `0` 到 `10`。
- `rewriteConcurrency`：改写并发，默认 `2`，最高 `16`。
- `modelProviders`：多服务商列表。
- `roundModels`：每轮单独模型路由。

前端读取配置时会拿到脱敏字段，API Key 不会完整回传给浏览器界面。已保存密钥用占位符和尾号预览表示。

## 并发与长思考模型

本项目的改写请求大多是网络 I/O 密集型。并发可以明显减少整轮等待时间，但不是越高越稳。

当前并发档位：

```text
1, 2, 3, 4, 6, 8, 12, 16
```

建议：

- 普通 API：从 `2` 或 `4` 开始。
- 自建中转站：先用 `4` 验证稳定性，再尝试 `6`、`8`、`12` 或 `16`。
- 长思考模型：建议把超时保持在 `600` 秒或更高。
- 如果上游经常 500、502、503、504：先降低并发，再观察重试是否能恢复。
- 如果只剩一个 chunk 卡住，可以中断后继续；已完成 chunk 会保留。

后端会把 chunk 并行提交给模型，但写回和 compare 数据会按原文 chunk 顺序恢复，避免 Diff 顺序错乱。

## 改写算法思路

核心流程：

1. 从 TXT 或 DOCX 提取可编辑正文。
2. 按项目当前分段策略构建 chunk manifest。
3. 每个 chunk 拼接当前轮 prompt、语言约束、段落约束、引用和结构保护约束。
4. 并发调用模型。
5. 对输出做结构、编号、引用、数字、术语、语言、长度和事实关系校验。
6. 校验失败时追加修复提示重试。
7. 多次失败但模型有输出时，把输出作为高风险内容放入审阅。
8. 恢复为完整文本并保存 Diff compare 数据。
9. 写入历史记录、checkpoint、质量摘要和审阅决策。

项目会保护这些内容：

- 引用标记，如 `[1]`、`[3-5]`。
- 关键数字、比例、公式样式数字。
- 结构编号，如 `1`、`1.1`、`1.1.1`、`（1）`、`1）`。
- 术语和事实关系。
- 英文段落语言稳定性。
- 段落数量和段落角色。

自动编号段落本身可以参与改写，但编号标记会被保护，避免模型把章节结构改乱。

## 提示词体系

当前内置 prompt：

| ID | UI 名称 | 文件 |
| --- | --- | --- |
| `prewrite` | 润色改写 | `prompts/prewrite.md` |
| `classical` | 经典改写 | `prompts/classical-rewrite.md` |
| `round1` | 规范改写 | `prompts/rewrite-pass-1.md` |
| `round2` | 专家改写 | `prompts/rewrite-pass-2.md` |

默认可见流程：

```text
润色改写 -> 规范改写 -> 专家改写
```

相关文件：

- `prompts/prompt-registry.json`：prompt 注册表。
- `prompts/prompt-workflows.json`：改写流程注册表。
- `prompts/defaults/`：内置 prompt 默认版本。
- `prompts/custom/`：用户新建 prompt。
- `finish/prompt_backups/`：修改 prompt 前的自动备份。

提示词 UI 支持：

- 新建自定义 prompt。
- 修改名称、描述和正文。
- 删除自定义 prompt。
- 保存当前内容。
- 恢复内置默认版本。
- 查看并恢复 prompt 备份。
- 修改自定义流程组合。

内置 prompt 可以编辑，但不能删除；自定义 prompt 可以删除。

## DOCX 正文保护与导出

DOCX 处理目标是：只改正文，最大限度保留原 Word 的结构和版式。

默认正文范围：

```text
从“摘要”开始，到“致谢”结束
```

正文之外会尽量保护：

- 封面。
- 目录。
- 页眉页脚相关字段。
- 图、图题、图注。
- 表格、表题、表注、表格内文字。
- 公式。
- 参考文献。
- 附录和其他后置材料。

导出策略：

- 优先基于原 DOCX 的 body map 回写正文段落。
- 只允许回写顶层正文段落，不把表格单元格当正文改写。
- 导出前检查正文段落数量、目标顺序、重复目标、空段落、语言漂移和长度异常。
- 导出后生成 guard、audit、preflight 等报告。
- 学校规范明确的格式要求优先应用。
- 学校规范未说明的段前、段后、缩进、样式细节，优先沿用上传 DOCX 的原有格式，避免无依据重排。

如果导出失败，通常是正文映射不一致、Word 结构异常、段落数量变化或保护区 guard 拦截。请优先查看导出错误和对应的审计文件。

## 学校规范解析

学校规范用于辅助导出，不会把保护区内容送入模型改写。

当前覆盖方向：

- 标题层级格式。
- 摘要、Abstract、关键词区域。
- 正文常见字体、字号、行距和缩进。
- 图表题注和三线表相关提示。
- 参考文献和致谢区域。
- 页边距、页码等页面要求。

规范中没有明确说明的部分，不应由系统强行臆造。更稳的策略是沿用上传文档自身格式，并在审计报告中提示缺失或不确定项。

## 高风险与需处理

Diff 区主要有三类需要关注的内容：

- 需处理：模型输出通过基本校验，但质量摘要提示需要确认。
- 高风险：模型给出了输出，但硬校验认为它可能改变了编号、术语、事实、语言或结构。
- 失败：重跑或改写请求本身失败，需要继续、重试或回退。

高风险默认更保守，系统不会自动采用危险输出。用户可以在 Diff 区查看原文、安全文本、模型输出和失败原因，再决定采用哪个版本。

## 历史记录与 SQLite

项目保留兼容 JSON 记录，同时使用 SQLite 做历史索引和治理。

主要文件：

- `finish/fyadr_records.json`：兼容历史记录。
- `finish/fyadr_history.sqlite3`：SQLite 历史索引。
- `finish/history_db_backups/`：SQLite 自动或手动备份。
- `finish/intermediate/`：中间文件、manifest、checkpoint、compare、quality、body map。
- `finish/web_exports/`：Web 导出副本。
- `origin/`：上传的原始文档副本。
- `logs/`：本地日志。

SQLite 负责：

- 文档、轮次、产物引用的索引。
- 历史列表查询。
- 删除影响预览。
- 孤儿产物扫描和清理。
- 数据库健康检查。
- 自动修复、备份和压缩。

`finish/`、`origin/`、`logs/` 是本地运行目录，默认不应提交到公开仓库。

## 环境变量

常用环境变量：

| 变量 | 作用 |
| --- | --- |
| `FYADR_API_KEY` | CLI 脚本默认 API Key |
| `FYADR_MODEL` | CLI 脚本默认模型 |
| `FYADR_BASE_URL` | CLI 脚本默认 Base URL |
| `FYADR_API_TYPE` | CLI 脚本默认接口类型 |
| `OPENAI_API_KEY` | 当 `FYADR_API_KEY` 为空时作为兼容输入 |
| `OPENAI_BASE_URL` | 当 `FYADR_BASE_URL` 为空时作为兼容输入 |
| `FYADR_ALLOWED_ORIGINS` | 额外允许访问本地 API 的前端 Origin，逗号分隔 |
| `FYADR_MAX_REQUEST_BYTES` | JSON 请求体上限，默认 64 MB |
| `FYADR_MAX_UPLOAD_BYTES` | 单文件上传上限，默认 40 MB |
| `VITE_FYADR_API_BASE` | 前端构建后访问的后端 API 地址 |

本地开发通常不需要 `.env`。如果要配置，可参考：

- `.env.example`
- `app/.env.example`

不要提交真实 `.env`、API Key、私有中转地址或个人路径。

## 目录结构

```text
.
├─ app/                         # React Web 前端
├─ docs/                        # 开发、发布和检查文档
├─ prompts/                     # 内置 prompt、默认版本、注册表和自定义 prompt
├─ references/                  # 优化路线和参考资料
├─ scripts/                     # Flask 后端、算法、导出和回归脚本
├─ start_web.bat                # Windows 一键启动
├─ start_web.ps1                # PowerShell 一键启动
├─ requirements.txt             # Python 依赖
├─ SECURITY.md                  # 安全说明
├─ CONTRIBUTING.md              # 贡献指南
└─ README.md
```

运行后会生成：

```text
origin/
finish/
logs/
app/node_modules/
app/dist/
```

这些目录默认不提交。

## 开发命令

安装依赖：

```powershell
pip install -r requirements.txt
npm --prefix app install
```

前端文本检查：

```powershell
npm --prefix app run check:text
```

前端构建：

```powershell
npm --prefix app run build
```

后端和算法回归：

```powershell
python scripts/run_regressions.py --skip-frontend-build
```

完整回归：

```powershell
python scripts/run_regressions.py
```

发布前总闸：

```powershell
python scripts/pre_release_check.py
```

开源审计：

```powershell
python scripts/open_source_audit.py
```

注意：`history_db_regression.py` 这类历史治理回归可能比较慢，完整回归不是秒级检查。

## 常用专项回归

```powershell
python scripts/state_machine_regression.py
python scripts/parallel_round_regression.py
python scripts/llm_client_regression.py
python scripts/format_rules_regression.py
python scripts/docx_export_regression.py --rebuild-sample
python scripts/web_security_regression.py
npm --prefix app run test:e2e:smoke
```

如果没有本地真实 DOCX 样例，部分真实文档冒烟测试会跳过。

## 常见问题

### 页面提示连不上本地服务

先确认后端是否启动：

```text
http://127.0.0.1:8765/api/ping
```

如果打不开，重新运行 `start_web.bat` 或 `python scripts/web_app.py`。

### 模型测试失败

重点检查：

- Base URL 是否正确。
- API Key 是否正确。
- 模型名是否存在。
- 接口类型是否选对。
- 代理或自建中转站是否可访问。
- 目标服务是否要求 `/v1/chat/completions` 或 `/v1/responses`。

### 长思考模型经常超时

把 `requestTimeoutSeconds` 调到 `600` 或更高。长思考模型单段超过 2 分钟是正常情况。

如果上游服务返回空响应或 500，项目会按重试策略处理。重试仍失败时，保留 checkpoint，用户可以继续当前轮。

### 并发设了但看起来没有跑满

实际并发会受这些因素影响：

- 当前剩余 chunk 数。
- 后端最高并发限制 16。
- 当前运行任务是否已有 checkpoint。
- 轮次是否只剩少量 chunk。
- 上游服务是否限流或返回错误。

如果只剩 1 个 chunk，实际并发自然就是 1。

### 中断后为什么能继续

每个 chunk 完成后都会写入 checkpoint。中断、刷新、后端重启后，只要 checkpoint 兼容，下次执行会跳过已完成 chunk。

如果用户明确放弃当前进度，系统会清理对应轮次 checkpoint；此后再启动会按新的轮次状态计算。

### 导出 Word 失败

常见原因：

- 原 DOCX 结构复杂，正文范围识别不稳定。
- 改写后段落数量不一致。
- body map 指向的段落已变化。
- 输出包含异常换行。
- 保护区 guard 认为导出会破坏正文外内容。

优先查看页面提示，以及 `finish/web_exports/` 和 `finish/intermediate/` 中生成的 audit、guard、preflight 文件。

### 上传提示文件过大

默认单文件上传上限是 40 MB。可以用环境变量调整：

```powershell
$env:FYADR_MAX_UPLOAD_BYTES = "83886080"
python scripts/web_app.py
```

### API Key 会不会进仓库

Web 配置保存在系统用户目录，不在项目目录。前端不会把完整 API Key 缓存在 localStorage。

开源前仍建议运行：

```powershell
python scripts/open_source_audit.py
git status --short
git ls-files -ci --exclude-standard
```

## 安全与隐私

- 不要把真实论文、检测报告、API Key、私有模型地址、个人路径提交到公开仓库。
- 不要在 Issue 里粘贴完整论文或完整检测报告。
- 需要报错复现时，优先构造最小样例。
- Web 后端默认只允许本机前端 Origin 访问。
- 如果通过 `FYADR_ALLOWED_ORIGINS` 放开访问，请确认自己知道风险。

## 开源发布前检查

建议至少执行：

```powershell
npm --prefix app run check:text
npm --prefix app run build
python scripts/open_source_audit.py
python scripts/run_regressions.py --skip-frontend-build
git status --short
```

发布前人工确认：

- `finish/`、`origin/`、`logs/` 没有被提交。
- 没有真实 DOCX、PDF、截图、数据库和浏览器缓存。
- README、启动脚本、回归命令与实际代码一致。
- Prompt 变更是明确需要的，不是顺手改动。
- `CHANGELOG.md` 和发布检查文档已同步更新。

## 项目来源与致谢

本项目早期基础设施和使用思路参考了 [baibaiAIGC](https://github.com/poleHansen/baibaiAIGC)。

部分中文改写 prompt 的设计参考了 [Linux.do](https://linux.do/) 社区中的公开讨论、经验总结和用户整理内容。当前 prompt 已重新整理为适配本项目流程的版本。继续分发或二次开发时，请尊重原社区内容贡献者和对应平台规则。

## 协议

本项目以 AGPL-3.0 协议发布，详见 [LICENSE](LICENSE)。
