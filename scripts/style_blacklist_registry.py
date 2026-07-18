"""High-precision style-risk phrases shared by prompts and diagnostics.

These lists are deliberately conservative.  A normal connective (for example
``因此``) or a factual result phrase (for example ``显著提高``) is not evidence that
text was machine generated, and penalising it can change the logic or strength
of an academic claim.  The registry therefore focuses on *repeated scaffolds*
and content-free boilerplate.  Callers still compare input and output deltas;
the presence of one listed phrase is not, by itself, a hard failure.
"""

from __future__ import annotations

# Formulaic transitions.  Ordinary causal and temporal connectors are omitted
# because removing them can obscure real logical relations.
MECHANICAL_CONNECTORS: list[str] = [
    "首先", "其次", "再次", "最后", "此外", "综上", "总之",
    "由此可见", "值得注意的是",
    "不仅如此", "与此同时", "综上所述", "总而言之", "进一步地", "具体而言",
    "换言之", "换句话说",
    "在此基础上", "基于此", "由此可知", "不难发现", "需要指出的是",
    "一方面", "另一方面", "再者", "再者说", "其一", "其二", "其三",
]

# English mechanical connectors (for English/mixed chunks).
EN_MECHANICAL_CONNECTORS: list[str] = [
    "firstly", "secondly", "thirdly", "finally", "in addition", "furthermore",
    "moreover", "in conclusion",
    "it is worth noting that", "it should be noted that", "as a result",
    "in this context", "on the other hand",
]

# Content-light academic boilerplate.  Productive technical constructions such
# as "通过 X 实现 Y" and "基于 X 构建 Y" are intentionally absent.
TEMPLATE_PHRASES: list[str] = [
    r"在.+?背景下",
    r"随着.+?的(?:不断)?发展",
    "具有重要意义",
    r"提供了(?:有力|重要)?(?:的)?(?:支持|支撑)",
    r"发挥(?:着|了)?重要(?:作用|角色)",
    r"为.+?提供了(?:有力|重要)?保障",
    r"日益(?:受到|得到).+?关注",
    r"具有(?:较强|一定)的(?:现实|理论|实践)?意义",
    r"奠定了(?:坚实)?基础",
    r"得到了广泛关注",
]

# English template phrases.
EN_TEMPLATE_PHRASES: list[str] = [
    "has important significance",
    "plays an important role",
    r"provides (?:strong|important)? support",
    "further improves",
    "effectively promotes",
    "in the context of",
    r"with the (?:continuous )?development of",
    r"has attracted (?:wide|increasing) attention",
    "lays a solid foundation",
]

# Passive-voice markers (被字句 + 予以/加以/为…所/受到/得以).
# These are regex alternatives, kept raw so the derived pattern is byte-stable.
PASSIVE_VOICE_MARKERS: list[str] = [
    r"被[一-龥]{1,15}(?:了|过)?",
    r"予以[一-龥]{1,4}",
    r"加以[一-龥]{1,4}",
    r"为[一-龥]{0,20}?所[一-龥]{1,4}",
    r"受到(?:了|过)?[一-龥]{1,20}?",
    r"得以[一-龥]{1,4}",
]

# Chengyu / 文言 tells over-produced by LLMs in academic Chinese.
CHENGYU: list[str] = [
    "至关重要", "不言而喻", "举足轻重", "不可或缺", "相辅相成", "息息相关", "显而易见",
    "日益凸显", "层出不穷", "与日俱增", "行之有效", "卓有成效",
    "一目了然", "众所周知", "毫无疑问", "不可否认", "毋庸置疑",
    "日益完善", "不断完善", "日益成熟", "蓬勃发展",
    "综上所述", "总而言之", "由此可见", "不难发现",
    "一以贯之", "重中之重", "首当其冲", "淋漓尽致",
]

# AI burst connectors (numbered enumeration + high-burst transitions).
# Numbered forms use lookahead guards already baked into the raw strings.
AI_BURST_CONNECTORS: list[str] = [
    "首先", "其次", "再次", "最后", "此外", "综上", "总之",
    "不仅如此", "与此同时", "进一步地", "具体而言", "在此基础上", "基于此",
    r"第一(?=[，,、是]|，)", r"第二(?=[，,、是]|，)", r"第三(?=[，,、是]|，)",
    r"第四(?=[，,、是]|，)", r"第五(?=[，,、是]|，)",
]

# Generic closing summary phrases (cross-language).
GENERIC_CLOSINGS: list[str] = [
    "综上所述", "总而言之", "总的来说", "由此可见", "整体来看", "不难看出",
    "in conclusion", "to sum up", "it can be seen that",
    "these findings suggest that", "this demonstrates that",
]

