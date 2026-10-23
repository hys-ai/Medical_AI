# -*- coding: utf-8 -*-
"""段落级索引：把每本教材的逐页文本切成带页码的段落块。"""
import io
import json
import os
import re

from . import config

IDX_PATH = os.path.join(config.ROOT, "chunks.jsonl")


def _chunks_of_page(text, maxlen=320):
    paras = [p.strip() for p in re.split(r"\n+", text) if p.strip()]
    out, buf = [], ""
    for p in paras:
        if len(p) < 8:
            continue
        if len(buf) + len(p) <= maxlen:
            buf = (buf + " " + p).strip()
        else:
            if buf:
                out.append(buf)
            buf = p
    if buf:
        out.append(buf)
    return out


def build(force=False):
    """从 book_*.jsonl 读取逐页文本，生成段落块并落盘缓存。"""
    if os.path.exists(IDX_PATH) and not force:
        return load()
    rows = []
    for book in config.BOOKS:
        path = os.path.join(config.ROOT, book["jsonl"])
        if not os.path.exists(path):
            continue
        with io.open(path, encoding="utf-8") as f:
            for line in f:
                rec = json.loads(line)
                page = rec["pdf_page"] - book["offset"]
                if page < 1 or page > 1200:
                    continue  # 封面、序、目录等前置页不参与引用
                for k, ch in enumerate(_chunks_of_page(rec["text"])):
                    rows.append({
                        "id": "%s:%d:%d" % (book["name"], page, k),
                        "book": book["name"] + "（" + book["edition"] + "）",
                        "page": page,
                        "text": ch,
                    })
    if not rows:
        # 没有教材就不写空文件，避免在干净仓库里留下一个 0 字节索引
        return rows
    with io.open(IDX_PATH, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    return rows


def load():
    rows = []
    with io.open(IDX_PATH, encoding="utf-8") as f:
        for line in f:
            rows.append(json.loads(line))
    return rows


def page_text(rows):
    """book+page -> 该页全部文本，用于引用回查。"""
    m = {}
    for r in rows:
        m.setdefault((r["book"], r["page"]), []).append(r["text"])
    return {k: "\n".join(v) for k, v in m.items()}
