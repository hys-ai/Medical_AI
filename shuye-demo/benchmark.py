# -*- coding: utf-8 -*-
"""离线基准测试：不调用任何外部接口，验证检索 + 引用校验 + 拒答三条链路。

用法：python benchmark.py
输出：控制台表格 + bench_result.md
"""
import io
import sys

from shuye import config, pipeline

QUESTIONS = [
    ("肝门静脉的属支有哪些", ["肝门静脉", "属支"]),
    ("结肠的淋巴引流分几组", ["结肠", "淋巴"]),
    ("DNA聚合酶III在复制中的作用", ["DNA", "聚合酶"]),
    ("三羧酸循环的关键限速酶", ["三羧酸", "关键酶"]),
    ("动作电位是怎样产生的", ["动作电位"]),
    ("影响肾小球滤过率的因素", ["肾小球", "滤过"]),
    ("甲状腺激素的生理作用", ["甲状腺"]),
    ("股三角的境界和内容物", ["股三角"]),
    ("动脉血压的影响因素", ["血压"]),
    ("胃的动脉供应", ["胃"]),
]

OFF_DOMAIN = [
    "量子纠缠的基本原理",
    "明天郑州天气怎么样",
    "怎么用 Python 读取 Excel",
    "公司的股权结构如何设计",
]


def main():
    pipeline.boot()
    lines = []
    hit = 0
    lines.append("| # | 问题 | 命中书 | 页码 | 页码核验 | 覆盖率 |\n|---|---|---|---|---|---|")
    for i, (q, kws) in enumerate(QUESTIONS, 1):
        r = pipeline.ask(q, with_pubmed=False, offline=True)
        top = r["chunks"][0] if r["chunks"] else {"book": "-", "page": "-", "text": ""}
        ok = (not r["refused"]) and all(k in top.get("text", "") for k in kws)
        hit += 1 if ok else 0
        lines.append("| %d | %s | %s | P%s | %s | %.2f |" % (
            i, q, top["book"], top["page"], "✓" if ok else "✗", r["coverage"]))

    refused = 0
    lines.append("\n**域外问题（应当拒答）**\n\n| 问题 | 覆盖率 | 是否拒答 |\n|---|---|---|")
    for q in OFF_DOMAIN:
        r = pipeline.ask(q, with_pubmed=False, offline=True)
        refused += 1 if r["refused"] else 0
        lines.append("| %s | %.2f | %s |" % (q, r["coverage"], "✓ 已拒答" if r["refused"] else "✗ 未拒答"))

    summary = "\n\n**汇总**：页级命中 %d/%d；域外拒答 %d/%d；拒答阈值 %.2f\n" % (
        hit, len(QUESTIONS), refused, len(OFF_DOMAIN), config.MIN_COVERAGE)
    text = "\n".join(lines) + summary
    print(text)
    with io.open("bench_result.md", "w", encoding="utf-8") as f:
        f.write("# 离线基准测试结果\n\n" + text + "\n\n> 生成命令：`python benchmark.py`（离线模式，不调用外部接口）\n")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