# AI abstract padding (inflated register, filler emphasis).
AI_ABSTRACT_PADDING: list[str] = [
    "具有(?:重要|较强|一定)意义",
    "提供了(?:有力|重要)?支持",
    r"发挥(?:着|了)?重要(?:作用|角色)",
    r"奠定了(?:坚实)?基础",
    "日益完善",
    "不断完善",
    "从某种意义上说",
    "就整体而言",
]


def _alt(items: list[str]) -> str:
    return "|".join(items)


def build_mechanical_connector_pattern() -> str:
    return "(" + _alt(MECHANICAL_CONNECTORS) + ")"


def build_template_phrase_pattern() -> str:
    return "(" + _alt(TEMPLATE_PHRASES) + ")"


def build_en_mechanical_connector_pattern() -> str:
    return r"\b(" + _alt(EN_MECHANICAL_CONNECTORS) + r")\b"


def build_en_template_phrase_pattern() -> str:
    return r"\b(" + _alt(EN_TEMPLATE_PHRASES) + r")\b"


def build_passive_voice_pattern() -> str:
    return "(?:" + _alt(PASSIVE_VOICE_MARKERS) + ")"


def build_chengyu_pattern() -> str:
    return "(" + _alt(CHENGYU) + ")"


def build_ai_burst_connector_pattern() -> str:
    return "(" + _alt(AI_BURST_CONNECTORS) + ")"


def build_generic_closing_pattern() -> str:
    return "(" + _alt(GENERIC_CLOSINGS) + ")"


def build_ai_abstract_padding_pattern() -> str:
    return "(" + _alt(AI_ABSTRACT_PADDING) + ")"


# Introduced-template phrase set: the subset of template phrasing we flag when
# it appears newly in the output (input -> output delta). A curated subset of
# TEMPLATE_PHRASES / GENERIC_CLOSINGS / padding, kept stable for the
# introduced-template detection contract.
INTRODUCED_TEMPLATE_PHRASES: list[str] = [
    "综上所述", "总而言之", "由此可见", "具有重要意义", "具有较强的现实意义",
    r"奠定了(?:坚实)?基础", r"提供了(?:有力|重要)?支持",
    r"在.+?背景下.+?具有.+?意义", r"随着.+?的(?:不断)?发展",
    r"发挥(?:着|了)?重要(?:作用|角色)", r"日益(?:受到|得到).+?关注",
    r"为.+?提供了(?:有力|重要)?保障", r"得到了广泛(?:应用|关注)",
]


def build_introduced_template_phrase_pattern() -> str:
    return "(" + _alt(INTRODUCED_TEMPLATE_PHRASES) + ")"


# Nested full/half-width numbered list markers: (1)/(2)/(3), （1）/（2）/（3）,
# and trailing 1）/2） forms.  Used only as a *density* fingerprint for machine
# scaffolds; a single legitimate academic enumeration is not by itself a defect.
NESTED_NUMBER_MARKERS: list[str] = [
    r"[（(]\s*(?:\d{1,2}|[一二三四五六七八九十]+)\s*[）)]",
    r"(?<![\d.A-Za-z])(?:\d{1,2}|[一二三四五六七八九十]+)\s*[）)]",
]


def build_nested_number_marker_pattern() -> str:
    return "(?:" + _alt(NESTED_NUMBER_MARKERS) + ")"


# Colon-semicolon parallel template: X：A；B；C (full- or half-width punctuation).
# Requires a lead-in, a colon, and at least three short parallel items separated
# by semicolons — the classic LLM "aspect list" scaffold.
_COLON_PARALLEL_ITEM = r"[^。！？!?\n：:；;]{1,48}"
COLON_PARALLEL_TEMPLATES: list[str] = [
    rf"{_COLON_PARALLEL_ITEM}[：:]\s*{_COLON_PARALLEL_ITEM}[；;]\s*{_COLON_PARALLEL_ITEM}[；;]\s*{_COLON_PARALLEL_ITEM}",
]


def build_colon_parallel_pattern() -> str:
    return "(?:" + _alt(COLON_PARALLEL_TEMPLATES) + ")"


# Literal (non-pattern) terms that prompts should avoid and that the detector
# must catch. Used by the drift regression to ensure prompt "avoid" lists stay
# covered by the detector regexes. Only includes pure-literal entries (no .+?).
LITERAL_CONNECTORS: list[str] = [t for t in MECHANICAL_CONNECTORS if "(?=" not in t]
LITERAL_CHENGYU: list[str] = list(CHENGYU)  # all literal
LITERAL_CLOSINGS: list[str] = [c for c in GENERIC_CLOSINGS if "(?=" not in c and ".+?" not in c]
