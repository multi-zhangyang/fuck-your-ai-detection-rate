from __future__ import annotations

import argparse
import json
import re
from copy import deepcopy
from pathlib import Path
from typing import Any

from ai_json import extract_json_object
from app_config import DEFAULT_MAX_RETRIES, DEFAULT_REQUEST_TIMEOUT_SECONDS, load_app_config
from llm_client import llm_completion

ROOT_DIR = Path(__file__).resolve().parents[1]
INTERMEDIATE_DIR = ROOT_DIR / "finish" / "intermediate"
ACTIVE_RULES_PATH = INTERMEDIATE_DIR / "active_format_rules.json"
SCHEMA_PATH = ROOT_DIR / "references" / "format_rules.schema.json"
FORMAT_RULES_VERSION = 1
FORMAT_RULE_PARSE_DEFAULT_TIMEOUT_SECONDS = 300
FORMAT_RULE_PARSE_MAX_TIMEOUT_SECONDS = 1800
FORMAT_RULE_PARSE_MAX_RETRIES = 0

ALIGNMENT_VALUES = {"left", "center", "right", "justify"}
FULLWIDTH_TRANSLATION = str.maketrans(
    "０１２３４５６７８９．，：；（）％",
    "0123456789.,:;()%",
)
STYLE_KEY_ALIASES = {
    "cnFont": ("cnFont", "cn_font", "chineseFont", "zhFont", "eastAsiaFont", "cjkFont", "中文字体", "汉字字体", "中文用字", "中文", "汉字"),
    "enFont": ("enFont", "en_font", "englishFont", "westernFont", "latinFont", "asciiFont", "numberFont", "西文字体", "英文字体", "数字字体", "英文", "西文", "数字"),
    "fontSizePt": ("fontSizePt", "fontSize", "font_size", "size", "字号", "字体大小", "字级", "号数"),
    "bold": ("bold", "isBold", "fontBold", "加粗", "粗体"),
    "italic": ("italic", "isItalic", "斜体"),
    "alignment": ("alignment", "align", "paragraphAlignment", "对齐", "对齐方式"),
    "firstLineIndentPt": ("firstLineIndentPt", "firstLineIndent", "indent", "textIndent", "首行缩进", "缩进"),
    "spaceBeforePt": ("spaceBeforePt", "spaceBefore", "beforeSpacing", "段前", "段前距"),
    "spaceAfterPt": ("spaceAfterPt", "spaceAfter", "afterSpacing", "段后", "段后距"),
    "lineSpacingPt": ("lineSpacingPt", "fixedLineSpacing", "fixedLineHeight", "lineSpacing", "lineHeight", "行距", "行间距", "固定行距", "固定值"),
    "lineSpacingMultiple": ("lineSpacingMultiple", "lineSpacingMultiplier", "multipleLineSpacing", "multiple", "倍数行距", "倍行距"),
}
STYLE_FORMAT_FIELDS = tuple(STYLE_KEY_ALIASES.keys())
STYLE_CONTAINER_KEYS = ("style", "textStyle", "fontStyle", "paragraph", "paragraphStyle", "paragraphFormat", "format", "rules", "value")
STYLE_ROOT_KEYS = ("styles", "styleRules", "style_rules", "paragraphStyles", "paragraph_styles", "formatStyles", "format_styles", "段落样式", "样式规则", "样式", "格式规则")
ROLE_FIELD_KEYS = ("role", "styleRole", "roleName", "key", "name", "styleName", "target", "section", "type")
PAGE_CONTAINER_KEYS = ("page", "pageSetup", "page_setting", "pageSettings", "pageLayout", "layout", "页面", "页面设置", "版面设置")
PAGE_MARGIN_CONTAINER_KEYS = ("margins", "margin", "pageMargins", "pageMargin", "marginCm", "marginsCm", "页边距", "边距")
PAGE_KEY_ALIASES = {
    "paper": ("paper", "paperSize", "pageSize", "paperType", "纸张", "纸型", "纸张大小"),
    "topMarginCm": ("topMarginCm", "top", "topMargin", "marginTop", "上", "上边距", "页边距上"),
    "bottomMarginCm": ("bottomMarginCm", "bottom", "bottomMargin", "marginBottom", "下", "下边距", "页边距下"),
    "leftMarginCm": ("leftMarginCm", "left", "leftMargin", "marginLeft", "左", "左边距", "页边距左"),
    "rightMarginCm": ("rightMarginCm", "right", "rightMargin", "marginRight", "右", "右边距", "页边距右"),
}
PAGE_FORMAT_FIELDS = tuple(PAGE_KEY_ALIASES.keys())

DEFAULT_FORMAT_RULES: dict[str, Any] = {
    "version": FORMAT_RULES_VERSION,
    "schoolName": "default",
    "sourceSummary": "Built-in school thesis formatting rules.",
    "page": {
        "paper": "A4",
        "topMarginCm": 2.5,
        "bottomMarginCm": 2.5,
        "leftMarginCm": 3.0,
        "rightMarginCm": 3.0,
    },
    "styles": {
        "toc_heading": {"cnFont": "黑体", "enFont": "Times New Roman", "fontSizePt": 16, "bold": False, "alignment": "center", "spaceBeforePt": 12, "spaceAfterPt": 18, "lineSpacingMultiple": 1.5},
        "cn_abstract_lead": {"cnFont": "黑体", "enFont": "Times New Roman", "fontSizePt": 16, "bold": False, "alignment": "center", "spaceBeforePt": 12, "spaceAfterPt": 0, "lineSpacingMultiple": 1.5},
        "en_abstract_lead": {"cnFont": "Times New Roman", "enFont": "Times New Roman", "fontSizePt": 16, "bold": True, "alignment": "center", "spaceBeforePt": 12, "spaceAfterPt": 0, "lineSpacingMultiple": 1.5},
        "cn_keywords": {"cnFont": "宋体", "enFont": "Times New Roman", "fontSizePt": 10.5, "bold": None, "alignment": "justify", "firstLineIndentPt": 0, "spaceBeforePt": 0, "spaceAfterPt": 0, "lineSpacingPt": 20},
        "en_keywords": {"cnFont": "Times New Roman", "enFont": "Times New Roman", "fontSizePt": 10.5, "bold": None, "alignment": "justify", "firstLineIndentPt": 0, "spaceBeforePt": 0, "spaceAfterPt": 0, "lineSpacingPt": 20},
        "cn_abstract_body": {"cnFont": "宋体", "enFont": "Times New Roman", "fontSizePt": 10.5, "bold": False, "alignment": "justify", "firstLineIndentPt": 21, "spaceBeforePt": 0, "spaceAfterPt": 0, "lineSpacingPt": 20},
        "en_abstract_body": {"cnFont": "Times New Roman", "enFont": "Times New Roman", "fontSizePt": 10.5, "bold": False, "alignment": "justify", "firstLineIndentPt": 21, "spaceBeforePt": 0, "spaceAfterPt": 0, "lineSpacingPt": 20},
        "heading_1": {"cnFont": "黑体", "enFont": "Times New Roman", "fontSizePt": 14, "bold": False, "alignment": "left", "firstLineIndentPt": 0, "spaceBeforePt": 0, "spaceAfterPt": 0, "lineSpacingPt": 20},
        "heading_2": {"cnFont": "黑体", "enFont": "Times New Roman", "fontSizePt": 12, "bold": False, "alignment": "left", "firstLineIndentPt": 0, "spaceBeforePt": 0, "spaceAfterPt": 0, "lineSpacingPt": 20},
        "heading_3": {"cnFont": "黑体", "enFont": "Times New Roman", "fontSizePt": 10.5, "bold": False, "alignment": "left", "firstLineIndentPt": 0, "spaceBeforePt": 0, "spaceAfterPt": 0, "lineSpacingPt": 20},
        "heading_4": {"cnFont": "黑体", "enFont": "Times New Roman", "fontSizePt": 10.5, "bold": False, "alignment": "left", "firstLineIndentPt": 0, "spaceBeforePt": 0, "spaceAfterPt": 0, "lineSpacingPt": 20},
        "body_text": {"cnFont": "宋体", "enFont": "Times New Roman", "fontSizePt": 10.5, "bold": False, "alignment": "justify", "firstLineIndentPt": 21, "spaceBeforePt": 0, "spaceAfterPt": 0, "lineSpacingPt": 20},
        "caption": {"cnFont": "黑体", "enFont": "Times New Roman", "fontSizePt": 9, "bold": False, "alignment": "center", "firstLineIndentPt": 0, "spaceBeforePt": 0, "spaceAfterPt": 0, "lineSpacingPt": 20},
        "note": {"cnFont": "楷体", "enFont": "Times New Roman", "fontSizePt": 9, "bold": False, "alignment": "left", "firstLineIndentPt": 21, "spaceBeforePt": 0, "spaceAfterPt": 0, "lineSpacingPt": 20},
        "table_text": {"cnFont": "宋体", "enFont": "Times New Roman", "fontSizePt": 9, "bold": False, "alignment": "center", "spaceBeforePt": 0, "spaceAfterPt": 0, "lineSpacingPt": 20},
        "references_heading": {"cnFont": "黑体", "enFont": "Times New Roman", "fontSizePt": 14, "bold": False, "alignment": "center", "spaceBeforePt": 12, "spaceAfterPt": 0, "lineSpacingMultiple": 1.5},
        "references_body": {"cnFont": "宋体", "enFont": "Times New Roman", "fontSizePt": 10.5, "bold": False, "alignment": "justify", "firstLineIndentPt": 0, "spaceBeforePt": 0, "spaceAfterPt": 0, "lineSpacingPt": 20},
        "ack_heading": {"cnFont": "黑体", "enFont": "Times New Roman", "fontSizePt": 16, "bold": False, "alignment": "center", "spaceBeforePt": 12, "spaceAfterPt": 0, "lineSpacingMultiple": 1.5},
        "ack_body": {"cnFont": "宋体", "enFont": "Times New Roman", "fontSizePt": 12, "bold": False, "alignment": "justify", "firstLineIndentPt": 21, "spaceBeforePt": 0, "spaceAfterPt": 0, "lineSpacingPt": 20},
    },
    "notes": [],
}



