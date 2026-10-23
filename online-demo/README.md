# 医枢 MedNexus 浏览器演示版

这是原 Python 本地智能体的浏览器演示版本。当前覆盖系统解剖学脑神经的 10 个知识点和 20 道题，提供诊断、按要点评分、补学、可追溯学习卡问答、真实 PubMed 检索、阅读后返回迁移题，以及学习报告。

**不需要任何外部托管服务**，本机或内网直接打开即可：

```powershell
python -m http.server 7871 --bind 127.0.0.1 --directory online-demo/dist
```

然后打开 `http://127.0.0.1:7871`。

需要让同一局域网的其他设备访问时：

```powershell
python -m http.server 7871 --bind 0.0.0.0 --directory online-demo/dist
```

其他设备打开 `http://<这台电脑的内网IP>:7871`。

原始 Word 附件、截图、本地 SQLite 数据库与 API 密钥不在源码内。

运行与构建均不依赖第三方包。`dist` 是可直接托管的静态目录；Node 执行 `tests/engine.test.mjs` 可验证浏览器引擎，原始结果为 `dist/demo-tests.json`。`dist/core-tests.json` 来自 Python 本地版重新运行的 35 项测试。

与本地版本的区别：学习记录、导入材料和文献缓存存于访问者浏览器 localStorage；NCBI 由浏览器直接请求，受到网络、跨域和 API 限流影响；未配置付费大模型。浏览器可查看题库与答案，适合自主学习与演示，不适用于保密考试。

逐项测试结果在 `#verification` 路由，可直接下载。63 项工程测试通过不等于医学准确率或教学效果已验证。
