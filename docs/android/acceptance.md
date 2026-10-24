> 0.2.0 更新：当前界面与交互修正见 [web-parity.md](web-parity.md)。下文保留 0.1.0 初次实现记录，其中未移植项、非流式显示、未支持宫位聚焦等结论已经被本次修正取代。

# Android 原生版验收记录

日期：2026-10-25（Asia/Singapore）
分支：android；来源 frontend@6b5a379c947acf3824def77a14dd26cdbbc2fdde。

## 已完成的验证

| 层级 | 结果与范围 |
| --- | --- |
| Kotlin/JVM 核心 | 实际 Gradle :core:test：23 项通过，0 失败/错误/跳过 |
| 原生应用 JVM | 实际 Gradle :app:testDebugUnitTest：22 项通过，0 失败/错误/跳过 |
| Android 设备运行 | 专用 Pixel_9_Pro x86_64 模拟器、Android 17/API37，飞行模式下 8 项通过 |
| 静态检查 | :app:lintDebug：0 错误、4 警告；下方列出限制 |
| 构建 | :app:assembleDebug、:app:assembleDebugAndroidTest 成功 |
| 实际页面 | 安装启动并人工查看原生首页、八字结果截图；未将截图当作全部页面/设备尺寸验收 |

核心冻结参考：八字/起运840组；神煞/结构关系1496组、22440次列表对照；六爻128组、时间起卦24组；奇门249张完整盘；紫微156张盘、25584个结构字段。参考代码固定版本，来源和许可证保留在各移植说明中。数据和测试证明迁移一致性，不是新增的独立天文或术数有效性证明。

8 项实际 Android 检查：四类排盘保存后重开；超过2MB的排盘/对话与Unicode尾部完整恢复；非法导入无部分写入；合法合并/删除/聊天快照保留；Keystore加密、原始偏好文件及备份不泄密、清空密钥；已收到回复在写盘失败后仍保留且只重试存储；MainActivity启动；实际 Activity.recreate 后原始农历/闰月/起卦参数/聊天和设置草稿保留。测试数据使用随机命名空间，不清理应用正式档案；飞行模式恢复为原值0。

## APK

- 版本：0.1.0 debug，applicationId=com.manafeng.xuan。
- 最低安装版本：API26/Android8.0；实际运行证据来自API37模拟器，其他系统/实体机尚未逐一验证。
- 字节数：9194654。
- SHA-256：A58CE98BD4036BDEC8EAA063B4460CFCEFC00CDD8967F6D630166E03C8B444DC。
- 工程产物：android-app/app/build/outputs/apk/debug/app-debug.apk。
- 本机交付副本：F:/github/xuan_agent/.local-dev/android-release/2026-10-25/xuan-android-0.1.0-debug.apk。

## 审查与回归

独立审查发现4项重要问题和1项命名问题，修复前结论及实现者处理记录见 code-review.md。大SQLite单行问题在真实Android先复现SQLiteBlobTooBigException，再以同一数据验证分块读取通过。原始输入恢复、已付费回复保留、导出上限和命名标题均有先失败后通过的回归。最终全套45项JVM及8项设备测试通过；未把原始审查改写为独立复审通过。

## 尚未执行及已知差异

- 真实模型 API 联网：NOT_EXECUTED，没有读取用户真实密钥或产生模型调用费用。三种请求协议、响应错误、格式校验和Agent解析已在本机测试；没有声称所有服务商真实互通通过。
- 实体手机、API26最低版本及其他Android版本：NOT_EXECUTED。
- 真实网络请求取消/断流/弱网：NOT_EXECUTED；当前使用整段回复，客户端明确取消且不自动重试。
- 历史时区数据库随设备系统版本可能不同，未进行跨系统全量对照。
- 老浏览器存储/旧JSON档案自动迁移不支持；原生备份为v1。单份8MB，提供全部/单盘/单对话导出；超大单会话不会静默截断。
- 八字保留44类逐柱神煞与结构关系，未搬入自动旺衰、格局、喜用神及扩展流运节点图等评判/交互函数；详情见 bazi-details-port.md。
- AI动作需要点击确认，不支持聊天直接聚焦紫微某宫位。
- 本包是debug侧载交付，未完成生产签名、应用商店目标SDK或上架验收。

Lint的4条警告：Compose旧版自定义检查与当前分析器API不兼容（部分Compose专用检查被跳过，常规Android检查执行）；建议添加Android12数据提取规则；输出流回收检查无法追踪 bufferedWriter().use 的关闭链；未配置专用启动图标。未将警告描述为通过的检查。

实际截图：screenshots/home-offline.png、screenshots/bazi-result-offline.png。
完整本机日志保存在 .local-dev/android/，主要为 gradle-final-green.log、gradle-final-resources.log、instrumentation-final-green.log、final-gradle-summary.json。