SIZE_NAME_TO_PT = {
    "\u521d\u53f7": 42.0,
    "\u5c0f\u521d": 36.0,
    "1": 26.0,
    "\u4e00": 26.0,
    "\u5c0f1": 24.0,
    "\u5c0f\u4e00": 24.0,
    "2": 22.0,
    "\u4e8c": 22.0,
    "\u5c0f2": 18.0,
    "\u5c0f\u4e8c": 18.0,
    "3": 16.0,
    "\u4e09": 16.0,
    "\u5c0f3": 15.0,
    "\u5c0f\u4e09": 15.0,
    "4": 14.0,
    "\u56db": 14.0,
    "\u5c0f4": 12.0,
    "\u5c0f\u56db": 12.0,
    "5": 10.5,
    "\u4e94": 10.5,
    "\u5c0f5": 9.0,
    "\u5c0f\u4e94": 9.0,
    "6": 7.5,
    "\u516d": 7.5,
    "\u5c0f6": 6.5,
    "\u5c0f\u516d": 6.5,
    "7": 5.5,
    "\u4e03": 5.5,
    "8": 5.0,
    "\u516b": 5.0,
}
ROLE_MARKERS = {
    "toc_heading": ("\u76ee\u5f55\u6807\u9898", "\u76ee\u5f55\u9898\u540d", "\u76ee\u5f55\u9875\u6807\u9898", "\u76ee\u5f55", "\u76ee \u5f55", "Contents"),
    "cn_abstract_lead": ("\u4e2d\u6587\u6458\u8981\u6807\u9898", "\u6458\u8981\u6807\u9898", "\u6458\u8981\u9898\u540d", "\u4e2d\u6587\u6458\u8981", "\u6458\u8981", "\u6458 \u8981"),
    "cn_abstract_body": ("\u4e2d\u6587\u6458\u8981\u6b63\u6587", "\u4e2d\u6587\u6458\u8981\u5185\u5bb9", "\u6458\u8981\u6b63\u6587", "\u6458\u8981\u5185\u5bb9", "\u6458\u8981\u6587\u5b57", "\u6458\u8981\u6bb5\u843d", "\u6458\u8981"),
    "en_abstract_lead": ("\u82f1\u6587\u6458\u8981\u6807\u9898", "\u82f1\u6587\u6458\u8981\u9898\u540d", "\u82f1\u6587\u6458\u8981", "Abstract title", "Abstract heading", "Abstract", "ABSTRACT"),
    "en_abstract_body": ("\u82f1\u6587\u6458\u8981\u6b63\u6587", "\u82f1\u6587\u6458\u8981\u5185\u5bb9", "\u82f1\u6587\u6458\u8981\u6bb5\u843d", "\u82f1\u6587\u6458\u8981\u6587\u5b57", "Abstract body", "Abstract content", "Abstract paragraph", "Abstract"),
    "cn_keywords": ("\u5173\u952e\u8bcd\u5185\u5bb9", "\u5173\u952e\u5b57\u5185\u5bb9", "\u4e2d\u6587\u5173\u952e\u8bcd", "\u5173\u952e\u8bcd", "\u5173\u952e\u5b57"),
    "en_keywords": ("\u82f1\u6587\u5173\u952e\u8bcd\u5185\u5bb9", "\u82f1\u6587\u5173\u952e\u8bcd", "Key words content", "Keywords content", "Key words", "Keywords", "Key Words", "KEYWORDS"),
    "heading_1": ("\u4e00\u7ea7\u6807\u9898", "1\u7ea7\u6807\u9898", "\u7b2c\u4e00\u5c42\u6b21\u6807\u9898", "\u7b2c\u4e00\u5c42\u6807\u9898", "\u7b2c\u4e00\u7ea7\u6807\u9898", "\u7ae0\u6807\u9898", "\u7ae0\u9898", "\u6807\u98981", "\u6807\u9898\u4e00"),
    "heading_2": ("\u4e8c\u7ea7\u6807\u9898", "2\u7ea7\u6807\u9898", "\u7b2c\u4e8c\u5c42\u6b21\u6807\u9898", "\u7b2c\u4e8c\u5c42\u6807\u9898", "\u7b2c\u4e8c\u7ea7\u6807\u9898", "\u8282\u6807\u9898", "\u8282\u9898", "\u6807\u98982", "\u6807\u9898\u4e8c"),
    "heading_3": ("\u4e09\u7ea7\u6807\u9898", "3\u7ea7\u6807\u9898", "\u7b2c\u4e09\u5c42\u6b21\u6807\u9898", "\u7b2c\u4e09\u5c42\u6807\u9898", "\u7b2c\u4e09\u7ea7\u6807\u9898", "\u5c0f\u8282\u6807\u9898", "\u6761\u6807\u9898", "\u6807\u98983", "\u6807\u9898\u4e09"),
    "heading_4": ("\u56db\u7ea7\u6807\u9898", "4\u7ea7\u6807\u9898", "\u7b2c\u56db\u5c42\u6b21\u6807\u9898", "\u7b2c\u56db\u5c42\u6807\u9898", "\u7b2c\u56db\u7ea7\u6807\u9898", "\u6b3e\u6807\u9898", "\u6807\u98984", "\u6807\u9898\u56db"),
    "body_text": ("\u8bba\u6587\u6b63\u6587", "\u6b63\u6587\u6bb5\u843d", "\u6b63\u6587\u6587\u5b57", "\u6b63\u6587\u5185\u5bb9", "\u6b63\u6587\u683c\u5f0f", "\u6b63\u6587\u5b57\u4f53", "\u4e3b\u4f53\u6587\u5b57", "\u4e00\u822c\u6b63\u6587", "\u6bb5\u843d\u6587\u5b57", "\u6b63\u6587"),
    "caption": ("\u56fe\u9898", "\u8868\u9898", "\u9898\u6ce8", "\u56fe\u8868\u6807\u9898", "\u56fe\u8868\u9898\u6ce8", "\u56fe\u8868\u540d\u79f0", "\u63d2\u56fe\u6807\u9898", "\u8868\u683c\u6807\u9898", "\u56fe\u5e8f", "\u56fe\u540d", "\u8868\u5e8f", "\u8868\u540d"),
    "note": ("\u56fe\u8868\u6ce8\u91ca", "\u56fe\u8868\u8bf4\u660e", "\u56fe\u6ce8", "\u8868\u6ce8", "\u56fe\u8868\u6ce8", "\u8d44\u6599\u6765\u6e90", "\u6ce8\u91ca\u6587\u5b57", "\u6ce8\u91ca", "\u8bf4\u660e\u6587\u5b57"),
    "table_text": ("\u8868\u683c\u5185\u5bb9", "\u8868\u683c\u5185", "\u8868\u5185\u6587\u5b57", "\u8868\u4e2d\u6587\u5b57", "\u8868\u683c\u6587\u5b57", "\u8868\u4e2d\u5185\u5bb9", "\u8868\u683c\u6b63\u6587", "\u8868\u683c\u9879\u76ee"),
    "references_heading": ("\u53c2\u8003\u6587\u732e\u6807\u9898", "\u6587\u540e\u53c2\u8003\u6587\u732e\u6807\u9898", "\u53c2\u8003\u4e66\u76ee\u6807\u9898", "\u53c2\u8003\u6587\u732e"),
    "references_body": ("\u53c2\u8003\u6587\u732e\u5185\u5bb9", "\u53c2\u8003\u6587\u732e\u6b63\u6587", "\u53c2\u8003\u6587\u732e\u6761\u76ee", "\u53c2\u8003\u4e66\u76ee\u6761\u76ee", "\u53c2\u8003\u4e66\u76ee\u5185\u5bb9", "\u53c2\u8003\u4e66\u76ee\u6b63\u6587", "\u4e66\u76ee\u6761\u76ee", "\u6587\u732e\u6761\u76ee", "\u6587\u732e\u5185\u5bb9", "\u6587\u732e\u6b63\u6587", "\u6587\u540e\u53c2\u8003\u6587\u732e", "\u53c2\u8003\u4e66\u76ee", "\u53c2\u8003\u6587\u732e"),
    "ack_heading": ("\u81f4\u8c22\u6807\u9898", "\u8c22\u8f9e\u6807\u9898", "\u9e23\u8c22\u6807\u9898", "\u81f4\u8c22", "\u8c22\u8f9e", "\u9e23\u8c22"),
    "ack_body": ("\u81f4\u8c22\u5185\u5bb9", "\u8c22\u8f9e\u5185\u5bb9", "\u9e23\u8c22\u5185\u5bb9", "\u81f4\u8c22\u6b63\u6587", "\u8c22\u8f9e\u6b63\u6587", "\u9e23\u8c22\u6b63\u6587", "\u81f4\u8c22", "\u8c22\u8f9e", "\u9e23\u8c22"),
}
STYLE_ROLE_KEYS = tuple(DEFAULT_FORMAT_RULES["styles"].keys())
AI_ROLE_ALIASES = {
    "toc_heading": ("toc", "toc_title", "contents_title", "table_of_contents_heading", "目录标题", "目录页标题", "目录题名"),
    "cn_abstract_lead": ("cn_abstract_title", "chinese_abstract_title", "zh_abstract_heading", "abstract_heading_cn", "摘要标题", "中文摘要标题", "摘要题名"),
    "cn_abstract_body": ("cn_abstract_content", "cn_abstract_body", "chinese_abstract_body", "zh_abstract_body", "abstract_body_cn", "摘要正文", "摘要内容", "中文摘要正文", "中文摘要内容", "摘要文字"),
    "en_abstract_lead": ("en_abstract_title", "english_abstract_title", "abstract_title", "abstract_heading", "abstract_heading_en", "英文摘要标题", "英文摘要题名"),
    "en_abstract_body": ("en_abstract_content", "en_abstract_body", "english_abstract_body", "abstract_body", "abstract_content", "abstract_body_en", "英文摘要正文", "英文摘要内容", "英文摘要文字"),
    "cn_keywords": ("cn_keywords", "chinese_keywords", "keyword_content_cn", "关键词内容", "关键词正文", "中文关键词"),
    "en_keywords": ("en_keywords", "english_keywords", "key_words", "keyword_content_en", "英文关键词", "英文关键词内容"),
    "heading_1": ("h1", "heading1", "heading_1", "title1", "level1_heading", "level_1_heading", "chapter_title", "chapter_heading", "first_level_heading", "章标题", "章题", "一级标题", "1级标题", "第一层标题"),
    "heading_2": ("h2", "heading2", "heading_2", "title2", "level2_heading", "level_2_heading", "section_title", "section_heading", "second_level_heading", "节标题", "节题", "二级标题", "2级标题", "第二层标题"),
    "heading_3": ("h3", "heading3", "heading_3", "title3", "level3_heading", "level_3_heading", "subsection_title", "third_level_heading", "三级标题", "3级标题", "第三层标题"),
    "heading_4": ("h4", "heading4", "heading_4", "title4", "level4_heading", "level_4_heading", "fourth_level_heading", "四级标题", "4级标题", "第四层标题"),
    "body_text": ("body", "body_text", "main_text", "paragraph", "content_text", "normal_text", "正文", "论文正文", "正文段落", "正文文字", "正文字体", "正文格式", "主体文字", "段落文字"),
    "caption": ("caption", "figure_caption", "table_caption", "caption_text", "图题", "表题", "图表标题", "图表题注"),
    "note": ("note", "figure_note", "table_note", "chart_note", "图注", "表注", "图表注释", "图表说明"),
    "table_text": ("table_text", "table_body", "table_content", "table_cell_text", "表内文字", "表格内容", "表格文字"),
    "references_heading": ("references_title", "references_heading", "reference_heading", "bibliography_title", "参考文献标题", "文献标题", "参考书目标题"),
    "references_body": ("references_body", "reference_items", "references_items", "bibliography_body", "bibliography_items", "参考文献正文", "参考文献内容", "文献条目", "参考文献条目", "参考书目"),
    "ack_heading": ("ack_heading", "ack_title", "acknowledgement_title", "acknowledgments_title", "thanks_heading", "致谢标题", "谢辞标题", "鸣谢标题"),
    "ack_body": ("ack_body", "ack_content", "acknowledgement_body", "acknowledgements_body", "thanks_body", "致谢正文", "致谢内容", "谢辞正文", "谢辞内容", "鸣谢正文", "鸣谢内容"),
}
STYLE_GROUP_ALIASES = {
    "headings": ("headings", "headingStyles", "heading_levels", "titleLevels", "标题层级", "标题样式", "标题"),
    "cn_abstract": ("cn_abstract", "chineseAbstract", "zhAbstract", "中文摘要"),
    "en_abstract": ("en_abstract", "englishAbstract", "英文摘要"),
    "references": ("references", "bibliography", "referenceList", "参考文献", "参考书目"),
    "ack": ("ack", "acknowledgement", "acknowledgements", "thanks", "致谢", "谢辞", "鸣谢"),
}
GROUP_CHILD_ROLE_ALIASES = {
    "headings": {
        "1": "heading_1",
        "level1": "heading_1",
        "level_1": "heading_1",
        "h1": "heading_1",
        "一级": "heading_1",
        "一层": "heading_1",
        "第一层": "heading_1",
        "chapter": "heading_1",
        "2": "heading_2",
        "level2": "heading_2",
        "level_2": "heading_2",
        "h2": "heading_2",
        "二级": "heading_2",
        "二层": "heading_2",
        "第二层": "heading_2",
        "section": "heading_2",
        "3": "heading_3",
        "level3": "heading_3",
        "level_3": "heading_3",
        "h3": "heading_3",
        "三级": "heading_3",
        "三层": "heading_3",
        "第三层": "heading_3",
        "subsection": "heading_3",
        "4": "heading_4",
        "level4": "heading_4",
        "level_4": "heading_4",
        "h4": "heading_4",
        "四级": "heading_4",
        "四层": "heading_4",
        "第四层": "heading_4",
    },
    "cn_abstract": {"title": "cn_abstract_lead", "heading": "cn_abstract_lead", "lead": "cn_abstract_lead", "标题": "cn_abstract_lead", "body": "cn_abstract_body", "content": "cn_abstract_body", "正文": "cn_abstract_body", "内容": "cn_abstract_body", "keywords": "cn_keywords", "关键词": "cn_keywords"},
    "en_abstract": {"title": "en_abstract_lead", "heading": "en_abstract_lead", "lead": "en_abstract_lead", "标题": "en_abstract_lead", "body": "en_abstract_body", "content": "en_abstract_body", "正文": "en_abstract_body", "内容": "en_abstract_body", "keywords": "en_keywords", "key_words": "en_keywords", "关键词": "en_keywords"},
    "references": {"title": "references_heading", "heading": "references_heading", "标题": "references_heading", "body": "references_body", "content": "references_body", "items": "references_body", "item": "references_body", "正文": "references_body", "内容": "references_body", "条目": "references_body"},
    "ack": {"title": "ack_heading", "heading": "ack_heading", "标题": "ack_heading", "body": "ack_body", "content": "ack_body", "正文": "ack_body", "内容": "ack_body"},
}
FONT_NAMES = (
    "\u5b8b\u4f53",
    "\u9ed1\u4f53",
    "\u6977\u4f53",
    "\u4eff\u5b8b",
    "\u4eff\u5b8bGB2312",
    "\u4eff\u5b8b_GB2312",
    "\u6977\u4f53_GB2312",
    "\u5fae\u8f6f\u96c5\u9ed1",
    "\u534e\u6587\u4e2d\u5b8b",
    "\u65b9\u6b63\u5c0f\u6807\u5b8b\u7b80\u4f53",
    "Times New Roman",
    "Arial",
    "Calibri",
    "Cambria",
    "Courier New",
)
FONT_VALUE_ALIASES = {
    "simsun": "宋体",
    "songti": "宋体",
    "simhei": "黑体",
    "heiti": "黑体",
    "kaiti": "楷体",
    "kai": "楷体",
    "fangsong": "仿宋",
    "fangsonggb2312": "仿宋GB2312",
    "timesnewroman": "Times New Roman",
    "times": "Times New Roman",
    "microsoftyahei": "微软雅黑",
    "yahei": "微软雅黑",
}
CONTENT_STYLE_ROLES = {"cn_abstract_body", "en_abstract_body", "cn_keywords", "en_keywords", "references_body", "ack_body"}
HEADING_STYLE_ROLES = {"toc_heading", "cn_abstract_lead", "en_abstract_lead", "references_heading", "ack_heading", "heading_1", "heading_2", "heading_3", "heading_4"}
REQUIRED_FORMAT_ROLES = [
    "body_text",
    "heading_1",
    "heading_2",
    "heading_3",
    "cn_abstract_lead",
    "cn_abstract_body",
    "cn_keywords",
    "references_heading",
    "references_body",
    "ack_heading",
    "ack_body",
]
_ALL_ROLE_MARKERS = tuple(dict.fromkeys(marker for markers in ROLE_MARKERS.values() for marker in markers))
_ALL_ROLE_MARKER_RE = re.compile(
    "|".join(re.escape(marker) for marker in sorted(_ALL_ROLE_MARKERS, key=len, reverse=True)),
    flags=re.IGNORECASE,
)
_AMBIGUOUS_ROLE_MARKERS = {"\u6458\u8981", "\u6458 \u8981", "Abstract", "ABSTRACT", "\u5173\u952e\u8bcd", "\u5173\u952e\u5b57", "Key words", "Keywords", "Key Words", "KEYWORDS", "\u53c2\u8003\u6587\u732e", "\u81f4\u8c22", "\u8c22\u8f9e"}


