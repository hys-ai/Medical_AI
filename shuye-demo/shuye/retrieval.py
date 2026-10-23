# -*- coding: utf-8 -*-
"""混合检索：BM25（术语精确）+ 向量（语义），用 RRF 融合。

向量部分可选：没有 embeddings.npy 时自动退化为纯 BM25。
"""
import collections
import math
import os
import re

from . import config

CJK = re.compile(r"[\u4e00-\u9fff]")
ASCIIW = re.compile(r"[A-Za-z][A-Za-z0-9\-]{1,}")
STOP = set("的了是在和与或有不为以及等这那其")


def tokenize(text):
    toks = [m.group(0).lower() for m in ASCIIW.finditer(text)]
    chars = CJK.findall(text)
    toks += [chars[i] + chars[i + 1] for i in range(len(chars) - 1)]
    toks += chars
    return toks


def expand_query(q):
    """同义词扩展：把学生用语映射到教材用语。"""
    extra = []
    for base, alts in config.SYNONYMS.items():
        if base in q and base not in alts:
            extra.extend(alts)
    return q + (" " + " ".join(extra) if extra else ""), extra


class BM25:
    def __init__(self, docs, k1=1.5, b=0.75):
        self.docs = docs
        self.k1, self.b = k1, b
        self.post = collections.defaultdict(list)
        self.df = collections.Counter()
        self.len = []
        for i, d in enumerate(docs):
            tf = collections.Counter(tokenize(d["text"]))
            self.len.append(sum(tf.values()))
            for t, c in tf.items():
                self.post[t].append((i, c))
                self.df[t] += 1
        self.avg = sum(self.len) / max(1, len(self.len))

    def search(self, query, topk=20):
        N = len(self.docs)
        qs = collections.Counter(tokenize(query))
        scores = collections.defaultdict(float)
        for t, qn in qs.items():
            if t not in self.post:
                continue
            idf = math.log(1 + (N - self.df[t] + 0.5) / (self.df[t] + 0.5))
            for did, tf in self.post[t]:
                dl = self.len[did]
                s = idf * (tf * (self.k1 + 1)) / (tf + self.k1 * (1 - self.b + self.b * dl / self.avg))
                scores[did] += s * qn
        ranked = sorted(scores.items(), key=lambda x: -x[1])[:topk]
        return [(i, s) for i, s in ranked]


class VectorIndex:
    """可选的向量检索：embeddings.npy + ids.json。缺文件时返回空。"""

    def __init__(self, docs):
        self.docs = docs
        self.ok = False
        npy = config.VECTOR_PATH
        ids = os.path.join(config.ROOT, "embedding_ids.json")
        if not (os.path.exists(npy) and os.path.exists(ids)):
            return
        try:
            import json
            import numpy as np
            self.np = np
            self.mat = np.load(npy)
            with open(ids, encoding="utf-8") as f:
                self.ids = json.load(f)
            norms = np.linalg.norm(self.mat, axis=1, keepdims=True)
            self.mat = self.mat / (norms + 1e-9)
            self.ok = True
        except Exception:
            self.ok = False

    def search(self, query, topk=20):
        if not self.ok or not config.EMB_KEY:
            return []
        try:
            import json
            import urllib.request
            payload = json.dumps({"model": config.EMB_MODEL, "input": [query]}).encode()
            req = urllib.request.Request(
                config.EMB_BASE.rstrip("/") + "/embeddings", data=payload,
                headers={"Content-Type": "application/json",
                         "Authorization": "Bearer " + config.EMB_KEY})
            with urllib.request.urlopen(req, timeout=15) as r:
                q = json.loads(r.read())["data"][0]["embedding"]
            q = self.np.array([q], dtype="float32")[0]
            q = q / (self.np.linalg.norm(q) + 1e-9)
            sims = self.mat @ q
            order = self.np.argsort(-sims)[:topk]
            return [(self.ids[int(i)], float(sims[int(i)])) for i in order]
        except Exception:
            return []


def rrf(rank_lists, k=60):
    """Reciprocal Rank Fusion：多路结果融合，不需要调权重。"""
    score = collections.defaultdict(float)
    for lst in rank_lists:
        for rank, (did, _) in enumerate(lst):
            score[did] += 1.0 / (k + rank + 1)
    return sorted(score.items(), key=lambda x: -x[1])


class Retriever:
    def __init__(self, docs):
        self.docs = docs
        self.bm25 = BM25(docs)
        self.vec = VectorIndex(docs)

    def search(self, query, topk=None):
        topk = topk or config.TOP_K
        q, extra = expand_query(query)
        lists = [self.bm25.search(q, 20)]
        v = self.vec.search(q, 20)
        if v:
            lists.append(v)
        fused = rrf(lists)[: max(30, topk)]
        # 覆盖率重排：优先选"查询词覆盖更全"的块，缓解长尾词被高频词淹没
        reranked = []
        for did, s in fused:
            cov = self.coverage(query, [self.docs[did]], topn=1)
            reranked.append((did, s * (0.4 + cov), cov))
        reranked.sort(key=lambda x: -x[1])
        chunks = [dict(self.docs[did], score=round(s, 4)) for did, s, _ in reranked[:topk]]
        coverage = self.coverage(query, chunks)
        return chunks, extra, coverage

    def coverage(self, query, chunks, topn=3):
        """IDF 加权的查询覆盖率：生僻词命中才算真的相关，防止用"基本""原理"蒙混过关。"""
        grams = _q_grams(query)
        if not grams:
            return 0.0
        N = len(self.docs)
        blob = "\n".join(c["text"] for c in chunks[:topn])
        tot = got = 0.0
        for g in grams:
            df = self.bm25.df.get(g, 0)
            idf = math.log(1 + (N - df + 0.5) / (df + 0.5))
            tot += idf
            if g in blob:
                got += idf
        return got / tot if tot else 0.0


def _q_grams(query, maxn=12):
    chars = [c for c in CJK.findall(query) if c not in STOP]
    out, seen = [], set()
    for i in range(len(chars) - 1):
        a, b = chars[i], chars[i + 1]
        if a in STOP or b in STOP:
            continue
        g = a + b
        if g not in seen:
            seen.add(g)
            out.append(g)
    return out[:maxn]



