"""Bounded original PubMed excerpts; section metadata is not a quality rating.

No network, model call, translation, inferred study design or generated findings
occur here. The caller supplies the selected real paper and learning question.
"""
import re
import unicodedata


MAX_CHARS = 1500
PARAGRAPH_CHARS = 300
MAX_PARAGRAPHS = 12

SECTION_INFO = (
    ('research_question', '研究背景与问题'),
    ('methods', '研究方法'),
    ('results', '研究结果'),
    ('conclusions', '作者结论'),
    ('limitations', '作者报告的局限'),
    ('unclassified', '未分类摘要原文'),
)
CATEGORY_SECTIONS = {
    'BACKGROUND': 'research_question', 'OBJECTIVE': 'research_question',
    'METHODS': 'methods', 'RESULTS': 'results', 'CONCLUSIONS': 'conclusions',
}
# Exact, normalized headings only. In particular, a mixed or unknown heading
# containing "conclusion" or "finding" cannot become a conclusion by substring.
LABEL_SECTIONS = {
    'BACKGROUND': 'research_question', 'CONTEXT': 'research_question',
    'OBJECTIVE': 'research_question', 'OBJECTIVES': 'research_question',
    'AIM': 'research_question', 'AIMS': 'research_question', 'PURPOSE': 'research_question',
    'METHOD': 'methods', 'METHODS': 'methods',
    'MATERIALS AND METHODS': 'methods', 'PATIENTS AND METHODS': 'methods',
    'PARTICIPANTS AND METHODS': 'methods',
    'DESIGN SETTING AND PARTICIPANTS': 'methods', 'STUDY DESIGN': 'methods',
    'RESULT': 'results', 'RESULTS': 'results', 'FINDING': 'results', 'FINDINGS': 'results',
    'CONCLUSION': 'conclusions', 'CONCLUSIONS': 'conclusions',
    'LIMITATION': 'limitations', 'LIMITATIONS': 'limitations',
    'STUDY LIMITATIONS': 'limitations',
}
NOTICE = ('以下仅按PubMed摘要的标准分类或明确标签整理原文节选，未翻译或自动推断研究设计、'
          '样本量、结论适用性与证据质量。缺少单列段落不等于原文没有报告，'
          '未分类内容请自行核对；节选不能替代完整摘要或全文。')
LIMITATIONS_NOTICE = ('请核对人群、设计、样本量和结局。文献类型不等于证据质量；'
                      '摘要未报告的局限不能当作不存在。')


def _heading(value):
    if not isinstance(value, str):
        return ''
    value = unicodedata.normalize('NFKC', value).strip().upper()
    value = re.sub(r'^\d+(?:\.\d+)*[.)]?\s+', '', value)
    return re.sub(r'[\s,_:\-]+', ' ', value).strip(' .')


def _section(paragraph):
    category = _heading(paragraph.get('category'))
    if category in CATEGORY_SECTIONS:
        return CATEGORY_SECTIONS[category]
    return LABEL_SECTIONS.get(_heading(paragraph.get('label')), 'unclassified')


def _metadata(paper):
    # Do not put the full abstract back into another response field, bypassing
    # the excerpt limits. No private cache fields are forwarded either.
    result = {key: paper[key] for key in ('pmid', 'title', 'journal', 'year', 'evidence', 'url', 'doi')
              if isinstance(paper.get(key), str)}
    for key, limit in (('authors', 8), ('types', 20)):
        if isinstance(paper.get(key), list):
            result[key] = [item for item in paper[key] if isinstance(item, str)][:limit]
    return result


def _missing(section, available, unclassified):
    if not available:
        return 'PubMed未提供可阅读的摘要文字，不能据标题或文献类型补写本项内容。'
    if section == 'unclassified':
        return '本次可阅读摘要段落均有可识别分类或明确标签，没有未分类段落。'
    title = dict(SECTION_INFO)[section]
    return ('摘要没有可归入“' + title + '”的单列段落。'
            + ('相关内容可能在未分类原文中，请核对。' if unclassified else '请核对完整原摘要。')
            + '这不等于研究没有报告该项，不能据此补写。')


