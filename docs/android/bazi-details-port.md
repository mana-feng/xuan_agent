> 0.2.0 更新：当前界面与交互修正见 [web-parity.md](web-parity.md)。下文保留 0.1.0 初次实现记录，其中未移植项、非流式显示、未支持宫位聚焦等结论已经被本次修正取代。

# 八字神煞与结构关系 Kotlin 移植

## 接口与范围

`android-app/core/src/main/kotlin/com/xuan/core/BaziDetails.kt` 提供：

```kotlin
BaziDetails.sections(input: ChartInput, pillars: Pillars): List<ChartSection>
```

返回“四柱神煞”、“干支关系”、“柱位对应关系”三个分节；调用方可移除 `BaziEngine` 既有的部分“干支关系”后添加本结果。该对象使用调用方已经确定的四柱，不另外计算日期或覆盖换日选择。性别用于前端既定元辰规则；每个干支必须是合法六十甲子。

已移植：

- `calculateShenShaForGanZhi` 在年/月/日/时四个位置的全部实际规则与 44 类输出名称，包括年干/日干并查、年支/日支自查排除、年柱纳音学堂、词馆干支与纳音条件、日柱专属标签、男女元辰、金神及天罗地网双名称。
- `calculateOriginalGanZhiRelations` 使用的全部九类结构关系：三合、刑、三会、天干五合、天干冲、六合、六冲、害、破，保留顺序和去重方式。三刑完整组合抑制内部两两刑；源函数仅对辰午酉亥生成自刑标签，辰午酉亥重复时的“辰辰刑/辰自刑”等源输出亦照实保留。
- `buildGanZhiDiagram` 在本命四柱上的全部边类型与柱位：天干合/冲/克、地支三合/三会/六合/半合/暗合/冲/刑/害/破/克。每条关系对应具体年/月/日/时柱，原始有向索引及标签用于对照，展示按柱位合并。

源关系字符串 `合化土` 等在内部对照中保留，但用户结果显示为 `合土` 并明确“仅记录组合，未判断成化、日主强弱或吉凶”。本模块没有新增旺衰、喜忌或预测结论。

## 固定来源与开发工具

依据本仓库前端 `src/libs/utils/bazi-enhanced.ts`，读取位置：`F:/github/xuan_agent/.local-dev/worktrees/frontend-sync`。源文件 SHA-256：`6420400984e7d2a29c6b9479ac6496f53d649707007d4f42e138059548b165b9`。这是仓库内既有代码的 Kotlin 移植，沿用仓库根 `LICENSE` 的 GNU AGPL version 3；本模块未把该来源标为 lunar-javascript 的 MIT 算法。

开发期导出工具 `android-app/tools/export-bazi-details.cjs` 使用参考目录已有 TypeScript 依赖将源文件在内存中转为 CommonJS，仅移除配置模块导入并替换为未使用的空配置。调用实际导出的神煞、关系和图边函数；没有重写期望算法，也没有修改参考目录。运行时无 JS、Node 或 TypeScript 依赖：

```powershell
node android-app/tools/export-bazi-details.cjs F:/github/xuan_agent/.local-dev/worktrees/frontend-sync
```

## RED → GREEN 证据

在实现前先固定 `android-app/core/src/test/resources/bazi-details-reference.tsv`：1,496 组，SHA-256 `2ae68aefdc7ca9554f852859f189bba12c83ad480c907d459abd37cfdede8db9`。其中：

- 60 日柱 × 12 组月/年/时组合 × 男女 = 1,440 组固定合成四柱；这些只用于规则覆盖，不冒充实际民用日期。
- 金神三种日柱 × 三种时支 × 男女 = 18 组。
- 三刑、三合、三会、自刑专例 × 男女 = 10 组。
- 1900-01-01、1990-06-15、闰月、立春边界、春节晚子与年末等七个真实民用时间 × 两种换日设置 × 男女 = 28 组；期望四柱由锁定前端 lunar-javascript 得出。

`BaziDetailsTest`：4/4 测试先因 TODO 失败，日志 `.local-dev/android/bazi-details-red.log`；实现后同样测试 4/4 通过，日志 `.local-dev/android/bazi-details-green.log`。使用缓存 Kotlin 1.9.22 编译器、JDK 21、JVM target 17、JUnit 4.13.2：

```powershell
cd android-app
./tools/test-core-direct.ps1 -TestClasses com.xuan.core.BaziDetailsTest -JavaHome 'C:/Program Files/Eclipse Adoptium/jdk-21.0.5.11-hotspot'
```

逐组对照四柱标签列表、九个关系列表与两组图边列表，共 22,440 个固定列表比较；另检验结果分节和显示中不直接宣称合化。测试期望包含全部 44 类源函数标签。

## 明确边界

本次是本命四柱神煞与结构关系接口。未移植前端格局、五行旺衰、日主强弱、用神建议等推断；未提供大运/流年/流月追加节点的公开关系接口，基础大运/流年由 `BaziEngine` 提供。

前端还存在另一套汇总函数 `calculateShenSha`，其规则与逐柱函数不完全一致：汇总函数有日德、日贵、天赦等逐柱函数没有的输出，且天赦季节分支把 `bazi.getMonth()` 的干支字符串与数字月份比较，实际走冬季分支。本模块没有混用该汇总函数或在未经确认的情况下复制该分支；当前返回逐柱函数的全部 44 类命中。词馆/魁罡/金神/天罗地网等看似特殊或重复的源行为均以固定样例保留，未擅自按注释改算法。

本记录仅确认 Kotlin/JVM 规则对照，不等于整个 Android 应用、界面或真机验收。没有并行启动 Gradle，以免干扰 Android 构建任务；最终整体验收还需调用方集成后执行全套测试。
