# 论文 AI 降检平台：双契约技术设计

## 1. 目标

平台所有自动处理必须同时满足两条互不替代的产品契约：

1. **降检策略契约**：根据可解释的相对文本信号决定停止、定点重跑或进入下一个不同维度，不伪造第三方 AIGC 检测率，也不为了单一统计指标反复机械改写。
2. **正文与格式契约**：模型只能看到冻结后的可编辑正文；标题、目录、图表、表格、公式、参考文献、页眉页脚等保护区不得进入模型。DOCX 导出只能替换这些冻结目标的文字，其他文本、格式和 OOXML 结构必须保持原样。

只有两条契约同时就绪，运行或导出动作才可继续：

```text
可解释的降检策略决策
          +
正文范围冻结 + 原格式保真证据
          =
可运行 / 可导出的双契约门
```

## 2. 非目标

- 不把启发式风险点包装成某个查重平台或 AIGC 检测器的概率。
- 不承诺跨平台统一的“AI 率”。不同检测器、版本和语料分布不存在可验证的统一映射。
- 不通过刻意制造病句、碎句、被动句、长定语或随机同义词来投机指标。
- 不提供学校规范说明解析、套版或对照页面；用户上传的原 DOCX 是格式唯一真相源。
- 不自动改写标题、目录、表格、图表、公式、引文列表、页眉页脚或其他结构区。

## 3. 数据模型

### 3.1 正文与格式契约

契约由 `scripts/document_edit_contract.py` 生成，核心字段如下：

```json
{
  "version": 1,
  "policy": "editable_body_text_only",
  "stage": "pre_run | post_round | rate_audit | pre_export | post_export",
  "sourceSha256": "...",
  "snapshotVersion": 10,
  "snapshotCurrent": true,
  "scopeDigest": "...",
  "formatDigest": "...",
  "editableUnitCount": 42,
  "protectedUnitCount": 18,
  "protectedHeadingCount": 9,
  "editableHeadingCount": 0,
  "extractedTextMatchesEditableUnits": true,
  "modelInputMatchesEditableUnits": true,
  "scopeReady": true,
  "formatLockReady": true,
  "ready": true,
  "issueCount": 0,
  "issues": []
}
```

`scopeDigest` 对所有文本单元的顺序、目标、样式、保护状态、保护原因和原文哈希做规范化摘要。`formatDigest` 对所有段落的文本无关格式签名、表格、节属性以及 DOCX 包内非正文 XML/资源做摘要。两者与 `sourceSha256` 一起形成可追踪的源文档身份。

### 3.2 降检策略计划

RateAudit 在原有基线、分轮轨迹、维度变化和热区之上生成 `strategyPlan`：

```json
{
  "version": 1,
  "decision": "stop | targeted_rerun | next_dimension | blocked",
  "recommendedPromptId": "round1",
  "currentPromptId": "prewrite",
  "nextPromptId": "round1",
  "dimensionId": "rhythm",
  "reason": "...",
  "targetChunkIds": ["p0003-c00"],
  "contentContractReady": true,
  "scopeContractReady": true,
  "formatContractReady": true,
  "canExecute": true
}
```

决策含义：

- `stop`：当前没有值得继续自动处理的可解释信号，转入事实、引用和人工语言检查。
- `targeted_rerun`：存在新增、加重、高等级或局部残留信号，只重跑目标段落，不重写整篇。
- `next_dimension`：当前维度已经改善，进入职责不同的下一个提示词，避免重复施压。
- `blocked`：正文边界、模型输入或格式锁证据未通过；任何策略都不可执行。

### 3.3 双契约就绪状态

RateAudit 返回统一 `readiness`：

```json
{
  "status": "ready | attention | blocked",
  "strategyDecisionReady": true,
  "contentContractReady": true,
  "scopeContractReady": true,
  "formatContractReady": true,
  "runReady": false,
  "preExportReady": true,
  "blockedReason": ""
}
```

## 4. DOCX 正文范围不变量

每次运行和导出都必须满足：

1. 快照版本与当前源文件一致，源路径、大小和修改时间未漂移。
2. `editableHeadingCount == 0`。
3. 原始抽取文本必须严格等于按顺序连接的 `snapshot.editable_units()`，包括自然段边界。
4. body map 的单元数量、目标顺序、目标类型和冻结范围签名必须有效。
5. body map 只能指向顶层正文段落，不得指向标题、表格单元、目录、图注或保护区。
6. 待模型处理或待回填的段落数量必须与冻结正文数量一致。
7. 单个回填单元不得携带换行，避免一个正文单元改变为多个 Word 自然段。
8. 标题样式判断同时使用文字、Word 样式和自动编号信号，不能只依赖“第一章”“研究背景”等关键词。

任何一项失败都必须阻断动作并写出 JSON 报告，不能静默回退为整篇文本处理。

## 5. DOCX 格式保真不变量

