# -*- coding: utf-8 -*-
"""导出 docx 全文（含表格，按文档顺序），用于阅读队员方案。"""
import sys
from docx import Document
from docx.table import Table
from docx.text.paragraph import Paragraph

src = sys.argv[1]
dst = sys.argv[2] if len(sys.argv) > 2 else "dump.txt"

d = Document(src)
lines = []
for ch in d.element.body.iterchildren():
    if ch.tag.endswith('}p'):
        t = Paragraph(ch, d).text.strip()
        if t:
            lines.append(t)
    elif ch.tag.endswith('}tbl'):
        tb = Table(ch, d)
        lines.append("--- TABLE %dx%d ---" % (len(tb.rows), len(tb.columns)))
        for r in tb.rows:
            cells = []
            prev = None
            for c in r.cells:
                if c._tc is prev:
                    continue
                prev = c._tc
                cells.append(c.text.replace("\n", " / ").strip())
            lines.append(" | ".join(cells))

with open(dst, "w", encoding="utf-8") as f:
    f.write("\n".join(lines))

print("paragraphs+tables exported:", len(lines))
print("chars:", sum(len(x) for x in lines))
print("inline images:", len(d.inline_shapes))
