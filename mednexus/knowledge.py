"""Author-written teaching examples. All goals and rubrics require teacher review.

No textbook pages are asserted here. Questions use structured point-level answers
so offline grading does not mistake a keyword or a negated sentence for knowledge.
"""

SOURCES = {
    "eye": {"title": "Clinical Methods · Cranial Nerves III, IV, and VI", "url": "https://www.ncbi.nlm.nih.gov/books/NBK406/", "section": "Chapter 60"},
    "exam": {"title": "StatPearls · Cranial Nerve Testing", "url": "https://www.ncbi.nlm.nih.gov/books/NBK585066/", "section": "Cranial nerve examination"},
    "face": {"title": "StatPearls · Facial Nerve Anatomy and Clinical Applications", "url": "https://www.ncbi.nlm.nih.gov/books/NBK554569/", "section": "Clinical significance"},
    "gag": {"title": "StatPearls · Physiology, Gag Reflex", "url": "https://www.ncbi.nlm.nih.gov/books/NBK554502/", "section": "Mechanism"},
    "tongue": {"title": "StatPearls · Neuroanatomy, Cranial Nerve 12", "url": "https://www.ncbi.nlm.nih.gov/books/NBK532869/", "section": "Hypoglossal nerve lesions"},
    "accessory": {"title": "Merck Manual · How To Assess the Cranial Nerves", "url": "https://www.merckmanuals.com/professional/neurologic-disorders/neurologic-examination/how-to-assess-the-cranial-nerves", "section": "Cranial nerve XI"},
}


def point(label, correct, wrong1, wrong2, reason, category="机制理解"):
    return {"label": label, "correct": correct, "options": [correct, wrong1, wrong2, "暂时不确定"], "reason": reason, "category": category}


def concept(id, name, unit, level, note, source, terms, research, query, diagnostic, transfer):
    return {"id": id, "name": name, "unit": unit, "level": level, "note": note,
            "source": source, "terms": terms, "research": research, "query": query,
            "questions": [{"id": id + "-pre", "kind": "diagnostic", **diagnostic},
                          {"id": id + "-transfer", "kind": "transfer", **transfer}]}


