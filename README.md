<div align="center">
  <img src="./app/public/brand-logo-96.webp" width="88" height="88" alt="FYADR logo" />
  <h1>FYADR</h1>
  <p><strong>论文 AI 降检平台</strong></p>
  <p>文档导入 · 模型路由 · 分轮改写 · Diff 审阅 · TXT / DOCX 导出</p>

  <p>
    <a href="https://github.com/multi-zhangyang/fuck-your-ai-detection-rate/actions/workflows/ci.yml"><img alt="CI status" src="https://img.shields.io/github/actions/workflow/status/multi-zhangyang/fuck-your-ai-detection-rate/ci.yml?branch=main&style=flat-square&label=CI" /></a>
    <a href="https://github.com/multi-zhangyang/fuck-your-ai-detection-rate/blob/main/LICENSE"><img alt="AGPL-3.0 license" src="https://img.shields.io/github/license/multi-zhangyang/fuck-your-ai-detection-rate?style=flat-square&label=License" /></a>
    <a href="https://www.python.org/"><img alt="Python 3.10+" src="https://img.shields.io/badge/Python-3.10%2B-3776AB?style=flat-square&logo=python&logoColor=white" /></a>
    <a href="https://nodejs.org/"><img alt="Node.js 20.19+ (20.x) or 22.12+" src="https://img.shields.io/badge/Node.js-%3E%3D20.19%20%3C21%20%7C%20%3E%3D22.12-339933?style=flat-square&logo=nodedotjs&logoColor=white" /></a>
  </p>
</div>

FYADR 是一个可自部署的论文改写与审阅工作台。它将 OpenAI-compatible 模型接入、长文档分轮处理、段落级 Diff、质量诊断、历史恢复和 DOCX 导出整合在同一套界面中，并在导出前提供差异审阅、人工选择和可恢复的处理历史。

> [!IMPORTANT]
> FYADR 是写作辅助与审阅工具，不是 AIGC 检测器，也不承诺任何检测平台的结果。使用者应核对事实、引用和最终文稿，并遵守所在机构的学术诚信要求。

## 核心能力

- **TXT 与 DOCX 工作流**：导入文档、分轮处理、审阅差异并导出结果。
- **OpenAI-compatible 模型接入**：支持 Chat Completions、Responses、流式响应、多服务商和按轮次路由。
- **长文档并发处理**：正文分块并行请求，结果按原文顺序合并；并发数可在 `1–16` 之间配置。
- **段落级人工审阅**：逐块比较原文和改写，保留原文、采用改写或录入人工版本。
- **相对质量诊断**：比较同一文档处理前后的可读性和风险信号变化，不模拟第三方检测平台。
- **历史与恢复**：支持中断后继续处理、恢复历史版本和压缩备份运行数据。
- **DOCX 结构保护**：限定可编辑正文范围，将标题、目录、公式、表格、参考文献等结构排除在模型改写之外。

## 界面预览

<table>
  <tr>
    <td width="50%" valign="top">
      <a href="./docs/assets/readme/01-workbench.webp"><img src="./docs/assets/readme/01-workbench.webp" alt="FYADR 工作台与段落级 Diff 审阅" /></a>
      <br /><strong>工作台与 Diff</strong><br />
      <sub>运行文档任务并逐段审阅改写结果。</sub>
    </td>
    <td width="50%" valign="top">
      <a href="./docs/assets/readme/02-quality-audit.webp"><img src="./docs/assets/readme/02-quality-audit.webp" alt="FYADR 相对质量诊断报告" /></a>
      <br /><strong>相对质量诊断</strong><br />
      <sub>查看质量维度变化和需要复核的段落。</sub>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <a href="./docs/assets/readme/03-docx-protection.webp"><img src="./docs/assets/readme/03-docx-protection.webp" alt="FYADR DOCX 保护区地图" /></a>
      <br /><strong>DOCX 保护区</strong><br />
      <sub>确认正文编辑范围与受保护的文档结构。</sub>
    </td>
    <td width="50%" valign="top">
      <a href="./docs/assets/readme/04-model-routing.webp"><img src="./docs/assets/readme/04-model-routing.webp" alt="FYADR 模型服务与分轮路由配置" /></a>
      <br /><strong>模型路由</strong><br />
      <sub>配置服务商、模型、流式响应、重试和并发。</sub>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <a href="./docs/assets/readme/05-history.webp"><img src="./docs/assets/readme/05-history.webp" alt="FYADR 历史记录和恢复" /></a>
      <br /><strong>历史与恢复</strong><br />
      <sub>恢复历史文档与处理轮次，管理导出文件。</sub>
    </td>
    <td width="50%" valign="top">
      <a href="./docs/assets/readme/06-prompt-workflows.webp"><img src="./docs/assets/readme/06-prompt-workflows.webp" alt="FYADR 提示词库和流程模板编辑器" /></a>
      <br /><strong>提示词与流程模板</strong><br />
      <sub>维护提示词，并设置流程顺序与轮次上限。</sub>
    </td>
  </tr>
