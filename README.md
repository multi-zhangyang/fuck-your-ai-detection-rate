# Fuck your AI detection rate

这是一个面向中文论文、摘要和技术文档的多轮改写与 Word 导出辅助项目。

项目本身不提供外部平台 AIGC 检测能力；如果接入 SpeedAI、PaperPass 等外部报告，报告只作为定位反馈和复盘记录使用，不作为自动判定依据。

项目核心边界：

- 正文按段落改写，尽量保留事实、术语、编号、引用和段落角色。
- 目录、图表、表格、公式、参考文献等保护区内容不交给模型改写。
- 学校规范用于导出样式和审计提示，不直接改写保护区正文。
- 外部报告只用于定位问题段和复盘策略，不作为唯一改写依据。

## 先看这个

如果你只是想打开 Web 端，按下面做：

1. 先安装依赖
2. 双击根目录的 `start_web.bat`
3. 浏览器打开 [http://127.0.0.1:1420](http://127.0.0.1:1420)

如果你更习惯 PowerShell，也可以在项目根目录运行：

```powershell
.\start_web.ps1
```

## 运行前准备

### Python 依赖

```powershell
pip install -r requirements.txt
```

### 前端依赖

```powershell
cd app
npm install
```

## 一键启动 Web 端

项目根目录已经提供了两个启动脚本：

- `start_web.bat`
- `start_web.ps1`

它们会做这些事：

- 检查 `python` 和 `npm` 是否可用
- 检查 `app/node_modules` 是否已经安装
- 自动启动本地后端 `http://127.0.0.1:8765`
- 自动启动前端开发服务 `http://127.0.0.1:1420`
- 尝试自动打开浏览器

推荐直接双击 `start_web.bat`。

## 手动启动 Web 端

如果你想手动开两个窗口，也可以这样做。

### 1. 启动后端

```powershell
python scripts/web_app.py
```

后端默认地址：

- API: `http://127.0.0.1:8765`
- 健康检查: `http://127.0.0.1:8765/api/health`

### 2. 启动前端

```powershell
cd app
npm run dev:web
```

前端默认地址：

- Web 页面: `http://127.0.0.1:1420`

### 可选前端环境变量

本地开发通常不需要配置环境变量；如果前端和后端分开部署，可以复制 `app/.env.example` 为 `app/.env`，再填写：

- `VITE_FYADR_API_BASE`：前端请求的后端地址，例如 `http://127.0.0.1:8765`

### 可选脚本环境变量

如果只使用命令行脚本，也可以复制根目录 `.env.example` 作为自己的本地环境变量参考。不要把真实 `.env`、API Key 或私有模型地址提交到公开仓库。

### 本地模型配置保存位置

Web 端保存的模型服务商、轮次模型、超时、重试和速率限制不会写进仓库，默认保存在系统用户目录：

- Windows：`%APPDATA%\FYADR\config.json`
- 其他系统：`~/.fyadr/config.json`

这个文件可能包含 API Key，不要提交到公开仓库。

## Web 端使用顺序

推荐这样用：

1. 打开 Web 页面
2. 先填写模型配置并保存
3. 先点一次“测试连通性”
4. 导入 `txt` 或 `docx`
5. 点击“开始 / 继续第 N 轮”
6. 处理中如果中断，再点一次执行，系统会优先尝试断点续跑
7. 跑完后在历史记录里下载 TXT 或 Word

## 现在补上的稳定性能力

### 1. 断点续跑

每个分块完成后都会保存检查点。

如果中途遇到这些问题：

- 502
- 503
- 429
- 连接被拒绝
- 上游超时
- 流式通道意外断开

再次点击执行时，会优先从已经完成的分块继续，而不是整轮重来。

### 2. 传输层自动重试

对常见临时性错误已经加了自动重试，包括：

- 408
- 409
- 429
- 5xx
- 连接中断
- 连接被拒绝
- 超时

### 3. 防止同一文档重复开跑

同一份文档在运行时，如果你重复点“执行下一轮”，系统会直接拦住，避免状态互相覆盖。

### 4. 可配置超时和重试

Web 端模型设置里现在可以直接调：

- 单次请求超时（秒）
- 失败重试次数

如果你用的上游模型很慢，或者服务偶尔抽风，这两个配置会比较有用。

## 文档与输出目录

- `origin/`：原始输入文档
- `finish/intermediate/`：中间文本、manifest、checkpoint 等
- `finish/web_exports/`：Web 端生成的 TXT 或 DOCX 导出副本，浏览器下载到本地的文件不受历史清理影响
- `finish/fyadr_records.json`：轮次记录
- `prompts/`：核心 prompt
- `scripts/`：后端逻辑
- `app/`：Web 前端

## 不建议改的部分

如果你只是想继续修项目的易用性和稳定性，尽量不要动这些核心改写 prompt：

- `prompts/fyadr-cn-round1.md`
- `prompts/fyadr-cn-round2.md`
- `prompts/fyadr-cn-prewrite.md`
- `prompts/fyadr-cn-classical.md`

其他代码可以继续优化，但涉及分块、导出、保护区和报告匹配时，建议先跑回归检查。

## 常见问题

### 1. 打开页面后提示连不上本地服务

先确认后端是否启动成功：

- 访问 [http://127.0.0.1:8765/api/health](http://127.0.0.1:8765/api/health)
- 如果打不开，先重新执行 `start_web.bat`

### 2. 提示 `WinError 10061` 或连接被拒绝

这通常不是项目核心逻辑坏了，而是模型接口地址不通：

- Base URL 填错了
- 代理没开
- 本地转发没起
- 目标服务本身挂了

### 3. 出现 502 / 503 / 504

这通常是上游模型服务不稳定。

建议：

- 直接重试这一轮
- 适当调大“单次请求超时（秒）”
- 适当增加“失败重试次数”

现在项目已经支持断点续跑，通常不会整轮白跑。

### 4. 进度跑一半断掉了

可以直接再点一次“执行下一轮”。

如果已经有检查点，系统会优先从已完成分块继续。

### 5. 我要提交 Issue，需要提供什么？

先打开 Web 端左侧的“启动诊断”，点击“复制诊断信息”，检查其中没有私密内容后粘贴到 GitHub Issue。请同时写清楚复现步骤、点击了什么按钮、是否刷新过页面、是否从历史记录切换过文档、后端日志或浏览器控制台是否有报错。

不要在 Issue 里粘贴真实论文全文、检测报告原文、API Key、私有模型地址或个人路径。

## 相关入口

- Web 后端：[scripts/web_app.py](scripts/web_app.py)
- 单轮脚本：[scripts/run_fyadr_round.py](scripts/run_fyadr_round.py)
- Web 前端：[app/package.json](app/package.json)
- 贡献指南：[CONTRIBUTING.md](CONTRIBUTING.md)
- 版本记录：[CHANGELOG.md](CHANGELOG.md)
- 发布检查：[docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md)
- 优化路线：[references/optimization-roadmap.md](references/optimization-roadmap.md)
- 隐私与安全：[SECURITY.md](SECURITY.md)
- 自动回归：`.github/workflows/ci.yml`

## 开源发布检查

准备开源或打包前，先确认：

- 没有提交 `finish/`、`origin/`、`logs/` 中的运行产物。
- 没有提交个人论文、检测报告、截图、API Key、私有模型地址或本地绝对路径。
- 运行 `python scripts/open_source_audit.py`；它会拦截疑似 API Key、私有 Base URL、模型厂商 endpoint、个人路径、旧项目名和乱码文本。
- README、启动脚本、回归命令和实际代码保持一致。
- `CHANGELOG.md` 已记录本次发布的主要能力、移除项和已知边界。
- GitHub Actions 已能在 push / Pull Request 时运行完整回归。
- 核心 prompt 的任何变更都是明确、有意、可回滚的。

完整清单见 `docs/RELEASE_CHECKLIST.md`。

## DOCX 导出回归

修改 Word 导出、正文映射、学校规范或 DOCX 审计逻辑前运行：

```powershell
python scripts/docx_export_regression.py --rebuild-sample
```

检查内容：

- 在 `finish/regression/` 下创建本地样例 Word。
- 不调用模型，离线跑一轮改写流程。
- 通过 Web 端同一条导出路径生成 DOCX。
- 审计保护区、表格、标题、参考文献和正文映射数量。
- 写出报告到 `finish/regression/fyadr_regression_report.json`。

## 状态机回归

修改运行、中断、继续、历史记录状态流前运行：

```powershell
python scripts/state_machine_regression.py
```

检查内容：

- 同一文档重复运行会被拦截。
- 中断请求能标记当前任务并发出进度事件。
- 取消未知任务会返回 `404`。
- 已完成任务状态可以被清理释放。
- 后端轮次执行仍接受 `cancel_check`。
- 回归中会加载 `references/school_format_instruction.md` 的确定性学校规则。

更严格的排版验证：

```powershell
python scripts/docx_export_regression.py --rebuild-sample --strict-preflight
```

## 格式规则回归

修改学校规范解析或样式映射前运行：

```powershell
python scripts/format_rules_regression.py
```

检查内容：

- 不调用模型，解析 `references/school_format_instruction.md`。
- 验证页边距、标题、正文、摘要、关键词、参考文献、图表题注、注释和致谢样式。
- 防止标题字符间距被误读成段落缩进。
- 写出报告到 `finish/regression/format_rules_regression_report.json`。

## 完整回归套件

发布前、UI 重构、模型流程调整、报告匹配或 DOCX 导出改动后运行：

```powershell
python scripts/run_regressions.py
```

检查内容：

- 学校规范解析回归。
- SpeedAI / PaperPass 报告解析回归。
- 前端报告片段到 Diff 分块的匹配回归。
- 真实 DOCX 冒烟测试。
- 运行 / 中断状态机回归。
- DOCX 导出回归。
- Python 编译、前端文本检查和前端生产构建。
- 开源审计，检查密钥、个人路径、旧项目名、乱码文档和本地产物提示。
- 写出报告到 `finish/regression/run_regressions_report.json`。

本地快速检查：

```powershell
python scripts/run_regressions.py --skip-frontend-build
```

## 开源审计

准备提交或发布前运行：

```powershell
python scripts/open_source_audit.py
```

检查内容：

- 源码和文档中是否残留 API Key、Token、JWT 等敏感字符串。
- 源码和文档中是否残留个人绝对路径或旧项目名。
- Markdown / 文本文档中是否出现明显乱码。
- `.gitignore` 是否覆盖运行产物、文档样例、检测报告和本地环境文件。
- 本机是否存在论文样例、检测报告、截图、`finish/`、`origin/`、`logs/`、`app/dist/`、`app/node_modules/` 等需要注意的本地产物。

本地样例和运行目录只会作为 warning 提示；真正会让命令失败的是源码或文档中的敏感信息、个人路径、旧项目名、乱码等开源风险。

## 外部报告解析回归

修改 SpeedAI / PaperPass 报告解析或匹配输入前运行：

```powershell
python scripts/detection_report_regression.py
node scripts/detection_matching_regression.mjs
```

检查内容：

- 在本地样例 PDF 存在时识别 SpeedAI 和 PaperPass。
- 验证片段数量、风险百分比、匹配文本和来源兜底逻辑。
- 默认跳过缺失样例 PDF，保证开源仓库仍可运行。
- 写出报告到 `finish/regression/detection_report_regression_report.json`。

## 真实 DOCX 冒烟

修改 DOCX 提取、正文映射、保护区地图或导出回写逻辑前运行：

```powershell
python scripts/real_docx_smoke.py
```

检查内容：

- 运行前把本地真实 DOCX 样例复制到 `finish/regression/`，不触碰原文件。
- 不调用模型，离线跑一轮恒等改写。
- 通过 Web 端同一条导出路径生成 DOCX。
- 验证可编辑 / 保护单元数量、导出守卫、预检和保护内容审计。
- 写出报告到 `finish/regression/real_docx_smoke_report.json`。

## Web 健康检查

一键启动脚本提示后端或前端离线时运行：

```powershell
python scripts/web_health_check.py --backend-url http://127.0.0.1:8765/api/health --frontend-url http://127.0.0.1:1420 --timeout 30 --default-report
```

一键启动脚本启动后端和前端窗口后，也会自动调用这个检查脚本。