def _role_key_signature(value: str) -> str:
    return re.sub(r"[\s_\-./\\:：,，;；()（）\[\]【】{}]+", "", str(value or "").strip().lower())


def _build_role_alias_map() -> dict[str, str]:
    alias_map: dict[str, str] = {}
    for role in STYLE_ROLE_KEYS:
        alias_map[_role_key_signature(role)] = role
        alias_map[_role_key_signature(role.replace("_", ""))] = role
    for role, aliases in AI_ROLE_ALIASES.items():
        for alias in aliases:
            alias_map[_role_key_signature(alias)] = role
    for role, markers in ROLE_MARKERS.items():
        for marker in markers:
            if marker in _AMBIGUOUS_ROLE_MARKERS:
                continue
            alias_map.setdefault(_role_key_signature(marker), role)
    return alias_map


ROLE_ALIAS_TO_CANONICAL = _build_role_alias_map()


def _canonical_format_role(role: Any) -> str | None:
    raw = str(role or "").strip()
    if raw in STYLE_ROLE_KEYS:
        return raw
    return ROLE_ALIAS_TO_CANONICAL.get(_role_key_signature(raw))


def _canonical_style_field_key(value: Any) -> str | None:
    signature = _role_key_signature(value)
    for key, aliases in STYLE_KEY_ALIASES.items():
        if signature == _role_key_signature(key):
            return key
        if any(signature == _role_key_signature(alias) for alias in aliases):
            return key
    return None


def _normalize_explicit_fields(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        raw_items: list[Any] = [item for item in re.split(r"[\s,，;；、|/]+", value) if item]
    elif isinstance(value, dict):
        raw_items = [key for key, enabled in value.items() if enabled is not False]
    elif isinstance(value, (list, tuple, set)):
        raw_items = list(value)
    else:
        return []
    result: list[str] = []
    for item in raw_items:
        key = _canonical_style_field_key(item)
        if key and key not in result:
            result.append(key)
    return result


def _canonical_style_group(value: Any) -> str | None:
    signature = _role_key_signature(value)
    for group, aliases in STYLE_GROUP_ALIASES.items():
        if signature == _role_key_signature(group):
            return group
        if any(signature == _role_key_signature(alias) for alias in aliases):
            return group
    return None


def _canonical_group_child_role(group: str, child: Any) -> str | None:
    child_signature = _role_key_signature(child)
    for alias, role in GROUP_CHILD_ROLE_ALIASES.get(group, {}).items():
        if child_signature == _role_key_signature(alias):
            return role
    return _canonical_format_role(child)


def _normalize_instruction_text(text: str) -> str:
    normalized = re.sub(r"[\r\n]+", "\n", text or "")
    normalized = re.sub(r"[\u3000\t]+", " ", normalized)
    return normalized.translate(FULLWIDTH_TRANSLATION)


def _flatten_text_fragments(value: Any) -> list[str]:
    if value in (None, ""):
        return []
    if isinstance(value, dict):
        fragments: list[str] = []
        for item in value.values():
            fragments.extend(_flatten_text_fragments(item))
        return fragments
    if isinstance(value, (list, tuple, set)):
        fragments: list[str] = []
        for item in value:
            fragments.extend(_flatten_text_fragments(item))
        return fragments
    return [_normalize_scalar_text(value)]


def _split_instruction_units(text: str) -> list[str]:
    units: list[str] = []
    for line in text.splitlines():
        normalized_line = line.strip()
        if not normalized_line:
            continue
        parts = re.split(r"(?<=[\u3002\uff1b;])", normalized_line)
        for part in parts:
            candidate = part.strip()
            if candidate:
                units.append(candidate)
    return units


def _context_windows(text: str, markers: tuple[str, ...], *, radius: int = 180) -> list[str]:
    windows: list[str] = []
    units = _split_instruction_units(text)
    for marker in markers:
        for index, unit in enumerate(units):
            if re.search(re.escape(marker), unit, flags=re.IGNORECASE):
                context = unit
                next_unit = units[index + 1] if index + 1 < len(units) else ""
                if next_unit and re.search(r"(?:\u5185\u5bb9\u6587\u5b57|\u5185\u5bb9)\s*(?:\u7528|\u4e3a|\u5b57\u4f53\u4e3a)?", next_unit):
                    context = f"{unit}{next_unit}"
                windows.append(context[:radius])
    return windows


def _context_has_style_signal(context: str) -> bool:
    if any(font in context for font in FONT_NAMES):
        return True
    return bool(
        re.search(
            r"(\u5c0f?\s*[1-8\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b]\s*\u53f7|\u521d\u53f7|\u5c0f\u521d|\u5b57\u4f53|\u5b57\u53f7|\u884c\u8ddd|\u884c\u95f4\u8ddd|\u5c45\u4e2d|\u5c45\u5de6|\u5c45\u53f3|\u5bf9\u9f50|\u52a0\u7c97|\u6bb5\u524d|\u6bb5\u540e|\u9996\u884c\u7f29\u8fdb|\d+(?:\.\d+)?\s*(?:pt|\u78c5))",
            context,
            flags=re.IGNORECASE,
        )
    )


GENERIC_HEADING_MARKER_RE = re.compile(r"^(?:\u6807\u9898|\u9898\u540d)[1-4\u4e00\u4e8c\u4e09\u56db]$", flags=re.IGNORECASE)
SCOPED_HEADING_PREFIXES = (
    "\u53c2\u8003\u6587\u732e",
    "\u53c2\u8003\u4e66\u76ee",
    "\u6458\u8981",
    "Abstract",
    "\u76ee\u5f55",
    "\u81f4\u8c22",
    "\u8c22\u8f9e",
    "\u9e23\u8c22",
    "\u56fe\u8868",
    "\u56fe",
    "\u8868",
)


def _is_usable_role_marker_match(unit: str, role: str, marker: str, start: int, end: int) -> bool:
    if role.startswith("heading_") and GENERIC_HEADING_MARKER_RE.match(marker):
        next_char = unit[end : end + 1]
        if next_char in {"\u53f7", "\u865f"}:
            return False
        prefix = unit[max(0, start - 12) : start]
        if any(scoped in prefix for scoped in SCOPED_HEADING_PREFIXES):
            return False
    return True


def _role_context_windows(text: str, role: str, markers: tuple[str, ...], *, radius: int = 260) -> list[str]:
    windows: list[str] = []
    seen: set[str] = set()
    units = _split_instruction_units(text)
    for index, unit in enumerate(units):
        role_matches: list[tuple[int, int, str, str]] = []
        for marker_role, role_markers in ROLE_MARKERS.items():
            for marker in role_markers:
                for match in re.finditer(re.escape(marker), unit, flags=re.IGNORECASE):
                    if _is_usable_role_marker_match(unit, marker_role, marker, match.start(), match.end()):
                        role_matches.append((match.start(), match.end(), marker_role, marker))
        if not role_matches:
            continue
        role_matches.sort(key=lambda item: (item[0], -(item[1] - item[0])))
        for match_index, (start, end, marker_role, _marker) in enumerate(role_matches):
            if marker_role != role:
                continue
            next_start = len(unit)
            for other_start, _other_end, _other_role, _other_marker in role_matches[match_index + 1:]:
                if other_start >= end and _other_role != marker_role:
                    next_start = other_start
                    break
            context = unit[start:min(len(unit), max(end, min(next_start, start + radius)))]
            if role in CONTENT_STYLE_ROLES and index + 1 < len(units) and _looks_like_content_style_continuation(units[index + 1]):
                context = f"{context}{units[index + 1]}"
            elif (
                len(context) < 24
                and index + 1 < len(units)
                and not _context_has_style_signal(context)
                and not (role in HEADING_STYLE_ROLES and _looks_like_content_style_continuation(units[index + 1]))
            ):
                context = f"{context}{units[index + 1]}"
            context = context.strip()[:radius]
            if context and context not in seen:
                seen.add(context)
                windows.append(context)
    if not windows:
        windows.extend(_context_windows(text, markers, radius=radius))
    return windows


def _looks_like_content_style_continuation(unit: str) -> bool:
    return bool(
        re.search(r"(?:\u5185\u5bb9|\u6b63\u6587|\u6587\u5b57|\u6761\u76ee)\s*(?:\u7528|\u91c7\u7528|\u4e3a|\u5b57\u4f53)", unit)
        or re.search(r"(?:\u884c\u8ddd|\u884c\u95f4\u8ddd|\u5b57\u53f7|\u5b57\u4f53)", unit)
    )


def _extract_font(context: str, *, prefer_english: bool = False) -> str | None:
    fonts = _extract_fonts(context, prefer_english=prefer_english)
    return fonts.get("enFont") if prefer_english and fonts.get("enFont") else fonts.get("cnFont") or fonts.get("enFont")


def _extract_fonts(context: str, *, prefer_english: bool = False) -> dict[str, str]:
    result: dict[str, str] = {}
    latin_fonts = ("Times New Roman", "Arial", "Calibri", "Cambria", "Courier New")
    cjk_fonts = tuple(font for font in FONT_NAMES if font not in latin_fonts)
    cjk_found: list[tuple[int, str]] = []
    latin_found: list[tuple[int, str]] = []
    for font in cjk_fonts:
        if font in context:
            cjk_found.append((context.index(font), font))
    for font in latin_fonts:
        if font.lower() == "times new roman":
            pattern = r"Times\s*New\s*Roman"
        else:
            pattern = re.escape(font).replace("\\ ", r"\s+")
        match = re.search(pattern, context, flags=re.IGNORECASE)
        if match:
            canonical = "Times New Roman" if font.lower() == "times new roman" else font
            latin_found.append((match.start(), canonical))
    if cjk_found:
        result["cnFont"] = min(cjk_found, key=lambda item: (item[0], -len(item[1])))[1]
    if latin_found:
        result["enFont"] = min(latin_found, key=lambda item: (item[0], -len(item[1])))[1]
    if prefer_english and result.get("enFont") and not result.get("cnFont"):
        result["cnFont"] = result["enFont"]
    return result


def _extract_font_legacy(context: str, *, prefer_english: bool = False) -> str | None:
    if prefer_english and re.search(r"Times\s+New\s+Roman", context, flags=re.IGNORECASE):
        return "Times New Roman"
    found: list[tuple[int, str]] = []
    for font in FONT_NAMES:
        if font == "Times New Roman":
            match = re.search(r"Times\s+New\s+Roman", context, flags=re.IGNORECASE)
            if match:
                found.append((match.start(), "Times New Roman"))
        elif font in context:
            found.append((context.index(font), font))
    return min(found, key=lambda item: item[0])[1] if found else None


def _normalize_size_token(prefix: str, value: str) -> str:
    token = value.strip()
    if prefix.strip():
        token = "\u5c0f" + token
    return token.replace(" ", "")


def _extract_font_size_pt(context: str) -> float | None:
    patterns = (
        r"(\u5c0f?)\s*([1-8])\s*\u53f7(?:\u5b57)?",
        r"(\u5c0f?)\s*([\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b])\s*\u53f7(?:\u5b57)?",
        r"(\u5c0f)\s*([1-8\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b])",
    )
    named = re.search(r"(\u5c0f\u521d|\u521d\u53f7|\u5c0f\u4e00|\u4e00\u53f7|\u5c0f\u4e8c|\u4e8c\u53f7|\u5c0f\u4e09|\u4e09\u53f7|\u5c0f\u56db|\u56db\u53f7|\u5c0f\u4e94|\u4e94\u53f7|\u5c0f\u516d|\u516d\u53f7|\u4e03\u53f7|\u516b\u53f7)", context)
    if named:
        raw_key = named.group(1)
        key = raw_key if raw_key in SIZE_NAME_TO_PT else raw_key.replace("\u53f7", "")
        if key in SIZE_NAME_TO_PT:
            return SIZE_NAME_TO_PT[key]
    for pattern in patterns:
        match = re.search(pattern, context)
        if not match:
            continue
        key = _normalize_size_token(match.group(1), match.group(2))
        if key in SIZE_NAME_TO_PT:
            return SIZE_NAME_TO_PT[key]
    pt_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:pt|\u78c5)", context, flags=re.IGNORECASE)
    if pt_match:
        return float(pt_match.group(1))
    return None


