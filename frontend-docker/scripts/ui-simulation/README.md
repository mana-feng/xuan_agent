# 正式 H5 页面本地模拟运行器

这是独立的 Node HTTP 夹具服务，不进入生产 bundle。正式前端仍使用原 `src/main.ts`、uni-app 路由、API client、Pinia store 和排盘算法。账号、记录、额度与 AI 回复为模拟数据，不连接真实模型、邮件服务或数据库。

## 启动

在 `frontend-docker` 下运行：

```powershell
node scripts/ui-simulation/run.cjs
```

本机没有全局 Node 时：

```powershell
& 'C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' scripts/ui-simulation/run.cjs
```

- 正式页面：<http://127.0.0.1:4174/#/pages/agent/index>
- 场景控制台：<http://127.0.0.1:4318/>
- 账号：`demo@example.test`
- 密码：`Demo123!`
- 注册使用任意 `.test` 结尾的虚构邮箱；先点发送验证码，再填写 `123456`。不发送邮件。
- 仅启动 API：`node scripts/ui-simulation/run.cjs --api-only`
- 自定义端口：`--api-port=4318 --frontend-port=4174`。API 端口占用时直接报错，不杀死其它进程，也不自动改端口。
- `Ctrl+C` 同时关闭模拟 API 与它启动的 uni-app 子进程。

运行器用当前 Node 执行 `node_modules/@dcloudio/vite-plugin-uni/bin/uni.js dev -p h5 --host 127.0.0.1`，不会启动 `ui-draft`。仅给子进程设置 `VITE_DEV_PORT`、`VITE_API_PROXY_TARGET`、`VITE_API_BASE_URL`、虚构签名密钥与本地 CSP 样式开关。Vite 配置必须读取 `VITE_CACHE_DIR`；运行器将它指向 `frontend-docker/.local-dev/vite-ui-simulation`，以支持当前 `node_modules` 为指向其它 checkout 的 junction 的情况。

没有 `.env` 写入、生产配置写入、磁盘夹具保存或数据库连接。前端自身的浏览器本地存储仍按原逻辑运行，测试应始终使用独立 `127.0.0.1:4174` origin。API 重启或控制台重置会恢复四类共 56 条初始夹具并让旧 token 失效；前端需要重新登录。API 重置不会删除浏览器中的聊天归档或当前排盘缓存。

## 场景

控制台提供以下按钮；切换后需要在正式页面重新触发请求或刷新页面。

| 场景 | 响应行为 |
| --- | --- |
| 成功 | 原协议格式的成功响应 |
| 延迟加载 | 所有 API 请求等待指定毫秒；默认 1800，可设 0–15000 |
| 空历史 | 四类历史 GET 返回空列表；已有内存记录保留，恢复成功后可见 |
| 服务失败 | 账号、历史和模型接口返回 503；引导配置和公告仍可读取 |
| 额度不足 | quota 返回 0；Agent/chat 返回 429 `QUOTA_EXCEEDED` |
| 未登录 / 已失效 | 受保护请求与刷新返回 401；登录暂时拒绝。恢复成功后重新登录 |
| 流式错误 | 输出两个 SSE delta 后发送 error 对象，不发 `[DONE]` |
| 流式中断 | 输出两个 SSE delta 后提前 EOF，不发 `[DONE]` |

「仅使 Access Token 失效」保留 refresh cookie 会话，供测试客户端 401 刷新与重试。它不会直接操作前端 storage。「重置全部模拟数据」清空模拟账户、tokens、额度消耗与改动，恢复默认夹具。

默认额度为 30，每次成功开始 Agent 或 chat 生成扣 1。失败的授权/额度请求不扣减；流式中途失败保留已扣额度，便于测试避免自动重复收费请求的行为。

控制台的 Agent 下拉选项可以强制返回导航、三种排盘动作、紫微聚焦或无动作。自动模式用固定关键词匹配，并非 LLM 推理。动作只包含输入参数，由正式前端执行真实算法。

自动模式示例：

```text
查看历史记录
打开八字排盘
帮我排八字，男，1996-03-21 18:30
帮我排紫微，女，1996-03-21 18:30
按时间起卦，问换工作
查看事业宫
```

## 协议覆盖

| 请求 | 夹具响应 |
| --- | --- |
| `GET /api/config/bootstrap` | `{success,data:{version,simulation:true,features,label}}` |
| `GET /api/announcements?onlyMeta=true` | `{success,data:{meta:[{id,updatedAt}]}}` |
| `GET /api/announcements` | 完整公告 list，内容明确标注模拟 |
| `POST /api/auth/login` | `identifier/password/device_id` → `access_token/refresh_token/user`，设置本地 HttpOnly cookie |
| `GET /api/auth/me` | 当前模拟用户 |
| `POST /api/auth/refresh` | 接收 refresh cookie 或 body 的 `refresh_token`，轮换 token |
| `POST /api/auth/logout` | 撤销会话并清除模拟 cookie |
| `POST /api/email/send-code` | 返回固定本地验证码，不发送邮件 |
| `POST /api/email/verify-code` | 验证已申请的固定验证码 |
| `POST /api/auth/register` | 验证验证码并建立仅本次进程存活的测试账号 |
| `GET /api/charts?type=bazi\|ziwei\|liuyao\|qimen` | 每类型默认 14 条，含 `list/total/hasMore`；keyword、gender、sortBy、sortOrder |
| `POST /api/bazi`, `/api/ziwei`, `/api/liuyao`, `/api/qimen` | 保存原始输入与前端提供的快照，返回 `{id,updated:false}` |
| `PUT /api/bazi/:id`, `/api/ziwei/:id`, `/api/liuyao/:id`, `/api/qimen/:id` | 更新同类型记录，返回 `{id,updated:true}`；不存在返回 404 `NOT_FOUND` |
| `GET /api/bazi/:id`, `/api/ziwei/:id`, `/api/liuyao/:id`, `/api/qimen/:id` | 读取同类型记录，用于接口检查；不带 ID 时返回 list |
| `DELETE /api/qimen/:id` | 删除指定奇门记录 |
| `DELETE /api/charts/:id?type=...` | 删除指定类型，保留其它类型的相同数字 ID |
| `GET /api/llm/quota` | `remainingCount/totalCount/usedCount` |
| `POST /api/llm/agent` | reply 包含 `<!--AGENT_ACTION:{...}-->`，兼容真实解析器 |
| `POST /api/llm/chat` | `stream:false` 返回 reply；`stream:true` 返回 OpenAI 兼容 delta SSE 和 `[DONE]` |
| `POST /api/stats/pageview` | 接收但不持久化模拟埋点 |