</table>

## 快速开始

### 环境要求

选择一种运行方式：

- **Docker Compose**：Docker Engine 或 Docker Desktop，以及 Compose v2。
- **原生启动**：Python `3.10+`、Node.js `>=20.19 <21` 或 `>=22.12`。

两种方式都需要一个可用的 OpenAI-compatible 模型服务。

### Docker Compose

```bash
git clone https://github.com/multi-zhangyang/fuck-your-ai-detection-rate.git
cd fuck-your-ai-detection-rate
docker compose up -d --build
```

打开 <http://127.0.0.1:8765>。上传文件、历史、导出结果、模型配置、提示词修改和流程模板保存在项目的 `data/` 目录中。

```bash
docker compose logs -f fyadr
docker compose down
```

默认配置只监听 `127.0.0.1`。共享部署需要在服务前配置 HTTPS、身份认证、访问控制和限流，完整选项见 [DEPLOY.md](DEPLOY.md)。

### Windows

首次启动并安装依赖：

```powershell
.\start_web.bat -Install
```

后续运行 `.\start_web.bat` 即可。PowerShell 用户也可以运行 `.\start_web.ps1`；添加 `-NoBrowser` 可禁止自动打开浏览器。

### macOS / Linux

首次启动并安装依赖：

```bash
./start_web.sh --install
```

后续运行 `./start_web.sh` 即可；添加 `--no-browser` 可禁止自动打开浏览器。开发前端默认地址为 <http://127.0.0.1:1420>。

## 使用流程

1. 在“模型配置”中添加服务商、API Key 和模型。
2. 导入 `.txt` 或 `.docx` 文档，检查正文范围与保护区。
3. 选择流程模板和每轮模型，启动处理任务。
4. 在工作台中逐段审阅 Diff，处理风险提示并确认采用内容。
5. 导出 TXT 或 Word，并在提交前完成最终人工校对。

## 模型配置

| 配置项 | 说明 |
| --- | --- |
| Base URL | OpenAI-compatible API 地址 |
| API Key | 服务商凭据，仅保存到服务端配置文件 |
| Model | 默认模型，也可在流程中按轮次覆盖 |
| API type | `chat_completions` 或 `responses` |
| Streaming | 是否流式接收响应 |
| Request timeout | 请求超时，支持 `30–3600` 秒 |
| Max retries | 可恢复错误的重试次数 |
| Rewrite concurrency | 同一轮的并发请求数，范围 `1–16`，默认 `2` |

配置保存在以下位置：

- Windows：`%APPDATA%\FYADR\config.json`
- macOS / Linux：`~/.fyadr/config.json`
- Docker：`/app/config/config.json`

POSIX 系统会将配置目录和文件权限设置为 `0700/0600`。API Key 仍以可用明文保存，请保护主机账户、磁盘和备份。

## 提示词与流程模板

提示词工作区包含两个视图：

- **提示词库**：编辑或恢复内置提示词，创建、修改、删除和恢复自定义提示词。
- **流程模板**：调整可自定义流程的名称、说明、提示词顺序、默认提示词数量和最多运行轮次。

内置流程以只读方式提供，自定义流程可以编辑和保存。

## 文档格式

### DOCX

源 DOCX 是导出格式的唯一基准。FYADR 只替换通过范围检查的正文文字，保留标题、目录、题注、图片、公式、表格、参考文献、页眉页脚、编号、样式和节属性。证据不足或结构检查失败时，导出会被阻止。