def _extract_line_spacing(context: str) -> dict[str, float]:
    result: dict[str, float] = {}
    fixed_patterns = (
        r"(?:\u884c\u8ddd|\u884c\u95f4\u8ddd)[^0-9\u3002\uff1b;]{0,16}(?:\u56fa\u5b9a(?:\u503c)?[^0-9]{0,8})?(\d+(?:\.\d+)?)\s*(?:pt|\u78c5)",
        r"\u56fa\u5b9a(?:\u503c)?[^0-9\u3002\uff1b;]{0,8}(\d+(?:\.\d+)?)\s*(?:pt|\u78c5)",
        r"(\d+(?:\.\d+)?)\s*(?:pt|\u78c5)[^。\uff1b;]{0,12}\u56fa\u5b9a(?:\u884c\u8ddd|\u884c\u95f4\u8ddd)?",
    )
    for pattern in fixed_patterns:
        fixed = re.search(pattern, context, flags=re.IGNORECASE)
        if fixed:
            result["lineSpacingPt"] = float(fixed.group(1))
            result["lineSpacingMultiple"] = None
            break
    multiple = re.search(r"(\d+(?:\.\d+)?)\s*\u500d(?:\u884c\u8ddd|\u884c\u95f4\u8ddd)?", context)
    if multiple:
        result["lineSpacingMultiple"] = float(multiple.group(1))
        result["lineSpacingPt"] = None
    elif "\u5355\u500d\u884c\u8ddd" in context:
        result["lineSpacingMultiple"] = 1.0
        result["lineSpacingPt"] = None
    elif "\u53cc\u500d\u884c\u8ddd" in context:
        result["lineSpacingMultiple"] = 2.0
        result["lineSpacingPt"] = None
    return result


def _extract_alignment(context: str) -> str | None:
    if "\u4e24\u7aef\u5bf9\u9f50" in context or "\u4e24\u8fb9\u5bf9\u9f50" in context or "\u5206\u6563\u5bf9\u9f50" in context:
        return "justify"
    if "\u53f3\u5bf9\u9f50" in context or "\u5c45\u53f3" in context or "\u9760\u53f3" in context:
        return "right"
    if "\u5c45\u5de6" in context or "\u5de6\u5bf9\u9f50" in context or "\u9760\u5de6" in context or "\u5de6\u9f50" in context:
        return "left"
    if "\u5c45\u4e2d" in context or "\u4e2d\u5fc3\u5bf9\u9f50" in context:
        return "center"
    return None


def _extract_bold(context: str) -> bool | None:
    if "\u4e0d\u52a0\u7c97" in context:
        return False
    if "\u52a0\u7c97" in context:
        return True
    return None


def _extract_indent(context: str) -> float | None:
    if re.search(r"\u4e24\u4e2a\u5b57(?:\u4e2d\u95f4|\u4e4b\u95f4)\u7a7a\u4e24\u683c", context):
        return None
    if re.search(r"\u9996\u884c(?:\u7f29\u8fdb)?\s*0\s*(?:\u5b57\u7b26|\u5b57|\u683c|cm|\u5398\u7c73)", context):
        return 0.0
    if "\u4e0d\u7f29\u8fdb" in context or "\u65e0\u9996\u884c\u7f29\u8fdb" in context:
        return 0.0
    if (
        "\u7a7a\u4e24\u683c" in context
        or "\u7a7a\u4e8c\u683c" in context
        or "\u9996\u884c\u7f29\u8fdb\u4e24\u5b57" in context
        or "\u9996\u884c\u7f29\u8fdb\u4e8c\u5b57" in context
        or re.search(r"\u9996\u884c(?:\u7f29\u8fdb)?\s*2\s*(?:\u5b57\u7b26|\u4e2a\u5b57|\u5b57|\u683c)", context)
        or re.search(r"\u9996\u884c(?:\u7f29\u8fdb)?\s*\u4e8c\s*(?:\u5b57\u7b26|\u4e2a\u5b57|\u5b57|\u683c)", context)
    ):
        return 21.0
    em_match = re.search(r"\u9996\u884c(?:\u7f29\u8fdb)?\s*(\d+(?:\.\d+)?)\s*(?:em|ch)", context, flags=re.IGNORECASE)
    if em_match:
        return round(float(em_match.group(1)) * 10.5, 2)
    cm_match = re.search(r"\u9996\u884c(?:\u7f29\u8fdb)?\s*(\d+(?:\.\d+)?)\s*(?:cm|\u5398\u7c73)", context, flags=re.IGNORECASE)
    if cm_match:
        return round(float(cm_match.group(1)) * 28.35, 2)
    if "\u5de6\u9876\u683c" in context or "\u9876\u683c" in context:
        return 0.0
    return None


def _extract_paragraph_spacing(context: str) -> dict[str, float]:
    result: dict[str, float] = {}
    for key, label in (("spaceBeforePt", "\u6bb5\u524d"), ("spaceAfterPt", "\u6bb5\u540e")):
        match = re.search(rf"{label}\s*(\d+(?:\.\d+)?)\s*(?:pt|\u78c5)", context, flags=re.IGNORECASE)
        if match:
            result[key] = float(match.group(1))
            continue
        line_match = re.search(rf"{label}\s*(\d+(?:\.\d+)?)\s*\u884c", context)
        if line_match:
            result[key] = round(float(line_match.group(1)) * 12.0, 2)
    if "\u4e0a\u9762\u7a7a\u4e00\u884c" in context or "\u4e0a\u7a7a\u4e00\u884c" in context:
        result.setdefault("spaceBeforePt", 12.0)
    return result


def _length_to_cm(value: float, unit: str) -> float:
    normalized_unit = str(unit or "").lower()
    if normalized_unit in {"mm", "\u6beb\u7c73"}:
        return round(value / 10.0, 3)
    return round(value, 3)


PAGE_MARGIN_LABELS = {
    "topMarginCm": ("上", "上边", "上边距", "页边距上"),
    "bottomMarginCm": ("下", "下边", "下边距", "页边距下"),
    "leftMarginCm": ("左", "左边", "左边距", "页边距左"),
    "rightMarginCm": ("右", "右边", "右边距", "页边距右"),
}


def _extract_page_margin_values(text: str) -> dict[str, float]:
    page: dict[str, float] = {}
    contexts = [match.group(0) for match in re.finditer(r"(?:页边距|页面边距|版心|版面|纸张边距|边距)[^。\n\uff1b;]{0,180}", text, flags=re.IGNORECASE)]
    if not contexts and re.search(r"(?:上|下|左|右)[^。\n\uff1b;]{0,80}(?:cm|厘米|mm|毫米)", text, flags=re.IGNORECASE):
        contexts = [text]
    for context in contexts:
        shared_unit_match = re.search(r"(cm|厘米|mm|毫米)", context, flags=re.IGNORECASE)
        shared_unit = shared_unit_match.group(1) if shared_unit_match else "cm"
        sequence = re.search(
            r"上\s*[、,，/]\s*下\s*[、,，/]\s*左\s*[、,，/]\s*右[^0-9]{0,16}"
            r"(\d+(?:\.\d+)?)\s*[、,，/]\s*(\d+(?:\.\d+)?)\s*[、,，/]\s*(\d+(?:\.\d+)?)\s*[、,，/]\s*(\d+(?:\.\d+)?)\s*(cm|厘米|mm|毫米)?",
            context,
            flags=re.IGNORECASE,
        )
        if sequence:
            unit = sequence.group(5) or shared_unit
            for key, group_index in (("topMarginCm", 1), ("bottomMarginCm", 2), ("leftMarginCm", 3), ("rightMarginCm", 4)):
                page[key] = _length_to_cm(float(sequence.group(group_index)), unit)
        all_sides = re.search(r"(?:上下左右|四周|各边|四边)[^0-9]{0,16}(\d+(?:\.\d+)?)\s*(cm|厘米|mm|毫米)", context, flags=re.IGNORECASE)
        if all_sides:
            value = _length_to_cm(float(all_sides.group(1)), all_sides.group(2))
            for key in PAGE_MARGIN_LABELS:
                page.setdefault(key, value)
        for key, labels in PAGE_MARGIN_LABELS.items():
            label_pattern = "|".join(re.escape(label) for label in sorted(labels, key=len, reverse=True))
            for match in re.finditer(rf"(?:{label_pattern})\s*(?:[:：为是=]|边距|距)?\s*(\d+(?:\.\d+)?)\s*(cm|厘米|mm|毫米)?", context, flags=re.IGNORECASE):
                unit = match.group(2) or shared_unit
                page[key] = _length_to_cm(float(match.group(1)), unit)
    return page


def _extract_content_rule_context_legacy(context: str) -> str | None:
    patterns = (
        r"(?:\uff08|\()(?:[^\uff09)]{0,20})?(?:\u5185\u5bb9\u6587\u5b57|\u5185\u5bb9)\s*(?:\u7528|\u4e3a|\u5b57\u4f53\u4e3a)?(?P<body>[^\uff09)]{1,140})(?:\uff09|\))",
        r"(?:\u5185\u5bb9\u6587\u5b57|\u5185\u5bb9)\s*(?:\u7528|\u4e3a|\u5b57\u4f53\u4e3a)?(?P<body>[^。\uff1b;]{1,140})",
    )
    for pattern in patterns:
        match = re.search(pattern, context, flags=re.IGNORECASE)
        if match:
            return match.group("body").strip()
    return None


def _strip_content_parentheticals(context: str) -> str:
    stripped = re.sub(r"[\uff08(][^\uff09)]*(?:\u5185\u5bb9\u6587\u5b57|\u5185\u5bb9)[^\uff09)]*[\uff09)]", "", context)
    return re.split(r"[\u3002\uff1b;]\s*(?:\u5185\u5bb9\u6587\u5b57|\u5185\u5bb9)\s*", stripped, maxsplit=1)[0]


def _extract_content_rule_context(context: str) -> str | None:
    content_marker = r"(?:\u5185\u5bb9\u6587\u5b57|\u5185\u5bb9|\u6b63\u6587|\u6761\u76ee|\u6587\u5b57|body|paragraph)"
    patterns = (
        rf"(?:\uff08|\()(?:[^\uff09)]{{0,20}})?{content_marker}\s*(?:\uff1a|:|\u7528|\u91c7\u7528|\u4e3a|\u5b57\u4f53\u4e3a)?(?P<body>[^\uff09)]{{1,140}})(?:\uff09|\))",
        rf"{content_marker}\s*(?:\uff1a|:|\u7528|\u91c7\u7528|\u4e3a|\u5b57\u4f53\u4e3a)?(?P<body>[^\u3002\uff1b;]{{1,140}})",
    )
    matches: list[str] = []
    for pattern in patterns:
        for match in re.finditer(pattern, context, flags=re.IGNORECASE):
            body = match.group("body").strip()
            if body:
                matches.append(body)
    if matches:
        return matches[0]
    return None


def _style_context_for_role(role: str, context: str) -> str:
    if role in CONTENT_STYLE_ROLES:
        return _extract_content_rule_context(context) or context
    if role in HEADING_STYLE_ROLES:
        return _strip_content_parentheticals(context)
    return context


def _is_role_context_candidate(role: str, context: str) -> bool:
    if role in CONTENT_STYLE_ROLES:
        if role == "cn_keywords":
            if "\u5173\u952e\u8bcd" not in context and "\u5173\u952e\u5b57" not in context:
                return False
        elif role == "en_keywords":
            if not re.search(r"\b(?:Key\s*words|Keywords)\b", context, flags=re.IGNORECASE) and "\u82f1\u6587\u5173\u952e\u8bcd" not in context:
                return False
        elif not re.search(r"(\u5185\u5bb9|\u6b63\u6587|\u6587\u5b57|\u6761\u76ee|body|paragraph)", context, flags=re.IGNORECASE):
            return False
    if role in {"cn_abstract_lead", "en_abstract_lead", "references_heading", "ack_heading"}:
        first_chunk = re.split(r"[\u3002\uff1b;]", context, maxsplit=1)[0]
        if re.search(r"(\u6b63\u6587|\u5185\u5bb9|\u6761\u76ee|body|paragraph)", first_chunk, flags=re.IGNORECASE) and not re.search(r"(\u6807\u9898|title|heading)", first_chunk, flags=re.IGNORECASE):
            return False
    if role.startswith("heading_"):
        scoped_markers = (
            "\u6458\u8981",
            "Abstract",
            "\u5173\u952e\u8bcd",
            "Key words",
            "Keywords",
            "\u53c2\u8003\u6587\u732e",
            "\u53c2\u8003\u4e66\u76ee",
            "\u6587\u540e\u53c2\u8003",
            "\u81f4\u8c22",
            "\u8c22\u8f9e",
            "\u9e23\u8c22",
            "\u76ee\u5f55",
            "\u56fe\u9898",
            "\u8868\u9898",
            "\u9898\u6ce8",
        )
        if any(marker in context for marker in scoped_markers):
            return False
    if role == "body_text" and any(marker in context for marker in ("\u6458\u8981", "Abstract", "\u5173\u952e\u8bcd", "Key words", "Keywords", "\u53c2\u8003\u6587\u732e", "\u81f4\u8c22", "\u76ee\u5f55")):
        if not re.search(r"(?:\u8bba\u6587\u6b63\u6587|\u6b63\u6587\u6bb5\u843d|\u4e3b\u4f53\u6587\u5b57)", context):
            return False
    if role.startswith("cn_abstract") and ("\u82f1\u6587\u6458\u8981" in context or re.search(r"\bAbstract\b", context, flags=re.IGNORECASE)):
        if "\u4e2d\u6587\u6458\u8981" not in context:
            return False
    if role.startswith("en_abstract") and "\u4e2d\u6587\u6458\u8981" in context and "Abstract" not in context:
        return False
    if role == "cn_keywords" and re.search(r"\b(?:Key\s*words|Keywords)\b", context, flags=re.IGNORECASE):
        if "\u4e2d\u6587\u5173\u952e" not in context and "\u5173\u952e\u8bcd" not in context[:20] and "\u5173\u952e\u5b57" not in context[:20]:
            return False
    if role == "en_keywords" and ("\u5173\u952e\u8bcd" in context or "\u5173\u952e\u5b57" in context) and not re.search(r"\b(?:Key\s*words|Keywords)\b", context, flags=re.IGNORECASE):
        return False
    if role == "references_heading" and "\u5185\u5bb9" in context and "\u53c2\u8003\u6587\u732e" not in context[:80] and "\u53c2\u8003\u4e66\u76ee" not in context[:80]:
        return False
    if role == "references_body":
        if re.search(r"(\u6807\u9898|\u9898\u540d|title|heading)", context, flags=re.IGNORECASE) and not re.search(r"(\u6761\u76ee|\u5185\u5bb9|\u6b63\u6587|items?|body|content)", context, flags=re.IGNORECASE):
            return False
    if role == "ack_heading" and "\u5185\u5bb9" in context and "\u81f4\u8c22" not in context[:80]:
        return False
    return True


