# -*- coding: utf-8 -*-
"""教材页级检索层（由「书页」项目并入）。

职责：把本地教材索引 chunks.jsonl 变成 MedNexus 可用的 source 记录，
让「补学」与「自由提问」都能给出**可核验的印刷页码**，而不是自编摘要。

索引文件位置（按顺序查找，取第一个存在的）：
    <仓库根>/chunks.jsonl
    <仓库根>/mednexus/data/chunks.jsonl

索引由 tools/pdf_extract.py + shuye/index.py 生成，格式每行：
    {"id": "...", "book": "生理学（第10版）", "page": 321, "text": "..."}

设计要点：
  · BM25（术语精确）+ IDF 加权覆盖率（判断该不该拒答）
  · 索引只在首次使用时构建，之后走模块级缓存
  · 覆盖率低于 MIN_COVERAGE 时返回空列表，由上层走拒答/回退
"""
import hashlib
import io
import json
import math
import re
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent

CANDIDATES = [ROOT / "chunks.jsonl", HERE / "data" / "chunks.jsonl"]

MIN_COVERAGE = 0.30      # 查询词覆盖率下限，低于此值判为“教材里没有”
TOP_K = 3

_CJK = re.compile(r"[\u4e00-\u9fff]")
_WORD = re.compile(r"[a-z0-9]+")
_STOP = set("的了是在和与或有不为以及等这那其即由对可会要将把被")

_index = None
_status = {"loaded": 0, "path": ""}


# ---------- 索引构建 ----------

def _tokens(text):
    text = str(text).lower()
    toks = _WORD.findall(text)
    chars = _CJK.findall(text)
    toks += [chars[i] + chars[i + 1] for i in range(len(chars) - 1)]
    return toks


def _query_terms(query):
    """查询词：去停用字的二元组 + 英文词。用于覆盖率判定。"""
    text = str(query).lower()
    terms = set(_WORD.findall(text))
    chars = [c for c in _CJK.findall(text) if c not in _STOP]
    terms.update(chars[i] + chars[i + 1] for i in range(len(chars) - 1))
    return terms


def _find_index_file():
    for p in CANDIDATES:
        if p.is_file() and p.stat().st_size > 0:
            return p
    return None


def _build():
    global _index
    path = _find_index_file()
    if path is None:
        _status["loaded"] = 0
        _index = {"sources": [], "postings": {}, "df": {}, "len": [], "avg": 1.0}
        return _index

    sources = []
    with io.open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
            except ValueError:
                continue
            text = str(rec.get("text", "")).strip()
            page = rec.get("page")
            if not text or not isinstance(page, int) or page < 1:
                continue
            book = str(rec.get("book", "")).strip() or "未命名教材"
            sid = "tb-" + hashlib.sha256(
                (book + "|" + str(page) + "|" + text[:40]).encode("utf-8")
            ).hexdigest()[:16]
            sources.append({
                "id": sid,
                "book": book,
                "chapter": rec.get("chapter", "") or "",
                "page": page,
                "text": text,
                "keywords": rec.get("keywords", []),
                "url": "",
                "locator": "P%d" % page,
                "reference": book,
                "kind": "textbook",
                "provenance": "本地教材索引；页码为印刷页码，需对照正版核验",
            })

    postings = defaultdict(list)
    df = Counter()
    lengths = []
    for i, s in enumerate(sources):
        tf = Counter(_tokens(s["text"]))
        lengths.append(sum(tf.values()))
        for t, c in tf.items():
            postings[t].append((i, c))
            df[t] += 1
    avg = (sum(lengths) / len(lengths)) if lengths else 1.0

    _index = {"sources": sources, "postings": postings, "df": df, "len": lengths, "avg": avg}
    _status["loaded"] = len(sources)
    _status["path"] = str(path)
    return _index


def ensure():
    if _index is None:
        _build()
    return _index


def status():
    idx = ensure()
    return {"loaded": len(idx["sources"]), "path": _status["path"],
            "min_coverage": MIN_COVERAGE, "top_k": TOP_K}


def reload():
    global _index
    _index = None
    return ensure()


# ---------- 检索 ----------

def search(query, top_k=TOP_K):
    """返回 [{source...}, coverage]，按相关性降序；覆盖率不足返回 []。"""
    idx = ensure()
    if not idx["sources"]:
        return []

    terms = _query_terms(query)
    if not terms:
        return []

    N = len(idx["sources"])
    scores = defaultdict(float)
    for t in terms:
        post = idx["postings"].get(t)
        if not post:
            continue
        df = idx["df"][t]
        idf = math.log(1 + (N - df + 0.5) / (df + 0.5))
        for did, tf in post:
            dl = idx["len"][did] or 1
            denom = tf + 1.2 * (0.25 + 0.75 * dl / idx["avg"])
            scores[did] += idf * (tf * 2.2) / denom

    if not scores:
        return []

    ranked = sorted(scores.items(), key=lambda x: -x[1])[: max(top_k * 4, 12)]

    # IDF 加权覆盖率：生僻词命中才算真的相关
    total_w = 0.0
    for t in terms:
        df = idx["df"].get(t, 0)
        total_w += math.log(1 + (N - df + 0.5) / (df + 0.5))

    out = []
    for did, sc in ranked:
        s = idx["sources"][did]
        blade = s["text"]
        got = 0.0
        matched = 0
        for t in terms:
            if t in blade:
                matched += 1
                df = idx["df"].get(t, 0)
                got += math.log(1 + (N - df + 0.5) / (df + 0.5))
        cov = got / total_w if total_w else 0.0
        # 双重门槛：覆盖率达标 + 至少命中 2 个不同查询词，挡住单点误命中
        if cov >= MIN_COVERAGE and matched >= 2:
            out.append((sc, {**s, "coverage": round(cov, 3)}))

    out.sort(key=lambda x: -x[0])
    return [item for _, item in out[:top_k]]


def coverage_of(items):
    if not items:
        return 0.0
    return max(float(i.get("coverage", 0)) for i in items)
