"""Render the local verification report from completed benchmark artifacts."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
read = lambda name: json.loads((ROOT / name).read_text(encoding='utf-8-sig'))
natal = read('ziwei-extended/after-summary.json')
flows = read('ziwei-flows/summary.json')['counts']
zones = read('timezones/summary.json')
astro = read('qimen-astronomy/summary.json')
ui = read('../ui-benchmark-2026-10-13/verification.json')
assert natal['unresolved'] == natal['brightnessDifferences'] == flows['unresolved'] == flows['confirmedRuleMismatch'] == zones['differences'] == 0
assert ui['automatedChecks']['tests']['failed'] == 0
tests = ui['automatedChecks']['tests']['passed']
html = f'''<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>排盘验证与界面复验 · 2026-10-13</title>
<style>body{{margin:0;background:#f1f7f7;color:#203d45;font:15px/1.8 system-ui,"Microsoft YaHei",sans-serif}}main{{max-width:1100px;margin:auto;padding:36px 24px}}h1{{font-size:30px;line-height:1.35}}h2{{font-size:22px;margin-top:0}}h3{{font-size:17px}}section{{background:#fff;border:1px solid #dbe9e8;border-radius:16px;margin:22px 0;padding:26px}}.eyebrow{{color:#27807a;letter-spacing:2px;font-size:12px}}a{{color:#087d90;text-underline-offset:4px}}.metrics{{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}}.metrics div{{background:linear-gradient(120deg,#e5f2fa,#e6f5ef);border-radius:12px;padding:18px}}.metrics strong{{display:block;font-size:27px}}.muted{{color:#627a80;font-size:13px}}.note{{padding:14px 18px;background:#fff5df;border-left:3px solid #c89538}}table{{border-collapse:collapse;width:100%;margin:16px 0}}th,td{{padding:10px;text-align:left;border-bottom:1px solid #dce6e7;vertical-align:top}}th{{background:#f0f7f7}}.gallery{{display:grid;grid-template-columns:2fr 1fr;gap:18px;align-items:start}}figure{{margin:0}}img{{width:100%;display:block;border:1px solid #dce6e7;border-radius:10px}}figcaption{{font-size:13px;color:#627a80;margin:8px 0}}.links{{display:flex;flex-wrap:wrap;gap:10px 22px}}@media(max-width:700px){{main{{padding:20px 14px}}section{{padding:18px}}.metrics,.gallery{{grid-template-columns:1fr}}table{{font-size:12px}}td,th{{padding:7px}}h1{{font-size:25px}}}}</style></head><body><main>
<div class="eyebrow">XUAN · VERIFICATION · 2026.10.13</div><h1>排盘验证与界面复验</h1>
<p>已补齐上一轮遗漏的辅星、杂曜、亮度、运限、时区和交节天文对照。结论限于记录的输入、字段与明确安法；原始差异保留，流派约定不冒充完全一致。测试使用真实排盘算法，账号和 AI 接口使用隔离模拟服务。</p>
<div class="metrics"><div><strong>{natal['cases']:,}</strong>紫微本命输入 · {natal['checks']:,} 个字段比较</div><div><strong>{flows['cases']:,}</strong>运限输入 · {flows['fields']:,} 个字段比较</div><div><strong>{zones['cases']:,}</strong>出生时区输入 · 13 个时区</div></div>
<section><h2>实际修复的问题</h2><table><tr><th>问题</th><th>修复后的行为</th></tr>
<tr><td>旧版酉宫三项亮度</td><td>太阳为平、太阴为旺、七杀为旺。原典表先发现差异，上游 <a href="https://github.com/SylarLong/iztro/releases/tag/v2.6.1">2.6.1 发布记录</a>确认同三项错误；本地定点修正，未替换共享依赖。</td></tr>
<tr><td>晚子时跨春节／闰月，流时遇设备午夜夏令时缺口</td><td>主盘、时间轴与导出使用同一完整换日规则；明确的子时时辰不再被设备 Date 归一化成丑时。</td></tr>
<tr><td>春节前后虚岁与大限年份偏移</td><td>时间轴与 AI 导出用农历年初定位虚岁，所有大限锚点与声明年龄一致。</td></tr>
<tr><td>闰月与普通月同时选中</td><td>按实际月份日期区间独立选中；晚子跨入闰月同步切换。</td></tr>
<tr><td>121 虚岁起小限无效</td><td>按十二年循环延续正确宫位；无效运限返回明确空状态。</td></tr>
<tr><td>运限四化消失、三方四正错位、详情飞化滞后</td><td>四化对应实际星曜所在宫位，选中宫的关系保持物理位置；弹窗读取最新计算结果。AI 导出保持相同聚焦宫。</td></tr></table>
<p>布局保留蓝绿渐变和侧边栏。总览突出主星与四化，完整辅星、杂曜和神煞放在桌面右侧或移动端弹窗，基础信息字号与间距已压缩。</p>
<div class="gallery"><figure><a href="../ui-benchmark-2026-10-13/after-flow-desktop.png"><img src="../ui-benchmark-2026-10-13/after-flow-desktop.png" alt="桌面真实流月命盘及宫位详情"></a><figcaption>桌面 1280 px：真实排盘、流月四化与物理宫位关联。</figcaption></figure><figure><a href="../ui-benchmark-2026-10-13/after-flow-mobile.png"><img src="../ui-benchmark-2026-10-13/after-flow-mobile.png" alt="手机真实流月命盘"></a><figcaption>手机 390 px：紧凑十二宫，详情按需展开。</figcaption></figure></div>
<div class="links"><a href="../ui-benchmark-2026-10-13/before-result.png">修改前</a><a href="../ui-benchmark-2026-10-13/after-flow-tablet.png">平板命盘</a><a href="../ui-benchmark-2026-10-13/after-flow-detail-mobile.png">手机详情</a><a href="../ui-benchmark-2026-10-13/after-form-mobile.png">手机表单</a><a href="../ui-benchmark-2026-10-13/month-selection-interactions.json">13 个月份逐项点击</a></div></section>
<section><h2>紫微本命：扩展字段与独立原典</h2><p><a href="https://github.com/airicyu/fortel-ziweidoushu">Fortel 1.3.4</a> 独立安星实现，结合固定版本<a href="https://zh.wikisource.org/w/index.php?oldid=1963110&amp;title=紫微斗數全書/卷二">《紫微斗数全书》卷二</a>表与具名安法文献。每盘 81 个核心字段重新计算，另加 295 个扩展字段；3 个 1900 年初日期用独立 sxtwl 历法补齐，额外 183 项补证。</p>
<table><tr><th>覆盖</th><th>结果</th></tr><tr><td>主星、命身宫、五行局、大限、农历元数据等原 81 字段</td><td>18,433 个输入重跑，保留 10,180 个戊／庚／壬化科差异</td></tr><tr><td>14 辅星、35 杂曜、命主身主、长生／博士／将前／岁前、小限年龄</td><td>按独立、已声明安法比较；小限年龄 2,211,960 项</td></tr><tr><td>亮度</td><td>368,660 次比较，232 个可达星曜×地支格全部覆盖；修复前 3,747 次错误，修复后 0</td></tr><tr><td>全部字段</td><td>{natal['equal']:,} 项相等，10,180 项已声明四化差异；未解释差异 0</td></tr></table>
<p class="note">不是直接宣称 Fortel 全相同：两方原始结果还保留命主取法、天伤天使、空曜拆分／命名和四化等差异，扩展包逐项展示其原始值与采用依据。Fortel npm 与声明 Git 提交的辛年魁钺表也有版本差别，实际执行的 npm 包已单独固定。</p><p>旧运行结束才采集源码哈希，期间生产源码已更新；该原始哈希记录保留，<a href="ziwei-extended/corrected-run-manifest.json">更正说明</a>指向保存的修复前源码与当时预检证据。修复后运行在启动时固定源码哈希。</p>
<div class="links"><a href="ziwei-extended/report.html">扩展完整报告与逐字段清单</a><a href="ziwei-extended/after-summary.json">最终汇总</a><a href="ziwei-extended/after-verification.json">逐行复核</a><a href="ziwei-extended/reproduce.ps1">复现脚本</a><a href="ziwei-extended/source-notes.json">来源与被排除的同源候选</a></div></section>
<section><h2>运限与时间轴：独立公式、原始库结果同时保留</h2><p>本轮 {flows['cases']:,} 个输入，正常命盘每个 189 字段，覆盖大限、流年、流月、流日、流时的宫位、干支、四化和动态星曜，以及小限、流年将前／岁前。五层均覆盖十干、十二支和十二个命宫位置。</p>
<p>{flows['equal']:,} 个字段相等；5,940 个四化流派差异保留，未解释差异 0；12 个出生农历年前的输入正确拒绝。独立公式明确采用项目已声明的晚子换日和闰月十五／十六分界。原始 Fortel 运限 API 的 19,104 次宫位比较中，556 次不同单列：412 次闰月约定、144 次童限约定。</p>
<p>时间轴另验 1,280 个年份行、1,280 次大限选择、1,598 个农历月首日与 128 次唯一月份选择；追加 18 个换日边界、162 字段。7 个设备时区×2 个出生时区×9 个时间边界，共 126 例／23,814 个字段，含圣保罗历史午夜夏令时缺口。</p>
<div class="links"><a href="ziwei-flows/report.html">运限完整报告</a><a href="ziwei-flows/summary.json">最终汇总</a><a href="ziwei-flows/selection-results.json">时间轴独立比较</a><a href="ziwei-flows/sources.json">公式依据与规则约定</a><a href="ziwei-flows/reproduce.ps1">复现脚本</a></div></section>
<section><h2>出生时区：跨实现与时区跳变核验</h2><p>生产 Intl/ICU 对照 Python zoneinfo，覆盖 1900—2099 年、页面 10 个时区及 Lord Howe、Kathmandu、Apia，共 13 个时区。扫描 1,712 个偏移跳变，包含 3,320 个缺失时刻与 4,996 个重复时刻；{zones['disambiguationChecks']:,} 项选择策略检查和 {zones['roundTrips']:,} 次往返，差异为 0。</p><p class="muted">两者换算实现独立，历史时区数据共同以 IANA 为权威；这不等于重新考证全部历史时制或穷举世界所有时区。</p><div class="links"><a href="timezones/README.txt">方法与复现</a><a href="timezones/reference.json">参考版本及输入清单</a><a href="timezones/summary.json">最终结果</a></div></section>
<section><h2>奇门：707 例盘面与独立天文裁决</h2><p>真实引擎为 qfdk/qimen 加本地修正，时家转盘、符头拆补、23 点换日、中五寄坤二。对照实际运行的 Python <a href="https://github.com/kentang2017/kinqimen">kinqimen</a> 和 Go <a href="https://github.com/atopx/qimen">atopx/qimen</a>，来源固定，原始差异不删除。</p>
<table><tr><th>比较</th><th>实际结果</th></tr><tr><td>Go 盘面 12 类字段</td><td>707 / 707；规则和显示规范化见原始报告</td></tr><tr><td>Python</td><td>7 项核心 670 / 707，完整 12 类 0 / 707；阴遁宫序、八神名称、中五与交节差异保留</td></tr><tr><td>旬空地支／宫位、驿马地支／宫位</td><td>各 707 / 707</td></tr><tr><td>选定暗干安法</td><td>独立数学参考器 707 / 707，含 82 甲时、75 值使真实中五；Go 另一暗干法原始仅 32 / 707 相同</td></tr><tr><td>2026 全 24 节气对 NASA JPL DE440s＋Skyfield</td><td>产品误差 −1.520658 至 +1.550475 秒；HKO 最近分钟 24 / 24；前后 3 秒排盘 48 / 48</td></tr></table>
<p>此前约 17 秒争议的主要原因是 sxtwl 旧 DeltaT 外推。仅校正其时间尺度后，残差缩至约 −1.28～+1.70 秒，因此没有给产品机械减去 17 秒。1900、1950、2000、2026、2050、2099 共 144 个节气根，天体 TT 模型最大差约 2.22 秒。</p>
<p class="note">2026 的实测精度不能扩展为全部年份保证：未来 UTC 闰秒未知，2099 的地球自转预测模型差约 90 秒。暗干依据为早于引擎的现代原始问答，中五从真实五宫起算是明确项目约定；不声称古籍或所有流派统一。</p>
<p>浏览器另用同一基准案例逐一点击九宫，核对神、星、门、天盘干、地盘干、暗干共 54 项，以及中宫、寄干、旬空和驿马标记；手机和平板可展开完整详情。</p>
<div class="links"><a href="qimen/README.txt">三套盘面报告</a><a href="qimen-astronomy/README.txt">独立天文与辅助字段完整报告</a><a href="qimen-astronomy/verification.json">16 项证据校验</a><a href="qimen-astronomy/hidden-stem-rule-summary.json">暗干来源与约定</a><a href="../ui-benchmark-2026-10-13/qimen-palace-interactions.json">九宫浏览器核对记录</a><a href="../ui-benchmark-2026-10-13/qimen-desktop.png">真实九宫截图</a></div></section>
<section><h2>最终验证与本地入口</h2><p>前端 <strong>{tests} / {tests}</strong> 项测试通过，TypeScript 检查、H5 构建与改动范围差异检查通过。正式紫微页面在 390／834／1280 px 验证，页面无横向溢出，运限切换、十二宫详情、月选中状态与焦点恢复有实测记录。构建仍有既有动态导入分包提示。</p><div class="links"><a href="../ui-benchmark-2026-10-13/tests.txt">测试日志</a><a href="../ui-benchmark-2026-10-13/build.txt">构建日志</a><a href="../ui-benchmark-2026-10-13/verification.json">验收记录</a><a href="../ui-benchmark-2026-10-13/final-review.txt">独立审查</a><a href="http://127.0.0.1:4174/#/pages/ziwei/index">正式紫微页面</a><a href="http://127.0.0.1:4175/">真实奇门草稿</a></div><p class="muted">奇门当前接入的是真实算法 HTML 草稿；正式 Vue 暂无奇门入口。浏览器响应式检查不等于原生真机验收，模拟账号／AI 响应不等于生产后端验收。本地入口依赖开发服务保持运行。</p></section>
</main></body></html>'''
html = html.replace('final-review.txt', 'review.txt').replace('1,280 次大限选择', '1,536 次大限选择').replace('162 字段', '180 字段')
html = html.replace('7 个设备时区×2 个出生时区×9 个时间边界', '另以 sxtwl 补充 Fortel 的参考历法范围，1900／2099 年首尾出生×男女，96 个大限起点、8 个末限最后有效日及 8 个越界拒绝，共 19,664 字段，234 个已知四化差异、0 未解释差异、0 跳过。7 个设备时区×2 个出生时区×9 个时间边界')
(ROOT / 'index.html').write_text(html, encoding='utf-8')
print('Rendered index.html from completed benchmark summaries.')
