# 开发说明

## 活代码边界

- 后端：`scripts/core_*.py` 与 `scripts/web_app.py`
- 前端：`app/src/CoreApp.tsx`、`app/src/components/core/`、`app/src/lib/coreService.ts`
- 浏览器烟测：`scripts/browser_e2e_smoke.mjs`

旧版学校解析、质量评分、候选门禁、SQLite 历史和复杂状态机已经删除，不应以兼容名义重新接回主流程。

## 常用命令

```powershell
pip install -r requirements.txt
npm --prefix app install
python scripts/run_regressions.py
```

包含 Chrome / Edge 真实点击流程：

```powershell
python scripts/run_regressions.py --include-browser-e2e
```

仅跑后端核心：

```powershell
python -m unittest discover -s scripts -p "core_*_regression.py" -v
```

调试启动：

```powershell
python scripts/web_app.py
npm --prefix app run dev:web
```
