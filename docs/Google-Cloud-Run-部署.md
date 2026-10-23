# 在 Google Cloud Run 部署医枢在线演示

本指南部署 `online-demo/dist/` 中已经完成的浏览器演示。它包括主动诊断、补学、迁移题、学习报告和浏览器端 PubMed 查询。学习记录保存在访问者自己的浏览器 `localStorage` 中，因此无须数据库。它与仓库中的 Python 本地版是两套运行形态。

## 前提

1. 有一个已启用结算的 Google Cloud 项目，并且当前账号有部署 Cloud Run、使用 Cloud Build 和修改服务公开访问设置的权限。
2. 使用 Google Cloud Shell，或在本机安装并登录 Google Cloud CLI。以下命令可在 Cloud Shell 直接运行。
3. 选择项目 ID 和区域。示例使用 `asia-east2`（香港）；请按访问者所在地和项目策略选择实际区域。

## 部署

```bash
git clone https://github.com/hys-ai/Medical_AI.git
cd Medical_AI/online-demo
gcloud config set project YOUR_PROJECT_ID
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
gcloud run deploy mednexus-demo \
  --source . \
  --region asia-east2 \
  --no-invoker-iam-check \
  --min-instances 0
```

将 `YOUR_PROJECT_ID` 换成自己的项目 ID。`--source .` 会根据本目录的 Dockerfile 在 Google Cloud 中构建容器，无须本机安装 Docker。Dockerfile 只复制 `dist/`，按 Cloud Run 提供的 `PORT` 在 `0.0.0.0` 监听。

部署成功后，命令行会输出服务 URL。打开该 URL，再打开 `URL/#verification` 查看测试页。也可以查询：

```bash
gcloud run services describe mednexus-demo --region asia-east2 --format='value(status.url)'
```

如组织策略禁止公开访问，公开访问设置会失败；需要项目管理员处理或改为仅授权用户访问。`--no-invoker-iam-check` 会让拿到链接的人均可访问，与本次演示的公开范围一致。

## 上线后检查

1. 首页能进入脑神经章节并显示主动诊断题。
2. 完成作答、补学和迁移题后，报告出现实际记录；刷新同一浏览器仍可读取记录。
3. `/#verification` 显示保存的 35 项 Python 测试和 28 项浏览器引擎测试，共 63 项通过。它是既有测试记录，不代表 Cloud Run 自动重新执行了测试。
4. 如需测试文献功能，用实际网络查询 PubMed；浏览器对 NCBI 的访问取决于访问者网络和接口限流。

## 数据和费用边界

这个部署没有服务端学习数据库，也不连接付费大模型。浏览器清理站点数据、换设备或换浏览器后，不会自动同步学习记录。Google Cloud 需要启用结算；Cloud Run 有免费额度，Cloud Build、Artifact Registry 和网络流量等可能产生费用，请在 Google Cloud 控制台设置预算提醒。

Python 本地版的 `server.py` 目前固定监听 `127.0.0.1`，只接受 localhost Host/Origin，并把学习记录写入 SQLite。Cloud Run 实例文件系统不持久，因此不能直接把它作为多人持久化服务部署。若需要联网账号和跨设备进度，应先设计登录、授权与持久数据库，再改造服务后单独部署。
