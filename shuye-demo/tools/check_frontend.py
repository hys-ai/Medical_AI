# -*- coding: utf-8 -*-
"""前端一致性检查：JS 引用的 id 必须在 HTML 中存在；静态资源可访问。"""
import io
import re
import sys

html = io.open("web/index.html", encoding="utf-8").read()
js = io.open("web/app.js", encoding="utf-8").read()
css = io.open("web/styles.css", encoding="utf-8").read()

ids = set(re.findall(r'id="([^"]+)"', html))
used = set(re.findall(r'\$\("([^"]+)"\)', js))
missing = sorted(used - ids)
unused = sorted(ids - used)

print("HTML ids:", len(ids), "| JS refs:", len(used))
print("JS 引用但 HTML 缺失:", missing or "无")

# CSS 类与 HTML 类的覆盖情况（粗略）
html_classes = set()
for m in re.findall(r'class="([^"]+)"', html):
    html_classes.update(m.split())
css_classes = set(re.findall(r"\.([a-zA-Z][\w-]*)", css))
print("HTML 用到但 CSS 未定义:", sorted(c for c in html_classes if c not in css_classes) or "无")

sys.exit(1 if missing else 0)
