# 玄枢 Android · Kotlin 原生单机版

`android` 分支基于纯前端 `frontend@6b5a379` 开发。安卓界面和排盘算法均采用 Kotlin；排盘、历史记录和回放不依赖网络。AI 通过用户自行配置的 HTTPS API 调用。

## 使用范围

- 八字：四柱、十神藏干、纳音、十二长生、旬空、起运、大运、流年与干支结构关系。
- 六爻：时间、数字、随机铜钱、手动起卦；本卦/变卦、纳甲、六亲、六神、世应、伏神。
- 紫微：十二宫、命身宫、五行局、主辅杂曜、四化、亮度、长生/博士/岁前/将前及大限小限。
- 奇门：时家转盘、符头拆补、精确节气、九宫天地盘、九星八门八神、暗干、旬空与驿马。
- 本地档案：结果快照保存、搜索、回放、删除；JSON 导入/导出（支持全部、单盘、单对话备份）。
- AI：OpenAI 兼容、Anthropic、Gemini；携盘对话、自定义接口/模型/密钥、取消请求与本机会话保存；模型建议的排盘动作通过明确按钮确认，缺少出生信息时只打开输入页。

支持公历 1900—2099 年；农历输入在本机转换。时间必须有明确时区，夏令时不存在的时间会拒绝；重复时间可填写明确 UTC 偏移。八字和六爻可选 00:00/23:00 换日；紫微在 23:00 全日期推进；奇门固定北京时间 UTC+08:00。

## 工程

```text
android-app/
  core/       纯 Kotlin/JVM 历法与四类排盘，不含 Android/UI/网络依赖
  app/        Compose 界面、SQLite、Keystore、API 客户端
  tools/      Windows 构建与独立测试辅助
  gradle/     固定版本 wrapper
  gradlew / gradlew.bat
tools/        开发时导出静态历法/规则与冻结参考样本
docs/android/ 来源、算法对照、环境与验收记录
src/ tests/ vendor/   保留的 frontend 基准，只用于参考核对
```

APK 不包含网页、JavaScript 引擎或 Java 排盘库。离线历法数据由固定 `lunar-javascript@1.7.7` 导出，安星/纳甲/奇门等规则由 Kotlin 计算。来源、许可和数据校验见 `docs/android/`，运行时资源保留上游许可。

## 构建

JDK 21、Android SDK 34/Build Tools 34.0.0；Gradle 8.5、AGP 8.2.2、Kotlin 1.9.22、Compose compiler 1.5.8。最低 Android 8.0/API 26。本分支提供可侧载 debug 包，未作应用商店发布验收。

在 Android Studio 打开 `android-app/`，配置 SDK 后构建；或：

```sh
cd android-app
./gradlew :core:test :app:testDebugUnitTest :app:lintDebug :app:assembleDebug
```

Windows 使用 `gradlew.bat`。SDK 路径写入本机的 `local.properties`，该文件不提交。某些 Windows JDK 环境的 Unix socket 临时目录会导致 Gradle 回环连接错误，可使用已附带的短路径辅助：

```powershell
./android-app/tools/build.ps1 -JavaHome '你的 JDK 21 目录' -SocketDirectory '短临时目录' -GradleArguments ':core:test',':app:testDebugUnitTest',':app:assembleDebug'
```

产物：`android-app/app/build/outputs/apk/debug/app-debug.apk`。

## AI 配置与数据

在“设置”填写协议、完整 HTTPS API 地址、模型名称和 API Key。OpenAI 兼容接口使用完整 `chat/completions` 地址；Anthropic 使用完整 `messages` 地址；Gemini 使用原生接口根地址或完整 `generateContent` 地址。保存只做格式检查，主动发送提问才联网。当前回复采用整段返回，支持取消，不自动重试失败请求。

密钥使用 Android Keystore AES-GCM 加密；JSON 备份仅含排盘与会话，不含接口密钥。Android 自动云备份关闭，请通过“记录→导出备份”保管档案。卸载/清理应用数据会移除本机记录。导入格式版本为 1，单份文件上限 8 MB，数据较多时可按单盘或单对话导出；全部校验后在事务中合并，相同编号替换。当前原生备份格式与旧浏览器档案不同，尚未提供旧浏览器数据迁移器。

## 验收

具体测试数、边界、模拟器结果及未执行项见 `docs/android/acceptance.md`。前端对照验证迁移一致性，不等同于新的独立术数正确性证明。真实付费模型调用与实体手机测试分别标记，不能用模拟器或构建通过替代。

原 Pages 工作流仅发布 `frontend`，不会将 `android` 分支发布到网站。


## 与网页版本的差异

原生版已迁移四类排盘与常用结构结果；八字当前显示44类逐柱神煞和九类干支结构关系，不搬入自动旺衰、喜用神、格局等评判函数，也未迁移额外流运节点图交互。AI 动作使用显式按钮确认，当前不支持聊天直接聚焦紫微某宫位。全部差异和来源见 docs/android/ 各移植说明。
