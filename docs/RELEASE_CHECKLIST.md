# 发布检查清单

这个清单用于开源前、较大重构后、或者准备打包发版前执行。

## 一、本地文件清理

- 确认 `finish/`、`origin/`、`logs/` 中没有准备提交的运行产物。
- 确认根目录没有个人论文、检测报告、截图、临时 Word、临时 PDF。
- 确认没有提交 `.env`、`app/.env`、API Key、私有 Base URL、个人路径。
- 确认根目录 `.env.example` 和 `app/.env.example` 只包含空值或占位说明。
- 确认 `prompts/` 中核心 prompt 的改动是有意的。

## 二、启动验证

```powershell
pip install -r requirements.txt
cd app
npm install
cd ..
.\start_web.ps1
```

启动后检查：

- 后端健康检查：`http://127.0.0.1:8765/api/health`
- 前端页面：`http://127.0.0.1:1420`
- 模型配置保存后刷新页面仍能恢复。
- 上传取消后按钮仍可点击。
- “启动诊断”可以复制脱敏诊断信息。

## 三、回归验证

快速回归：

```powershell
python scripts/run_regressions.py --skip-frontend-build
```

完整回归：

```powershell
python scripts/run_regressions.py
```

真实浏览器烟测：

```powershell
npm --prefix app run test:e2e:smoke
```

如果希望发版总闸也覆盖浏览器点击链路：

```powershell
python scripts/pre_release_check.py --include-browser-e2e
```

发版前总闸：

```powershell
python scripts/pre_release_check.py
```

如果正在开发这个检查脚本本身、工作区暂时未提交，可以临时使用：

```powershell
python scripts/pre_release_check.py --allow-dirty
```

GitHub Actions 会在推送 `main`、创建 Pull Request 或手动触发时运行完整回归。CI 使用仓库内代码和空样例环境，不依赖本地论文、检测报告、截图或运行产物。

单项回归：

```powershell
python scripts/docx_export_regression.py --rebuild-sample
python scripts/state_machine_regression.py
python scripts/detection_report_regression.py
python scripts/format_rules_regression.py
python scripts/open_source_audit.py
npm --prefix app run check:text
npm --prefix app run build
```

## 四、人工验收

- 首页当前文档清晰可见。
- Diff 区是主页视觉重心。
- 右侧操作面板可以收起进入“专注 Diff”，并且刷新后仍保持用户选择。
- 上传文档弹窗取消后，主页按钮、导航、通知中心仍可点击。
- 历史记录能区分删除记录、删除中间产物、删除导出副本、删除源文档。
- 学校规范未填写时能使用默认规则；填写后能查看结构化解析结果。
- 外部报告上传后只影响定位反馈，不自动覆盖正文。
- Word 导出后保护区内容不变，正文样式和学校规则按预期应用。

## 五、发布前确认

- README 中的命令全部可执行。
- `CHANGELOG.md` 已更新本次版本的新增能力、移除项和已知边界。
- GitHub Actions 最近一次 `CI` 工作流通过。
- `.gitignore` 覆盖本地运行产物和私密文件。
- `.github/ISSUE_TEMPLATE/` 和 Pull Request 模板能引导用户提供复现步骤与诊断信息。
- `python scripts/open_source_audit.py` 无 error；特别确认没有 API Key、私有 Base URL、模型厂商 endpoint、个人路径、旧项目名和乱码。
- 审计 warning 中的 PDF、DOCX、截图、`finish/`、`origin/`、`logs/`、`app/dist/`、`app/node_modules/` 已确认不会提交。
- 没有乱码文案、个人路径、个人模型地址或临时调试按钮。
- 没有把浏览器下载到用户本地的文件描述成会被项目清理。
