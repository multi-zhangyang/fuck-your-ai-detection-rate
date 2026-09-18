# 贡献指南

FYADR 当前只维护两个核心能力：DOCX 原位回填与分块流式改写。新增功能应直接服务这两条链路，避免重新引入评分门禁、学校规则、每轮模型路由或历史治理系统。

## 开发原则

- 原 DOCX 是唯一格式真相源，不对字体、字号、段落或页面规则做二次排版。
- 模型的非空正文默认保留；数字、引用等变化只提示，不自动回退。
- 失败块明确暂停，不能用原文伪装成功结果。
- UI 沿用现有 shadcn 工作台和语义色，不另建一套组件或页面风格。
- 不提交真实文档、密钥、私有接口、个人路径或本地运行产物。

## 验证

```powershell
python scripts/run_regressions.py
python scripts/run_regressions.py --include-browser-e2e
```

小范围后端改动可以先运行：

```powershell
python -m unittest discover -s scripts -p "core_*_regression.py" -v
```