def build_reading(paper, question, concept=None):
    """Organize actual original paragraphs into six conservative reading groups.

    Recognized NlmCategory values take priority. UNASSIGNED, missing and unknown
    categories can use only an exact normalized heading; all other text remains
    unclassified. Mixed headings are retained without guessing their meaning.
    """
    if not isinstance(paper, dict) or not isinstance(question, str) or not question.strip():
        raise ValueError('阅读需要真实文献记录和原研究疑问')
    if concept is not None and not isinstance(concept, str):
        raise ValueError('知识点须为文字标识或留空')
    groups = {section: [] for section, _ in SECTION_INFO}
    abstract = paper.get('abstract')
    for paragraph in abstract if isinstance(abstract, list) else []:
        if not isinstance(paragraph, dict) or not isinstance(paragraph.get('text'), str):
            continue
        text = paragraph['text'].strip()
        if not text:
            continue
        groups[_section(paragraph)].append({
            'text': text,
            'label': paragraph['label'] if isinstance(paragraph.get('label'), str) else '',
            'category': paragraph['category'] if isinstance(paragraph.get('category'), str) else '',
        })

    # Round-robin selection gives each available group a chance before a long
    # background/methods section can consume every paragraph slot.
    selected = []
    for index in range(MAX_PARAGRAPHS):
        for section, _ in SECTION_INFO:
            if index < len(groups[section]) and len(selected) < MAX_PARAGRAPHS:
                selected.append((section, groups[section][index]))
        if len(selected) >= MAX_PARAGRAPHS:
            break
    allocations = []
    if selected:
        share = MAX_CHARS // len(selected)
        allocations = [min(len(part['text']), PARAGRAPH_CHARS, share) for _, part in selected]
        remaining = MAX_CHARS - sum(allocations)
        for index, (_, part) in enumerate(selected):
            extra = min(remaining, min(len(part['text']), PARAGRAPH_CHARS) - allocations[index])
            allocations[index] += extra
            remaining -= extra

    excerpts = {section: [] for section, _ in SECTION_INFO}
    for (section, part), length in zip(selected, allocations):
        excerpts[section].append({**part, 'text': part['text'][:length],
                                  'truncated': length < len(part['text'])})
    available = sum(len(parts) for parts in groups.values())
    sections = []
    for section, title in SECTION_INFO:
        displayed = excerpts[section]
        omitted = len(groups[section]) - len(displayed)
        missing = '' if displayed else _missing(section, available, bool(groups['unclassified']))
        if groups[section] and not displayed:
            missing = '本组有摘要原文，但因节选上限未展示；请打开PubMed核对。'
        sections.append({'id': section, 'title': title, 'excerpts': displayed,
                         'missing_notice': missing, 'omitted_count': omitted})
    truncated = available > len(selected) or any(part['truncated'] for group in excerpts.values() for part in group)
    return {'paper': _metadata(paper), 'concept': concept or None, 'question': question.strip(),
            'mode': '摘要原文分组阅读 · 未自动推断研究结论',
            'abstract_available': bool(available), 'sections': sections,
            'notice': NOTICE,
            'evidence': [dict(part) for section in ('results', 'conclusions') for part in excerpts[section]],
            'limitations': LIMITATIONS_NOTICE,
            'relationship': ('这篇文献是对当前知识疑问的候选补充证据。是否支持、补充或与课程知识有分歧，需阅读内容后判断。'
                             if concept else '这篇文献是围绕当前疑问的候选资料。相关性、结论适用条件与局限需阅读原文核对。'),
            'excerpt_limits': {'max_chars': MAX_CHARS, 'paragraph_chars': PARAGRAPH_CHARS,
                               'max_paragraphs': MAX_PARAGRAPHS, 'shown_chars': sum(allocations),
                               'available_paragraphs': available, 'shown_paragraphs': len(selected),
                               'omitted_paragraphs': available - len(selected), 'truncated': truncated}}
