# -*- coding: utf-8 -*-
"""答案生成：有密钥走大模型，没密钥走抽取式（保证离线也能演示整条链路）。"""
import json
import urllib.request

from . import config

PROMPT = """你是医学学习助手。只能依据下面给出的教材片段回答问题。

规则：
1. 每个结论后必须标注出处，格式为《书名》P页码，书名与页码只能取自片段标记。
2. 片段中找不到依据时，直接回答"教材中未见明确表述"，不要推测。
3. 只输出 3-5 句，先给结论，再给要点，不要复述原文长句。
4. 不要编造页码，不要引用未给出的文献。

教材片段：
{context}

问题：{question}
"""


def _post(url, payload, key, timeout=30):
    req = urllib.request.Request(
        url, data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + key})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def chat(messages, temperature=0.2, timeout=30):
    if not config.LLM_KEY:
        return None
    try:
        data = _post(config.LLM_BASE.rstrip("/") + "/chat/completions", {
            "model": config.LLM_MODEL, "messages": messages,
            "temperature": temperature, "max_tokens": 600,
        }, config.LLM_KEY, timeout)
        return data["choices"][0]["message"]["content"].strip()
    except Exception as e:
        return "[LLM 调用失败：%s]" % e


def build_context(chunks):
    lines = []
    for i, c in enumerate(chunks, 1):
        lines.append("[片段%d] 《%s》P%d：%s" % (i, c["book"], c["page"], c["text"][:300]))
    return "\n".join(lines)


def answer(question, chunks, offline=False):
    """返回 (答案文本, 模式)"""
    if not chunks:
        return "教材中未见明确表述（未检索到相关段落）。", "refuse"
    if offline or not config.LLM_KEY:
        return _extractive(question, chunks)
    out = chat([{"role": "user", "content": PROMPT.format(context=build_context(chunks), question=question)}])
    if not out or out.startswith("[LLM 调用失败"):
        return _extractive(question, chunks)
    return out, "llm"


def _extractive(question, chunks):
    """离线兜底：在检索段落里挑与问题最贴近的 1-2 句，并强制标注页码。"""
    import re as _re

    c = chunks[0]
    body = " ".join(c["text"].split())
    sents = [s.strip() for s in _re.split(r"(?<=[。；;])", body) if len(s.strip()) > 8]
    if not sents:
        sents = [body]

    qchars = _re.sub(r"[^\u4e00-\u9fff]", "", question)
    qgrams = set()
    for n in (5, 4, 3, 2):
        for i in range(len(qchars) - n + 1):
            qgrams.add(qchars[i:i + n])

    def score(s):
        # 命中的查询片段越长越可信："股三角" 比 "三角" 更有辨识度
        return sum(len(g) ** 2 for g in qgrams if g in s)

    sents.sort(key=score, reverse=True)
    lead = "".join(sents[:2])[: config.MAX_QUOTE]
    return "%s（依据《%s》P%d；离线抽取模式，未做语言组织）" % (lead, c["book"], c["page"]), "extractive"



