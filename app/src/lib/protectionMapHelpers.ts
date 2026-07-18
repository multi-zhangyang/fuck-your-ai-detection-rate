export function formatUnitIndex(value?: number | null): string {
  return typeof value === "number" ? `#${value}` : "未命中";
}

export function formatScopeReason(value?: string): string {
  const labels: Record<string, string> = {
    abstract_marker: "摘要起点",
    body_start_marker: "正文标题起点",
    before_back_matter_boundary: "后置材料前结束",
    document_end: "文档末尾结束",
    fallback: "兜底边界",
  };
  return labels[value ?? ""] ?? value ?? "";
}

export function formatProtectReason(value: string): string {
  const labels: Record<string, string> = {
    front_matter: "前置内容",
    generated_field: "自动域",
    table_content: "表格",
    graphic_anchor: "图形锚点",
    formula: "公式",
    references: "参考文献",
    heading: "标题",
    back_matter: "后置内容",
    caption: "图表名",
    structured_field: "结构字段",
    semantic_range_anchor: "书签/批注范围",
    semantic_range_span: "跨段批注范围",
    semantic_range_topology_invalid: "书签/批注范围拓扑异常",
    semantic_point_reference: "脚注/尾注/批注落点",
    outside_body_scope: "正文外",
    acknowledgement_body: "致谢正文",
    template_instruction: "模板撰写指导语",
    ambiguous_non_prose: "无法确认为正文，已安全跳过",
    complex_inline: "复杂 Word 结构",
    ambiguous_format_anchor: "格式锚点归属不明确",
    format_sensitive_text: "整段格式敏感文字",
  };
  return labels[value] ?? value;
}

export function formatEligibilityReason(value: string): string {
  const labels: Record<string, string> = {
    sentence_prose_evidence: "具备完整句子证据",
    numbered_sentence_prose: "具备编号正文证据",
    inside_confirmed_body_scope: "位于已确认正文范围",
    inside_abstract_scope: "位于摘要正文范围",
    insufficient_positive_body_evidence: "缺少正文正证据",
    presentation_structural_heading: "呈现方式符合标题",
    paragraph_centered_or_right_structural: "居中或右对齐结构段",
    font_size_above_body_baseline: "字号高于正文基线",
    all_visible_runs_bold_structural: "整段粗体结构段",
    paragraph_keep_with_next: "与下段同页",
    paragraph_page_break_before: "段前分页",
    inside_table: "位于表格单元",
    inside_acknowledgement_phase: "位于致谢部分",
    template_instruction_prefix: "段首包含模板指令标记",
    template_document_authoring_cue: "包含论文撰写要求语义",
    template_directive_cue: "包含填写或撰写指令",
    adjacent_structural_heading: "紧邻结构标题",
    acknowledgement_guidance: "致谢模板指导语",
    adjacent_acknowledgement_heading: "紧邻致谢标题",
    bookmark_range_anchor: "书签边界锚点",
    comment_range_anchor: "批注范围锚点",
    inside_comment_range: "位于跨段批注范围",
    marker_free_bookmark_interior: "位于无标记书签内部，边界可安全保留",
  };
  return labels[value] ?? value;
}

export function formatStructuralRole(value: string): string {
  const labels: Record<string, string> = {
    front_matter: "前置材料",
    toc_heading: "目录标题",
    toc_entry: "目录项",
    abstract_body: "摘要正文",
    heading: "标题",
    body_prose: "正文内容",
    body_list: "编号正文",
    caption: "图表名",
    note: "图表注释",
    equation: "公式",
    table_content: "表格内容",
    acknowledgement_heading: "致谢标题",
    acknowledgement_body: "致谢正文",
    template_instruction: "模板撰写指导语",
    references_heading: "参考文献标题",
    reference_entry: "参考文献条目",
    back_matter: "后置材料",
    keywords: "关键词",
    complex_container: "复杂 Word 结构",
    ambiguous_non_prose: "无法确认为正文",
    unknown: "未知结构",
  };
  return labels[value] ?? value;
}

export function formatScopeFlag(value: string): string {
  const labels: Record<string, string> = {
    abstractStart: "摘要",
    bodyStart: "正文起点",
    acknowledgementHeading: "致谢",
    referencesHeading: "参考文献",
    referenceEntry: "参考文献条目",
    backMatterHeading: "后置",
    tocHeading: "目录标题",
    tocEntry: "目录项",
    heading: "标题",
    numberedBodyItem: "编号正文",
    keywordLine: "关键词",
    caption: "图表名",
    note: "注释",
    formula: "公式",
    templateInstruction: "模板撰写指导语",
    semanticRangeCovered: "书签/批注范围",
    bookmarkRangeInterior: "书签内部（边界保留）",
    commentRangeInterior: "批注范围内部（冻结）",
  };
  return labels[value] ?? value;
}
