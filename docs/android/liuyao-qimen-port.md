> 0.2.0 更新：当前界面与交互修正见 [web-parity.md](web-parity.md)。下文保留 0.1.0 初次实现记录，其中未移植项、非流式显示、未支持宫位聚焦等结论已经被本次修正取代。

# 六爻、奇门 Kotlin 移植记录

实现位置：android-app/core/src/main/kotlin/com/xuan/core/LiuyaoEngine.kt、QimenEngine.kt。Android 运行时仅使用 Kotlin、java.time 与离线历法表；没有 JavaScript 引擎、Node 或 Java 排盘库。tools/export-najia-qimen.cjs 只在开发阶段运行。

## 规则与输出

- 六爻爻序自下而上，0 阴静、1 阳静、3 阳动、4 阴动。包含卦名、卦宫、世应、纳甲五行、六亲、六神、伏神、变卦。变卦六亲仍按本卦宫五行，与 frontend 一致。
- 数字起卦、农历时间起卦、三枚铜钱随机起卦均为 Kotlin。数字要求正整数；时间起卦遵循共享输入的年界、闰月和换日规则。随机使用三枚独立布尔铜钱，概率 1/8 老阴、3/8 少阳、3/8 少阴、1/8 老阳。
- 奇门为时家转盘、符头拆补。输入先按其明确时区确定时刻，再换算固定 UTC+08:00；用精确节气时刻、23:00 日界、五日符头定元。值使从原始宫数计步（包含中五），显示才寄坤二；天禽随天芮。
- 输出包含九宫地盘、天盘、九星、八门、八神、暗干、值符、值使、旬首、空亡及驿马；中宫星门神为空，盘干保留。没有移植自动断语、吉凶打分、格局或建议文案。

## 对照来源与许可

开发对照 checkout：F:/github/xuan_agent/.local-dev/worktrees/frontend-sync，导出时 HEAD 为 6b5a379c947acf3824def77a14dd26cdbbc2fdde。

六爻依据 src/features/liuyao/najiaCore.ts、najiaConst.ts、qiGua.ts 与 data/guaci.json 的卦名，保留现有仓库 LICENSE。原文件注明移植自 najia-master；本次没有新增关于更早上游许可的推断。

奇门依据 vendor/qfdk-qimen/lib 和 src/utils/qimenCalculation.ts。上游 qfdk/qimen 固定 commit 1d0d1c5b39755e67525a11e68bab9b73baae1937，本项目补丁 xuan-1。MIT 原文保存在 core/src/main/resources/qimen-LICENSE.txt。原 PROVENANCE.json 已指出上游 package.json 的 ISC 标注与 LICENSE 冲突，沿用其保留 LICENSE 原文的处理。

静态运行时资源 liuyao-names.tsv 仅 64 个卦码和卦名；完整排盘 fixture 只在 src/test/resources，不打入主程序。

## 验证记录

1. 实现前导出 128 组六爻（64 卦静爻及全动爻）、249 个奇门完整盘、24 组时间起卦；编写测试后，以 TODO API 骨架运行直接 Kotlin/JUnit，6 个测试全部以 NotImplementedError 失败。记录：.local-dev/android/liuyao-qimen-direct-red.log。
2. 第一次对照发现导出器将时间起卦规则放在 CalendarOptions 顶层，frontend 实际读取 options.rules。修正导出器后重新从 frontend 导出 24 组时间起卦，覆盖闰月按原月/加十二及子时推进。这是对照工具修正，没有放宽 Kotlin 断言。
3. 直接 Kotlin 1.9.22 / JUnit 4.13.2：LiuyaoTest 4 个测试、QimenTest 2 个测试，全部通过。测试内逐项比较 128 卦、24 起卦、249 奇门盘全部结构字段；奇门含 1900/2099 输入边界、夏至/冬至交接前后、22:59:59/23:00、阴阳遁双时辰扫描。另验证相同时刻不同输入时区等盘及无自动断语。
4. 整体 Gradle :core:test 通过；检查生成的五个测试套件 XML，共 19 测试、0 失败、0 错误。最终任务调用已为 UP-TO-DATE，XML 时间为 2026-10-24T17:00:13Z（新加坡 10 月 25 日 01:00:13）。

复现：
~~~powershell
node tools/export-najia-qimen.cjs F:/github/xuan_agent/.local-dev/worktrees/frontend-sync
$env:JAVA_HOME='C:/Program Files/Eclipse Adoptium/jdk-21.0.5.11-hotspot'
& ./android-app/tools/test-core-direct.ps1 -TestClasses com.xuan.core.LiuyaoTest,com.xuan.core.QimenTest
& ./android-app/tools/build.ps1 -JavaHome $env:JAVA_HOME -SocketDirectory "$PWD/.local-dev/android/sockets" -GradleArguments ':core:test','--console=plain','--no-daemon'
~~~

SHA-256：
- liuyao-reference.tsv：FD00B5205CBDC734D8523C91C2CA219BC87DA1ABBBBC913F725571E593A90C8C
- liuyao-casting.tsv：7898CCD193162594808D47B09830E8F11D53A44F095A9F5521F7E3F7F02810EB
- qimen-reference.tsv：C1CD316E3EA5375AAF2EF46E3D61D1E920D796E1621A3C11A7BC7FD16FA63359
- liuyao-names.tsv：A7061E9C264BCB23FC5ED44BD5477AE85CA475698948460B4D62C158DE900BCB

## 边界

这些测试证明 Kotlin 与冻结 frontend 规则和共享历法的一致性，不构成独立传统术数正确性证明。未支持真太阳时、飞盘、置闰或不同门派比较。本任务没有执行 Android 设备交互测试，设备与 APK 验收由整体验收另行记录。
