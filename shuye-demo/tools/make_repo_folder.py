# -*- coding: utf-8 -*-
"""把要上传到 GitHub 的文件汇总到一个文件夹（严格按白名单复制）。

用法：python tools/make_repo_folder.py [目标文件夹名]
默认生成：<项目>/书页-仓库/
"""
import os
import shutil
import sys

SRC = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 目录：递归复制，但跳过不想要的
DIRS = ["shuye", "web", "scripts", "tools"]

# 单文件
FILES = [
    "server.py",
    "cli.py",
    "benchmark.py",
    "requirements.txt",
    "README.md",
    "CONTRIBUTING.md",
    ".gitignore",
    "启动说明.md",
    "项目说明.md",
    "启动书页.bat",
    "run_app.ps1",
    "打样报告.md",
    "bench_result.md",
    "核心方案-定稿.md",
    "界面-首页.png",
    "界面-问答结果.png",
    "界面-我的学习.png",
]

# 递归时跳过
SKIP_DIRS = {"__pycache__", ".tmp", "libs", ".git", "portable"}
SKIP_EXT = {".pyc", ".pyo", ".db", ".pdf", ".jsonl", ".npy", ".mp4"}


def ignored(name):
    if name in SKIP_DIRS:
        return True
    return os.path.splitext(name)[1].lower() in SKIP_EXT


def copy_dir(src_dir, dst_dir):
    n = 0
    for root, dirs, files in os.walk(src_dir):
        dirs[:] = [d for d in dirs if not ignored(d)]
        rel = os.path.relpath(root, os.path.dirname(src_dir))
        target = os.path.join(dst_dir, os.path.basename(src_dir), os.path.relpath(root, src_dir))
        os.makedirs(target, exist_ok=True)
        for f in files:
            if ignored(f):
                continue
            shutil.copy2(os.path.join(root, f), os.path.join(target, f))
            n += 1
    return n


def main():
    name = sys.argv[1] if len(sys.argv) > 1 else "书页-仓库"
    dst = os.path.join(SRC, name)

    # 已有 .git 说明这个文件夹已经是 Git 仓库：原地刷新文件，保留版本历史
    if os.path.isdir(os.path.join(dst, ".git")):
        print("检测到 .git，保留版本历史，原地刷新文件内容")
        keep_git = True
    else:
        if os.path.exists(dst):
            shutil.rmtree(dst)
        os.makedirs(dst)
        keep_git = False

    total = 0
    for d in DIRS:
        p = os.path.join(SRC, d)
        if os.path.isdir(p):
            total += copy_dir(p, dst)

    for f in FILES:
        p = os.path.join(SRC, f)
        if os.path.isfile(p):
            shutil.copy2(p, os.path.join(dst, f))
            total += 1

    size = sum(
        os.path.getsize(os.path.join(r, x))
        for r, _, fs in os.walk(dst)
        for x in fs
    )
    print("复制完成：%d 个文件，共 %.2f MB" % (total, size / 1024 / 1024))
    print("位置：", dst)


if __name__ == "__main__":
    main()
