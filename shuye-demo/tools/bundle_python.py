# -*- coding: utf-8 -*-
"""把本机 Python 解释器复制到项目根目录，让「一键启动」不依赖系统 Python。

复制 python.exe → <项目>\python.exe。它仍是同一套安装，会自动找到
其旁边的标准库和 site-packages，因此不需要下载便携版 Python。

如果项目里已经有 portable\\python\\python.exe，则优先保留它。

用法：python tools/bundle_python.py
"""
import os
import shutil
import subprocess
import sys

APP_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET = os.path.join(APP_DIR, "python.exe")
PORTABLE = os.path.join(APP_DIR, "portable", "python", "python.exe")


def check(exe):
    try:
        r = subprocess.run([exe, "-c", "import sys; print(sys.version_info[:2])"],
                           capture_output=True, text=True, timeout=20)
        return r.returncode == 0, (r.stdout or "").strip()
    except Exception as e:
        return False, str(e)


def main():
    if os.path.exists(PORTABLE):
        print("已存在便携版 Python，跳过复制：", os.path.relpath(PORTABLE, APP_DIR))
        return

    src = sys.executable
    if not src or not src.lower().endswith("python.exe"):
        print("当前解释器不是 python.exe，无法复制：", src)
        return

    shutil.copy2(src, TARGET)
    ok, ver = check(TARGET)
    print("copied:", os.path.relpath(TARGET, APP_DIR), "| size:", os.path.getsize(TARGET), "bytes")
    print("works:", ok, ver)


if __name__ == "__main__":
    main()
