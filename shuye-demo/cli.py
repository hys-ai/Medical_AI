# -*- coding: utf-8 -*-
"""命令行入口：不装任何第三方库即可跑通"提问 → 三卡"。

用法：
    python cli.py "三羧酸循环的关键限速酶"
    python cli.py "动脉血压的影响因素" --no-pubmed
    python cli.py "肝门静脉的属支" --offline
"""
import argparse
import io
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

from shuye import pipeline


def main():
    ap = argparse.ArgumentParser(description="书页 · 教材页级溯源问答")
    ap.add_argument("question", nargs="?", help="要问的问题")
    ap.add_argument("--no-pubmed", action="store_true", help="跳过文献卡")
    ap.add_argument("--offline", action="store_true", help="强制离线抽取模式")
    ap.add_argument("--rebuild", action="store_true", help="重建段落索引")
    args = ap.parse_args()

    pipeline.boot(force=args.rebuild)
    if not args.question:
        print("进入交互模式，输入问题（Ctrl+C 退出）")
        while True:
            try:
                q = input("\n问题> ").strip()
            except (EOFError, KeyboardInterrupt):
                print()
                break
            if q:
                print(pipeline.render(pipeline.ask(q, with_pubmed=not args.no_pubmed, offline=args.offline)))
        return

    result = pipeline.ask(args.question, with_pubmed=not args.no_pubmed, offline=args.offline)
    print(pipeline.render(result))


if __name__ == "__main__":
    main()