def _extract_style_from_context(role: str, context: str) -> dict[str, Any]:
    context = _style_context_for_role(role, context)
    style: dict[str, Any] = {}
    prefer_english = role.startswith("en_")
    fonts = _extract_fonts(context, prefer_english=prefer_english)
    if fonts.get("cnFont"):
        style["cnFont"] = fonts["cnFont"]
    if fonts.get("enFont"):
        style["enFont"] = fonts["enFont"]
    if style.get("cnFont") and not style.get("enFont"):
        style["enFont"] = "Times New Roman"
    size = _extract_font_size_pt(context)
    if size is not None:
        style["fontSizePt"] = size
    style.update(_extract_line_spacing(context))
    style.update(_extract_paragraph_spacing(context))
    alignment = _extract_alignment(context)
    if alignment:
        style["alignment"] = alignment
    bold = _extract_bold(context)
    if bold is not None:
        style["bold"] = bold
    indent = _extract_indent(context)
    if indent is not None:
        style["firstLineIndentPt"] = indent
    return style


def _style_candidate_score(role: str, context: str, style: dict[str, Any]) -> float:
    score = float(len(style))
    if role in CONTENT_STYLE_ROLES and _extract_content_rule_context(context):
        score += 20.0
    if role in HEADING_STYLE_ROLES and re.search(r"(\u5185\u5bb9|\u6b63\u6587|\u6761\u76ee|body|paragraph)", context, flags=re.IGNORECASE):
        score -= 10.0
    if role in HEADING_STYLE_ROLES and style.get("alignment"):
        score += 1.5
    if role in CONTENT_STYLE_ROLES and ("lineSpacingPt" in style or "lineSpacingMultiple" in style):
        score += 1.0
    return score


COMPACT_HEADING_LEVEL_MARKERS = {
    "heading_1": ("一级", "一层", "第一层", "第1层", "1级", "第一级", "章"),
    "heading_2": ("二级", "二层", "第二层", "第2层", "2级", "第二级", "节"),
    "heading_3": ("三级", "三层", "第三层", "第3层", "3级", "第三级", "小节"),
    "heading_4": ("四级", "四层", "第四层", "第4层", "4级", "第四级", "款"),
}


def _extract_compact_heading_styles(text: str) -> dict[str, tuple[dict[str, Any], str]]:
    extracted: dict[str, tuple[dict[str, Any], str]] = {}
    for unit in _split_instruction_units(text):
        if not re.search(r"(?:标题|题名|层次|层级|heading|title)", unit, flags=re.IGNORECASE):
            continue
        matches: list[tuple[int, int, str]] = []
        for role, markers in COMPACT_HEADING_LEVEL_MARKERS.items():
            for marker in markers:
                for match in re.finditer(re.escape(marker), unit, flags=re.IGNORECASE):
                    matches.append((match.start(), match.end(), role))
        if not matches:
            continue
        matches.sort(key=lambda item: (item[0], -(item[1] - item[0])))
        for index, (start, end, role) in enumerate(matches):
            next_start = len(unit)
            for other_start, _other_end, other_role in matches[index + 1:]:
                if other_start > start and other_role != role:
                    next_start = other_start
                    break
            context = unit[start:next_start].strip()
            if not _context_has_style_signal(context):
                prefix = unit[:start]
                suffix = unit[end:next_start]
                context = f"{prefix[-40:]}{unit[start:end]}{suffix}".strip()
            style = _extract_style_from_context(role, context)
            if not style:
                continue
            current = extracted.get(role)
            if current is None or _style_candidate_score(role, context, style) > _style_candidate_score(role, current[1], current[0]):
                extracted[role] = (style, context[:260])
    return extracted


def extract_deterministic_format_rules(document_text: str) -> dict[str, Any]:
    text = _normalize_instruction_text(document_text)
    raw: dict[str, Any] = {
        "version": FORMAT_RULES_VERSION,
        "schoolName": "custom",
        "sourceSummary": "Deterministic parser extracted explicit school formatting rules.",
        "page": {},
        "styles": {},
        "notes": [],
        "styleMeta": {},
        "quality": {"warnings": [], "deterministicHits": 0, "inferredRoles": []},
    }
    page_patterns = {
        "topMarginCm": r"(?:\u4e0a|\u4e0a\u8fb9|\u4e0a\u8fb9\u8ddd|\u9875\u8fb9\u8ddd\u4e0a)\s*(\d+(?:\.\d+)?)\s*(cm|\u5398\u7c73|mm|\u6beb\u7c73)",
        "bottomMarginCm": r"(?:\u4e0b|\u4e0b\u8fb9|\u4e0b\u8fb9\u8ddd|\u9875\u8fb9\u8ddd\u4e0b)\s*(\d+(?:\.\d+)?)\s*(cm|\u5398\u7c73|mm|\u6beb\u7c73)",
        "leftMarginCm": r"(?:\u5de6|\u5de6\u8fb9|\u5de6\u8fb9\u8ddd|\u9875\u8fb9\u8ddd\u5de6)\s*(\d+(?:\.\d+)?)\s*(cm|\u5398\u7c73|mm|\u6beb\u7c73)",
        "rightMarginCm": r"(?:\u53f3|\u53f3\u8fb9|\u53f3\u8fb9\u8ddd|\u9875\u8fb9\u8ddd\u53f3)\s*(\d+(?:\.\d+)?)\s*(cm|\u5398\u7c73|mm|\u6beb\u7c73)",
    }
    if "A4" in text.upper():
        raw["page"]["paper"] = "A4"
    raw["page"].update(_extract_page_margin_values(text))
    for key, pattern in page_patterns.items():
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match and key not in raw["page"]:
            raw["page"][key] = _length_to_cm(float(match.group(1)), match.group(2))
    vertical_margin = re.search(r"(?:\u4e0a\u4e0b|\u4e0a\u3001\u4e0b|\u4e0a\u4e0b\u9875\u8fb9\u8ddd|\u4e0a\u3001\u4e0b\u9875\u8fb9\u8ddd|\u9875\u8fb9\u8ddd\u4e0a\u4e0b)[^\d]{0,12}(\d+(?:\.\d+)?)\s*(cm|\u5398\u7c73|mm|\u6beb\u7c73)", text, flags=re.IGNORECASE)
    if vertical_margin:
        value = _length_to_cm(float(vertical_margin.group(1)), vertical_margin.group(2))
        raw["page"].setdefault("topMarginCm", value)
        raw["page"].setdefault("bottomMarginCm", value)
    horizontal_margin = re.search(r"(?:\u5de6\u53f3|\u5de6\u3001\u53f3|\u5de6\u53f3\u9875\u8fb9\u8ddd|\u5de6\u3001\u53f3\u9875\u8fb9\u8ddd|\u9875\u8fb9\u8ddd\u5de6\u53f3)[^\d]{0,12}(\d+(?:\.\d+)?)\s*(cm|\u5398\u7c73|mm|\u6beb\u7c73)", text, flags=re.IGNORECASE)
    if horizontal_margin:
        value = _length_to_cm(float(horizontal_margin.group(1)), horizontal_margin.group(2))
        raw["page"].setdefault("leftMarginCm", value)
        raw["page"].setdefault("rightMarginCm", value)
    for role, markers in ROLE_MARKERS.items():
        best_style: dict[str, Any] = {}
        best_source = ""
        best_score = -1.0
        for context in _role_context_windows(text, role, markers):
            if not _is_role_context_candidate(role, context):
                continue
            style = _extract_style_from_context(role, context)
            score = _style_candidate_score(role, context, style)
            if score > best_score:
                best_style = style
                best_source = context.strip()[:260]
                best_score = score
        if best_style:
            raw["styles"][role] = best_style
            raw["styleMeta"][role] = {"sourceText": best_source, "confidence": 0.92, "isInferred": False, "explicitFields": sorted(best_style)}
    for role, (style, source_text) in _extract_compact_heading_styles(text).items():
        if role not in raw["styles"]:
            raw["styles"][role] = style
            raw["styleMeta"][role] = {"sourceText": source_text, "confidence": 0.9, "isInferred": False, "explicitFields": sorted(style)}
    if "body_text" in raw["styles"]:
        body = raw["styles"]["body_text"]
        body_fields = sorted(body)
        for role in ("cn_abstract_body", "en_abstract_body", "references_body", "ack_body"):
            raw["styles"].setdefault(role, dict(body))
            raw["styleMeta"].setdefault(role, {"sourceText": "Inherited from explicit body text rule.", "confidence": 0.66, "isInferred": True, "explicitFields": body_fields})
    raw["notes"].extend(_extract_non_style_instruction_notes(text))
    raw["quality"]["deterministicHits"] = sum(1 for meta in raw["styleMeta"].values() if not bool(meta.get("isInferred")))
    return raw


def _extract_non_style_instruction_notes(text: str) -> list[str]:
    notes: list[str] = []

    def add_if(condition: bool, note: str) -> None:
        if condition and note not in notes:
            notes.append(note)

    add_if("\u5c01\u9762" in text, "封面题名、填写项横线、日期大写等要求属于封面结构区；默认保护原 Word，不由模型改写。")
    add_if("\u76ee\u5f55" in text and ("\u81ea\u52a8\u751f\u6210" in text or "\u9875\u7801\u53f3\u7aef\u5bf9\u9f50" in text), "目录自动生成、三级目录和页码右端对齐属于 Word 域/目录结构；系统会尽量保护，不把目录文本交给模型。")
    add_if("\u9875\u7801" in text and ("I,II" in text or "I\uff0cII" in text or "\u8fde\u7eed\u7f16\u7801" in text), "摘要罗马页码与正文阿拉伯页码涉及分节页脚；当前作为导出审计重点，不作为普通样式规则直接套用。")
    add_if("\u4e09\u7ebf\u8868" in text or "\u9876\u7ebf" in text or "\u5e95\u7ebf" in text, "三线表线宽要求已记录为表格排版风险点；表格内容默认锁定，避免数据和结构被误改。")
    add_if("\u4e0d\u5f97\u62c6\u5f00" in text or "\u6b21\u9875\u6700\u524d\u9762" in text, "图表整体不跨页属于版面流控制，无法仅靠段落样式保证，需导出后人工复查。")
    add_if("\u5f15\u6587\u6807\u793a" in text or "\u53c2\u8003\u6587\u732e" in text and "[1]" in text, "引用标示和参考文献排序属于内容规范，系统会保护引用标记，但不会自动重排文献条目。")
    add_if("\u516c\u5f0f" in text or "\u516c\u5f0f\u7f16\u53f7" in text, "公式编辑器、公式换行和编号右对齐属于公式对象/版式要求，默认保护原结构。")
    return notes


def _copy_inferred_style(rules: dict[str, Any], target_role: str, source_role: str, *, reason: str, confidence: float = 0.62) -> None:
    meta = rules.setdefault("styleMeta", {})
    if target_role in meta or source_role not in rules.get("styles", {}):
        return
    rules["styles"][target_role] = dict(rules["styles"][source_role])
    source_meta = meta.get(source_role) if isinstance(meta.get(source_role), dict) else {}
    inherited_meta = {
        "sourceText": reason,
        "confidence": confidence,
        "isInferred": True,
    }
    explicit_fields = _normalize_explicit_fields(source_meta.get("explicitFields"))
    if explicit_fields:
        inherited_meta["explicitFields"] = explicit_fields
    meta[target_role] = inherited_meta


