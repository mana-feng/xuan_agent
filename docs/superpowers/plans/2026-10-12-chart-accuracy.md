# 排盘边界校验与真实奇门接入 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task in the current working tree. Preserve existing UI changes.

**Goal:** 验证并修正紫微子时、闰月、时区边界，将真实开源奇门计算接入现有九宫预览。

**Architecture:** 共用显式 IANA 时区转换；紫微在适配层统一 23 点换日后调用固定版本 iztro，保留真实出生时刻与计算历日。奇门引入固定提交的 qfdk/qimen 核心，通过薄适配层输出九宫，预览由浏览器本地计算，不使用 mock 回退。

**Tech Stack:** Vue/uni-app, TypeScript, iztro 2.5.7, lunar-javascript, vendored qfdk/qimen MIT, node:test, esbuild.

**Spec:** 用户本轮要求及本文件规则约定。

## Constraints and rules

- 紫微通行规则：农历正月初一换年；23:00 按次日子时完整换日；闰月前十五日按本月、十六日起按下月；民用钟表时，不计算真太阳时。
- 出生时区随记录保存；旧记录无时区则保留当前设备解释并明确提示待确认，不猜测原始出生地。
- 夏令时不存在时间拒绝；重叠时间须明确选择较早/较晚。
- 奇门范围为当前 HTML 九宫预览和可复用计算模块，不扩展账号、AI 或历史业务模块。
- 奇门时家转盘、符头拆补、交节时刻定局、23 点换日、中五寄坤二；时间统一北京时间。上游 README 的“茅山”与测试的“置闰”不能当作实际实现依据。
- 不改共享 node_modules；保留上游许可证、提交 SHA、文件哈希和补丁说明。

## Tasks

- [x] 1. 保存改动前失败证据；用香港天文台日期表、安命身诀和手算盘构建有来源的断言。
- [x] 2. 新建 chartTime.ts 与 ziweiCalculation.ts；时区、非法时间、DST、子时跨月/年/闰月测试先失败后修复。
- [x] 3. 接通紫微表单/store/保存/恢复/导出规则元数据；修复既有 summaryGroups 测试过时引用。
- [x] 4. 固定 qfdk/qimen 提交，校验节气与子时边界；必要修正限定在带说明的 vendor 补丁。验证九宫核心字段。
- [x] 5. 预览接入真实计算及日期/时区输入，替换全部假星曜、局数、标记；计算失败不展示旧盘为新结果。
- [x] 6. 跑单测、类型检查、H5 构建、手机/平板浏览器交互；保留结果 JSON 和审计说明。

## Review focus

- 子时完整换日包含月、年、四化，而不仅是日数加一。
- 闰月十五的 23 点等同闰月十六的 00 点。
- 同一 timestamp + timeZone 跨宿主 TZ 输出不变，历史/编辑往返不丢规则。
- 交节前后一分钟和中五旬首的值使数宫不提前寄宫。
- 真实盘所有 UI 摘要与宫位/详情来自同一结果；上游回归一致不等于独立准确性证明。

## Verification completed

148/148 tests; typecheck exit 0; H5 build exit 0. Independent code review completed; restored Timeline civil-date semantics and added a regression test. Real browser checks and source evidence are in docs/algorithm-audit/report.html.
