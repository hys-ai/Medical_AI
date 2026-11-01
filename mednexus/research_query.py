"""Small, explicit question-focus suggestions; never a sentence translator.

The selected concept owns its authored English subject. Only one clearly named
focus can replace the authored template's extra conditions. Ambiguity keeps the
whole original template available for manual editing; no network or model call
occurs here and no research question is declared valuable or answered.
"""
import re


FOCI = (
    ('recovery', '恢复', r'恢复|恢復|\brecovery\b', 'recovery[Title/Abstract]'),
    ('prognosis', '预后', r'预后|預後|\bprognosis\b', 'prognosis[Title/Abstract]'),
    ('etiology', '病因', r'病因|\ba?etiology\b', '(etiology[Title/Abstract] OR aetiology[Title/Abstract])'),
    ('mechanism', '机制', r'机制|機制|\bmechanism\b', 'mechanism[Title/Abstract]'),
    ('outcome', '结局指标', r'结局指标|結局指標|结局评价|結局評價|结局评估|結局評估|'
     r'功能评价|功能評價|功能评估|功能評估|评估指标|評估指標|\boutcome measures?\b',
     '("outcome measure"[Title/Abstract] OR "outcome measures"[Title/Abstract])'),
)

# Distinct subject names and characteristic target muscles, not broad shared
# terms such as pupil, function or injury. This only detects when a comparison
# needs a human to specify both subjects; it does not switch the selected topic.
SUBJECT_TERMS = {
    'oculomotor': r'动眼神经|動眼神經|\boculomotor\b|\bthird nerve\b',
    'light': r'对光反射|對光反射|瞳孔反射|\blight reflex\b',
    'abducens': r'展神经|展神經|外直肌|\babducens\b',
    'trochlear': r'滑车神经|滑車神經|上斜肌|\btrochlear\b',
    'trigeminal': r'三叉神经|三叉神經|咀嚼肌|\btrigeminal\b',
    'corneal': r'角膜反射|\bcorneal reflex\b',
    'facial': r'面神经|面神經|表情肌|\bfacial nerve\b',
    'gag': r'舌咽神经|舌咽神經|迷走神经|迷走神經|咽反射|\bgag reflex\b',
    'accessory': r'副神经|副神經|斜方肌|胸锁乳突肌|胸鎖乳突肌|\baccessory nerve\b',
    'hypoglossal': r'舌下神经|舌下神經|舌肌|\bhypoglossal\b',
}

NOTICE = ('这是少量明确词语的规则匹配，不是逐句翻译。人群、比较对象、时间和其他条件'
          '可能未转换；请核对原疑问并手动编辑英文式，确认后再检索。')
_NEGATED_OR_UNDECIDED = re.compile(
    r'不想|不要|不讨论|不討論|不研究|不考虑|不考慮|不看|不查|排除|忽略|并非|並非|而非|不是|'
    r'不确定|不確定|还没想好|還沒想好|没想清|沒想清|不清楚要|先随便|先隨便|'
    r'\b(?:not|without|exclude|unsure|uncertain)\b', re.I)
_COMPARISON = re.compile(r'比较|比較|对比|對比|差异|差異|不同|\bcompar(?:e|ison)\b|\bversus\b', re.I)


def _core_subject(template):
    """Keep the first top-level AND subject, including its authored OR group."""
    quoted, parentheses, brackets = False, 0, 0
    for index, char in enumerate(template):
        if char == '"':
            quoted = not quoted
        elif not quoted:
            if char == '(':
                parentheses += 1
            elif char == ')':
                parentheses -= 1
            elif char == '[':
                brackets += 1
            elif char == ']':
                brackets -= 1
            if parentheses < 0 or brackets < 0:
                return ''
            if parentheses == brackets == 0 and template[index:index + 3].upper() == 'AND':
                before = template[index - 1:index]
                after = template[index + 3:index + 4]
                if not (before.isalnum() or after.isalnum() or before == '_' or after == '_'):
                    return template[:index].strip()
    return ''


def build_query_proposal(concept, question):
    """Return a transparent suggestion without changing eligibility or context.

    Callers own the original gate, privacy check and explicit search action.
    A user-edited query must take precedence over this proposal at the caller.
    Authored example questions intentionally retain their matching full template.
    """
    if not isinstance(concept, dict) or not isinstance(concept.get('query'), str):
        raise ValueError('检索建议需要当前知识点的预编英文模板')
    if not isinstance(question, str):
        raise ValueError('研究疑问须为文字')
    query = concept['query']
    text = question.strip()
    subject = _core_subject(query)
    matches = []
    for focus_id, label, pattern, expression in FOCI:
        for match in re.finditer(pattern, text, re.I):
            matches.append({'term': match.group(0), 'focus': focus_id, 'label': label, 'query': expression,
                            '_start': match.start()})
    matches.sort(key=lambda item: item['_start'])
    for match in matches:
        del match['_start']
    focuses = list(dict.fromkeys(match['focus'] for match in matches))
    mentioned = {cid for cid, pattern in SUBJECT_TERMS.items() if re.search(pattern, text, re.I)}
    foreign_subject = mentioned - {concept.get('id')}
    reason = ''
    if concept.get('id') not in SUBJECT_TERMS:
        reason = '未知知识点，未自动生成或替换研究条件。'
    elif not text or text == str(concept.get('research', '')).strip():
        reason = '使用本知识点已编写的研究疑问与配套模板。'
    elif _NEGATED_OR_UNDECIDED.search(text):
        reason = '疑问包含话题排除、否定或犹豫表述，未自动选择研究焦点。'
    elif foreign_subject:
        reason = '疑问还涉及其他神经、肌肉或反射主题，未自动选择比较对象或改换知识点。'
    elif len(focuses) > 1:
        reason = '识别到多个研究焦点，未擅自把它们合并为英文条件。'
    elif not focuses:
        reason = '尚未识别到单一、受支持的明确研究焦点。'
    elif not subject:
        reason = '模板没有可可靠分离的核心主题，未自动替换原有条件。'

    focus = None
    if not reason:
        selected = next(item for item in matches if item['focus'] == focuses[0])
        focus = {'id': selected['focus'], 'label': selected['label'], 'query': selected['query']}
        query = subject + ' AND ' + focus['query']
        mapping = '保留当前知识点核心主题，并按明确词语建议“' + focus['label'] + '”条件；请确认后检索。'
        if _COMPARISON.search(text):
            mapping += ' 比较对象与差异条件尚未自动转换。'
    else:
        mapping = '保留当前知识点的原英文模板。' + reason
    return {'query': query, 'original_query': concept['query'], 'subject': subject, 'mode': 'focused' if focus else 'template',
            'mapping': mapping, 'matches': matches, 'focus': focus,
            'fallback_reason': reason, 'notice': NOTICE}
