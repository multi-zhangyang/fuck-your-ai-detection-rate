# Development Notes

这份文档只给开发者看，用来记录回归、审计和发布前检查命令。普通用户阅读 `README.md` 即可。

## 快速检查

```powershell
npm --prefix app run check:text
python scripts/open_source_audit.py
```

## 发布前总闸

```powershell
python scripts/pre_release_check.py
python scripts/run_regressions.py
```

如果只想本地快速确认主要逻辑：

```powershell
python scripts/run_regressions.py --skip-frontend-build
```

## 常用专项回归

### DOCX 导出

```powershell
python scripts/docx_export_regression.py --rebuild-sample
```

### 任务状态机

```powershell
python scripts/state_machine_regression.py
```

### 并发与恢复

```powershell
python scripts/parallel_round_regression.py
python scripts/checkpoint_resume_regression.py
python scripts/single_output_retry_regression.py
```

### 真实 DOCX 冒烟

```powershell
python scripts/real_docx_smoke.py
```

### 浏览器烟测

```powershell
npm --prefix app run test:e2e:smoke
```

也可以接进本地总闸；GitHub Actions 已默认执行该浏览器门禁：

```powershell
python scripts/run_regressions.py --skip-frontend-build --include-browser-e2e
python scripts/pre_release_check.py --include-browser-e2e
```

如果没有自动找到浏览器，可以设置 `FYADR_E2E_BROWSER` 指向 Chrome 或 Edge 可执行文件。

## 开源审计重点

```powershell
python scripts/open_source_audit.py
```

审计会拦截源码和文档中的敏感信息、个人路径、私有模型地址、旧项目名和乱码文本。本地样例、检测报告、含真实数据的截图和运行目录只作为 warning 提示；发布前仍要确认它们没有被 git 跟踪。README 产品图是唯一例外：只能使用 `scripts/capture_readme_assets.mjs` 的 synthetic fixture，并保存为 `docs/assets/readme/*.webp`。

## 发布前人工确认

- 不提交 `finish/`、`origin/`、`logs/` 中的运行产物。
- 不提交真实论文、检测报告、含真实论文/凭据/个人路径的截图、API Key、私有模型地址或本地绝对路径。
- README 展示图只能放在 `docs/assets/readme/`，并且必须由可复现的 synthetic fixture 生成。
- `README.md`、启动脚本、回归命令和实际代码保持一致。
- `CHANGELOG.md` 已记录本次发布的主要能力、移除项和已知边界。
- 核心 prompt 的任何变更都是明确、有意、可回滚的。
