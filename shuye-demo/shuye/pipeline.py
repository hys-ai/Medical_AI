# -*- coding: utf-8 -*-
"""三卡流水线：一次提问 → 答案卡 + 文献卡 + 建议卡。"""
from . import citation, config, index, llm, pubmed, retrieval, store

_docs = None
_retriever = None


def boot(force=False):
    global _docs, _retriever
    if _retriever is None or force:
        _docs = index.build(force=force)
        _retriever = retrieval.Retriever(_docs)
    return _retriever


def book_stats():
    """每本书的段落数、页码范围。"""
    docs = boot().docs
    agg = {}
    for d in docs:
        b = d["book"]
        s = agg.setdefault(b, {"book": b, "chunks": 0, "min": 10 ** 6, "max": 0})
        s["chunks"] += 1
        s["min"] = min(s["min"], d["page"])
        s["max"] = max(s["max"], d["page"])
    out = list(agg.values())
    for s in out:
        if s["min"] == 10 ** 6:
            s["min"] = 0
    out.sort(key=lambda x: -x["chunks"])
    return out


def overview():
    """首页所需的全部数据。"""
    boot()
    totals = store.totals()
    books = book_stats()
    return {
        "questions": totals,
        "books": books,
        "chunks": sum(b["chunks"] for b in books),
        "recent": store.recent(8),
        "weak": store.weak_points(),
        "status": {
            "llm": bool(config.LLM_KEY),
            "model": config.LLM_MODEL,
            "pubmed": True,
            "coverage_threshold": config.MIN_COVERAGE,
        },
    }



def ask(question, with_pubmed=True, offline=False):
    r = boot()
    chunks, expanded, coverage = r.search(question)
    if coverage < config.MIN_COVERAGE:
        chunks = []          # 检索结果与问题不相关 → 走拒答分支
    texts, names = citation.build_ref_map(chunks) if chunks else ({}, {})
    raw, mode = llm.answer(question, chunks, offline=offline)
    cleaned, report = citation.verify(raw, texts, names)
    refused = citation.all_rejected(report) or mode == "refuse"

    if refused:
        cleaned = "教材中未见明确表述：本次检索没有找到可核对的依据，建议换个说法再问，或直接查看文献卡。"

    top = chunks[0] if chunks else {}
    qid = store.record(question, top.get("book", ""), top.get("page", 0), mode,
                       1 if any(x["ok"] for x in report) else 0)
    tips = store.suggest(top.get("book", ""), top.get("page", 0))

    papers, pm_note = [], ""
    if with_pubmed:
        papers, pm_note = pubmed.search(question, retmax=3)

    return {
        "question": question,
        "question_id": qid,
        "answer": cleaned,
        "mode": mode,
        "refused": refused,
        "expanded": expanded,
        "coverage": round(coverage, 2),
        "citations": report,
        "chunks": chunks,
        "papers": papers,
        "pubmed_note": pm_note,
        "tips": tips,
    }


def render(result):
    L = []
    L.append("=" * 68)
    L.append("问题：" + result["question"])
    L.append("=" * 68)
    L.append("【答案卡】")
    L.append("  " + result["answer"].replace("\n", "\n  "))
    L.append("  查询覆盖率：%.2f（拒答阈值 %.2f）" % (result["coverage"], config.MIN_COVERAGE))
    if result["expanded"]:
        L.append("  查询扩展：" + "、".join(result["expanded"]))
    if result["refused"]:
        L.append("  状态：已拒答（无可核对依据）")
    L.append("")
    L.append("【引用校验】")
    if not result["citations"]:
        L.append("  （本次答案未使用教材引用）")
    for c in result["citations"]:
        L.append("  %s《%s》P%d — %s" % ("✓" if c["ok"] else "✗", c["book"], c["page"], c["reason"]))
    L.append("")
    if result["papers"]:
        L.append("【文献卡】来源：" + result["pubmed_note"])
        for i, p in enumerate(result["papers"], 1):
            L.append("  %d. [%s] %s (%s, %s) PMID:%s" % (i, p["evidence"], p["title"], p["journal"], p["year"], p["pmid"]))
            if p["abstract"]:
                L.append("     " + p["abstract"][:110] + "…")
    elif result["pubmed_note"]:
        L.append("【文献卡】未取到文献：" + result["pubmed_note"])
    L.append("")
    L.append("【建议卡】")
    for t in result["tips"]:
        L.append("  · " + t)
    return "\n".join(L)