def _apply_inferred_style_defaults(rules: dict[str, Any]) -> None:
    meta = rules.get("styleMeta") if isinstance(rules.get("styleMeta"), dict) else {}
    if not isinstance(meta, dict):
        rules["styleMeta"] = {}
        meta = rules["styleMeta"]
    if "body_text" in meta:
        for role in ("cn_abstract_body", "references_body", "ack_body"):
            _copy_inferred_style(rules, role, "body_text", reason=f"Inherited from explicit body_text rule for {role}.")
        if "en_abstract_body" not in meta:
            inherited = dict(rules["styles"]["body_text"])
            en_font = inherited.get("enFont") or "Times New Roman"
            inherited["cnFont"] = en_font
            inherited["enFont"] = en_font
            rules["styles"]["en_abstract_body"] = inherited
            source_fields = _normalize_explicit_fields(meta.get("body_text", {}).get("explicitFields") if isinstance(meta.get("body_text"), dict) else None)
            if "cnFont" in source_fields or "enFont" in source_fields:
                source_fields = sorted({*source_fields, "cnFont", "enFont"})
            inherited_meta = {
                "sourceText": "Inherited from explicit body_text rule with western font for English abstract body.",
                "confidence": 0.58,
                "isInferred": True,
            }
            if source_fields:
                inherited_meta["explicitFields"] = source_fields
            meta["en_abstract_body"] = inherited_meta
    if "cn_abstract_body" in meta and "cn_keywords" not in meta:
        _copy_inferred_style(rules, "cn_keywords", "cn_abstract_body", reason="Inherited from explicit Chinese abstract body rule.")
        rules["styles"]["cn_keywords"]["firstLineIndentPt"] = 0.0
    if "en_abstract_body" in meta and "en_keywords" not in meta:
        _copy_inferred_style(rules, "en_keywords", "en_abstract_body", reason="Inherited from explicit English abstract body rule.")
        rules["styles"]["en_keywords"]["firstLineIndentPt"] = 0.0
    for previous_role, next_role in (("heading_1", "heading_2"), ("heading_2", "heading_3"), ("heading_3", "heading_4")):
        if previous_role in meta and next_role not in meta:
            _copy_inferred_style(
                rules,
                next_role,
                previous_role,
                reason=f"Inherited from explicit {previous_role} rule because {next_role} was not specified.",
                confidence=0.52,
            )


def validate_format_rules_structure(rules: dict[str, Any]) -> list[dict[str, Any]]:
    issues: list[dict[str, Any]] = []
    page = rules.get("page") if isinstance(rules.get("page"), dict) else {}
    for key in ("topMarginCm", "bottomMarginCm", "leftMarginCm", "rightMarginCm"):
        value = page.get(key)
        if not isinstance(value, (int, float)) or not 0.5 <= float(value) <= 6.0:
            issues.append({"code": "page_margin_out_of_range", "key": key, "value": value})
    styles = rules.get("styles") if isinstance(rules.get("styles"), dict) else {}
    for role, style in styles.items():
        canonical_role = _canonical_format_role(role)
        if not canonical_role or not isinstance(style, dict):
            issues.append({"code": "unknown_style_role", "role": str(role)})
            continue
        font_size = style.get("fontSizePt")
        if not isinstance(font_size, (int, float)) or not 5.0 <= float(font_size) <= 42.0:
            issues.append({"code": "font_size_out_of_range", "role": canonical_role, "value": font_size})
        alignment = style.get("alignment")
        if alignment is not None and alignment not in ALIGNMENT_VALUES:
            issues.append({"code": "invalid_alignment", "role": canonical_role, "value": alignment})
        line_spacing_pt = style.get("lineSpacingPt")
        line_spacing_multiple = style.get("lineSpacingMultiple")
        if line_spacing_pt is not None and line_spacing_multiple is not None:
            issues.append({"code": "conflicting_line_spacing", "role": canonical_role})
        if line_spacing_pt is not None and (not isinstance(line_spacing_pt, (int, float)) or not 6 <= float(line_spacing_pt) <= 60):
            issues.append({"code": "line_spacing_pt_out_of_range", "role": canonical_role, "value": line_spacing_pt})
        if line_spacing_multiple is not None and (not isinstance(line_spacing_multiple, (int, float)) or not 0.7 <= float(line_spacing_multiple) <= 3.0):
            issues.append({"code": "line_spacing_multiple_out_of_range", "role": canonical_role, "value": line_spacing_multiple})
    return issues


def merge_deterministic_rules(ai_rules: dict[str, Any], deterministic_rules: dict[str, Any]) -> dict[str, Any]:
    merged = normalize_format_rules(ai_rules)
    normalized_deterministic = normalize_format_rules(deterministic_rules)
    if not str(ai_rules.get("schoolName", "")).strip() and str(deterministic_rules.get("schoolName", "")).strip():
        merged["schoolName"] = str(deterministic_rules["schoolName"]).strip()
    if not str(ai_rules.get("sourceSummary", "")).strip() and str(deterministic_rules.get("sourceSummary", "")).strip():
        merged["sourceSummary"] = str(deterministic_rules["sourceSummary"]).strip()
    if deterministic_rules.get("page"):
        merged["page"].update({k: v for k, v in normalized_deterministic.get("page", {}).items() if k in deterministic_rules.get("page", {})})
    page_explicit_fields = _normalize_page_explicit_fields(merged.get("pageExplicitFields"))
    for field in _normalize_page_explicit_fields(normalized_deterministic.get("pageExplicitFields")):
        if field not in page_explicit_fields:
            page_explicit_fields.append(field)
    if page_explicit_fields:
        merged["pageExplicitFields"] = page_explicit_fields
    deterministic_styles = deterministic_rules.get("styles", {}) if isinstance(deterministic_rules.get("styles"), dict) else {}
    for role, style in deterministic_styles.items():
        canonical_role = _canonical_format_role(role)
        if not canonical_role:
            continue
        if not isinstance(style, dict):
            continue
        base = dict(merged["styles"].get(canonical_role, merged["styles"]["body_text"]))
        normalized_style = normalize_format_rules({"styles": {canonical_role: style}})["styles"][canonical_role]
        base.update({key: value for key, value in normalized_style.items() if key in style})
        if base.get("lineSpacingPt") is not None:
            base["lineSpacingMultiple"] = None
        elif base.get("lineSpacingMultiple") is not None:
            base["lineSpacingPt"] = None
        merged["styles"][canonical_role] = base
    style_meta: dict[str, Any] = {}
    if isinstance(merged.get("styleMeta"), dict):
        style_meta.update(merged["styleMeta"])
    if isinstance(deterministic_rules.get("styleMeta"), dict):
        style_meta.update(_normalize_style_meta(deterministic_rules["styleMeta"]))
    merged["styleMeta"] = style_meta
    _apply_inferred_style_defaults(merged)
    merged["quality"] = build_format_rules_quality(merged, deterministic_rules)
    validation_issues = validate_format_rules_structure(merged)
    merged["quality"]["validationIssues"] = validation_issues
    merged["quality"]["validationIssueCount"] = len(validation_issues)
    merged["notes"] = list(dict.fromkeys([*merged.get("notes", []), *deterministic_rules.get("notes", [])]))
    return merged


def build_format_rules_quality(rules: dict[str, Any], deterministic_rules: dict[str, Any] | None = None) -> dict[str, Any]:
    all_roles = list(DEFAULT_FORMAT_RULES["styles"].keys())
    required_roles = list(REQUIRED_FORMAT_ROLES)
    meta = rules.get("styleMeta") if isinstance(rules.get("styleMeta"), dict) else {}
    explicit_roles = [
        role for role in all_roles
        if isinstance(meta.get(role), dict) and not bool(meta[role].get("isInferred"))
    ]
    inherited_roles = [
        role for role in all_roles
        if isinstance(meta.get(role), dict) and bool(meta[role].get("isInferred"))
    ]
    default_roles = [role for role in all_roles if role not in meta]
    required_explicit_roles = [role for role in required_roles if role in explicit_roles]
    required_usable_roles = [role for role in required_roles if role in explicit_roles or role in inherited_roles]
    missing_source_roles = [role for role in required_roles if role in default_roles]
    low_confidence_roles = [
        role for role in required_roles
        if isinstance(meta.get(role), dict) and float(meta[role].get("confidence") or 0) < 0.7
    ]
    explicit_coverage = round(len(required_explicit_roles) / max(1, len(required_roles)) * 100)
    usable_coverage = round(len(required_usable_roles) / max(1, len(required_roles)) * 100)
    warnings: list[str] = []
    suggestions: list[str] = []
    body_size = rules.get("styles", {}).get("body_text", {}).get("fontSizePt")
    if body_size not in (10.5, 12.0):
        warnings.append("正文字号不在常见范围内，请确认学校说明或解析结果。")
    if missing_source_roles:
        warnings.append(f"{len(missing_source_roles)} 个关键角色未从学校说明中命中来源，导出时未说明字段会继承原文档。")
        suggestions.append("建议补充或核对：正文、标题、摘要、参考文献、致谢等关键区域的字体、字号、行距。")
    if inherited_roles:
        warnings.append(f"{len(inherited_roles)} 个角色来自继承规则，请确认是否符合学校要求。")
    if low_confidence_roles:
        warnings.append(f"{len(low_confidence_roles)} 个关键角色置信度偏低，建议人工复核。")
    return {
        "deterministicHits": int((deterministic_rules or {}).get("quality", {}).get("deterministicHits", len(explicit_roles))),
        "requiredRoles": required_roles,
        "explicitRoles": explicit_roles,
        "inheritedRoles": inherited_roles,
        "defaultRoles": default_roles,
        "inferredRoles": [*inherited_roles, *default_roles],
        "missingSourceRoles": missing_source_roles,
        "lowConfidenceRoles": low_confidence_roles,
        "explicitCoveragePercent": explicit_coverage,
        "usableCoveragePercent": usable_coverage,
        "warningCount": len(warnings),
        "warnings": warnings,
        "suggestions": suggestions,
    }


def _safe_error_message(exc: Exception) -> str:
    message = str(exc).strip()
    if not message:
        return exc.__class__.__name__
    message = re.sub(r"Bearer\s+[A-Za-z0-9._-]+", "Bearer ***", message, flags=re.IGNORECASE)
    message = re.sub(r"sk-[A-Za-z0-9_-]{8,}", "sk-***", message)
    return message[:260]


def _fallback_format_rules(document_text: str, reason: str) -> dict[str, Any]:
    deterministic_rules = extract_deterministic_format_rules(document_text)
    rules = merge_deterministic_rules({}, deterministic_rules)
    rules["sourceSummary"] = "Local deterministic parser fallback after AI JSON parsing was unavailable."
    quality = rules.setdefault("quality", {})
    warnings = list(quality.get("warnings", [])) if isinstance(quality.get("warnings"), list) else []
    fallback_warning = f"AI 结构化解析未完成，已使用本地规则抽取兜底：{reason}"
    if fallback_warning not in warnings:
        warnings.insert(0, fallback_warning)
    suggestions = list(quality.get("suggestions", [])) if isinstance(quality.get("suggestions"), list) else []
    suggestion = "如需更高覆盖率，可提高规范解析模型的请求超时，或换用响应更快且支持稳定 JSON 输出的模型重新解析。"
    if suggestion not in suggestions:
        suggestions.insert(0, suggestion)
    quality["warnings"] = warnings
    quality["suggestions"] = suggestions
    quality["warningCount"] = len(warnings)
    notes = list(rules.get("notes", [])) if isinstance(rules.get("notes"), list) else []
    note = "AI 解析不可用时，系统已回退到本地确定性解析；请重点复核未命中或继承的样式角色。"
    if note not in notes:
        notes.append(note)
    rules["notes"] = notes
    return rules

FORMAT_ROLE_PROMPT_GUIDE = """角色映射表：
- toc_heading：目录标题，不是目录条目正文。
- cn_abstract_lead / cn_abstract_body：中文摘要标题 / 中文摘要正文。若同一句写“摘要：标题样式；内容/正文：正文样式”，必须拆成两个角色。
- en_abstract_lead / en_abstract_body：英文摘要标题 / 英文摘要正文。Abstract 单独作为标题，Abstract body/content/英文摘要正文作为正文。
- cn_keywords / en_keywords：关键词内容样式；如果“关键词”标签与“关键词内容”不同，优先抽取内容样式。
- heading_1 / heading_2 / heading_3 / heading_4：一级到四级标题；章标题通常是 heading_1，节标题通常是 heading_2。
- body_text：论文正文或正文段落。
- caption / note / table_text：图题表题 / 图注表注图表注释 / 表格内文字。
- references_heading / references_body：参考文献标题 / 文献条目或参考文献内容。
- ack_heading / ack_body：致谢标题 / 致谢内容。"""