CONCEPTS = [
    concept("oculomotor", "动眼神经的功能与损伤", "眼球运动与瞳孔", "掌握",
        "动眼神经参与提上睑、眼球内收等运动，并携带缩瞳的副交感纤维。完全损伤可见上睑下垂、眼位向外下偏斜；瞳孔是否受累取决于损伤范围，不能把散大视为所有病例必有。",
        "eye", ["动眼神经", "上睑下垂", "眼睑", "oculomotor", "瞳孔", "外下斜"],
        "不同病因的动眼神经麻痹，瞳孔受累的模式与机制是否存在差异？",
        '("Oculomotor Nerve Diseases"[MeSH Terms] OR "third nerve palsy"[Title/Abstract]) AND (pupil[Title/Abstract] OR mechanism[Title/Abstract])',
        {"prompt": "动眼神经完全损伤后，可能出现哪些表现？请把表现与结构联系起来。", "points": [
            point("上睑的变化", "上睑下垂，与提上睑肌失去支配有关", "闭眼无力，由动眼神经支配眼轮匝肌", "上睑抬高，与提上睑肌失去支配有关", "提上睑肌支配受损可解释上睑下垂。"),
            point("静息眼位", "眼位向外下偏斜，与未受损肌作用相对占优有关", "眼位固定内收，与外直肌作用相对占优有关", "眼球外展受限，因为外直肌由动眼神经支配", "外直肌、上斜肌的支配与动眼神经不同。"),
            point("瞳孔的变化", "副交感纤维受累时可散大，并非所有损伤都有", "所有动眼神经损伤必然散瞳", "副交感纤维受累时必然缩瞳", "将瞳孔是否受累与损伤范围分开判断。") ]},
        {"prompt": "教学病例：上睑下垂、眼位外下偏斜，但瞳孔反应保留。如何解释这组体征？", "points": [
            point("主要涉及的脑神经", "动眼神经", "展神经", "面神经", "提上睑与多条眼外肌功能指向动眼神经。", "应用迁移"),
            point("保留瞳孔反应意味着什么", "瞳孔相关副交感功能可能相对保留", "已经排除动眼神经受损", "所有运动纤维都正常", "同一神经内不同功能纤维受累可不一致。", "应用迁移"),
            point("从这个教学病例能得出什么", "可解释功能分离，不能仅凭这组表现确定病因", "可以直接确定病因为糖尿病", "可以排除所有压迫性病因", "基础定位与具体病因诊断不能等同。", "应用迁移") ]}),
    concept("light", "瞳孔对光反射通路", "眼球运动与瞳孔", "掌握",
        "对光反射的传入侧涉及视神经，传出缩瞳侧涉及动眼神经副交感通路。分析直接与间接反射时，需分别考虑光从哪侧进入、哪侧瞳孔执行缩瞳。",
        "exam", ["对光反射", "视神经", "传入", "传出", "瞳孔反射", "light reflex"],
        "瞳孔反应的定量测量能否补充传统的床旁观察？",
        'pupillary light reflex[Title/Abstract] AND quantitative pupillometry[Title/Abstract]',
        {"prompt": "建立对光反射的最简功能通路。", "points": [
            point("传入通路", "视神经", "面神经", "展神经", "入光信息经视神经进入中枢。", "概念记忆"),
            point("缩瞳传出通路", "动眼神经副交感通路", "三叉神经眼支", "展神经", "缩瞳执行侧涉及动眼神经副交感纤维。"),
            point("分析反射时", "同时比较直接与间接反射", "只观察被照侧即可判定全部通路", "瞳孔大小等同于反射是否正常", "比较两侧反应有助于区分传入与传出。") ]},
        {"prompt": "假设右侧缩瞳传出通路完全中断、两侧传入正常。照左眼时如何理解？", "points": [
            point("左眼直接反射", "可以保留", "必然消失", "无法接收入光信息", "左侧传入和传出均保留。", "应用迁移"),
            point("右眼间接反射", "受损", "必然正常", "变成角膜反射", "右侧执行缩瞳的通路中断。", "应用迁移"),
            point("功能定位", "右侧动眼神经副交感传出", "左侧视神经传入", "右侧面神经传出", "不要把执行失败误判为入光失败。", "应用迁移") ]}),
    concept("abducens", "展神经与外直肌", "眼球运动与瞳孔", "掌握",
        "展神经支配外直肌，主要参与眼球外展。单侧外展功能受限可用来练习神经与肌肉的对应关系；单一体征不能直接确定病因。",
        "eye", ["展神经", "外直肌", "外展", "abducens"],
        "展神经麻痹的恢复过程与病因、随访时间有什么关系？",
        'abducens nerve palsy[Title/Abstract] AND (recovery[Title/Abstract] OR prognosis[Title/Abstract])',
        {"prompt": "将展神经、靶肌和动作对应起来。", "points": [
            point("脑神经序号", "第 VI 对", "第 III 对", "第 IV 对", "展神经为第 VI 对脑神经。", "概念记忆"),
            point("主要靶肌", "外直肌", "内直肌", "上斜肌", "展神经支配外直肌。", "概念记忆"),
            point("主要动作", "眼球外展", "提上睑", "瞳孔缩小", "外直肌作用对应外展。") ]},
        {"prompt": "教学病例中，右眼向右运动明显受限。只讨论最简功能定位。", "points": [
            point("受限动作", "右眼外展", "右眼内收", "左眼外展", "先将方向转换成单眼动作。", "应用迁移"),
            point("对应靶肌", "右外直肌", "右内直肌", "右提上睑肌", "外展对应外直肌。", "应用迁移"),
            point("主要支配神经", "右展神经", "右面神经", "左滑车神经", "功能链是右展神经—右外直肌—右眼外展。", "应用迁移") ]}),
    concept("trochlear", "滑车神经与上斜肌", "眼球运动与瞳孔", "熟悉",
        "滑车神经支配上斜肌。理解上斜肌时，可抓住眼球在内收位时的下转作用；避免把它与展神经所支配的外直肌混淆。",
        "eye", ["滑车神经", "上斜肌", "内收位", "trochlear"],
        "滑车神经麻痹的功能代偿如何影响眼位检查的解释？",
        'trochlear nerve palsy[Title/Abstract] AND compensation[Title/Abstract]',
        {"prompt": "梳理滑车神经的基本对应关系。", "points": [
            point("序号", "第 IV 对", "第 VI 对", "第 VII 对", "滑车神经为第 IV 对。", "概念记忆"),
            point("靶肌", "上斜肌", "外直肌", "提上睑肌", "上斜肌由滑车神经支配。", "概念记忆"),
            point("学习动作", "内收位下转", "外展", "闭眼", "内收位下转是理解上斜肌的切入点。") ]},
        {"prompt": "教学检查中，希望突出上斜肌的下转功能，应如何建立推理？", "points": [
            point("观察位置", "眼球内收位", "只看闭眼动作", "只看瞳孔大小", "内收位有助于突出上斜肌的下转作用。", "应用迁移"),
            point("目标肌肉", "上斜肌", "外直肌", "眼轮匝肌", "先由动作联系肌肉。", "应用迁移"),
            point("目标神经", "滑车神经", "面神经", "展神经", "再由肌肉联系滑车神经。", "应用迁移") ]}),
    concept("trigeminal", "三叉神经的感觉与运动", "面部感觉与运动", "掌握",
        "三叉神经包含面部一般感觉与咀嚼运动功能。其眼支、上颌支、下颌支构成感觉分区；咀嚼肌的运动支配主要经下颌支。",
        "exam", ["三叉神经", "咀嚼", "面部感觉", "下颌支", "trigeminal"],
        "三叉神经相关疼痛中，神经压迫与症状的关系应怎样验证？",
        'trigeminal neuralgia[Title/Abstract] AND neurovascular compression[Title/Abstract]',
        {"prompt": "三叉神经的两类主要功能是什么？", "points": [
            point("感觉功能", "面部一般感觉", "视觉", "听觉", "三叉神经承担面部一般感觉。", "概念记忆"),
            point("运动功能", "咀嚼肌运动", "全部表情肌运动", "眼球外展", "咀嚼运动与面部表情运动不同。"),
            point("运动纤维主要经过", "下颌支", "眼支", "上颌支", "三叉神经运动功能主要随下颌支。") ]},
        {"prompt": "学习病例同时提到面部感觉减退和咀嚼无力。建立最简功能对应。", "points": [
            point("优先讨论的神经", "三叉神经", "面神经", "舌下神经", "感觉与咀嚼同时指向三叉神经功能。", "应用迁移"),
            point("咀嚼运动分支", "下颌支", "眼支", "上颌支", "下颌支包含咀嚼运动纤维。", "应用迁移"),
            point("与面神经的区分", "面神经主要支配表情肌运动", "面神经主要支配咀嚼肌", "二者完全相同", "不要用面部这一共同区域替代具体功能。", "应用迁移") ]}),
    concept("corneal", "角膜反射的传入与传出", "面部感觉与运动", "掌握",
        "角膜反射的经典通路以三叉神经眼支作为传入、面神经作为闭眼传出。感觉到刺激和完成闭眼是两个环节，应分别分析。",
        "exam", ["角膜反射", "眼支", "闭眼", "角膜", "corneal reflex"],
        "角膜感觉与眨眼反射的定量检测能否提供互补信息？",
        'corneal reflex[Title/Abstract] AND blink reflex[Title/Abstract]',
        {"prompt": "分别识别角膜反射的输入与输出。", "points": [
            point("传入", "三叉神经眼支", "面神经", "动眼神经", "感觉传入经三叉神经眼支。"),
            point("闭眼传出", "面神经", "展神经", "视神经", "闭眼动作由面神经相关运动通路完成。"),
            point("执行肌", "眼轮匝肌", "外直肌", "提上睑肌", "闭眼与提上睑是不同动作。", "概念记忆") ]},
        {"prompt": "教学假设：右侧面神经运动通路受损，角膜感觉传入正常。", "points": [
            point("右侧角膜刺激感觉", "可以保留", "必然消失", "属于视觉", "传入正常时可保留感觉。", "应用迁移"),
            point("右侧闭眼动作", "可以受损", "必然正常", "由展神经接替", "右侧闭眼执行可受损。", "应用迁移"),
            point("解释框架", "把感觉传入和闭眼传出分开", "有感觉就证明全部反射正常", "闭眼无力必然是角膜无感觉", "保留感觉不等于保留运动执行。", "应用迁移") ]}),
    concept("facial", "面神经与面瘫的定位", "面部感觉与运动", "熟悉",
        "面神经支配表情肌。典型单侧核上损伤主要影响对侧下面部、额部相对保留；周围性运动损伤可累及同侧上下半面。此处为简化教学模式，真实定位需完整检查。",
        "face", ["面神经", "面瘫", "额纹", "表情肌", "facial nerve", "周围性"],
        "面神经损伤后的功能恢复，用哪些结局指标评估更合适？",
        'facial nerve palsy[Title/Abstract] AND (recovery[Title/Abstract] OR outcome measures[Title/Abstract])',
        {"prompt": "区分面神经运动与两种典型面瘫模式。", "points": [
            point("主要运动功能", "表情肌运动", "咀嚼肌运动", "瞳孔缩小", "面神经与表情肌对应。", "概念记忆"),
            point("典型核上模式", "对侧下面部无力，额部相对保留", "同侧上下半面一律瘫痪", "只影响舌运动", "额部的双侧核上支配是理解切入点。"),
            point("典型周围性模式", "可累及同侧上下半面", "仅对侧下面部", "必然不影响闭眼", "周围运动通路受损可影响同侧闭眼和口角。") ]},
        {"prompt": "教学病例：右侧额纹减少、闭眼无力和右口角无力。仅在典型模式中比较。", "points": [
            point("倾向的模式", "右侧周围性面神经运动损伤", "右侧展神经损伤", "左侧舌下神经损伤", "同侧上下半面均受累符合该教学模式。", "应用迁移"),
            point("闭眼无力相关肌", "眼轮匝肌", "提上睑肌", "外直肌", "闭眼对应眼轮匝肌。", "应用迁移"),
            point("教学结论边界", "不能据此直接确定具体病因", "可以直接诊断所有病例为贝尔麻痹", "可以排除其他神经系统病变", "模式匹配不能代替病因诊断。", "应用迁移") ]}),
    concept("gag", "舌咽、迷走与咽反射", "延髓与颈舌运动", "熟悉",
        "经典咽反射教学模型中，舌咽神经主要承担传入，迷走神经主要承担传出。反射缺如也可见于健康人，不能孤立地把它等同于特定疾病。",
        "gag", ["舌咽神经", "迷走神经", "咽反射", "gag reflex", "吞咽"],
        "咽反射表现与吞咽功能之间的关系，能否用研究证据检验？",
        'gag reflex[Title/Abstract] AND (swallowing[Title/Abstract] OR dysphagia[Title/Abstract])',
        {"prompt": "建立经典咽反射教学通路，并说明解释边界。", "points": [
            point("主要传入", "舌咽神经", "展神经", "舌下神经", "经典教学模型将舌咽神经作为主要传入。"),
            point("主要传出", "迷走神经", "视神经", "副神经", "经典教学模型将迷走神经作为主要传出。"),
            point("缺如的解释", "不能单独据此确定疾病", "必然存在严重疾病", "等同于完全不能吞咽", "需结合其他体征和功能评估。") ]},
        {"prompt": "一个教学案例仅给出“咽反射未引出”。你应如何推理？", "points": [
            point("对疾病的推断", "信息不足以单独确定疾病", "可直接确定脑干病变", "可直接确定吸入性肺炎", "单一反射结果不能替代完整判断。", "应用迁移"),
            point("需要联系的传入", "舌咽神经", "动眼神经", "嗅神经", "回到经典反射弧。", "应用迁移"),
            point("需要联系的传出", "迷走神经", "展神经", "视神经", "再分析执行侧。", "应用迁移") ]}),
    concept("accessory", "副神经与颈肩运动", "延髓与颈舌运动", "了解",
        "副神经参与胸锁乳突肌和斜方肌的运动支配。抗阻转头、抗阻耸肩分别提供这两类肌肉功能的教学观察点。",
        "accessory", ["副神经", "斜方肌", "胸锁乳突肌", "耸肩", "accessory nerve"],
        "副神经损伤后，不同功能评价工具是否测量了相同的恢复维度？",
        'accessory nerve injury[Title/Abstract] AND functional outcome[Title/Abstract]',
        {"prompt": "把副神经与颈肩动作对应起来。", "points": [
            point("序号", "第 XI 对", "第 XII 对", "第 IX 对", "副神经为第 XI 对。", "概念记忆"),
            point("耸肩的主要观察肌", "斜方肌", "外直肌", "眼轮匝肌", "抗阻耸肩观察斜方肌。"),
            point("抗阻转头的观察肌", "胸锁乳突肌", "咬肌", "舌肌", "抗阻转头可观察胸锁乳突肌。") ]},
        {"prompt": "学习检查设计：同时观察抗阻耸肩与抗阻转头。", "points": [
            point("共同涉及的脑神经", "副神经", "面神经", "视神经", "两种动作联系副神经相关肌肉。", "应用迁移"),
            point("耸肩对应", "斜方肌", "上斜肌", "咬肌", "区分斜方肌与上斜肌。", "应用迁移"),
            point("转头对应", "胸锁乳突肌", "外直肌", "颏舌肌", "通过具体动作识别靶肌。", "应用迁移") ]}),
    concept("hypoglossal", "舌下神经与伸舌偏斜", "延髓与颈舌运动", "熟悉",
        "舌下神经参与舌肌运动。单侧周围性损伤时，伸舌可偏向受损侧，并可能出现萎缩或肌束颤动；分析偏斜方向时需先区分核上与周围性损伤。",
        "tongue", ["舌下神经", "伸舌", "舌偏", "舌肌", "hypoglossal"],
        "不同定位的舌下神经损伤，影像与功能表现如何相互印证？",
        'hypoglossal nerve palsy[Title/Abstract] AND (imaging[Title/Abstract] OR localization[Title/Abstract])',
        {"prompt": "只讨论单侧周围性舌下神经损伤。", "points": [
            point("主要功能", "舌肌运动", "表情肌运动", "面部感觉", "舌下神经对应舌肌运动。", "概念记忆"),
            point("伸舌方向", "可偏向受损侧", "必然偏向健侧", "必然完全不偏", "此结论限定于单侧周围性损伤。"),
            point("伴随体征", "可有舌肌萎缩或肌束颤动", "必然只有瞳孔散大", "必然只有听力下降", "萎缩和肌束颤动可提示下运动神经元相关受累。") ]},
        {"prompt": "教学假设：右侧周围性舌下神经损伤。尝试预期体征并说明边界。", "points": [
            point("伸舌可偏向", "右侧", "左侧", "必然无偏斜", "单侧周围性损伤时向受损侧偏斜。", "应用迁移"),
            point("右侧舌肌可能", "萎缩或肌束颤动", "只出现角膜感觉消失", "只出现眼球外展受限", "联系周围运动通路与靶肌。", "应用迁移"),
            point("能否直接套用核上损伤", "不能，需重新分析支配与定位", "可以，任何伸舌偏斜的规则都相同", "可以，完全不需要考虑定位", "必须保留题目的周围性限定。", "应用迁移") ]}),
]

CONCEPT_MAP = {c["id"]: c for c in CONCEPTS}
QUESTION_MAP = {q["id"]: (c, q) for c in CONCEPTS for q in c["questions"]}
COURSE = {"id": "anatomy", "name": "系统解剖学", "subtitle": "从结构出发，把功能与表现连起来", "chapter": "脑神经", "goal_source": "示例教学目标，待医学教师审核；未接入校内或国家正式大纲", "units": list(dict.fromkeys(c["unit"] for c in CONCEPTS))}
