奇门交节天文裁决与页面辅助字段补测
2026-10-13，工作目录 F:/github/xuan_agent

本包补充 ../qimen/ 的 707 例外部排盘对照。没有修改产品、共享依赖或被测外部算法。
它解决原报告中 lunar-javascript 与 sxtwl 相差约 17 秒的未决归因，不能将原始差异直接计作产品错误。

1. 明确结论

2026 全部 24 节气以 NASA JPL DE440s + Skyfield 1.54 独立求根：
  产品输出（整数秒）减 JPL UTC：-1.520658 至 +1.550475 秒。
  sxtwl 2.0.6 减 JPL UTC：-18.885435 至 -15.431541 秒。
  只纠正 sxtwl 旧时间尺度换算，残差缩至 -1.280093 至 +1.703833 秒。
  香港天文台官方表最近分钟对照：JPL 24/24，产品 24/24，sxtwl 19/24。
  以 JPL 时刻前后 3 秒调用真实 calculateQimen：48/48 交节归属正确。

因此不应把产品所有节气减去 17 秒。旧对照库的 DeltaT 外推是这批差异的主要来源。
2026 此次观测误差在 2 秒以内；回归边界采用 3 秒保护带。不能声称亚秒准确，也不能将一个年度的实测上界变成所有年份保证。

2. 为什么是旧对照库时间尺度偏差

JPL 星历在 TT/TDB 时间尺度上求太阳位置。2026 TT-UTC = 32.184 + 37 = 69.184 秒；
IERS Bulletin C72 确认 UTC-TAI 自 2017-01-01 起为 -37 秒，2026 年末不加闰秒。

sxtwl 2.0.6 原始 src/eph.cpp 的 DeltaT 表止于 2015 年、69 秒；之后采用旧二次外推。
它给 2026 的 DeltaT 为 85.870113 至 87.375889 秒。减掉这个偏大的量，太阳交节民用时就提前约 17 秒。
产品 lunar-javascript 的表含 2016/2020/2024/2028 等更新，2026 插值为 68.976266 至 68.993971 秒。
两者还共同存在 DeltaT（TT-UT1）与 UTC 不是同一概念的问题，但 2026 产品相对已知 UTC 的总差仍在上述 1.55 秒内。

delta-t-diagnosis.json 保存每个节气旧表数值、产品值、JPL 根、未经修改的 sxtwl 输出，以及仅替换 TT->UTC 换算的反事实残差。
反事实计算不是重新跑一个改过的外部库，也不把它冒充第二套独立天文模型。

3. JPL 方法与可复现性

星历：NASA JPL de440s.bsp，约 32 MB，范围覆盖 1849—2150。
SHA256: c1c7feeab882263fc493a9d5a5b2ddd71b54826cdf65d8d17a76126b260a49f2
定义：地心观测太阳，考虑光行时、光行差和引力偏折，使用日期真黄道/真春分点，太阳视黄经每到 15 度倍数为节气。
Skyfield 官方 solar_terms 算法与完整默认章动路径都实际运行；2026 二者最大时刻差 0.024261 秒。
最终数据使用完整默认章动路径。求根区间目标 0.000864 秒只表示数值停止精度，不是绝对天文精度。
JPL 和 Skyfield 不是寿星历法的另一翻译，因此可用于独立裁决先前两个寿星系实现的时间差。
Skyfield 内置 IERS/DeltaT 资料文件也做哈希固定；没有把未来预测当作已观测事实。

主来源：
  NASA JPL 星历：https://ssd.jpl.nasa.gov/ftp/eph/planets/bsp/de440s.bsp
  JPL 星历说明：https://ssd.jpl.nasa.gov/planets/eph_export.html
  Skyfield 节气方法：https://rhodesmill.org/skyfield/almanac.html#solar-terms
  IERS 公告：https://hpiers.obspm.fr/iers/bul/bulc/bulletinc.72
  香港天文台 2026 原始表：https://www.hko.gov.hk/en/gts/astronomy/data/files/24SolarTerms_2026.xml
  香港天文台表说明：https://www.hko.gov.hk/en/gts/astronomy/Solar_Term.htm