历史接口默认全量返回，正式页面使用原协议在客户端分页。协议检查还可显式传 `page/limit`；生产页面不依赖这两个模拟扩展参数。协议和隐私正文来自 `src/features/auth/protocols` 的本地内容，不存在需要模拟的远程协议文案请求。

四类夹具使用相同数字 ID 验证类型隔离；八字、紫微保存 lite 身份输入，六爻保存原爻参数和所选起卦时间。奇门初始夹具保存版本化 `input`（问题、绝对时间戳、时区、记录 ID 和 `qimen-chai-bu-v1` 规则），由正式前端重新计算。新保存的奇门记录完整保留浏览器提供的 `snapshot`，服务不会伪造排盘算法输出。

## 控制 API

所有控制端点仅存在于 `4318`，不会经过生产构建注入。

```powershell
Invoke-RestMethod 'http://127.0.0.1:4318/__simulation/scenario' -Method Post -ContentType 'application/json' -Body '{"scenario":"loading","delayMs":1800}'
Invoke-RestMethod 'http://127.0.0.1:4318/__simulation/scenario' -Method Post -ContentType 'application/json' -Body '{"scenario":"success","agentAction":"auto"}'
Invoke-RestMethod 'http://127.0.0.1:4318/__simulation/reset' -Method Post -ContentType 'application/json' -Body '{}'
Invoke-RestMethod 'http://127.0.0.1:4318/__simulation/expire-access' -Method Post -ContentType 'application/json' -Body '{}'
Invoke-RestMethod 'http://127.0.0.1:4318/__simulation/state'
Invoke-RestMethod 'http://127.0.0.1:4318/__simulation/requests'
Invoke-RestMethod 'http://127.0.0.1:4318/__simulation/chat-requests'
```

控制 API 校验场景、延迟范围和动作值；非本地 Origin 被拒绝。普通请求日志有 150 条上限，仅记录路径、查询、时间和状态码。

`chat-requests` 是独立的本地调试捕获，最多保留 20 次已授权 AI 请求的 `path/at/stream/messages`，其中 `messages` 仅含实际发送的 `role/content`。它用于核对真实盘面上下文是否进入 AI 请求，不保存请求头、密码、token 或其他正文参数。控制台「查看 AI 请求上下文」可直接读取；重置或重启会清空。仅使用虚构测试消息，捕获接口不会进入正式后端。

## 验证证据与边界

```powershell
node --test tests/ui-simulation.test.cjs
node --test tests/*.test.cjs
```

2026-10-12 本机执行：模拟协议测试 **11/11**，当前完整前端回归 **122/122**。测试会启动真实本地 HTTP 服务，验证三类 CRUD、筛选排序、401 刷新、注册、SSE 帧/完成标识、错误/额度、Agent 动作解析格式、跨重启内存隔离和 `.env` 不变。公告还覆盖焦点限制、关闭恢复及错误状态。测试使用随机端口，不影响手动测试中的 `4318` 服务。

2026-10-13 奇门接入后：模拟协议 **13/13**、完整前端 **188/188**、完整后端 **81/81** 通过。新增覆盖第四类 CRUD、奇门输入恢复、按类型删除、AI 上下文捕获及清空；后端同时覆盖属主隔离、快照校验、初始化建表与管理端记录联动。后端测试使用受控数据库边界，不代表真实 MySQL 的部署验收。

已通过 HTTP 检查：`4174` 正式入口返回 200 且引用 `/src/main.ts`；`4174/api/config/bootstrap` 经过代理返回 `simulation:true`；`4318` 控制面板返回 200；浏览器源码模块中的 API origin 为 `4174`；H5 CSP 已允许当前 TMUI 所需的 inline style。

桌面与移动宽度的浏览器验证记录见仓库 `docs/ui-production-verification.html`。模拟测试不等同于真实后端、模型质量、不同账号的数据隔离或原生文件选择器验证。

当前依赖目录为共享 junction；`vite-plugin-progress` 默认向依赖目录写进度缓存。只读依赖环境可关闭该进度条后构建，不改变正式 bundle 的配置：

```powershell
$env:VITE_BUILD_PROGRESS = 'false'
node node_modules/@dcloudio/vite-plugin-uni/bin/uni.js build -p h5
```
