# -*- coding: utf-8 -*-
"""全局配置：书籍清单、页码偏移、接口地址。密钥一律走环境变量。"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 每本书：JSONL 由 tools/build_index.py 从 PDF 生成；offset = PDF 页 - 印刷页
BOOKS = [
    {"name": "局部解剖学", "edition": "第10版", "jsonl": "book_jiepou.jsonl", "offset": 19},
    {"name": "生物化学与分子生物学", "edition": "第10版", "jsonl": "book_shenghua.jsonl", "offset": 29},
    {"name": "生理学", "edition": "第10版", "jsonl": "book_shengli.jsonl", "offset": 23},
]

# 术语同义词：学生用考试语言提问，教材用学术语言表述
SYNONYMS = {
    "限速酶": ["关键酶"],
    "限速步骤": ["关键酶", "不可逆"],
    "三羧酸循环": ["柠檬酸循环", "TCA循环"],
    "限速酶": ["关键酶", "限速步骤"],
    "糖酵解": ["糖分解"],
    "氧化磷酸化": ["电子传递链"],
    "基因表达": ["转录", "翻译"],
    "心肌梗死": ["心肌梗塞"],
    "肾功能": ["肾小球滤过"],
}

# 大模型（OpenAI 兼容协议）
LLM_BASE = os.environ.get("LLM_BASE", "https://api.deepseek.com/v1")
LLM_MODEL = os.environ.get("LLM_MODEL", "deepseek-chat")
LLM_KEY = os.environ.get("LLM_KEY", "")

# 向量模型（百炼 text-embedding-v3）
EMB_BASE = os.environ.get("EMB_BASE", "https://dashscope.aliyuncs.com/compatible-mode/v1")
EMB_MODEL = os.environ.get("EMB_MODEL", "text-embedding-v3")
EMB_KEY = os.environ.get("EMB_KEY", "")

# PubMed E-utilities（申请 key 后速率 3→10 次/秒）
NCBI_KEY = os.environ.get("NCBI_KEY", "")
NCBI_EMAIL = os.environ.get("NCBI_EMAIL", "")

DB_PATH = os.path.join(ROOT, "shuye.db")
CACHE_PATH = os.path.join(ROOT, "chunks.jsonl")
VECTOR_PATH = os.path.join(ROOT, "embeddings.npy")

MAX_QUOTE = 120          # 单条摘录上限，超过不输出，避免变相复制原文
TOP_K = 5                # 送进模型的段落数
MIN_COVERAGE = 0.30      # 查询词覆盖率低于此值直接拒答，防止答非所问


# 无 LLM 时的简易中英术语表：够把常见疑问变成能查的英文检索式
GLOSSARY = {
    "缺氧": "hypoxia", "高原": "high altitude", "红细胞": "erythrocyte",
    "三羧酸循环": "TCA cycle", "柠檬酸循环": "citric acid cycle",
    "限速酶": "rate-limiting enzyme", "关键酶": "key enzyme",
    "糖酵解": "glycolysis", "氧化磷酸化": "oxidative phosphorylation",
    "动作电位": "action potential", "静息电位": "resting potential",
    "肾小球滤过": "glomerular filtration", "甲状腺激素": "thyroid hormone",
    "血红蛋白": "hemoglobin", "贫血": "anemia", "炎症": "inflammation",
    "免疫": "immunity", "细胞因子": "cytokine", "凋亡": "apoptosis",
    "自噬": "autophagy", "肿瘤": "tumor", "转移": "metastasis",
    "胰岛素": "insulin", "糖尿病": "diabetes", "血压": "blood pressure",
    "肾": "kidney", "肝": "liver", "心": "heart", "肺": "lung",
    "神经": "neuron", "突触": "synapse", "记忆": "memory",
    "基因": "gene", "蛋白": "protein", "酶": "enzyme", "代谢": "metabolism",
    "信号通路": "signaling pathway", "受体": "receptor", "激素": "hormone",
    "肠道": "intestine", "菌群": "microbiota", "干细胞": "stem cell",
    "动脉": "artery", "静脉": "vein", "淋巴": "lymphatic",
}


