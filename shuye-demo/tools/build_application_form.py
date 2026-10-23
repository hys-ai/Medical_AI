# -*- coding: utf-8 -*-
from docx import Document
from docx.shared import Pt
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.text.paragraph import Paragraph
import io

SRC = "附件2：郑州大学首届AI智能体创新应用大赛项目申报表.docx"
DST = "申报表-书页·临床医学教材溯源学习助手.docx"

d = Document(SRC)

TITLE = "书页·教材页级溯源的临床医学 AI 学习助手"

S1 = [
"医学生查一个知识点，往往要翻教材、指南、课件好几处；找到答案也说不清出自哪一页，不敢直接采信。教材又滞后于前沿，遇到“机制尚未明确”的疑问只能搁置；复习时更不知道自己究竟哪里没掌握。",
"本项目面向临床医学本科生，只做一件事：让每个答案都能被翻到。学生提问后，系统同时给出三张卡——教材答案卡（结论、推理要点与书名页码）、前沿文献卡（PubMed 文献按证据等级排序，附中文要点）、学习建议卡（依据其提问与自测记录指出薄弱点与下一步）。",
"系统只用检索到的教材片段作答，页码取自索引元数据，并在生成后逐条回查；查不到依据就明确拒答，不做猜测。",
]

S2 = [
"主要功能：①溯源问答，输出结论、要点与引用页码，并标注考纲要求等级；②文献支撑，把口语化疑问转成规范检索式，返回 PubMed 摘要、证据类型与相关性点评；③个性化建议，统计提问与自测记录，给出“看哪页、做几题、读哪篇”的具体动作。",
"智能体方案为六环节流水线：",
"（1）查询理解：术语同义词扩展（如“限速酶→关键酶”），并判断走教材、文献还是建议；",
"（2）教材检索：BM25 与向量检索并行，RRF 融合取前五个段落块，每块携带书名、章节与印刷页码；",
"（3）生成：强约束提示词，只允许使用给定片段，每个结论后必须标注书名与页码；",
"（4）引用校验：逐条回查页码是否在本次检索集合内、该页原文是否含该结论关键词，不通过即删除引用并降级表述，全部不通过则拒答；",
"（5）文献：生成英文检索式调用 E-utilities，按综述、随机对照、队列、病例报告标注证据等级；",
"（6）建议：读取学习记录，由规则算出薄弱知识点，再由模型润色为可执行建议。",
"技术栈：Gradio 前端、Python 编排、DeepSeek 对话模型、百炼向量模型、SQLite 记录、PubMed 免费接口。",
]

S3 = [
"① 引用不可伪造。页码只来自索引元数据，生成后逐条回查原文，机制上杜绝模型编造页码——这解决了教育类 AI 最致命的问题：答案不可核对。",
"② 一次交互三张卡。把“教材怎么说、前沿怎么说、我该怎么办”压缩进同一次提问，而不是让学生在三个工具间来回切换。",
"③ 建议可追溯。每条建议都附带数据依据（近七天提问次数、自测正确率），不是模型泛泛而谈，学生能判断该不该听。",
"④ 低成本可落地。不依赖任何校内系统与授权数据，单机即可运行，便于在学院层面复制。",
]

S4 = [
"已完成：用纯标准库实现教材 PDF 页级解析（三本教材均为文字层，无需 OCR）；完成局部解剖学、生物化学与分子生物学、生理学三本书的段落级索引，共 5667 块；跑通混合检索与页码引用校验，10 个真实课程问题全部命中正确页码，4 个域外问题全部正确拒答，单次检索约 6 毫秒；完成三本书印刷页码偏移标定。",
"下一步（11 月）：第 1 周完成混合检索、引用校验与 Gradio 问答页；第 2 周完成 PubMed 链路与三卡输出；第 3 周完成记录、建议与自测入口；第 4 周完成整合、试用与演示材料。",
]

S5 = [
"预期成果：①可演示原型，一个问题同时输出教材答案、前沿文献与学习建议；②30 题测试集与实测报告；③试用反馈与演示视频；④指标口径与页码标定规范。",
"验证方式：①页码命中率，30 个真实课程问题人工核对，目标不低于 90%（打样已达 10/10）；②引用可核验率，由系统后处理机制保证，目标 100%；③拒答准确率，20 个教材中不存在的问题，目标不低于 90% 正确拒答；④文献相关性，20 个疑问由医学背景同学盲评，目标不低于 80% 相关；⑤试用，10 至 15 名同学使用一周，收集定性反馈与主观评分。",
]

EXTRA1 = "已完成教材页级解析、段落索引与检索原型的代码与打样报告，界面开发中；演示链接与视频将在 11 月补充。"
EXTRA2 = "暂无。原型已在团队内部完成 10 个课程问题的检索与页码核对，并对 4 个域外问题验证了拒答机制。"
EXTRA3 = "教材为团队成员自购正版教材的本地电子副本，仅本地检索，系统不输出整页原文、不对外分发；文献取自 PubMed 公开接口；不涉及患者数据与校内业务系统。"

