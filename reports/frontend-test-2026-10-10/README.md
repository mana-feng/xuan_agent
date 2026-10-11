# 前后端检测与修复报告

从仓库根目录运行：

```sh
node reports/frontend-test-2026-10-10/serve-report.mjs
```

打开 <http://127.0.0.1:3002/report.html>。报告分开展示完整版前后端与 `frontend-only`，并保留每项问题的初始结果和修复现状。

更新数据后可运行 `node reports/frontend-test-2026-10-10/generate-report.mjs` 重新生成 HTML 与 Markdown。生成报告不会重新执行测试。

`checks`、`evidence`、`screenshots` 和 `frontend-only` 保存各轮验证的原始证据。历史失败日志用于解释修复过程，不能当作当前回归结果。真实服务、浏览器操作、受控测试和未完成的原生文件对话框验证，按报告标注分别解读。

`checks/commit-verification.json` 记录整理提交时重新执行的 339 项回归及两套前端类型检查；此轮未重新执行数据库、真实模型或浏览器验收。证据中的本机路径描述原测试环境，下载文件副本保存在 `frontend-only/evidence/native-files`。
