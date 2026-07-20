# FYADR 开发指南

本文说明 FYADR 的开发环境、专项验证和发布前检查流程。安装与日常使用请先阅读 [README](../README.md)。

## 开发环境

Windows PowerShell：

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
npm --prefix app ci
```

macOS / Linux：

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
npm --prefix app ci
```

下面的检查通过 `scripts/run_python.mjs` 自动选择项目虚拟环境中的 Python，在 Windows、macOS 和 Linux 上使用相同命令。

## 快速检查

```bash
npm --prefix app run check:text
node scripts/run_python.mjs scripts/open_source_audit.py
```

## 发布前总闸

```bash
node scripts/run_python.mjs scripts/pre_release_check.py --include-browser-e2e
```

该命令依次检查 Git 状态与误提交产物、执行开源审计、运行完整回归、构建前端并完成真实浏览器烟测，无需再单独重复执行下面的专项命令。

如果只想本地快速确认主要逻辑：

```bash
node scripts/run_python.mjs scripts/run_regressions.py --skip-frontend-build
```

## 常用专项回归

### DOCX 导出

```bash
node scripts/run_python.mjs scripts/docx_export_regression.py --rebuild-sample
```

### 任务状态机

```bash
node scripts/run_python.mjs scripts/state_machine_regression.py
```

### 并发与恢复

```bash
node scripts/run_python.mjs scripts/parallel_round_regression.py
node scripts/run_python.mjs scripts/checkpoint_resume_regression.py
node scripts/run_python.mjs scripts/single_output_retry_regression.py
```

### 真实 DOCX 冒烟

```bash
node scripts/run_python.mjs scripts/real_docx_smoke.py
```

### 浏览器烟测

```bash
npm --prefix app run test:e2e:smoke
```

也可以在开发中将浏览器烟测接入快速回归：

```bash
node scripts/run_python.mjs scripts/run_regressions.py --skip-frontend-build --include-browser-e2e
```

如果没有自动找到浏览器，可以设置 `FYADR_E2E_BROWSER` 指向 Chrome 或 Edge 可执行文件。

## 开源审计重点

```bash
node scripts/run_python.mjs scripts/open_source_audit.py
```

审计会拦截源码和文档中的敏感信息、个人路径、私有模型地址、旧项目名和乱码文本。本地样例、检测报告、含真实数据的截图和运行目录只作为 warning 提示；发布前仍要确认它们没有被 git 跟踪。README 产品图是唯一例外：只能使用 `npm --prefix app run capture:readme` 生成，并保存为 `docs/assets/readme/*.webp`。

## 发布前人工确认

- 不提交 `finish/`、`origin/`、`logs/` 中的运行产物。
- 不提交真实论文、检测报告、含真实论文/凭据/个人路径的截图、API Key、私有模型地址或本地绝对路径。
- README 展示图只能放在 `docs/assets/readme/`，并且必须由可复现的匿名演示数据生成。
- `README.md`、启动脚本、回归命令和实际代码保持一致。
- `CHANGELOG.md` 已记录本次发布的主要能力、移除项和已知边界。
- 核心 prompt 的任何变更都是明确、有意、可回滚的。
