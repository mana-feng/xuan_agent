# Android 原生单机版

用户已确定：排盘与记录离线；AI 调用自行配置的 API；界面和算法全 Kotlin 原生；直接在 android 分支实施。

## 范围与架构
- android-app/ 为独立工程，Kotlin 1.9.22、Compose 1.6.1、AGP 8.2.2、Gradle 8.5，minSdk 26/compileSdk 34，使用本机已安装构建环境。
- core 为纯 Kotlin/JVM：历法、八字、六爻、紫微、奇门和输入规则。不使用 WebView、JavaScript 引擎或 Java 排盘库。
- 固定 lunar-javascript 1.7.7 导出农历月和精确节气数据，Kotlin 在运行时读取并计算，支持 1900—2099 年输入；保留导出脚本、来源、许可证与校验值。
- app 为 Compose 原生界面：四类输入/结果、记录搜索/回放/删除、JSON 备份导入导出、AI 对话和配置。
- 本地 SQLite 保存输入、规则和结果快照及聊天；API Key 经 Android Keystore 加密，不进备份。
- OpenAI 兼容/Anthropic/Gemini；仅主动聊天发起网络请求，禁止统计或后台上传。失败不自动重发。
- 保留明确时区与规则；拒绝 DST 空缺和未选择的重复时间；八字/六爻支持子时换日，紫微固定 23:00 全日期推进，奇门固定 UTC+08:00、精确节气、符头拆补。

## 方案
用户选择全 Kotlin 原生，排除网页包装与 JavaScript 桥接。以已有 frontend 结果为迁移基准；数据表只提供历法和静态规则，不预存整盘结果。

## 验收边界
固定前端对照、边界回归、存储恢复、协议本地模拟、APK 构建；有可用模拟器时安装启动。构建与模拟器结果独立报告，未执行真机测试不得标为通过。保留现有 frontend 与 main 工作。
