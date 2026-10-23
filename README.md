# Medical_AI · 医枢 MedNexus

面向医学生的主动学习与科研探索智能体原型。围绕具体知识点完成“主动诊断 → 按要点评分 → 针对性补学 → 有条件的文献探索 → 迁移再测 → 学习报告”。

- [在线演示](https://mednexus-learning-demo-1023.bar20070507.chatgpt.site)
- [测试情况与逐项记录](https://mednexus-learning-demo-1023.bar20070507.chatgpt.site/#verification)
- [完整演示与测试说明](docs/演示链接与测试情况.md)
- [部署到 Google Cloud Run](docs/Google-Cloud-Run-部署.md)

当前覆盖系统解剖学“脑神经”的10个知识点与20道三要点题。总览、课程、章节和报告可实际使用，初始成绩为空，状态根据真实作答更新。

## 本地启动

需要 Python 3.10+，不需要安装第三方 Python 包。

```bash
git clone https://github.com/hys-ai/Medical_AI.git
cd Medical_AI
python mednexus/server.py --open
```

Windows 也可双击仓库根目录的 `开始使用医枢.bat`。默认地址为 `http://127.0.0.1:7860`；关闭服务时在启动终端按 Ctrl+C。端口占用可改用 `python mednexus/server.py 7861 --open`。

本地版使用SQLite保存匿名学习记录与用户自行导入的资料，默认使用可解释规则与本地证据检索。可通过环境变量选配兼容的模型服务，详见 [本地版说明](mednexus/README.md)。不要将真实密钥写入源码或提交Git。

## 在线演示源码

`online-demo/dist/` 是可直接托管的静态源码，不是应忽略的构建缓存。它将学习记录保存在访问者浏览器的localStorage，不共享本地SQLite；PubMed英文查询直接发送到NCBI。

预览需要Python，仅启动静态文件服务：

```bash
python -m http.server 7871 --bind 127.0.0.1 --directory online-demo/dist
```

然后打开 `http://127.0.0.1:7871`。在线演示不连接付费模型；题目与答案随前端分发，适合自主学习和演示，不适用于保密考试。Sites账户绑定信息未包含在仓库，部署时需使用自己的托管配置。

## 运行测试

Python本地版与浏览器演示引擎分别测试，Node.js用于运行后者：

```bash
python -m unittest discover -s mednexus/tests -v
node online-demo/tests/engine.test.mjs
```

已记录的工程回归结果是本地35项、在线28项，合计63项通过。原始记录在 `online-demo/dist/core-tests.json` 和 `online-demo/dist/demo-tests.json`。浏览器手工检查另列在 `online-demo/dist/browser-checks.json`；真实PubMed联网结果不冒充自动化测试结果。

## 项目目录

```text
mednexus/          Python本地服务、医学学习示例、网页与回归测试（合并版）
online-demo/       独立浏览器演示、静态课程数据与引擎测试
docs/             演示链接与测试说明
开始使用医枢.bat    Windows相对路径启动脚本
LICENSE           原仓库MIT许可证
```

原始Word需求文件、用户截图、教材原文、本机学习数据库、模型密钥、部署账户配置和临时发布压缩包均未入库。

## 已合并：教材页级证据层

原「书页」项目已于 2026-10-24 并入本仓库，**不再作为独立目录存在**。合并方式是保留医枢的教学流程，替换它的证据层：

| 能力 | 合并前 | 合并后 |
|---|---|---|
| 补学依据 | 自编学习卡，无页码 | **本地教材索引，显示印刷页码** |
| 自由提问检索 | 字符二元组覆盖率，只看学习卡 | **BM25 + IDF 覆盖率，优先教材原文** |
| 拒答 | 覆盖率 0.33 | **覆盖率 0.30 + 至少命中 2 个查询词** |
| 引用校验 | 摘录字符串包含 | 同左，且页码只能来自索引记录 |

实现：`mednexus/textbook.py`，索引文件放仓库根目录 `chunks.jsonl` 或 `mednexus/data/chunks.jsonl`（**不入库**）。没有索引时系统仍可运行，只是回退到自编学习卡、不显示页码。

生成索引（需要有教材 PDF，仅本机使用）：

```powershell
python tools/pdf_extract.py "教材.pdf" 100000 book_xxx.jsonl
python tools/build_chunks.py            # 产出 chunks.jsonl
```

## 当前验证边界

教学目标与医学内容仍需教师审核，正式大纲与教材页码仍需对照正版核验。阅读不直接算掌握，单题满分也不直接算掌握；首次和最近作答的变化仅为过程记录。35 项工程测试通过不代表医学问答准确率、认知测量效度或真实学习效果已经验证。

教材页码来自本机索引，**索引本身需要人工核对**（三本书的 PDF 页与印刷页偏移分别为 +19 / +29 / +23），系统不会把索引页码标为“已核验原书”。

用于医学教育与科研入门，不提供个人诊疗建议。
