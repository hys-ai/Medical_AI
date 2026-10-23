# -*- coding: utf-8 -*-
"""把「书页」整理进仓库的 shuye-demo/ 子目录，与队友的 mednexus/ 并列、互不覆盖。

用法：
    python tools/sync_to_clone.py                 # 写入本机克隆目录
    python tools/sync_to_clone.py <仓库根目录>

行为：
  · 目标是 Git 仓库时，写入 <仓库>/shuye-demo/
  · 目标不是 Git 仓库时，直接写入该目录（当作沙盒排练）
  · 只覆盖白名单文件，从不删除目标里的其他内容
"""
import os
import shutil
import sys

SRC = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SUB = "shuye-demo"

DIRS = ["shuye", "web", "scripts", "tools"]
FILES = [
    "server.py", "cli.py", "benchmark.py", "requirements.txt",
    "README.md", "CONTRIBUTING.md", ".gitignore",
    "启动说明.md", "项目说明.md", "启动书页.bat", "run_app.ps1",
    "打样报告.md", "bench_result.md", "核心方案-定稿.md",
    "界面-首页.png", "界面-问答结果.png", "界面-我的学习.png",
]

SKIP_DIRS = {"__pycache__", ".tmp", "libs", ".git", "portable", "书页-仓库", "队友项目-MedNexus"}
SKIP_EXT = {".pyc", ".pyo", ".db", ".pdf", ".jsonl", ".npy", ".mp4", ".bundle", ".lnk"}
SKIP_FILES = {"python.exe", ".Rhistory"}


def ignored(name):
    return (name in SKIP_DIRS or name in SKIP_FILES
            or os.path.splitext(name)[1].lower() in SKIP_EXT)


def default_target():
    return os.path.join(os.environ["USERPROFILE"], "Documents", "GitHub", "Medical_AI")


def main():
    if len(sys.argv) > 1:
        root = sys.argv[1]
    else:
        root = default_target()
    if not os.path.isdir(root):
        print("目标目录不存在：", root)
        return 1

    dst = os.path.join(root, SUB)
    os.makedirs(dst, exist_ok=True)
    n = 0

    for d in DIRS:
        src_dir = os.path.join(SRC, d)
        if not os.path.isdir(src_dir):
            continue
        for cur, dirs, files in os.walk(src_dir):
            dirs[:] = [x for x in dirs if not ignored(x)]
            target = os.path.join(dst, os.path.relpath(cur, SRC))
            os.makedirs(target, exist_ok=True)
            for f in files:
                if ignored(f):
                    continue
                shutil.copy2(os.path.join(cur, f), os.path.join(target, f))
                n += 1

    for f in FILES:
        p = os.path.join(SRC, f)
        if os.path.isfile(p):
            shutil.copy2(p, os.path.join(dst, f))
            n += 1

    size = sum(os.path.getsize(os.path.join(r, x))
               for r, _, fs in os.walk(dst) for x in fs)
    print("已复制 %d 个文件（%.2f MB）到 %s" % (n, size / 1024 / 1024, dst))
    return 0


if __name__ == "__main__":
    sys.exit(main())
