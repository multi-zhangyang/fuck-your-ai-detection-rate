# 贡献指南

欢迎继续把 FYADR 打磨成更稳定、好用、适合本地运行的工具。

## 开发原则

- 优先修根因，不用一次性堆功能掩盖状态混乱。
- UI 以主流程为核心，减少重复解释和不必要的小字说明。
- 文档内容与实际代码保持一致，不写跑不通的命令。
- 不提交个人文档、检测报告、含真实或敏感数据的截图、API Key、私有模型地址或本地绝对路径。

## 核心边界

- `prompts/` 下的核心 prompt 是改写效果的关键资产，除非明确需要，否则不要顺手改。
- 目录、图表、表格、公式、参考文献等保护区内容不能交给模型改写。
- 原 DOCX 是格式唯一真相源；外部学校规则不会进入导出或改写流程，保护区正文也不能送入模型。
- 项目不内置外部检测报告解析链路；用户手动反馈只作为审阅和局部重跑上下文。

## 推荐工作流

1. 新建或切换到自己的开发分支。
2. 做一个聚焦改动，避免 UI、分块、导出、报告匹配同时大改。
3. 改完先跑局部验证，再跑完整回归。
4. 提交前检查 `.gitignore` 是否挡住了本地运行产物。

## 报告问题前

- 先打开 Web 端“启动诊断”，点击“复制诊断信息”，并在提交前检查其中没有私密内容。
- Issue 中必须写清楚复现步骤、当前文档来源、是否刷新页面、是否从历史记录切换、是否执行过中断/继续/重跑。
- 不要上传真实论文全文、检测报告原文、API Key、私有模型地址、个人路径或未脱敏截图。
- 如果问题和文档内容有关，优先构造一段最小复现样例，而不是贴完整文档。

## 提交与 CI

- 开发中可运行 `node scripts/run_python.mjs scripts/run_regressions.py --skip-frontend-build` 做快速检查。涉及前端或准备发布时，直接运行 `node scripts/run_python.mjs scripts/pre_release_check.py --include-browser-e2e`；该命令已包含完整回归，无需先跑快速检查。
- 推送到 `main` 或创建 Pull Request 后，GitHub Actions 会自动运行包含浏览器链路的完整回归，以及 Python 编译、开源审计、前端文本检查和前端构建。
- CI 不依赖本地论文、检测报告或截图；缺少本地样例时，相关真实文档冒烟测试会跳过，不会阻塞仓库协作。
- 提交信息建议使用清晰动词开头，例如 `Fix task resume state`、`Improve provider config UI`、`Add CI regression workflow`。
- 不要为了让 CI 通过而放宽核心校验；如果校验误伤，应补充回归样例或改进算法边界。

## 常用命令

```bash
node scripts/run_python.mjs -m pip install --require-hashes -r requirements-dev.lock
node scripts/run_python.mjs -m ruff check .
npm --prefix app ci
npm --prefix app run build
npm --prefix app run check:text
node scripts/run_python.mjs scripts/open_source_audit.py
node scripts/run_python.mjs scripts/run_regressions.py --skip-frontend-build
```

更完整的发布检查见 `docs/RELEASE_CHECKLIST.md`。