PROMPT_TEMPLATE = """你是论文 Word 排版规范的结构化抽取器。你的输出只是“结构化 JSON”，后端程序会继续校验、归一化、合并默认值；不要编造学校没有写明的要求。

硬性要求：
1. 只输出一个 JSON 对象，不要 Markdown 代码块，不要解释，不要前后缀。
2. JSON 顶层字段必须包含 version、schoolName、sourceSummary、page、styles、styleMeta、notes。
3. styles 的键只能使用这些角色：toc_heading, cn_abstract_lead, en_abstract_lead, cn_keywords, en_keywords, cn_abstract_body, en_abstract_body, heading_1, heading_2, heading_3, heading_4, body_text, caption, note, table_text, references_heading, references_body, ack_heading, ack_body。
4. 全文逐句扫描；同一句或同一行出现多个角色时，必须拆成多个 styles，不要把前一个角色的字体字号套到后一个角色。
5. 标题和内容要分离：标题样式只给 *_lead / *_heading，正文、内容、条目样式只给 *_body / cn_keywords / en_keywords / references_body / ack_body。
6. 只抽取能映射到 Word 样式的规则：字体、字号、加粗、对齐、缩进、段前段后、固定行距、倍数行距、页边距、纸张。
7. 封面、目录自动生成、页码分节、图表不跨页、公式编辑器、引用排序等无法直接映射为段落样式的内容，放入 notes，不要硬塞进 styles。
8. 字号统一换算为磅：初号=42，小初=36，1号=26，小1=24，2号=22，小2=18，3号=16，小3=15，4号=14，小4=12，5号=10.5，小5=9，6号=7.5，小6=6.5，7号=5.5，8号=5。
9. 页边距统一换算为厘米；25mm 输出 2.5，30mm 输出 3.0。
10. alignment 只能是 left、center、right、justify；“两端对齐/分散对齐”输出 justify。
11. 固定行距写 lineSpacingPt，倍数行距写 lineSpacingMultiple，两者不要同时写成有效数值。
12. 对每个 styles 角色，styleMeta 中尽量写 sourceText、confidence、isInferred；明确来自原文时 isInferred=false，不确定或继承时 isInferred=true 且 confidence 不要高于 0.7。
13. 学校说明没有提到的角色可以省略；不要为了完整而凭空生成。导出时未说明字段继承上传文档原格式。

{role_guide}

JSON schema 摘要：
{schema}

学校说明：
{document_text}
"""


def get_default_format_rules() -> dict[str, Any]:
    return deepcopy(DEFAULT_FORMAT_RULES)


def load_active_format_rules(path: Path | None = None) -> dict[str, Any]:
    rules_path = path or ACTIVE_RULES_PATH
    if not rules_path.exists():
        return get_default_format_rules()
    data = json.loads(rules_path.read_text(encoding="utf-8"))
    return normalize_format_rules(data)


def save_active_format_rules(rules: dict[str, Any], path: Path | None = None) -> Path:
    normalized = normalize_format_rules(rules)
    rules_path = path or ACTIVE_RULES_PATH
    rules_path.parent.mkdir(parents=True, exist_ok=True)
    rules_path.write_text(json.dumps(normalized, ensure_ascii=False, indent=2), encoding="utf-8")
    return rules_path


def _normalize_scalar_text(value: Any) -> str:
    return str(value or "").strip().translate(FULLWIDTH_TRANSLATION)


def _iter_raw_style_items(raw_styles: Any) -> list[tuple[Any, Any]]:
    if isinstance(raw_styles, dict):
        items: list[tuple[Any, Any]] = []
        for role, raw_style in raw_styles.items():
            group = _canonical_style_group(role)
            if group and isinstance(raw_style, dict):
                for child_role, child_style in raw_style.items():
                    canonical_child = _canonical_group_child_role(group, child_role)
                    if canonical_child and isinstance(child_style, dict):
                        items.append((canonical_child, child_style))
                continue
            items.append((role, raw_style))
        return items
    if not isinstance(raw_styles, list):
        return []
    items: list[tuple[Any, Any]] = []
    for index, raw_item in enumerate(raw_styles):
        if not isinstance(raw_item, dict):
            continue
        role = next((raw_item.get(key) for key in ROLE_FIELD_KEYS if str(raw_item.get(key, "")).strip()), None)
        if role is None:
            role = raw_item.get("id", f"style_{index}")
        items.append((role, raw_item))
    return items


def _iter_raw_style_items_from_rules(raw_rules: dict[str, Any]) -> list[tuple[Any, Any]]:
    items: list[tuple[Any, Any]] = []
    for key in STYLE_ROOT_KEYS:
        if key in raw_rules:
            items.extend(_iter_raw_style_items(raw_rules.get(key)))
    for key, value in raw_rules.items():
        if key in STYLE_ROOT_KEYS:
            continue
        if _canonical_format_role(key) and isinstance(value, dict):
            items.append((key, value))
    return items