浏览器使用 `multipart/form-data` 直接上传 TXT/DOCX，不会把 Word 文件扩展成 Base64 JSON。服务端会在写入内容寻址目录前流式限制大小、计算 SHA-256，并检查 DOCX 的 ZIP 路径、部件数量、解压大小、压缩比、OOXML 必需部件和 XML 实体声明；旧版 JSON 上传仅作为兼容入口保留。

格式保护不等于 DOCX 压缩包字节完全相同。正文长度变化仍可能引起换行、分页和页码变化；导出后应使用 Microsoft Word 或兼容软件检查最终版式。

### TXT

TXT 不包含 Word 样式和页面结构。它可以导出为采用默认版式的新 Word 文件，但无法继承不存在的 DOCX 格式基准。

FYADR 保护已有 DOCX 结构，但不负责按学校模板重新排版。字体、字号、行距、页边距和页面结构应在文字处理软件中完成。

## 数据与安全

- 文档、历史、导出文件和任务状态默认保存在部署目录中；新 SQLite 历史备份使用 `.sqlite3.gz`，旧 `.sqlite3` 备份仍可列出、校验和恢复。
- POSIX 服务以 `umask 077` 运行，运行数据目录和普通私密文件使用 `0700/0600`；旧文件会在启动时收紧权限，只读源锚点保持只读。
- 执行任务时，提示词与可编辑正文会发送给所配置的模型服务商。
- 连接测试和模型列表读取会向所选服务商发出请求；使用前应了解服务商的数据保留与训练政策。
- 模型配置文件包含可用凭据，不应提交到版本控制或放入公开备份。
- FYADR 不内置账号系统、多租户隔离或细粒度授权，不应未经访问保护直接暴露到公网。

安全问题请通过 [SECURITY.md](SECURITY.md) 中的方式报告。

## 开发

Windows PowerShell：

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --require-hashes -r requirements-dev.lock
```

macOS / Linux：

```bash
python3 -m venv .venv
.venv/bin/python -m pip install --require-hashes -r requirements-dev.lock
```

安装前端依赖：

```bash
npm --prefix app ci
```

在两个终端中分别启动后端和前端：

```powershell
# Windows 终端 1
.\.venv\Scripts\python.exe scripts\web_app.py
```

```bash
# macOS / Linux 终端 1
.venv/bin/python scripts/web_app.py
```

```bash
# 终端 2
npm --prefix app run dev:web
```

前端日常检查：

```bash
npm --prefix app run check
```

完整发布检查包含开源审计、完整回归、生产构建和浏览器烟测。Windows PowerShell：

```powershell
.\.venv\Scripts\python.exe scripts\pre_release_check.py --include-browser-e2e
```

macOS / Linux：

```bash
.venv/bin/python scripts/pre_release_check.py --include-browser-e2e
```

尚未提交的开发工作区可添加 `--allow-dirty`。

开发约定见 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)，发布检查见 [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md)。

## 项目结构

```text
app/                 React、TypeScript 与 Vite 前端
scripts/             Flask API、模型客户端、文档处理与测试
prompts/             内置提示词、流程注册表和自定义提示词目录
docs/                部署、设计、开发与产品资源
Dockerfile           生产镜像
docker-compose.yml   Compose 部署配置
start_web.*          跨平台启动器
```

## 贡献

提交改动前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。问题反馈请使用 [Bug 模板](https://github.com/multi-zhangyang/fuck-your-ai-detection-rate/issues/new?template=bug_report.yml)，功能建议请使用 [Feature 模板](https://github.com/multi-zhangyang/fuck-your-ai-detection-rate/issues/new?template=feature_request.yml)。

请勿在 Issue、Pull Request 或截图中提交论文原文、API Key、私有服务地址或个人信息。

## 致谢

项目早期基础设施参考了 [baibaiAIGC](https://github.com/poleHansen/baibaiAIGC)，部分提示词设计参考了 [Linux.do](https://linux.do/) 社区的公开讨论。感谢原作者与社区参与者的分享。

## 许可证

本项目基于 [GNU Affero General Public License v3.0](LICENSE) 发布。通过网络提供修改后的版本时，请遵守 AGPL-3.0 的源码开放要求。
