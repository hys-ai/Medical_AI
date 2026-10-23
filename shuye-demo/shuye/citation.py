# -*- coding: utf-8 -*-
"""引用校验：答案里的每个页码都必须能被检索到的原文复现，否则删除或降级。

这是整个系统最核心的一段代码——它把"页码可信"从口号变成机制。
"""
import re

CITE = re.compile(r"《([^》]{2,40}?)》\s*[Pp]?\s*(\d{1,4})")
SENT = re.compile(r"[。；;！!？?\n]")
CJK = re.compile(r"[\u4e00-\u9fff]")
STOP = set("的了是在和与或有不为以及等这那其即由对可会要将把被")


def _bigrams(s, n=4):
    chars = [c for c in CJK.findall(s) if c not in STOP]
    grams = ["".join(chars[i:i + 2]) for i in range(len(chars) - 1)]
    seen, out = set(), []
    for g in grams:
        if g not in seen:
            seen.add(g)
            out.append(g)
    return out[:n]


def _sentence_before(text, pos):
    start = 0
    for m in SENT.finditer(text, 0, pos):
        start = m.end()
    return text[start:pos]


def build_ref_map(chunks):
    """返回 ({书名: {页码: 原文}}, {简称: 全名})"""
    texts, names = {}, {}
    for c in chunks:
        book = c["book"]
        texts.setdefault(book, {})
        texts[book][c["page"]] = (texts[book].get(c["page"], "") + "\n" + c["text"]).strip()
        short = re.sub(r"（.*?）|\(.*?\)", "", book).strip()
        names[short] = book
    return texts, names


def _resolve(book_raw, names):
    if book_raw in names:
        return names[book_raw]
    for short, full in names.items():
        if short in book_raw or book_raw in short:
            return full
    return None


def verify(answer, texts, names, min_hit=2):
    """逐条回查引用，返回 (清理后的答案, 报告)"""
    report, keep, last = [], [], 0
    for m in CITE.finditer(answer):
        keep.append(answer[last:m.start()])
        last = m.end()
        page = int(m.group(2))
        book = _resolve(m.group(1), names)
        sent = _sentence_before(answer, m.start()).strip()
        if len(sent) < 8:   # 引用紧跟在短句后（如"（依据…"），改用前文窗口
            sent = answer[max(0, m.start() - 80):m.start()].strip()
        item = {"book": m.group(1), "page": page, "snippet": sent[:36], "ok": False, "reason": ""}

        if book is None:
            item["reason"] = "本次检索未命中该书"
            report.append(item)
            continue
        page_text = texts.get(book, {}).get(page)
        if not page_text:
            item["reason"] = "本次检索未命中该页"
            report.append(item)
            continue

        grams = _bigrams(sent)
        hit = sum(1 for g in grams if g in page_text)
        need = min(min_hit, max(1, len(grams)))
        if hit >= need:
            item["ok"] = True
            item["reason"] = "页码与原文一致"
            keep.append("《%s》P%d" % (book, page))
        else:
            item["reason"] = "该页原文未见相关表述（%d/%d）" % (hit, len(grams))
        report.append(item)

    keep.append(answer[last:])
    cleaned = re.sub(r"[ \t]{2,}", " ", "".join(keep)).strip()
    return cleaned, report


def all_rejected(report):
    return bool(report) and all(not r["ok"] for r in report)

