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
- 历史记录能区分删除记录、删除中间产物、删除导出副本、删除源文档。
- 学校规范未填写时能使用默认规则；填写后能查看结构化解析结果。
- 外部报告上传后只影响定位反馈，不自动覆盖正文。
- Word 导出后保护区内容不变，正文样式和学校规则按预期应用。

## 五、发布前确认

- README 中的命令全部可执行。
- `CHANGELOG.md` 已更新本次版本的新增能力、移除项和已知边界。
- `.gitignore` 覆盖本地运行产物和私密文件。
- `.github/ISSUE_TEMPLATE/` 和 Pull Request 模板能引导用户提供复现步骤与诊断信息。
- `python scripts/open_source_audit.py` 无 error；特别确认没有 API Key、私有 Base URL、模型厂商 endpoint、个人路径、旧项目名和乱码。
- 审计 warning 中的 PDF、DOCX、截图、`finish/`、`origin/`、`logs/`、`app/dist/`、`app/node_modules/` 已确认不会提交。
- 没有乱码文案、个人路径、个人模型地址或临时调试按钮。
- 没有把浏览器下载到用户本地的文件描述成会被项目清理。
