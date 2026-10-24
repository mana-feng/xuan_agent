# 玄学 AI Chat & Agent · 纯前端版

八字、六爻、紫微、奇门排盘，以及由浏览器直接调用模型 API 的 AI Chat / Agent。

- 在线访问：<https://xuan.manafeng.com/>
- 当前 `frontend` 分支只存放独立前端源码，项目文件位于仓库根目录。
- 带后端、账户系统和管理端的完整版本在 [`main` 分支](https://github.com/mana-feng/xuan_agent/tree/main)。

## 本次同步

以 `main` 的 `16ccd70` 为基准，同步工作台侧栏、渐变配色、统一时间编辑器、四类排盘输入及结果页、六爻手工爻象选择、历法规则和历史记录界面。

- 奇门引擎随源码固定在 `vendor/qfdk-qimen/`，浏览器本地起局，可保存、修改并携盘问 AI。
- 八字与六爻保留所选时区、子时换日等计算规则；旧记录缺少原时区时会先要求确认，不会静默按当前设备重新解释。
- 四类记录保存在当前浏览器，兼容此前纯前端版本的记录键和编号。聊天按命盘隔离，在支持 Web Crypto 的环境中加密保存，保留 30 天；仍支持原有 JSON 档案导入导出。
- AI 配置、模型直连和本地历史继续由纯前端管理，无需部署账户、数据库或应用后端。访问统计仍由 Pages 工作流注入。

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

排盘、聊天记录和模型配置存放在浏览器本地，模型请求直接发送到用户填写的服务商。API Key 以明文形式保存在本地，请仅在自己的设备上保存。服务商须允许来自站点的跨域请求；静态 Pages 不提供后端 API 代理。本地加密聊天依赖当前设备标识，清理站点存储后不能用旧设备密钥恢复，重要内容请另行导出保管。

## 分支维护

这个分支最初从原项目的 `frontend-only/` 源码独立导入，不携带后端 Git 历史。完整项目的历史保留在 `main`。

两个分支结构不同，请分别开发和提交。共享修复按具体文件移植，避免直接把整个 `main` 合并到 `frontend`。本地依赖、构建产物、环境密钥和历史测试报告不进入源码分支。

同机并行维护时，使用独立 Git worktree 分别检出 `main` 和 `frontend`，不要在另一个任务正在修改的工作目录切换分支。同步时固定来源提交，再核对后续增量。

## 鸣谢

- [OpenAI Codex](https://github.com/openai/codex) - 感谢在代码实现、调试与验证中的帮助。
- **tibo** - 特别感谢近期多次提供额度重置支持，帮助本项目持续开发和迭代。