def _extract_nested_mapping(raw_style: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(raw_style)
    for key in STYLE_CONTAINER_KEYS:
        nested = raw_style.get(key)
        if isinstance(nested, dict):
            normalized.update(nested)
    return normalized


def _get_alias_value(raw: dict[str, Any], canonical_key: str) -> Any:
    aliases = STYLE_KEY_ALIASES.get(canonical_key, (canonical_key,))
    for alias in aliases:
        if alias in raw:
            return raw[alias]
    signature_to_key = {_role_key_signature(str(key)): key for key in raw.keys()}
    for alias in aliases:
        matched_key = signature_to_key.get(_role_key_signature(alias))
        if matched_key is not None:
            return raw[matched_key]
    return None


def _normalize_font_value(value: Any, *, prefer_english: bool = False) -> str:
    fragments = _flatten_text_fragments(value)
    raw = " ".join(fragment for fragment in fragments if fragment).strip()
    if not raw:
        return ""
    alias = FONT_VALUE_ALIASES.get(_role_key_signature(raw))
    if alias:
        return alias
    if re.search(r"Times\s*New\s*Roman", raw, flags=re.IGNORECASE):
        return "Times New Roman"
    detected = _extract_fonts(raw, prefer_english=prefer_english)
    if prefer_english and detected.get("enFont"):
        return detected["enFont"]
    if detected.get("cnFont"):
        return detected["cnFont"]
    if detected.get("enFont"):
        return detected["enFont"]
    return raw


def _normalize_alignment(value: Any) -> str | None:
    raw = _normalize_scalar_text(value).casefold()
    if not raw:
        return None
    if raw in ALIGNMENT_VALUES:
        return raw
    if any(token in raw for token in ("两端", "分散", "justify", "justified")):
        return "justify"
    if any(token in raw for token in ("居中", "中心", "center", "centred", "middle")):
        return "center"
    if any(token in raw for token in ("右", "right")):
        return "right"
    if any(token in raw for token in ("左", "left")):
        return "left"
    return None


def _coerce_page_length_cm(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        return round(float(value), 3)
    raw = _normalize_scalar_text(value)
    if not raw:
        return None
    match = re.search(r"(-?\d+(?:\.\d+)?)\s*(cm|厘米|mm|毫米)?", raw, flags=re.IGNORECASE)
    if not match:
        return None
    unit = match.group(2) or "cm"
    return _length_to_cm(float(match.group(1)), unit)


def _coerce_style_number(key: str, value: Any) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    raw = _normalize_scalar_text(value)
    if not raw:
        return None
    if key == "fontSizePt":
        size = _extract_font_size_pt(raw)
        if size is not None:
            return size
    if key == "firstLineIndentPt":
        indent = _extract_indent(f"首行缩进{raw}")
        if indent is not None:
            return indent
    if key in {"spaceBeforePt", "spaceAfterPt"}:
        label = "段前" if key == "spaceBeforePt" else "段后"
        spacing = _extract_paragraph_spacing(f"{label}{raw}")
        if key in spacing:
            return spacing[key]
    if key == "lineSpacingPt":
        line_spacing = _extract_line_spacing(f"行距{raw}")
        if line_spacing.get("lineSpacingPt") is not None:
            return line_spacing["lineSpacingPt"]
        if line_spacing.get("lineSpacingMultiple") is not None:
            return None
    if key == "lineSpacingMultiple":
        line_spacing = _extract_line_spacing(raw if "倍" in raw else f"{raw}倍行距")
        if line_spacing.get("lineSpacingMultiple") is not None:
            return line_spacing["lineSpacingMultiple"]
    number_match = re.search(r"-?\d+(?:\.\d+)?", raw)
    if number_match:
        return float(number_match.group(0))
    return None


def _extract_style_line_spacing(raw: dict[str, Any], style: dict[str, Any]) -> None:
    raw_line_pt = _get_alias_value(raw, "lineSpacingPt")
    raw_line_multiple = _get_alias_value(raw, "lineSpacingMultiple")
    if raw_line_pt is not None:
        line_spacing = _extract_line_spacing(f"行距{_normalize_scalar_text(raw_line_pt)}")
        if line_spacing.get("lineSpacingPt") is not None:
            style["lineSpacingPt"] = line_spacing["lineSpacingPt"]
            style["lineSpacingMultiple"] = None
            return
        if line_spacing.get("lineSpacingMultiple") is not None:
            style["lineSpacingMultiple"] = line_spacing["lineSpacingMultiple"]
            style["lineSpacingPt"] = None
            return
        coerced = _coerce_style_number("lineSpacingPt", raw_line_pt)
        if coerced is not None:
            style["lineSpacingPt"] = coerced
            style["lineSpacingMultiple"] = None
    if raw_line_multiple is not None:
        coerced = _coerce_style_number("lineSpacingMultiple", raw_line_multiple)
        if coerced is not None:
            style["lineSpacingMultiple"] = coerced
            style["lineSpacingPt"] = None


def _normalize_raw_style_object(role: str, raw_style: dict[str, Any]) -> dict[str, Any]:
    raw = _extract_nested_mapping(raw_style)
    normalized: dict[str, Any] = {}
    font_blob = " ".join(
        [
            *[
                fragment
                for key in ("cnFont", "enFont")
                for alias in STYLE_KEY_ALIASES.get(key, ())
                for fragment in _flatten_text_fragments(raw.get(alias))
                if raw.get(alias) is not None
            ],
            *[
                fragment
                for alias in ("font", "fontFamily", "fontName", "typeface", "字体", "字体要求", "字体名称")
                for fragment in _flatten_text_fragments(raw.get(alias))
                if raw.get(alias) is not None
            ],
        ]
    )
    if font_blob:
        detected_fonts = _extract_fonts(font_blob, prefer_english=role.startswith("en_"))
        font_signature = _role_key_signature(font_blob)
        for alias_signature, font_name in sorted(FONT_VALUE_ALIASES.items(), key=lambda item: len(item[0]), reverse=True):
            if alias_signature not in font_signature:
                continue
            if font_name == "Times New Roman":
                detected_fonts.setdefault("enFont", font_name)
            else:
                detected_fonts.setdefault("cnFont", font_name)
        normalized.update({key: value for key, value in detected_fonts.items() if value})
    for key in ("cnFont", "enFont"):
        value = _get_alias_value(raw, key)
        font = _normalize_font_value(value, prefer_english=key == "enFont" or role.startswith("en_"))
        if font:
            normalized[key] = font
    if role.startswith("en_") and normalized.get("enFont") and not normalized.get("cnFont"):
        normalized["cnFont"] = normalized["enFont"]
    for key in ("fontSizePt", "firstLineIndentPt", "spaceBeforePt", "spaceAfterPt"):
        value = _get_alias_value(raw, key)
        if value is not None:
            number = _coerce_style_number(key, value)
            if number is not None:
                normalized[key] = number
    _extract_style_line_spacing(raw, normalized)
    bold = _get_alias_value(raw, "bold")
    if bold is not None:
        normalized["bold"] = _coerce_optional_bool(bold)
    italic = _get_alias_value(raw, "italic")
    if italic is not None:
        normalized["italic"] = _coerce_optional_bool(italic)
    alignment = _normalize_alignment(_get_alias_value(raw, "alignment"))
    if alignment:
        normalized["alignment"] = alignment
    return normalized


def _extract_page_mapping(raw_rules: dict[str, Any]) -> dict[str, Any]:
    page: dict[str, Any] = {}
    for key in PAGE_CONTAINER_KEYS:
        raw_page = raw_rules.get(key)
        if isinstance(raw_page, dict):
            page.update(raw_page)
            for margin_key in PAGE_MARGIN_CONTAINER_KEYS:
                if isinstance(raw_page.get(margin_key), dict):
                    page.update(raw_page[margin_key])
    if not page and isinstance(raw_rules.get("page"), dict):
        page.update(raw_rules["page"])
    for key in PAGE_MARGIN_CONTAINER_KEYS:
        margins = raw_rules.get(key)
        if isinstance(margins, dict):
            page.update(margins)
        elif isinstance(raw_rules.get("page"), dict) and isinstance(raw_rules["page"].get(key), dict):
            page.update(raw_rules["page"][key])
    return page


def _extract_page_margin_sequence(value: Any) -> dict[str, float]:
    if not isinstance(value, (list, tuple)) or len(value) < 4:
        return {}
    keys = ("topMarginCm", "bottomMarginCm", "leftMarginCm", "rightMarginCm")
    margins: dict[str, float] = {}
    for key, item in zip(keys, value):
        length = _coerce_page_length_cm(item)
        if length is not None:
            margins[key] = length
    return margins


def _extract_page_margin_blob(raw_page: dict[str, Any]) -> dict[str, float]:
    margins: dict[str, float] = {}
    for key in PAGE_MARGIN_CONTAINER_KEYS:
        value = raw_page.get(key)
        margins.update(_extract_page_margin_sequence(value))
        if isinstance(value, str):
            margins.update(_extract_page_margin_values(value))
    fragments = [fragment for fragment in _flatten_text_fragments(raw_page) if re.search(r"(?:页边距|边距|上|下|左|右).*(?:cm|厘米|mm|毫米)", fragment, flags=re.IGNORECASE)]
    if fragments:
        margins.update(_extract_page_margin_values("\n".join(fragments)))
    return margins


def _get_page_alias_value(raw_page: dict[str, Any], canonical_key: str) -> Any:
    aliases = PAGE_KEY_ALIASES.get(canonical_key, (canonical_key,))
    for alias in aliases:
        if alias in raw_page:
            return raw_page[alias]
    signature_to_key = {_role_key_signature(str(key)): key for key in raw_page.keys()}
    for alias in aliases:
        matched_key = signature_to_key.get(_role_key_signature(alias))
        if matched_key is not None:
            return raw_page[matched_key]
    return None


def _normalize_page_rules(raw_rules: dict[str, Any], base_page: dict[str, Any]) -> dict[str, Any]:
    page = dict(base_page)
    raw_page = _extract_page_mapping(raw_rules)
    if not raw_page:
        return page
    page.update(_extract_page_margin_blob(raw_page))
    paper = _get_page_alias_value(raw_page, "paper")
    if str(paper or "").strip():
        page["paper"] = str(paper).strip().upper() if str(paper).strip().lower() == "a4" else str(paper).strip()
    for key in ("topMarginCm", "bottomMarginCm", "leftMarginCm", "rightMarginCm"):
        value = _get_page_alias_value(raw_page, key)
        if value is None:
            continue
        length = _coerce_page_length_cm(value)
        if length is not None:
            page[key] = length
    return page


def _canonical_page_field_key(value: Any) -> str | None:
    signature = _role_key_signature(value)
    for key, aliases in PAGE_KEY_ALIASES.items():
        if signature == _role_key_signature(key):
            return key
        if any(signature == _role_key_signature(alias) for alias in aliases):
            return key
    return None


def _normalize_page_explicit_fields(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        raw_items: list[Any] = [item for item in re.split(r"[\s,，;；、|/]+", value) if item]
    elif isinstance(value, dict):
        raw_items = [key for key, enabled in value.items() if enabled is not False]
    elif isinstance(value, (list, tuple, set)):
        raw_items = list(value)
    else:
        return []
    result: list[str] = []
    for item in raw_items:
        key = _canonical_page_field_key(item)
        if key and key not in result:
            result.append(key)
    return result


def _extract_page_explicit_fields(raw_rules: dict[str, Any]) -> list[str]:
    raw_page = _extract_page_mapping(raw_rules)
    if not raw_page:
        return []
    fields: list[str] = []
    if _get_page_alias_value(raw_page, "paper") is not None:
        fields.append("paper")
    for key in _extract_page_margin_blob(raw_page):
        if key in PAGE_FORMAT_FIELDS and key not in fields:
            fields.append(key)
    for key in ("topMarginCm", "bottomMarginCm", "leftMarginCm", "rightMarginCm"):
        value = _get_page_alias_value(raw_page, key)
        if value is not None and _coerce_page_length_cm(value) is not None and key not in fields:
            fields.append(key)
    return fields


def _normalize_style_meta(raw_meta: Any) -> dict[str, dict[str, Any]]:
    if isinstance(raw_meta, list):
        raw_meta = {
            str(next((item.get(key) for key in ROLE_FIELD_KEYS if str(item.get(key, "")).strip()), None) or index): item
            for index, item in enumerate(raw_meta)
            if isinstance(item, dict)
        }
    if not isinstance(raw_meta, dict):
        return {}
    result: dict[str, dict[str, Any]] = {}
    for role, meta in raw_meta.items():
        canonical_role = _canonical_format_role(role)
        if not canonical_role or not isinstance(meta, dict):
            continue
        normalized: dict[str, Any] = {}
        if str(meta.get("sourceText", "")).strip():
            normalized["sourceText"] = str(meta["sourceText"]).strip()[:500]
        if "confidence" in meta:
            confidence = _coerce_optional_number(meta.get("confidence"))
            if confidence is not None:
                if confidence > 1 and "%" in str(meta.get("confidence", "")):
                    confidence = confidence / 100.0
                normalized["confidence"] = max(0.0, min(1.0, confidence))
        if "isInferred" in meta:
            normalized["isInferred"] = _coerce_optional_bool(meta.get("isInferred"))
        explicit_fields = _normalize_explicit_fields(
            meta.get("explicitFields")
            or meta.get("explicitStyleFields")
            or meta.get("fields")
            or meta.get("appliedFields")
        )
        if explicit_fields:
            normalized["explicitFields"] = explicit_fields
        if not normalized:
            continue
        current_confidence = float(result.get(canonical_role, {}).get("confidence", -1) or -1)
        next_confidence = float(normalized.get("confidence", 0) or 0)
        if canonical_role not in result or next_confidence >= current_confidence:
            result[canonical_role] = normalized
    return result


def normalize_format_rules(raw_rules: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(raw_rules, dict):
        raise ValueError("Format rules must be a JSON object.")
    rules = get_default_format_rules()
    rules["version"] = int(raw_rules.get("version", FORMAT_RULES_VERSION) or FORMAT_RULES_VERSION)
    rules["schoolName"] = str(raw_rules.get("schoolName", rules["schoolName"]) or "").strip() or "custom"
    rules["sourceSummary"] = str(raw_rules.get("sourceSummary", rules["sourceSummary"]) or "").strip()

    rules["page"] = _normalize_page_rules(raw_rules, rules["page"])
    page_explicit_fields = _normalize_page_explicit_fields(raw_rules.get("pageExplicitFields")) or _extract_page_explicit_fields(raw_rules)
    if page_explicit_fields:
        rules["pageExplicitFields"] = page_explicit_fields

    explicit_style_meta: dict[str, dict[str, Any]] = {}
    for role, raw_style in _iter_raw_style_items_from_rules(raw_rules):
        canonical_role = _canonical_format_role(role)
        if not canonical_role:
            continue
        if not isinstance(raw_style, dict):
            continue
        base_style = dict(rules["styles"].get(canonical_role, rules["styles"]["body_text"]))
        normalized_style = _normalize_raw_style_object(canonical_role, raw_style)
        for key, value in normalized_style.items():
            if key in {"bold", "italic", "lineSpacingPt", "lineSpacingMultiple"} or value is not None:
                base_style[key] = value
        if base_style.get("lineSpacingPt") is not None:
            base_style["lineSpacingMultiple"] = None
        elif base_style.get("lineSpacingMultiple") is not None:
            base_style["lineSpacingPt"] = None
        rules["styles"][canonical_role] = base_style
        if normalized_style:
            explicit_style_meta[canonical_role] = {
                "sourceText": f"Structured style rule for {canonical_role}.",
                "confidence": 0.74,
                "isInferred": False,
                "explicitFields": sorted(normalized_style),
            }

    raw_notes = raw_rules.get("notes")
    if isinstance(raw_notes, list):
        rules["notes"] = [str(item).strip() for item in raw_notes if str(item).strip()]
    rules["styleMeta"] = _normalize_style_meta(raw_rules.get("styleMeta"))
    for role, meta in explicit_style_meta.items():
        current_meta = rules["styleMeta"].setdefault(role, meta)
        if "explicitFields" not in current_meta and meta.get("explicitFields"):
            current_meta["explicitFields"] = meta["explicitFields"]
    if isinstance(raw_rules.get("quality"), dict):
        rules["quality"] = raw_rules["quality"]
    return rules


def parse_format_rules_from_text(document_text: str, *, model_config: dict[str, Any] | None = None) -> dict[str, Any]:
    text = str(document_text or "").strip()
    if not text:
        raise ValueError("Format instruction text is empty.")
    if text.startswith("{") or text.startswith("[") or text.startswith("```"):
        try:
            parsed_rules = _extract_json_object(text)
            deterministic_rules = extract_deterministic_format_rules(text)
            rules = merge_deterministic_rules(parsed_rules, deterministic_rules)
            notes = list(rules.get("notes", [])) if isinstance(rules.get("notes"), list) else []
            direct_note = "检测到输入本身为结构化 JSON，已直接归一化并合并本地显式规则。"
            if direct_note not in notes:
                notes.insert(0, direct_note)
            rules["notes"] = notes
            return rules
        except Exception:
            pass
    config = model_config or load_app_config()
    if not str(config.get("baseUrl", "")).strip() or not str(config.get("model", "")).strip():
        return _fallback_format_rules(text, "解析模型配置不完整。")

    schema_text = SCHEMA_PATH.read_text(encoding="utf-8") if SCHEMA_PATH.exists() else "{}"
    prompt = PROMPT_TEMPLATE.format(role_guide=FORMAT_ROLE_PROMPT_GUIDE, schema=schema_text, document_text=text[:20000])
    try:
        configured_timeout = int(config.get("requestTimeoutSeconds", DEFAULT_REQUEST_TIMEOUT_SECONDS))
    except (TypeError, ValueError):
        configured_timeout = DEFAULT_REQUEST_TIMEOUT_SECONDS
    try:
        configured_retries = int(config.get("maxRetries", DEFAULT_MAX_RETRIES))
    except (TypeError, ValueError):
        configured_retries = DEFAULT_MAX_RETRIES
    parse_timeout = max(
        FORMAT_RULE_PARSE_DEFAULT_TIMEOUT_SECONDS,
        min(FORMAT_RULE_PARSE_MAX_TIMEOUT_SECONDS, configured_timeout or FORMAT_RULE_PARSE_DEFAULT_TIMEOUT_SECONDS),
    )
    parse_retries = max(0, min(FORMAT_RULE_PARSE_MAX_RETRIES, configured_retries))
    try:
        response_text = llm_completion(
            prompt,
            model=str(config.get("model", "")),
            api_key=str(config.get("apiKey", "")),
            base_url=str(config.get("baseUrl", "")),
            api_type=str(config.get("apiType", "chat_completions")),
            temperature=0,
            timeout=parse_timeout,
            max_retries=parse_retries,
        )
        parsed = _extract_json_object(response_text)
        deterministic_rules = extract_deterministic_format_rules(text)
        return merge_deterministic_rules(parsed, deterministic_rules)
    except Exception as exc:
        return _fallback_format_rules(text, f"{_safe_error_message(exc)}；本次解析等待上限 {parse_timeout} 秒。")


def _extract_json_object(text: str) -> dict[str, Any]:
    return extract_json_object(text, allow_style_array=True)


def _coerce_number(value: Any) -> float:
    result = _coerce_optional_number(value)
    if result is None:
        raise ValueError(f"Expected number, got {value!r}")
    return result


def _coerce_optional_number(value: Any) -> float | None:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return float(value)
    raw = _normalize_scalar_text(value)
    if not raw:
        return None
    size = _extract_font_size_pt(raw)
    if size is not None:
        return size
    match = re.search(r"-?\d+(?:\.\d+)?", raw)
    if match:
        return float(match.group(0))
    return None


def _coerce_optional_bool(value: Any) -> bool | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    normalized = str(value).strip().lower()
    if normalized in {"true", "yes", "1", "加粗", "bold"}:
        return True
    if normalized in {"false", "no", "0", "不加粗", "normal"}:
        return False
    return None


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Parse school formatting instructions into structured Word format rules")
    subparsers = parser.add_subparsers(dest="command", required=True)

    parse_parser = subparsers.add_parser("parse-text", help="Parse a text/markdown instruction file with the configured LLM")
    parse_parser.add_argument("input", type=Path)
    parse_parser.add_argument("--output", type=Path, default=ACTIVE_RULES_PATH)

    deterministic_parser = subparsers.add_parser("parse-deterministic", help="Parse explicit school rules without calling an LLM")
    deterministic_parser.add_argument("input", type=Path)
    deterministic_parser.add_argument("--output", type=Path, default=ACTIVE_RULES_PATH)

    reset_parser = subparsers.add_parser("reset", help="Reset active format rules to built-in defaults")
    reset_parser.add_argument("--output", type=Path, default=ACTIVE_RULES_PATH)

    show_parser = subparsers.add_parser("show", help="Print active format rules")
    show_parser.add_argument("--input", type=Path, default=ACTIVE_RULES_PATH)

    args = parser.parse_args(argv)
    if args.command == "parse-text":
        rules = parse_format_rules_from_text(args.input.read_text(encoding="utf-8"))
        output_path = save_active_format_rules(rules, args.output)
        print(json.dumps({"ok": True, "path": str(output_path), "rules": rules}, ensure_ascii=False, indent=2))
        return
    if args.command == "parse-deterministic":
        deterministic = extract_deterministic_format_rules(args.input.read_text(encoding="utf-8"))
        rules = merge_deterministic_rules({}, deterministic)
        output_path = save_active_format_rules(rules, args.output)
        print(json.dumps({"ok": True, "path": str(output_path), "rules": rules}, ensure_ascii=False, indent=2))
        return
    if args.command == "reset":
        output_path = save_active_format_rules(get_default_format_rules(), args.output)
        print(json.dumps({"ok": True, "path": str(output_path)}, ensure_ascii=False, indent=2))
        return
    if args.command == "show":
        print(json.dumps(load_active_format_rules(args.input), ensure_ascii=False, indent=2))
        return
    parser.error("Unknown command")


if __name__ == "__main__":
    main()