HKO 原表只有分钟精度，本包严格只比较四舍五入至最近分钟，未伪造官方秒数。

4. 支持范围与未来年份

抽取 1900、1950、2000、2026、2050、2099 各年全部 24 节气，共 144 个独立根。
先逆转产品 DeltaT 换算恢复 TT，单独比较太阳/章动模型，避免把未来 UTC 闰秒假设混进天体模型误差。

年份    TT 天体模型最大绝对差/秒    UT1 模型最大绝对差/秒
1900             1.543504                     1.890314
1950             2.217007                     2.054384
2000             1.200718                     1.169698
2026             1.702867                     1.871444
2050             2.084921                     2.762206
2099             1.467142                    91.569409

TT 与 UTC 两项数值不同是因为前者使用未取整时刻且移除了时间尺度换算，后者包含产品的整数秒取整与民用时间换算。
1900/1950 尚无 UTC，不可把软件前推 UTC 的结果当真实历史钟表误差。
2050/2099 未来闰秒未知，UTC 列是“此后不加闰秒”情景，不是将来已知时间。
UT1 也依赖地球自转模型：2099 产品 DeltaT 184.136—186.499 秒，Skyfield 预测 95.190—95.906 秒，模型间分歧约 89—92 秒。
不能认定 Skyfield 对未来地球自转的预测必然是真值，也不能宣称产品在 1900—2099 全范围具有 2 秒民用时精度。
产品输入范围和实际时间精度应分别说明。建议避免全范围“精确到秒”的承诺；若将来要提供此承诺，须明确 UTC/UT1、历史时制、闰秒与 DeltaT 更新政策，并按年代给出误差范围。
本次没有足够依据对 2099 时刻硬加 90 秒，更没有依据对 2026 时刻减 17 秒。

5. 页面实际展示字段

检查对象为 docs/chart-overview-draft/index.html 的真实奇门页面，正式 Vue 暂无该入口。
此前主对照已比较 707 例、12 个字段组；本包增加页面读取的辅助数据。

旬空地支、旬空宫位、时支驿马、驿马宫位：各 707/707 与 kinqimen 一致。
宫位仅由外部地支映射：子1、丑寅8、卯3、辰巳4、午9、未申2、酉7、戌亥6。
230 例空亡数组有同宫重复，如辰巳映射 [4,4]；页面用 includes() 按宫显示，无重复标记问题。
天禽寄干显示取中五地盘干和禽芮所在宫；其地盘/星盘来源已在原 707 例独立盘面对照中验证。
这是显示字段的引擎输出检查，不是浏览器渲染验收；浏览器验证由主任务负责。

暗干必须区分两种规则：
  产品：时干加值使真实落宫，三奇六仪按宫数阳顺阴逆；甲时以旬首六仪入中五。
  atopx：地盘干随值使门沿外八宫转动，中宫干保持原位，即门下藏干。
两种原始输出只 32/707 完全一样。675 个不同不能当作产品错误，ui-extra-comparison.json 保留全部原始结果。

进一步针对产品选定规则，另写按宫位直接求值的数学参考器，未调用本地暗干算法，也未使用产品值使输出：
  安法依据：百度知道《转盘奇门暗干排法》，2014-03-05 采纳原回答，明确区分甲时和非甲时。
  来源：https://zhidao.baidu.com/question/397640584.html
  输入：真实运行 atopx 的时柱、旬首、阴阳、未寄宫值使位置。
  结果：707/707 一致；82 甲时、75 非甲且真实值使落中五、550 非甲外宫。
  覆盖 18 种阴阳局、60 时柱、544 种局×时柱组合，未穷举全部 1080 种。

