紫微出生时区独立换算验证 · 2026-10-13

实际比较生产 chartTime.ts 的 Intl/ICU 换算与 Python zoneinfo。
Node 24.19.0 / ICU 78.3 / IANA 2026b；Python 3.12.14 / tzdata 2026.5 / IANA 2026e。
两者实现独立，但使用共同的 IANA 历史时区权威；本报告不声称重新考证了所有历史时制。

范围：1900—2099 年，页面全部 10 个可选时区，以及 Lord Howe、Kathmandu、Apia 共 13 个时区。
按 UTC 扫描并精确定位 1,712 个偏移变化点，生成季度固定点、跳变前后 1 秒/30 分钟及重复/缺失区间中点。
27,300 个输入（18,984 个不同输入）；包含 3,320 个不存在的钟表时刻与 4,996 个重复时刻。
reject / earlier / later 三种策略合计 81,900 项校验，另有 28,976 次往返；差异为 0。
不是全部世界时区、全部分钟穷举，也不是手机操作系统的原生时区数据库验收。

文件：
reference.py / reference.json：独立参考器、版本、范围及输入 SHA256。
inputs.json / transitions.json：固定输入、真实 UTC 候选值与时区跳变。
compare.cjs / summary.json / differences.json：生产换算比较器、汇总、原始差异。

复现（项目根目录，Node 与 Python 在 PATH 时）：
  python -X utf8 docs/algorithm-benchmark-2026-10-13/timezones/reference.py
  node docs/algorithm-benchmark-2026-10-13/timezones/compare.cjs
Python 需已安装 tzdata。本次使用 Codex 自带 Python 的 tzdata；不写共享 node_modules。

主来源：https://docs.python.org/3/library/zoneinfo.html
