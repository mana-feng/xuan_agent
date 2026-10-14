# Vue / uni-app H5 UI 草稿

从 `frontend-docker` 运行：

```sh
npm ci
npm run dev:ui-draft
```

预览：<http://127.0.0.1:4173/>。构建：`npm run build:ui-draft`，类型检查：`npm run typecheck:ui-draft`。

使用项目已有 Vue 3、TypeScript、uni-app 和 Vite 依赖。`src/pages/index/index.vue` 组合各页面组件，`src/useDraft.ts` 管理响应式状态，`src/components/QiguaTime.vue` 独立呈现起卦时间。

这是 H5 交互草稿。`h5-*` 表单标签在编译时还原为原生 HTML 控件，以保留浏览器日期选择、键盘操作和约束校验。未验证小程序或 App 构建。

配色偏好保存在本机；记录仅在当前页面会话内保存。命盘和 AI 回复均为明确标注的固定示例，无后端请求。起卦采用东八区时间快照，与出生日期、时间分开；修改记录保留原时刻。

旧 HTML 位于 `docs/ui-draft/index.html`，仅作为设计来源保留。当前预览运行 Vue 单文件组件，并使用独立 uni-app 启动入口，不加载生产业务页面和 API 初始化。
