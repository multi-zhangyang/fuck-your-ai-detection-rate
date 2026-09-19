# FYADR

本地运行的 DOCX / TXT 文档改写平台。它把长文档拆成彼此独立的段落与段内分块，交给用户选择的模型逐轮处理，再通过原文对照、差异标记和人工审阅完成导出。

![FYADR 逐段对照](docs/images/workbench.png)

[查看完整界面截图](docs/SCREENSHOTS.md)

## 功能

- **DOCX 原位回填**：以源文件为格式来源，只替换用户选中的正文文字节点，不重新套用排版规则。
- **TXT 简化流程**：直接分段、改写和导出纯文本。
- **段落隔离 + 段内分块**：不同段落不会混在同一次模型请求中，长段落优先沿完整语义边界继续拆分。
- **逐轮提示词**：支持 1–3 轮改写，每轮独立选择提示词；上一轮完整输出作为下一轮输入。
- **1–16 路块并发**：并发处理不同分块，最终仍按原文顺序回填。
- **实时返回与断点继续**：模型开始输出后即可更新进度；停止后只继续未完成的分块。
- **逐段审阅**：提供原文对照、差异标记、采用改写、保留原文、手动编辑和重新改写。
- **提醒不干预**：数字、引用、URL、技术标识符和保护词的变化只做提醒，不覆盖模型结果，也不阻止用户导出。
- **多模型连接**：内置 DeepSeek 官方入口，并支持多个 OpenAI 兼容渠道。
- **继续改写**：可把当前审阅结果作为下一次输入，重新选择模型、每轮提示词、分块档位、并发和保护词。

## 快速开始

需要 Python 3.10+ 与 Node.js 18+，不需要 Docker。

```powershell
git clone https://github.com/multi-zhangyang/fuck-your-ai-detection-rate.git
cd fuck-your-ai-detection-rate
.\start_web.bat
```

也可以直接双击 `start_web.bat`。脚本会检查运行环境、安装缺少的依赖、启动本地服务并打开浏览器。

PowerShell 启动方式：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\start_web.ps1
```

不自动打开浏览器：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\start_web.ps1 -NoBrowser
```

启动后访问 <http://127.0.0.1:1420>。

## 使用流程

1. 在“模型连接”中填写 API 地址与密钥，获取或手动填写模型并验证连接。
2. 上传 DOCX 或 TXT。
3. DOCX 先确认正文范围；TXT 直接进入改写设置。
4. 选择模型、改写轮数及每轮提示词，再设置段内分块和并发数。
5. 开始改写，完成后逐段检查原文、结果与提醒。
6. 直接导出，或以当前审阅结果继续改写。

![正文范围](docs/images/document-scope.png)

## 分段、分块与多轮

每个段落独立处理，不跨段合并。长段落会继续在句号、问号、分号等语义边界拆分；超长单句才会退到逗号、空白或长度边界。默认使用“标准”档，也可选择“细致”或“长段”。

任务创建时会固定分块 ID、顺序和连接符。两轮改写就是每个分块依次调用两次：第 1 轮完成后，其完整结果进入第 2 轮；不会先把全文的第 1 轮集中跑完再开始第 2 轮。不同分块之间可以并发，单个分块内部始终按轮次串行。

完整、非空的模型输出会先保存，再执行提醒检查。提醒检查异常不会改变已完成结果；流式返回中断或返回空内容时只暂停当前分块，不会用原文冒充改写结果。

![继续改写设置](docs/images/completed-actions.png)

## 模型与请求

支持两种显式协议：

- OpenAI Chat Completions
- OpenAI Responses

默认使用 Chat Completions，应用不会静默切换协议。请求不包含 `max_tokens` 或 `max_output_tokens`，并分别设置连接、首次返回和流中静默等待时间。

普通分块只发送“当前轮提示词 + 两个换行 + 当前分块正文”。英文分块会追加一条英文输出提醒，避免英文摘要或正文被改写成中文；除此之外不注入 system prompt、隐藏 `instructions`、长度限制或质量评分规则。

网络客户端读取系统与环境代理，本地地址自动绕过代理。

![模型连接](docs/images/model-connections.png)

## DOCX 格式保留

FYADR 不根据学校、单位或模板规则重排字体、字号、行距、缩进和页边距。导出时复制原 DOCX 包，并在 `word/document.xml` 中定点替换所选正文已有的文字节点。

在支持范围内，应用会保留：

- 原段落、run、样式、编号、超链接关系和分节信息；
- 页眉页脚、主题、图片、表格、公式及其他包部件；
- 未选择的正文和非正文区域；
- 行内对象本身及其相对位置。

当前不改写表格单元格、公式对象、页眉页脚和纯图片中的文字。文字长度变化仍可能让 Word 重新换行或分页，因此项目不宣称任意 DOCX 都能达到 100% 视觉一致。

导出前会检查包部件、文档结构、未选区域和文件可读性。发现内容提醒或格式风险时，应用会列出具体段落，由用户决定返回审阅或继续导出；只有源文件损坏、目标文字不存在、内容无法写入或文件无法生成时才会报告生成失败，同时保留 TXT 导出。

![导出前确认](docs/images/export-warning.png)

## 本地数据

- 后端默认只监听 `127.0.0.1`。
- API Key、文档、任务快照、断点和导出文件均保存在本机。
- 浏览器接口不会返回明文密钥。
- 最近文档最多保留 20 条，删除前需要确认。

配置位置：

- Windows：`%APPDATA%\FYADR\config.json`
- macOS / Linux：`~/.fyadr/config.json`

旧配置迁移到 schema v8 前会在同目录创建 `config.before-v8.json`。自定义模型连接、密钥和提示词会保留；旧提示词方案会转换为每轮提示词选择。

## 开发与验证

分别启动后端与前端：

```powershell
# 终端 1
python scripts/web_app.py

# 终端 2
npm --prefix app run dev:web
```

运行核心回归：

```powershell
python scripts/run_regressions.py --fail-fast
```

运行完整浏览器回归：

```powershell
python scripts/run_regressions.py --include-browser-e2e --fail-fast
```

回归覆盖两类流式协议、任意字节分片、超时、取消、代理、重试边界、1–16 路并发顺序、段内分块、多轮衔接、提醒不回退、逐段审阅、DOCX 原位回填和响应式界面。

本地已有完成任务时，可重新生成 README 截图：

```powershell
node scripts/capture_readme_screenshots.mjs
```

截图脚本会使用最近完成的本地文档，并在截图阶段遮挡模型连接、密钥、模型名称和提示词正文。

## 项目来源与致谢

本项目早期基础设施和使用思路参考了 [baibaiAIGC](https://github.com/poleHansen/baibaiAIGC)。

部分中文改写提示词的设计参考了 [Linux.do](https://linux.do/) 社区中的公开讨论、经验总结和用户整理内容。继续分发或二次开发时，请尊重原社区内容贡献者和对应平台规则。

感谢所有提交 Issue、提供文档样例、验证模型兼容性和参与测试的用户与贡献者。

## 使用说明

本项目不提供 AI 内容检测服务，也不承诺通过任何平台的检测。请确认自己有权处理所上传的文档，并对模型调用、审阅结果和最终导出内容负责。

## 协议

本项目以 [AGPL-3.0](LICENSE) 协议发布。
