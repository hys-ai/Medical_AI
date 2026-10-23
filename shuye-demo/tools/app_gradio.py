# -*- coding: utf-8 -*-
"""Gradio 前端：一次提问，三张卡。

用法：python app.py
未安装 gradio 时会提示安装命令，并自动退回命令行。
"""
import sys

from shuye import config, pipeline


def _card(result):
    ans = result["answer"]
    cites = result["citations"]
    ok = sum(1 for c in cites if c["ok"])
    head = "**状态**：%s　|　引用校验：%d/%d 通过　|　查询覆盖率 %.2f" % (
        "已拒答" if result["refused"] else "已作答", ok, len(cites), result["coverage"])

    papers = ""
    for i, p in enumerate(result["papers"], 1):
        papers += "%d. **[%s]** %s（%s, %s）\n   - PMID: %s\n   - %s\n\n" % (
            i, p["evidence"], p["title"], p["journal"], p["year"], p["pmid"], p["abstract"][:160] + "…")
    if not papers:
        papers = result.get("pubmed_note") or "（未获取文献）"

    tips = "\n".join("- " + t for t in result["tips"])
    return ans, head, papers, tips


def build():
    import gradio as gr

    with gr.Blocks(title="书页 · 临床医学教材溯源助手") as demo:
        gr.Markdown("# 书页 · 临床医学教材溯源助手\n问一个问题，给你三张卡：书上怎么说、前沿怎么说、下一步怎么办。")
        with gr.Row():
            q = gr.Textbox(label="你的问题", placeholder="例如：三羧酸循环的关键限速酶有哪些？", scale=4)
            use_pm = gr.Checkbox(label="同时查 PubMed", value=True, scale=1)
            btn = gr.Button("提问", variant="primary", scale=1)

        answer = gr.Markdown(label="答案卡")
        status = gr.Markdown()
        with gr.Accordion("引用校验明细", open=False):
            detail = gr.Dataframe(headers=["书名", "页码", "结论片段", "是否通过", "说明"], wrap=True)
        papers = gr.Markdown(label="文献卡")
        tips = gr.Markdown(label="建议卡")

        def run(question, with_pm):
            if not question.strip():
                return "请先输入问题。", "", [], "", ""
            r = pipeline.ask(question, with_pubmed=with_pm)
            a, h, p, t = _card(r)
            rows = [[c["book"], c["page"], c["snippet"], "✓" if c["ok"] else "✗", c["reason"]] for c in r["citations"]]
            return a, h, rows, p, t

        btn.click(run, inputs=[q, use_pm], outputs=[answer, status, detail, papers, tips])
        q.submit(run, inputs=[q, use_pm], outputs=[answer, status, detail, papers, tips])
    return demo


if __name__ == "__main__":
    try:
        build().launch(server_name="127.0.0.1", server_port=7860, inbrowser=True)
    except ImportError:
        print("未安装 gradio。安装：pip install gradio")
        print("在此之前可以先用命令行：python cli.py \"你的问题\"")
        sys.exit(1)
