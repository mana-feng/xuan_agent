# Kotlin 紫微排盘移植

实现：`android-app/core/src/main/kotlin/com/xuan/core/ZiweiEngine.kt`。静态规则：同目录 `ZiweiRules.kt`。接口：`ZiweiEngine(CalendarEngine()).calculate(ChartInput): ChartResult`；返回从寅宫开始的 12 个原生结果分节。

## 固定规则

- 基于输入所选时区的民用时间；先调用共享历法进行日期、时区、DST 校验。
- 输入支持 1900—2099 年；23:00—23:59 先推进完整公历日期，然后重新取得农历年月日，以次日早子时排盘。2099-12-31 晚子允许使用内部 2100-01-01 历法数据。
- 年界采用农历春节。闰月十五日及以前用原月份；十六日起用下个月份。八字换日/年界选项不改变紫微固定规则。
- Kotlin 计算命身宫、命身主、五行局、14 主星、14 辅星、38 杂曜、四化、亮度、长生/博士/将前/岁前十二神、大限及小限。仅亮度、十干四化、宫名和命身主映射是静态表；运行时不执行 JavaScript，不调用 Java 排盘库，不查整盘缓存。
- 保留现有前端对酉宫太阳“平”、太阴“旺”、七杀“旺”的亮度修正。
- `ChartResult.metadata` 包含 `soulPalace`、`bodyPalace`、`fiveElementsClass`、`calculationDate`、`timeIndex`、`lateZiRollover` 和 `palace.0.*` 至 `palace.11.*` 的可复核字段。星曜字段格式为逗号分隔的 `名称:亮度:四化`；原始输入和规则仍由上层记录快照保存。

## 参考来源与再生成

算法与静态数据依据本地前端锁定的 iztro 2.5.7：`lib/astro/palace.js`、`lib/star/{majorStar,minorStar,adjectiveStar,location,decorativeStar}.js`、`lib/data`、`lib/utils`，以及项目 `src/utils/ziweiCalculation.ts` 中的规则与晚子处理。参考路径：`F:/github/xuan_agent/.local-dev/worktrees/frontend-sync`。

iztro 为 MIT，Copyright (c) 2023 All Contributors；完整许可已随 core 资源包含于 `android-app/core/src/main/resources/ziwei-LICENSE.txt`。这份声明和许可适用于移植的算法与派生静态表。

生成工具 `android-app/tools/export-ziwei.cjs` 只在开发机运行，要求本地参考依赖版本精确为 2.5.7：

```powershell
node android-app/tools/export-ziwei.cjs F:/github/xuan_agent/.local-dev/worktrees/frontend-sync --rules
```

工具同时导出测试样例和静态 Kotlin 表；省略 `--rules` 则只导出测试样例。Node/iztro 不属于 Android 或 core 的运行时依赖。

## 验证记录

在实现引擎之前导出 156 盘，固定为 `android-app/core/src/test/resources/ziwei-reference.tsv`，SHA-256：`7693fe6553e98b9b47abdde5658ba68cbeeba74f8206dc1530fe0d8160c52cbd`。样例含全部 24 个整点小时、全部十二地支年份/十天干、男女、十二月份、2023 闰二月十五/十六边界、春节跨年、23:00 全日期推进、上限年末及 72 个固定日期扫描点；每盘对照 164 个结构字段，合计 25,584 个参考字段比较。

TDD RED：stub `TODO("native Ziwei")` 时 3/3 测试失败（NotImplementedError）；日志 `.local-dev/android/ziwei-direct-red.log`。首次实现后的输入格式失败来自测试使用 ISO `T`，共享 `ChartInput` 要求空格格式；测试现在将参考样例显式转换为共享的 `YYYY-MM-DD HH:mm`，参考文件没有改动。

GREEN：2026-10-25 使用已缓存 Kotlin 1.9.22 编译器、JDK 21、JVM target 17、JUnit 4.13.2 执行；6/6 测试通过，日志 `.local-dev/android/ziwei-direct-green.log`：

```powershell
cd android-app
./tools/test-core-direct.ps1 -TestClasses com.xuan.core.ZiweiTest -JavaHome 'C:/Program Files/Eclipse Adoptium/jdk-21.0.5.11-hotspot'
```

除 156 盘逐字段比较外，测试独立断言 1900-01-01 对应前一年农历、闰月中点、23:00 春节完整推进、星曜数量以及紫微不受八字换日/年界选项影响。

## 验收边界

以上证据是 Kotlin/JVM 算法测试，不代表 Android 界面、APK、模拟器或真机已验收。Gradle 的一次尝试在构建任务执行之前因本机 `Unable to establish loopback connection` 失败；待构建环境允许时仍须运行 `:core:test --tests com.xuan.core.ZiweiTest` 与全套测试。数据与规则用于复现项目当前既定排盘行为。流年/流月等动态运限交互不在本次原生本命盘接口范围内。
