# -*- coding: utf-8 -*-
"""合并后的冒烟测试：教材检索 + 拒答 + 原有规则未破坏。"""
import json
import os
import sys
import tempfile
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
PARENT = os.path.dirname(HERE)
sys.path.insert(0, PARENT)

import textbook  # noqa: E402


def main():
    print("=== 1. 教材索引 ===")
    st = textbook.status()
    print("   条数:", st["loaded"], "| 阈值:", st["min_coverage"])
    if st["loaded"] == 0:
        print("   !! 没有索引，后续只测拒答")
    cases = [
        ("动眼神经损伤的表现", True),
        ("三羧酸循环的关键限速酶", True),
        ("动作电位是怎样产生的", True),
        ("股三角的境界和内容物", True),
        ("量子纠缠的基本原理", False),
        ("明天郑州天气怎么样", False),
    ]
    ok = 0
    for q, want in cases:
        hits = textbook.search(q)
        got = bool(hits)
        mark = "✓" if got == want else "✗"
        ok += got == want
        detail = ("%s P%d cov %.2f" % (hits[0]["book"], hits[0]["page"], hits[0]["coverage"])) if hits else "拒答"
        print("   %s %-16s %s" % (mark, q, detail))
    print("   判定正确: %d/%d" % (ok, len(cases)))

    print("\n=== 2. 原有点评规则（不启动服务，直接调函数）===")
    os.environ["MEDNEXUS_DB"] = os.path.join(tempfile.mkdtemp(), "t.sqlite3")
    import server  # noqa: E402
    server.init_db()
    learner = "a" * 48
    with server.connect() as db:
        task = server.make_task(db, learner, "oculomotor")
        print("   出题:", task["prompt"][:24], "要点数:", len(task["points"]))
        body = {"token": task["token"], "answers": [p["options"][0] for p in task["points"]], "confidence": "一般"}
        res = server.grade(db, learner, body)
        print("   评分:", res["score"], "动作:", res["action"], "要点:", len(res["rubric"]))
        snap = server.snapshot(db, learner)
        print("   知识点:", len(snap["concepts"]), "来源数:", len(snap["sources"]))
        kinds = {}
        for s in snap["sources"]:
            kinds[s["kind"]] = kinds.get(s["kind"], 0) + 1
        print("   来源构成:", kinds)

    print("\n=== 3. 检索走教材（经 server.retrieve）===")
    with server.connect() as db:
        hits = server.retrieve("三羧酸循环的关键限速酶", server.all_sources(db, learner))
    if hits:
        h = hits[0]
        print("   %s P%d kind=%s cov=%.2f" % (h["book"], h["page"], h["kind"], h.get("coverage", 0)))
    else:
        print("   未命中（若索引存在则为异常）")


if __name__ == "__main__":
    main()