# ---------- helpers ----------
def clear_cell(cell):
    for p in cell.paragraphs[1:]:
        p._element.getparent().remove(p._element)
    p = cell.paragraphs[0]
    for r in list(p.runs):
        r._element.getparent().remove(r._element)
    return p

def style_run(r, size=10.5):
    r.font.name = "宋体"
    r._element.rPr.rFonts.set(qn("w:eastAsia"), "宋体")
    r.font.size = Pt(size)

def fill_cell(cell, paras, size=10.5, indent=True):
    first = clear_cell(cell)
    for i, text in enumerate(paras):
        p = first if i == 0 else cell.add_paragraph()
        p.paragraph_format.space_before = Pt(0)
        p.paragraph_format.space_after = Pt(1)
        p.paragraph_format.line_spacing = 1.1
        p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
        if indent:
            pPr = p._p.get_or_add_pPr()
            ind = pPr.find(qn("w:ind"))
            if ind is None:
                ind = pPr.makeelement(qn("w:ind"), {})
                pPr.append(ind)
            ind.set(qn("w:firstLine"), "210")
        r = p.add_run(text)
        style_run(r, size)

def tick(cell, option):
    hit = False
    for p in cell.paragraphs:
        for r in p.runs:
            if r.text and ("□ " + option) in r.text:
                r.text = r.text.replace("□ " + option, "☑ " + option)
                hit = True
    if not hit:
        raise RuntimeError("option not found: " + option)

def put(cell, text):
    first = clear_cell(cell)
    first.paragraph_format.space_before = Pt(0)
    first.paragraph_format.space_after = Pt(0)
    r = first.add_run(text)
    style_run(r, 10.5)

t0, t1, t7, t8 = d.tables[0], d.tables[1], d.tables[7], d.tables[8]

fill_cell(t0.rows[0].cells[1], [TITLE], indent=False)
tick(t0.rows[0].cells[3], "校园真实需求挑战")
tick(t0.rows[1].cells[1], "赛事发布任务")
tick(t0.rows[1].cells[3], "已有初步原型")
put(t0.rows[2].cells[1], "【请填写】")
put(t0.rows[2].cells[3], "第一临床医学院")
put(t0.rows[3].cells[1], "临床医学")
put(t0.rows[3].cells[3], "2025级（大二）")
put(t0.rows[4].cells[1], "【请填写】")
put(t0.rows[4].cells[3], "本科生")
put(t0.rows[5].cells[1], "【请填写】")
put(t0.rows[5].cells[3], "【请填写】")
put(t0.rows[6].cells[1], "【选填，建议邀请医学信息学或生理学方向老师】")
put(t0.rows[6].cells[3], "【请填写】")
put(t0.rows[7].cells[1], "共 5 人（含负责人）")
tick(t0.rows[7].cells[3], "否")

for i in range(1, 5):
    for j in range(1, 5):
        put(t1.rows[i].cells[j], "")

fill_cell(d.tables[2].rows[1].cells[0], S1)
fill_cell(d.tables[3].rows[1].cells[0], S2)
fill_cell(d.tables[4].rows[1].cells[0], S3)
fill_cell(d.tables[5].rows[1].cells[0], S4)
fill_cell(d.tables[6].rows[1].cells[0], S5)

tick(t7.rows[0].cells[0], "仅使用公开数据或自建数据")
put(t8.rows[0].cells[1], EXTRA1)
put(t8.rows[1].cells[1], EXTRA2)
put(t8.rows[2].cells[1], EXTRA3)

# ---------- pagination ----------
def no_split(table):
    for row in table.rows:
        trPr = row._tr.get_or_add_trPr()
        if trPr.find(qn("w:cantSplit")) is None:
            trPr.append(trPr.makeelement(qn("w:cantSplit"), {}))

for _t in d.tables:
    no_split(_t)

def keep_next(par):
    pPr = par._p.get_or_add_pPr()
    if pPr.find(qn("w:keepNext")) is None:
        pPr.append(pPr.makeelement(qn("w:keepNext"), {}))

for _ti in (2, 3, 4, 5, 6):
    for _p in d.tables[_ti].rows[0].cells[0].paragraphs:
        keep_next(_p)
for _p in d.tables[9].rows[0].cells[0].paragraphs:
    keep_next(_p)

# drop trailing empty paragraph (avoid a blank last page)
_body = d.element.body
for _last in list(_body.iterchildren())[::-1]:
    if _last.tag.endswith("}sectPr"):
        continue
    if _last.tag.endswith("}p") and not "".join(_last.itertext()).strip():
        _body.remove(_last)
        continue
    break

d.save(DST)

chk = Document(DST)
print("saved", DST)
for ti in range(2, 7):
    cell = chk.tables[ti].rows[1].cells[0]
    txt = cell.text.replace("\n", "")
    print(ti, "chars=", len(txt), "paras=", len(cell.paragraphs))
print("name:", chk.tables[0].rows[0].cells[1].text)
print("dir:", chk.tables[0].rows[0].cells[3].text.replace("\n", " / "))
print("src:", chk.tables[0].rows[1].cells[1].text)
print("stage:", chk.tables[0].rows[1].cells[3].text.replace("\n", " / "))
print("data:", chk.tables[7].rows[0].cells[0].text.replace("\n", " / "))



