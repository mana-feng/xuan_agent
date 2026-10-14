奇门跨实现实测，2026-10-13

结果
产品与第三套 Go 实现 atopx/qimen：707/707 组在 12 类归一字段上全部一致。
最先选取的 Python 实现 kinqimen 原样运行后：707/707 能运行，七项核心字段
同时一致 670/707；完整 12 类字段一致 0/707。这个 0 主要来自神盘规则及其
阴遁环序差异，绝不能作为产品错误率。两套基准的原始结果和差异都保留。
本次没有更改产品算法或任何第三方算法，也没有证明术数预测效果。

输入与覆盖
707 个去重后的北京时间输入：576 个普通格点（2026 每月 1/8/15/22 日，
每两小时一个）；72 个节气边界（24 节气所在分钟的前/当/后一分钟）；
28 个晚子时/月末/年末边界；30 个 1900/1984/2000/2024/2099 年份样本；
4 个闰日样本。类别有重叠。覆盖全部阳遁、阴遁各九局；旬首六仪在中五
109 例，时干在中五 75 例。后三项分类由实际产品输出得到，不代表独立预言值。

                           kinqimen 核心字段一致       atopx 12 类字段一致
普通格点                      576 / 576                  576 / 576
节气边界                       38 / 72                    72 / 72
晚子时                         25 / 28                    28 / 28
年份抽样                       30 / 30                    30 / 30
闰日                            4 / 4                      4 / 4
旬首中五                      106 / 109                  109 / 109
时干中五                       65 / 75                    75 / 75
总计                          670 / 707                  707 / 707

核心字段 = 四柱、局数/三元/节气、时旬首六仪、九宫地盘干、值符落宫、
值使落宫、值使门。12 类完整比较额外含外八宫天盘干、星盘、门盘、神盘、
值符星（以及上述独立字段，详见 summary.json/coreFields 和 fieldCounts）。
归一只处理：宫名到宫号、简繁字、简称的“天/门/元”显示后缀、禽芮组合显示、
中五首领落宫寄坤二显示。未把勾陈/朱雀改成白虎/玄武，未交换任何宫位，
未替换任何基准计算函数。rawChiefPalaces 保留 Go 实现未寄宫前的首领位置。
未比较暗干、解读文案、吉凶、长生、旬空、马星等本轮范围外字段。

第一基准差异归因（原始输出保留，不修改以追求通过率）
1. 神盘：kinqimen 阳遁使用勾陈/朱雀，产品和 Go 使用白虎/玄武；有实质
   名称/规则分歧，不合并为同义词。全部 361 阳遁样本神盘至少有名称差异。
2. 阴遁：kinqimen config.py:23 把八宫序列写成“艮乾兑坤离巽震坎”；
   正常逆时针序列从艮开始是“艮坎乾兑坤离巽震”。这不是整个圆环的平移或
   反向，而是交换了坎/艮在圆环中的位置。其 pan_star/pan_door/pan_god
   使用这段特殊序列，pan_sky 却仍用 clockwise_eightgua 的反向序列，
   导致内部层间不一致。346 个阴遁样本星/门/神均有差异。
   Go 固定圆环实际运行 346/346 与产品一致，因此目前证据支持产品的环序，
   不支持为迎合 Python 基准而交换产品宫位。
3. 普通样本天盘：571/576 相同，余下 5 例均“旬首在坤二、时干在中五”。
   例 2026-06-01 18:00，地盘坤二辛、中五丁，时柱丁酉，旬首辛。
   中五寄坤二后，天盘起宫 2 → 落宫 2，转动 0 步，故天盘主干应等于地盘。
   产品和 Go 都如此，坤二天盘辛；Python 却返回坤二天盘丙。
   kinqimen.py:171-173 在该条件下以 reversed(a)[0] 重排天盘，额外转动。
   五例依次为 2026-06-01 18:00、06-08 06:00、09-01 16:00、
   09-08 00:00、09-15 18:00；第三套实际执行五例全支持产品。
4. 交节：33 个局数/地盘差异全部发生在节气样本；24 个是 Python API
   把交节秒数压到所在分钟（源码只保留 hour/minute），另 9 个处在不同
   历法库的秒级时刻差异窗口。另有 6 个四柱年干支差异靠近立春：Python
   getYearGZ 使用日级立春年界，晚子时又先换到次日；产品用交节时刻。
   这些计数可重叠，不能加总为独立错误数。

独立性与精度限制
产品 qfdk/qimen + 本地 xuan-1 补丁、Python kinqimen、Go atopx/qimen
是分别维护、不同语言的奇门排盘实现；源码检查未发现后两者导入 qfdk。
这不证明它们没有共同参考材料。历法层面尤其不能声称完全独立：sxtwl
官方说明其来自寿星天文历，产品 lunar-javascript 使用 ShouXingUtil，
Go 的 almanac/tables_xl.go 也注明寿星来源。

2026 年 24 个节气，lunar-javascript 1.7.7 比 sxtwl 2.0.6 晚
16.552—18.699 秒。直接以 sxtwl 秒值判定 72 个分钟输入时，产品相同
63/72，9/72 在两个引擎交节时刻之间。第三套 Go 在这批输入与产品一致，
但这不构成完全独立天文权威的裁决。尚未用独立天文台秒级数据判定谁更准；
不能声称秒级天文精度已验收，也不能直接把这 9 例定为产品 bug。

