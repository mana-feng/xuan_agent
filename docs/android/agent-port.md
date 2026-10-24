# 原生 Agent 建议解析

实现：app/src/main/kotlin/com/xuan/app/AgentActions.kt；测试：app/src/test/kotlin/com/xuan/app/AgentActionsTest.kt。

参考 frontend src/features/agent/runtime.ts 的 AGENT_ACTION HTML 注释协议，仅移植“解释模型建议为排盘或导航参数”这一边界。没有 JavaScript 运行时、自然语言推测、代码执行器或后台动作循环。

## 调用契约

父层只对实际 assistant 消息调用 AgentActions.parse(text)，不要对 user、system 或引用的历史文本调用。parse 接收单条消息，返回 AgentSuggestion?；它不会执行排盘、跳转页面、发网络请求或读系统当前时间。

AgentSuggestion.execute=true 表示数据已通过校验，可以在用户点击明确的操作按钮后执行，不表示自动执行。父层负责点击后的页面/排盘操作及线程上下文。visibleText(text) 隐藏完整和截断的 AGENT_ACTION 注释，保留其余正文。systemPrompt() 返回中文的原生协议约束与动作示例。

字段：
- label：操作按钮文字。
- target：bazi、liuyao、ziwei、qimen、history 之一。
- input：校验后的 ChartInput；导航时为 null。
- execute：只有完整有效的 run_bazi_chart、run_ziwei_chart、run_liuyao_chart 才为 true。

## 允许与拒绝

八字/紫微 payload 必须明确给出公历 date=YYYY-MM-DD、time=HH:mm 和 JSON 整数 gender=0/1。字符串性别、布尔值、浮点0.0、缺少任一资料都拒绝，不从正文提取或猜测。realname 可选，用作结果标题。

六爻 payload.title 必填且非空。明确给出有效 date/time 才可排盘；缺少任一个时间字段时，返回 target=liuyao、execute=false、input=null，让用户到页面确认。不会用“现在”替代。明确给出但无效的日期时间直接拒绝。

可选 payload.timeZone 默认 Asia/Shanghai；借助 CalendarEngine.civil 校验真实日期、1900—2099 范围、有效时区、DST 空缺和歧义。重复时间必须由用户明确提供如 -04:00 的偏移时区。当前 parser 不读取设备时区；父层若有活动时区，应通过提示上下文要求模型显式提供，再照同一校验路径处理。

navigate 只能使用允许列表，永远 execute=false。奇门只允许 navigate；none、focus_ziwei_palace、未知动作、外部 URL 目标均返回 null。原生版不提供宫位聚焦控制，父层可在正文提示用户打开紫微页查看。

每条消息最多65,536字符，动作标记最多8,192字符。必须恰好一个独占一行、位于代码块以外的标记。JSON 使用 Gson 的严格流式读取，拒绝畸形文法、重复键、多根值、超过8层嵌套或每个对象/数组超过64项的内容。已知字段要求真实类型，禁止 JSON 强制转换。未知字段在这些大小/深度限制内允许，但完全忽略；它们不会形成可执行代码或修改目标/输入。标题最长120字符，按钮最长64字符，拒绝控制字符。

## 验证

先编写8项行为测试并运行 TODO API 骨架，观察到8/8 NotImplementedError失败，再实现 parser。完成后直接 Kotlin1.9.22/JUnit4.13.2 对 AgentActionsTest 运行结果为8测试通过；随后运行整个 app 纯 JVM 测试集合，15测试通过。编译输出有其他任务进行中的 BaziDetails TODO 参数警告及 AiProtocol 冗余变量警告；本 parser 无编译警告。

测试覆盖三类完整排盘、缺失资料、六爻无时间降级、性别及日期强类型、真实日历/DST、允许列表、未知动作、重复标记、代码块、截断标记、重复键、非标准JSON、超长输入以及正文清理。没有真实模型/API或Android设备交互验证；界面按钮接线由父任务验证。

复现：
~~~powershell
$env:JAVA_HOME='C:/Program Files/Eclipse Adoptium/jdk-21.0.5.11-hotspot'
& ./android-app/tools/test-app-direct.ps1 -TestClasses com.xuan.app.AgentActionsTest
& ./android-app/tools/test-app-direct.ps1
~~~
