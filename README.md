# Fuck your AI detection rate

这是一个面向中文论文、摘要和技术文档的多轮改写与 Word 导出辅助项目。

项目本身不提供外部平台 AIGC 检测能力；如果接入 SpeedAI、PaperPass 等外部报告，报告只作为定位反馈和复盘记录使用，不作为自动判定依据。

项目核心边界：

- 正文按段落改写，尽量保留事实、术语、编号、引用和段落角色。
- 目录、图表、表格、公式、参考文献等保护区内容不交给模型改写。
- 学校规范用于导出样式和审计提示，不直接改写保护区正文。
- 外部报告只用于定位问题段和复盘策略，不作为唯一改写依据。

## 项目来源与致谢

本项目早期基础设施和使用思路参考了 [baibaiAIGC](https://github.com/poleHansen/baibaiAIGC)。在此基础上，本项目围绕段落级改写、多轮模型路线、断点续跑、外部报告反馈、Word 导出排版、保护区审计、历史生成物治理和开源检查做了大幅重构与扩展。

本项目的部分中文改写 prompt 设计参考了 [Linux.do](https://linux.do/) 社区中的公开讨论、经验总结和用户整理内容。相关 prompt 已重新整理为适配当前流程的版本；如继续分发或二次开发，请尊重原社区内容贡献者和对应平台规则。

本项目以 AGPL-3.0 协议发布，详见 [LICENSE](LICENSE)。

## 使用边界

本项目是写作辅助、改写辅助和排版辅助工具，不提供 AIGC 检测服务，也不承诺任何外部平台的检测结果。不同检测平台的算法、检测范围和阈值可能不同，结果也可能存在明显差异。

请自行确认学校、期刊、机构或平台对论文写作、AI 工具使用、引用披露和学术诚信的具体要求。

## 先看这个

如果你只是想打开 Web 端，按下面做：

1. 先安装依赖
2. 双击根目录的 `start_web.bat`
3. 脚本会自动打开浏览器；如果没有自动打开，手动访问 [http://127.0.0.1:1420](http://127.0.0.1:1420)

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
- 前端就绪后尝试自动打开浏览器；如系统拦截，会在终端显示手动访问地址

如果只想启动服务、不自动打开浏览器：

```powershell
.\start_web.ps1 -NoBrowser
```

推荐直接双击 `start_web.bat`。

## 手动启动 Web 端

如果你想手动开两个窗口，也可以这样做。

### 1. 启动后端

```powershell
python scripts/web_app.py
```

后端默认地址：

- API: `http://127.0.0.1:8765`
- 启动探针: `http://127.0.0.1:8765/api/ping`
- 诊断信息: `http://127.0.0.1:8765/api/health`

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

### 主页布局说明

- 顶部状态条显示当前文件、改写路线、Diff / 报告状态、运行进度和最新通知。
- 左侧是实时 Diff 和导出区域，是主要工作区。
- 右侧是操作面板，集中放上传、更换文档、轮次执行、模型路线和检测报告入口。
- 如果只想审阅 Diff，可以点击右侧操作面板顶部的“专注 Diff”；再次点击“展开操作面板”即可恢复。

## 主要能力

- 段落级多轮改写，支持按轮次选择不同 prompt 和模型服务商。
- 保护目录、图表、表格、公式、参考文献等非正文区域，避免无关内容被改写。
- 支持中断后继续处理，已完成分块会优先复用。
- 支持模型超时、重试和速率限制配置，适配较慢或限流严格的上游服务。
- 支持导出 TXT / DOCX，并结合学校规范做基础排版和审计提示。
- 支持导入外部检测报告，用于定位疑似问题段和复盘改写策略。

## 文档与输出目录

- `origin/`：原始输入文档
- `finish/intermediate/`：中间文本、manifest、checkpoint 等
- `finish/web_exports/`：Web 端生成的 TXT 或 DOCX 导出副本，浏览器下载到本地的文件不受历史清理影响
- `finish/fyadr_records.json`：轮次记录
- `prompts/`：核心 prompt
- `scripts/`：后端逻辑
- `app/`：Web 前端

## Prompt 文件

- `prompts/fyadr-cn-round1.md`
- `prompts/fyadr-cn-round2.md`
- `prompts/fyadr-cn-prewrite.md`
- `prompts/fyadr-cn-classical.md`

这些文件是中文改写路线的核心 prompt。开发者调整前建议先阅读 `docs/DEVELOPMENT.md`。

## 提交前自检

如果准备提交代码或整理公开仓库，建议先运行：

```powershell
python scripts/open_source_audit.py
git status --short
git ls-files -ci --exclude-standard
```

其中 `open_source_audit.py` 会检查疑似 API Key、私有模型地址、个人路径、被跟踪的本地产物和必要发布文件；`git ls-files -ci --exclude-standard` 用于确认没有被 `.gitignore` 覆盖但仍在索引中的文件。

## 常见问题

### 1. 打开页面后提示连不上本地服务

先确认后端是否启动成功：

- 访问 [http://127.0.0.1:8765/api/ping](http://127.0.0.1:8765/api/ping)
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
- 开发检查：[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)
- 优化路线：[references/optimization-roadmap.md](references/optimization-roadmap.md)
- 隐私与安全：[SECURITY.md](SECURITY.md)

开发者回归、审计和发布前检查命令见 `docs/DEVELOPMENT.md`。普通使用者只需要阅读上面的启动和使用流程。

