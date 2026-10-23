# -*- coding: utf-8 -*-
"""学习记录与个性化建议：所有建议都必须能追溯到具体数据。"""
import sqlite3
import time

from . import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS questions(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts REAL, query TEXT, book TEXT, page INTEGER, mode TEXT, cited_ok INTEGER
);
CREATE TABLE IF NOT EXISTS feedback(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts REAL, question_id INTEGER, useful INTEGER, note TEXT
);
"""


def _conn():
    c = sqlite3.connect(config.DB_PATH)
    c.executescript(SCHEMA)
    return c


def record(query, book, page, mode, cited_ok):
    c = _conn()
    cur = c.execute("INSERT INTO questions(ts,query,book,page,mode,cited_ok) VALUES(?,?,?,?,?,?)",
                    (time.time(), query, book, page, mode, 1 if cited_ok else 0))
    c.commit()
    qid = cur.lastrowid
    c.close()
    return qid


def suggest(book, page, window_days=7):
    """基于最近提问记录生成建议；每条都带数据依据。"""
    c = _conn()
    since = time.time() - window_days * 86400
    total = c.execute("SELECT COUNT(*) FROM questions WHERE ts>?", (since,)).fetchone()[0]
    same_book = c.execute("SELECT COUNT(*) FROM questions WHERE ts>? AND book=?", (since, book)).fetchone()[0]
    near = c.execute("SELECT COUNT(*) FROM questions WHERE ts>? AND book=? AND page BETWEEN ? AND ?",
                     (since, book, page - 3, page + 3)).fetchone()[0]
    c.close()

    out = []
    if near >= 3:
        out.append("你在 P%d–P%d 这一区域已提问 %d 次，说明这里没打通：建议把这段连续重读一遍，再自测 3 题。"
                   % (page - 3, page + 3, near))
    if same_book >= 3:
        out.append("本周你在《%s》已提问 %d 次（共 %d 次提问），投入集中：可换一本教材交叉验证，或直接看文献卡里的综述。"
                   % (book, same_book, total))
    if not out:
        out.append("这是你本周第 %d 次提问；当前没有反复卡住的知识点，建议按今天的内容做 3 道自测巩固。" % max(1, total))
    return out


def stats(window_days=7):
    c = _conn()
    since = time.time() - window_days * 86400
    rows = c.execute("SELECT book, COUNT(*) FROM questions WHERE ts>? AND length(book)>0 GROUP BY book ORDER BY 2 DESC", (since,)).fetchall()
    c.close()
    return {"window_days": window_days, "by_book": rows}


def recent(limit=8):
    """最近提问，用于首页「最近学习」。"""
    c = _conn()
    rows = c.execute(
        "SELECT ts, query, book, page, mode, cited_ok FROM questions ORDER BY id DESC LIMIT ?",
        (limit,)).fetchall()
    c.close()
    out = []
    for ts, q, book, page, mode, ok in rows:
        out.append({
            "ts": ts,
            "time": time.strftime("%m-%d %H:%M", time.localtime(ts)),
            "query": q,
            "book": book,
            "page": page,
            "mode": mode,
            "cited_ok": bool(ok),
        })
    return out


def totals(window_days=7):
    c = _conn()
    since = time.time() - window_days * 86400
    total = c.execute("SELECT COUNT(*) FROM questions").fetchone()[0]
    week = c.execute("SELECT COUNT(*) FROM questions WHERE ts>?", (since,)).fetchone()[0]
    cited = c.execute("SELECT COUNT(*) FROM questions WHERE ts>? AND cited_ok=1", (since,)).fetchone()[0]
    c.close()
    return {"total": total, "week": week, "week_cited": cited}


def weak_points(window_days=30, min_hits=2, limit=6):
    """反复提问的页段 → 薄弱点。按 book + 页码十位分桶。"""
    c = _conn()
    since = time.time() - window_days * 86400
    rows = c.execute(
        "SELECT book, page, COUNT(*) FROM questions WHERE ts>? AND length(book)>0 AND page>0 "
        "GROUP BY book, page/10 ORDER BY 3 DESC LIMIT ?",
        (since, limit * 2)).fetchall()
    c.close()
    out = []
    for book, page, n in rows:
        if n < min_hits:
            continue
        out.append({"book": book, "page": int(page), "count": n})
        if len(out) >= limit:
            break
    return out