基准来源及固定版本
产品：qfdk/qimen 1d0d1c5b39755e67525a11e68bab9b73baae1937 + xuan-1；
实际从 src/utils/qimenCalculation.ts 加载，不重写产品计算。
Python：https://github.com/kentang2017/kinqimen/tree/127ead87aa24a74d40c893a5351e22a1a89d0945
入口 Qimen(y,m,d,h,m).pan(1)，Python 3.12.14，sxtwl 2.0.6、ephem 4.1.6、
bidict 0.23.1。只安装排盘实际需要的依赖，没有安装 Streamlit 界面。
Go：https://github.com/atopx/qimen/tree/8eb06d007d4a5fcc5352d9054f81469e5f023f45
入口 qimen.From(st, MethodTime, StyleRotate, JuRuleChaiBu)，Go 1.26.0，
无第三方 Go 依赖。此库规模小，作为第三方复核，不作为无条件金标准。
星/天盘规则原始来源：
https://github.com/atopx/qimen/blob/8eb06d007d4a5fcc5352d9054f81469e5f023f45/plate/builders.go#L20-L59
https://github.com/atopx/qimen/blob/8eb06d007d4a5fcc5352d9054f81469e5f023f45/internal/tables/tables.go#L14-L20
Python 异常分支：
https://github.com/kentang2017/kinqimen/blob/127ead87aa24a74d40c893a5351e22a1a89d0945/kinqimen.py#L155-L177
https://github.com/kentang2017/kinqimen/blob/127ead87aa24a74d40c893a5351e22a1a89d0945/config.py#L21-L23
历法来源说明：https://github.com/yuangu/sxtwl_cpp

文件导航
inputs.json：实际输入，含原始节气锚点和样本类别。
product-output.json / external-output.json / third-output.json：三套实际输出。
comparison.json / third-comparison.json：逐例逐字段比较，保留归一前原始文件。
summary.json / third-summary.json：全部计数，第三方源码哈希。
diagnostic-cases.json：5 个天盘争议、年界和交节差异。
calendar-term-differences.json：24 节气两历法秒差。
independent-solar-term-check.json：72 个分钟输入相对于 sxtwl 秒值的结果。
provenance.json：产品/Python 源码及历法文件 SHA256、输入 SHA256、环境。
benchmark.py / product-runner.cjs / third-runner.go：可复现执行和比较程序。
artifact-manifest.json：本证据目录文件的 SHA256。

复现（PowerShell，从项目根目录执行；已装依赖时跳过下载）
$py = 'C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
$node = 'C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$repo = (Get-Location).Path
$bench = Join-Path $repo 'docs/algorithm-benchmark-2026-10-13/qimen'

git clone https://github.com/kentang2017/kinqimen.git .local-dev/qimen-benchmark/kinqimen
git -C .local-dev/qimen-benchmark/kinqimen checkout 127ead87aa24a74d40c893a5351e22a1a89d0945
& $py -m pip install --target .local-dev/qimen-benchmark/python-deps sxtwl==2.0.6 ephem==4.1.6 bidict==0.23.1
& $py -X utf8 "$bench/benchmark.py" prepare
& $node "$bench/product-runner.cjs"
& $py -X utf8 "$bench/benchmark.py" baseline
& $py -X utf8 "$bench/benchmark.py" compare

git clone https://github.com/atopx/qimen.git .local-dev/qimen-benchmark/atopx-qimen
git -C .local-dev/qimen-benchmark/atopx-qimen checkout 8eb06d007d4a5fcc5352d9054f81469e5f023f45
Invoke-WebRequest 'https://go.dev/dl/go1.26.0.windows-amd64.zip' -OutFile .local-dev/qimen-benchmark/go1.26.0.windows-amd64.zip
# 此次下载 ZIP 的 SHA256：9bbe0fc64236b2b51f6255c05c4232532b8ecc0e6d2e00950bd3021d8a4d07d4
Expand-Archive .local-dev/qimen-benchmark/go1.26.0.windows-amd64.zip .local-dev/qimen-benchmark/go-runtime
$env:GOCACHE = Join-Path $repo '.local-dev/qimen-benchmark/go-build-cache'
$env:GOPATH = Join-Path $repo '.local-dev/qimen-benchmark/go-mod-cache'
$env:GOTOOLCHAIN = 'local'
$go = Join-Path $repo '.local-dev/qimen-benchmark/go-runtime/go/bin/go.exe'
Push-Location .local-dev/qimen-benchmark/atopx-qimen
& $go run "$bench/third-runner.go" "$bench/inputs.json" "$bench/third-output.json"
Pop-Location
& $py -X utf8 "$bench/benchmark.py" third-compare

复现会覆盖本目录输出。若只审计此次结果，直接读取原始 JSON 和哈希即可。
Python 基准耗时约 62 秒；Go 首次编译及707例执行约 6 秒。无需启动服务、
浏览器或改动生产代码。本目录不包含完整的应用 UI 验收证据。
