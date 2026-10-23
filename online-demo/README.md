# 医枢 MedNexus 公开在线演示

这是原Python本地智能体的浏览器演示版本。当前覆盖系统解剖学脑神经的10个知识点和20道题，提供诊断、按要点评分、补学、可追溯学习卡问答、真实PubMed检索、阅读后返回迁移题，以及学习报告。

公开演示：https://mednexus-learning-demo-1023.bar20070507.chatgpt.site 。测试情况位于同地址的 #verification 路由，站点访问范围按用户要求设置为public。原始Word附件、截图、本地SQLite数据库与API密钥不在站点源码内。

运行与构建均不依赖第三方包。dist是直接部署的静态目录；Node执行tests/engine.test.mjs可验证浏览器引擎，原始结果为dist/demo-tests.json。dist/core-tests.json来自Python本地版重新运行的35项测试。

与本地版本的区别：学习记录、导入材料和文献缓存存于访问者浏览器localStorage；NCBI由浏览器直接请求，受到网络、跨域和API限流影响；未配置付费大模型。浏览器可查看题库与答案，适合自主学习与演示，不适用于保密考试。

测试情况在#verification路由，逐项原始结果可直接下载。63项工程测试通过不等于医学准确率或教学效果已验证。
