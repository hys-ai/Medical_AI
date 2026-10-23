# -*- coding: utf-8 -*-
"""PubMed 检索：口语问题 → 检索式 → 摘要 → 证据分级。带 SQLite 缓存，演示当天接口挂了也能出结果。"""
import hashlib
import json
import re
import sqlite3
import time
import urllib.parse
import urllib.request

from . import config, llm

ESEARCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
EFETCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"

# 按特异性从高到低匹配，避免 "systematic review" 被 "review" 抢先命中
EVIDENCE = [
    ("meta-analysis", "Meta 分析"),
    ("systematic review", "系统综述"),
    ("randomized controlled trial", "随机对照"),
    ("clinical trial", "临床试验"),
    ("cohort", "队列研究"),
    ("case reports", "病例报告"),
    ("guideline", "指南"),
    ("review", "综述"),
    ("journal article", "原始研究"),
]

CJK = re.compile(r"[\u4e00-\u9fff]+")
QUESTION_WORDS = ["为什么", "是什么", "有哪些", "怎么样", "如何", "什么", "机制", "作用", "功能",
                  "请问", "能否", "是否", "吗", "呢", "的", "了", "在", "中", "与", "和"]


def _conn():
    c = sqlite3.connect(config.DB_PATH)
    c.execute("""CREATE TABLE IF NOT EXISTS pm_cache(
        k TEXT PRIMARY KEY, ts REAL, payload TEXT)""")
    return c


def _cache_get(k):
    c = _conn()
    row = c.execute("SELECT ts,payload FROM pm_cache WHERE k=?", (k,)).fetchone()
    c.close()
    if row and time.time() - row[0] < 86400:
        return json.loads(row[1])
    return None


def _cache_put(k, payload):
    c = _conn()
    c.execute("INSERT OR REPLACE INTO pm_cache VALUES(?,?,?)", (k, time.time(), json.dumps(payload, ensure_ascii=False)))
    c.commit()
    c.close()


def build_query(question):
    """优先让大模型给规范检索式；无密钥时用规则兜底（中文关键词 + 英文常见术语保留）。"""
    if config.LLM_KEY:
        msg = ("把下面的中文医学问题转成 PubMed 检索式。要求：只用英文；"
               "使用 Title/Abstract 字段；用 AND 连接 2-4 个核心概念；"
               "只输出检索式本身，不要解释。\n问题：" + question)
        out = llm.chat([{"role": "user", "content": msg}], temperature=0)
        if out and not out.startswith("[LLM"):
            return out.strip().strip("`").split("\n")[0]
    # 无 LLM：先查术语表，把中文关键词映射成英文，再不行就放弃（英文库里查中文无意义）
    hits = []
    for zh, en in config.GLOSSARY.items():
        if zh in question and en not in hits:
            hits.append(en)
    if hits:
        return " AND ".join('"%s"[Title/Abstract]' % t for t in hits[:3])
    ascii_terms = re.findall(r"[A-Za-z][A-Za-z0-9\-]{2,}", question)
    if ascii_terms:
        return " AND ".join('"%s"[Title/Abstract]' % t for t in ascii_terms[:3])
    return ""


def esearch(term, retmax=5):
    params = {"db": "pubmed", "term": term, "retmax": str(retmax), "retmode": "json", "sort": "relevance"}
    if config.NCBI_KEY:
        params["api_key"] = config.NCBI_KEY
    if config.NCBI_EMAIL:
        params["email"] = config.NCBI_EMAIL
    url = ESEARCH + "?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=20) as r:
        return json.loads(r.read())["esearchresult"].get("idlist", [])


def efetch(pmids):
    if not pmids:
        return []
    params = {"db": "pubmed", "id": ",".join(pmids), "retmode": "xml"}
    if config.NCBI_KEY:
        params["api_key"] = config.NCBI_KEY
    url = EFETCH + "?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=30) as r:
        xml = r.read().decode("utf-8", "ignore")
    return _parse(xml)


def _parse(xml):
    import xml.etree.ElementTree as ET
    out = []
    try:
        root = ET.fromstring(xml)
    except Exception:
        return out
    for art in root.iter("PubmedArticle"):
        pmid = art.findtext(".//PMID") or ""
        title = "".join(art.find(".//ArticleTitle").itertext()) if art.find(".//ArticleTitle") is not None else ""
        year = art.findtext(".//PubDate/Year") or art.findtext(".//PubDate/MedlineDate") or ""
        journal = art.findtext(".//Journal/Title") or ""
        abstract = " ".join("".join(a.itertext()) for a in art.findall(".//AbstractText"))[:800]
        types = [t.text or "" for t in art.findall(".//PublicationType")]
        ev = "其他"
        low = " ; ".join(types).lower() + " " + title.lower()
        for k, v in EVIDENCE:
            if k in low:
                ev = v
                break
        out.append({"pmid": pmid, "title": title.strip(), "journal": journal,
                    "year": year, "abstract": abstract.strip(), "evidence": ev})
    return out


def search(question, retmax=3):
    """完整链路：缓存 → 检索式 → esearch → efetch。失败返回 ([], 原因)。"""
    q = build_query(question)
    if not q:
        return [], "检索式生成失败"
    key = hashlib.md5((q + str(retmax)).encode()).hexdigest()
    cached = _cache_get(key)
    if cached is not None:
        return cached, "cache:" + q
    try:
        ids = esearch(q, retmax)
        arts = efetch(ids)
        _cache_put(key, arts)
        return arts, q
    except Exception as e:
        return [], "PubMed 请求失败：%s（检索式：%s）" % (e, q)


