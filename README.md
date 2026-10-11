# 玄学 AI Chat & Agent · 纯前端版

八字、六爻、紫微排盘，以及由浏览器直接调用模型 API 的 AI Chat / Agent。

- 在线访问：<https://xuan.manafeng.com/>
- 当前 `frontend` 分支只存放独立前端源码，项目文件位于仓库根目录。
- 带后端、账户系统和管理端的完整版本在 [`main` 分支](https://github.com/mana-feng/xuan_agent/tree/main)。

## 本地开发与验证

使用 Node.js 22 和 npm：

```bash
git clone --branch frontend --single-branch https://github.com/mana-feng/xuan_agent.git
cd xuan_agent
npm ci
npm run dev:h5
```

开发地址：<http://localhost:3050/>。

```bash
npm test
npm run typecheck
npm run build:h5
```

静态构建产物位于 `dist/build/h5/`，使用 hash 路由，可部署在静态托管服务上。源码及测试不依赖 `main` 分支的后端或用户前端。

## GitHub Pages

仓库 Settings → Pages → Source 使用 **GitHub Actions**。推送到 `frontend` 后，`.github/workflows/deploy-pages.yml` 安装依赖、运行测试和类型检查、构建 H5 并发布。工作流只允许发布 `frontend`；手动运行时也须选择此分支。

自定义域名为 `xuan.manafeng.com`，在 Pages 设置中配置；DNS 指向 `mana-feng.github.io`。`CNAME` 同时随产物保留。`github-pages` 部署环境须允许 `frontend` 分支部署。`deployment.json` 记录线上产物的仓库、分支和提交，可用于核对实际发布版本。

可选的仓库级 Secret `ANALYTICS_SNIPPET` 仅在构建后注入统计片段；未配置则跳过。旧仓库的 Secret 不会随源码迁移。

## 数据与 API

排盘、聊天记录和模型配置存放在浏览器本地，模型请求直接发送到用户填写的服务商。API Key 以明文形式保存在本地，请仅在自己的设备上保存。服务商须允许来自站点的跨域请求；静态 Pages 不提供后端 API 代理。

## 分支维护

这个分支从原仓库当前 `frontend-only/` 源码独立导入，包含迁移时尚未提交的前端修复及测试；不携带后端 Git 历史。完整项目的原 Git 历史保留在 `main`，原仓库及原本地工作区也保持保留。

两个分支结构不同，请分别开发和提交。共享修复按具体文件移植，避免直接把整个 `main` 合并到 `frontend`。本地依赖、构建产物、环境密钥和历史测试报告不进入源码分支。
