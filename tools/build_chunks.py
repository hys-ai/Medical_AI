# -*- coding: utf-8 -*-
"""从 book_*.jsonl（逐页文本）生成 chunks.jsonl（段落级教材索引）。

用途：合并后的 MedNexus 通过 textbook.py 读取 chunks.jsonl，
      让「补学」与「自由提问」能给出可核验的印刷页码。

输入：项目根目录下的 book_*.jsonl，每行：
      {"pdf_page": 1, "text": "这一页的全部文字"}
输出：项目根目录下的 chunks.jsonl，每行：
      {"id": "...", "book": "生理学（第10版）", "page": 321, "text": "段落…"}

页码换算：page = pdf_page - offset。offset（PDF 页 − 印刷页）必须逐本核对，
          不同书不同，错一本整本引用都会偏。

用法：
    python tools/build_chunks.py                 # 用内置的三本书配置
    python tools/build_chunks.py --config my.py  # 自定义书籍清单
"""
import argparse
import hashlib
import io
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 实测偏移：局部解剖学 +19、生化 +29、生理学 +23
BOOKS = [
    {"name": "局部解剖学", "edition": "第10版", "jsonl": "book_jiepou.jsonl", "offset": 19},
    {"name": "生物化学与分子生物学", "edition": "第10版", "jsonl": "book_shenghua.jsonl", "offset": 29},
    {"name": "生理学", "edition": "第10版", "jsonl": "book_shengli.jsonl", "offset": 23},
]

MAX_LEN = 320      # 单块上限；医学教材概念密集，块太大检索会不准
MIN_LEN = 8        # 过短的段落（页码、图注残片）丢弃


def chunks_of_page(text):
    paras = [p.strip() for p in re.split(r"\n+", text) if p.strip()]
    out, buf = [], ""
    for p in paras:
        if len(p) < MIN_LEN:
            continue
        if len(buf) + len(p) <= MAX_LEN:
            buf = (buf + " " + p).strip()
        else:
            if buf:
                out.append(buf)
            buf = p
    if buf:
        out.append(buf)
    return out


def build(books, root, verbose=True):
    rows, stats = [], []
    for book in books:
        path = os.path.join(root, book["jsonl"])
        if not os.path.isfile(path):
            if verbose:
                print("  跳过（文件不存在）：", book["jsonl"])
            continue
        n = 0
        with io.open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                rec = json.loads(line)
                page = int(rec.get("pdf_page", 0)) - book["offset"]
                if page < 1 or page > 1200:
                    continue          # 封面、序、目录等前置页不参与引用
                for k, ch in enumerate(chunks_of_page(rec.get("text", ""))):
                    sid = hashlib.sha256(
                        ("%s|%d|%d" % (book["name"], page, k)).encode("utf-8")).hexdigest()[:16]
                    rows.append({
                        "id": sid,
                        "book": "%s（%s）" % (book["name"], book["edition"]),
                        "page": page,
                        "text": ch,
                    })
                    n += 1
        stats.append((book["name"], n))
        if verbose:
            print("  %-14s %5d 块" % (book["name"], n))

    out_path = os.path.join(root, "chunks.jsonl")
    if not rows:
        print("没有生成任何段落；请先放好 book_*.jsonl 教材文件。")
        return 0
    with io.open(out_path, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    size = os.path.getsize(out_path) / 1024 / 1024
    print("已生成 %s：%d 块，%.1f MB" % (os.path.basename(out_path), len(rows), size))
    return len(rows)


def main():
    ap = argparse.ArgumentParser(description="从 book_*.jsonl 生成教材段落索引")
    ap.add_argument("--config", help="自定义书籍清单（Python 文件，定义 BOOKS）")
    ap.add_argument("--root", default=ROOT, help="教材与输出的目录，默认项目根目录")
    args = ap.parse_args()

    books = BOOKS
    if args.config:
        ns = {}
        with io.open(args.config, encoding="utf-8") as f:
            exec(compile(f.read(), args.config, "exec"), ns)
        books = ns["BOOKS"]

    print("从逐页文本生成段落索引……")
    n = build(books, args.root)
    sys.exit(0 if n else 1)


if __name__ == "__main__":
    main()