产品导出模式固定为 `preserve_original`。旧配置或显式传入的 `school_rules` 会被迁移，不能重新打开格式写回路径。

导出过程执行以下独立证据链：

1. **正文目标文本审计**：每个冻结目标的导出文字与本轮结果完全一致。
2. **保护区文本审计**：所有非编辑单元与原始 Word 完全一致。
3. **OOXML 结构审计**：文档块、表格、样式、编号、设置、关系、页眉页脚、媒体、嵌入对象等保持一致。
4. **格式锁审计**：对每个段落的完整非文本 OOXML 树计算签名；仅允许直接 run/hyperlink 的可编辑 `w:t` 值变化。
5. **页面与表格审计**：节属性、表格 XML、页边距、页眉页脚和相关关系不得漂移。

FYADR 不解析外部学校说明，也不把外部规则作为第二个格式权威。用户可在 Word 或学校模板工具中自行完成格式要求的人工确认；FYADR 只对源 DOCX 的相对保真负责。

## 6. 生命周期

### 6.1 导入与建立基线

1. 读取 DOCX。
2. 建立版本化快照和正文边界诊断。
3. 生成只包含可编辑正文的抽取文本。
4. 生成源级正文与格式契约。
5. RateAudit 对同一份正文建立可解释基线。

### 6.2 每轮开始前

1. 构造或继承冻结 body map。
2. 重新验证源文件、快照、范围签名和标题数量。
3. 验证模型输入逐单元对应 body map。
4. 写入 `pre_run` 契约；不通过则在发起任何模型请求前停止。

### 6.3 每轮结束后

1. 验证输出段落数量和单元边界。
2. 更新 body map，但不允许更换目标。
3. 写入 `post_round` 契约。
4. RateAudit 更新轨迹、热区和下一步策略。

### 6.4 导出前与导出后

1. 应用审阅决定后再次运行导出前保护和 `pre_export` 契约。
2. 从原始 DOCX 复制结构，只替换冻结目标文字。
3. 不运行外部格式规则；原 DOCX 的非文本格式直接进入后续相对保真审计。
4. 运行正文、保护区、OOXML 和格式锁四类硬审计。
5. 写入 `post_export` 契约；任意证据失败即删除可用性并返回结构化错误。

## 7. API 与前端

### 7.1 RateAudit

`GET /api/rate-audit` 在原有字段之外返回：

- `strategyPlan`
- `contentContract`
- `readiness`

接口仍明确返回 `isAiDetector: false` 和第三方检测免责声明。

### 7.2 导出证据响应头

DOCX 导出新增并补全：

- `X-Export-Format-Lock-*`
- `X-Export-Content-Contract-*`
- `X-Export-Editable-Unit-Count`
- `X-Export-Protected-Unit-Count`
- `X-Export-Protected-Heading-Count`
- `X-Export-Editable-Heading-Count`
- `X-Export-Model-Input-Scope-Match`

前端必须把这些证据带入导出健康面板，不能只显示“下载成功”。

### 7.3 UI 表达

“降检报告”顶部使用一个双契约门：

- 左侧显示停止、定点重跑、下一维度或阻断决策；
- 右侧显示可改正文数、锁定保护区数、锁定标题数和误入标题数；
- `editableHeadingCount > 0`、范围不一致或格式锁未就绪时使用错误状态；
- 热区目标可直接跳转对应 Diff；
- 不再提供学校规范页面；产品界面只展示源 DOCX 的正文范围、保护区与格式锁证据。

## 8. 失败语义

所有范围/格式错误采用 fail-closed：

- 运行前错误：不发起模型请求。
- 轮后错误：不登记为可用轮次。
- 导出前错误：不生成可下载成品。
- 导出后审计错误：返回 `docx_export_blocked` 和结构化 `exportFailure`，包含阶段、报告路径、问题数和样例。

旧数据兼容不得削弱硬约束。旧 `school_rules` 配置只迁移；旧 body map 缺失关键签名时只能在可证明目标安全的兼容路径中使用，并应产生可见警告。

## 9. 回归覆盖

`scripts/document_edit_contract_regression.py` 构造包含以下元素的真实 DOCX：

- 任意文字的 Title 样式标题；
- 英文 Heading 和中文“标题 1”样式；
- 自动编号标题；
- TOC 域；
- 图注、公式、表格；
- 致谢与参考文献；
- 页眉页脚；
- 非标准字体、字号、首行缩进、行距和页边距。

回归验证：

- 所有标题和结构区均不出现在模型输入；
- 可编辑正文完整出现且顺序一致；
- 旧 `school_rules` 配置和显式参数都被迁移；
- 导出后保护文本、OOXML 和全部段落格式签名与源文件一致；
- 篡改 body map 使其指向标题时必须硬失败。

该回归已纳入 `scripts/run_regressions.py`，并与 RateAudit、前端类型/展示、真实多轮保真和浏览器烟测共同构成发布门。