证据等级不能夸大：这是早于代码库的原始现代问答，当前提取作者匿名，不是古籍权威。
该答复未逐字规定中五寄前/寄后的选择；这里将数字飞宫按真实五宫起算，是明确写出的项目约定。
因而这 75 个中五案例证明“实现与所声明约定一致”，不证明所有流派都必须如此。
又检查 deminzhang/qimen-go 与 qimen-rs：二者采用“时干重地盘干则改中五”的另一变体，Rust 明确引用前者，不算两个独立同规则裁判。
每个实现提交、规则位置和证据局限见 hidden-stem-rule-summary.json。

页面规则建议：
“暗干采用时干加值使真实落宫，按三奇六仪、宫数阳顺阴逆排九宫；值使到中五仍以五宫起算，门显示寄坤二；甲时以旬首六仪入中五。”
主任务负责页面说明；本包不改 UI 或产品算法。

6. 重跑

已准备隔离依赖与星历。下列命令在仓库根 PowerShell 运行，除 Go 命令注明的工作目录外：

$py = 'C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
$node = 'C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $py -X utf8 docs/algorithm-benchmark-2026-10-13/qimen-astronomy/compute-jpl.py
& $node docs/algorithm-benchmark-2026-10-13/qimen-astronomy/compare-clock.cjs
& $py -X utf8 docs/algorithm-benchmark-2026-10-13/qimen-astronomy/analyze.py

Go 辅助字段运行：工作目录 .local-dev/qimen-benchmark/atopx-qimen
$env:GOCACHE='F:\github\xuan_agent\.local-dev\qimen-benchmark\go-build-cache'
$env:GOPATH='F:\github\xuan_agent\.local-dev\qimen-benchmark\go-mod-cache'
$env:GOTOOLCHAIN='local'
& 'F:\github\xuan_agent\.local-dev\qimen-benchmark\go-runtime\go\bin\go.exe' run 'F:\github\xuan_agent\docs\algorithm-benchmark-2026-10-13\qimen-astronomy\third-extra-runner.go' 'F:\github\xuan_agent\docs\algorithm-benchmark-2026-10-13\qimen\inputs.json' 'F:\github\xuan_agent\docs\algorithm-benchmark-2026-10-13\qimen-astronomy\third-extra-output.json'

回到仓库根：
& $py -X utf8 docs/algorithm-benchmark-2026-10-13/qimen-astronomy/compare-ui-extras.py
& $py -X utf8 docs/algorithm-benchmark-2026-10-13/qimen-astronomy/hidden-stem-rule-oracle.py
& $py -X utf8 docs/algorithm-benchmark-2026-10-13/qimen-astronomy/verify-evidence.py

初次部署可将 Skyfield1.54 / jplephem2.24 / numpy2.4.2 / sgp4 2.25 / certifi2026.7.22 安装到 .local-dev/qimen-astronomy/python-deps，并按上述原始 URL 下载星历与官方表；不写共享 node_modules。
其余 707 例主对照的准备及运行见 ../qimen/README.txt。

7. 文件索引

summary.json                       天文数值总表
jpl-de440s-2026.json                24 个完整 JPL 根、原始残差与来源
jpl-de440s-year-samples.json        六年 144 根及明确时间尺度标签
time-scale-comparison.json         真实产品太阳计算与 TT/UT1/UTC 拆分
delta-t-diagnosis.json             旧对照库 DeltaT 诊断及反事实
hko-minute-comparison.json         官方分钟表逐项比较
jpl-boundary-fixtures.json         JPL 前后 3 秒、48 个真实排盘结果
ui-extra-comparison.json           707 例辅助字段和两种暗干原始差异
hidden-stem-rule-comparison.json   有来源的选定暗干约定参考器、707 个结果
provenance.json                    源代码、星历、时间资料的固定哈希
verification.json                 数据完整性和实际断言结果
artifact-manifest.json             本目录产物哈希清单（不含清单自身）
