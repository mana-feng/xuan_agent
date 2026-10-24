package com.xuan.app

import com.google.gson.JsonArray
import com.google.gson.JsonElement
import com.google.gson.JsonNull
import com.google.gson.JsonObject
import com.google.gson.JsonPrimitive
import com.google.gson.internal.LazilyParsedNumber
import com.google.gson.stream.JsonReader
import com.google.gson.stream.JsonToken
import com.xuan.core.CalendarEngine
import com.xuan.core.ChartInput
import java.io.StringReader

/** A validated suggestion. execute means eligible to calculate after the user clicks its button. */
data class AgentSuggestion(val label: String, val target: String, val input: ChartInput?, val execute: Boolean)

/** Call only for assistant messages. This parser neither performs actions nor fills missing facts. */
object AgentActions {
    private const val PREFIX = "<!--AGENT_ACTION:"
    private const val MAX_TEXT = 65_536
    private const val MAX_MARKER = 8_192
    private val markerStart = Regex("""<!--\s*AGENT_ACTION\b""")
    private val hiddenMarker = Regex("""<!--\s*AGENT_ACTION\b[\s\S]*?(?:-->|$)""")
    private val targets = setOf("bazi", "liuyao", "ziwei", "qimen", "history")
    private val datePattern = Regex("""\d{4}-\d{2}-\d{2}""")
    private val timePattern = Regex("""\d{2}:\d{2}""")

    fun parse(text: String): AgentSuggestion? = try {
        parseChecked(text)
    } catch (_: Exception) {
        null
    }

    private fun parseChecked(text: String): AgentSuggestion? {
        if (text.length > MAX_TEXT) return null
        val starts = markerStart.findAll(text).take(2).toList()
        if (starts.size != 1) return null
        val start = starts.single().range.first
        if (!text.startsWith(PREFIX, start)) return null
        val close = text.indexOf("-->", start + PREFIX.length)
        if (close < 0 || close + 3 - start > MAX_MARKER) return null
        val before = text.substring(text.lastIndexOf('\n', start).let { it + 1 }, start)
        val nextLine = text.indexOf('\n', close + 3).let { if (it < 0) text.length else it }
        if (before.isNotBlank() || text.substring(close + 3, nextLine).isNotBlank()) return null
        if (insideFence(text.substring(0, start))) return null
        val json = text.substring(start + PREFIX.length, close)
        val reader = JsonReader(StringReader(json)).apply { isLenient = false }
        val root = reader.use {
            val value = readValue(it, 0)
            require(it.peek() == JsonToken.END_DOCUMENT) { "Trailing JSON" }
            require(value.isJsonObject) { "Object required" }
            value.asJsonObject
        }
        val type = requiredString(root, "type")
        val customLabel = optionalString(root, "label")?.trim()?.takeIf { it.isNotEmpty() }
        require(customLabel == null || (customLabel.length <= 64 && customLabel.none { it.isISOControl() }))
        optionalString(root, "reason")
        if (type == "none" || type == "focus_ziwei_palace") return null
        if (type == "navigate") {
            val target = requiredString(root, "target")
            if (target !in targets) return null
            return AgentSuggestion(customLabel ?: navigationLabel(target), target, null, false)
        }
        val target = when (type) {
            "run_bazi_chart" -> "bazi"
            "run_ziwei_chart" -> "ziwei"
            "run_liuyao_chart" -> "liuyao"
            else -> return null
        }
        val payload = root.get("payload")?.takeIf { it.isJsonObject }?.asJsonObject ?: return null
        val isLiuyao = target == "liuyao"
        val title = if (isLiuyao) requiredString(payload, "title").trim() else optionalString(payload, "realname")?.trim().orEmpty()
        require(title.length <= 120 && title.none { it.isISOControl() })
        if (isLiuyao && title.isEmpty()) return null
        val date = optionalString(payload, "date")
        val time = optionalString(payload, "time")
        val zone = optionalString(payload, "timeZone") ?: "Asia/Shanghai"
        if (isLiuyao && (date.isNullOrBlank() || time.isNullOrBlank())) {
            return AgentSuggestion(navigationLabel(target), target, null, false)
        }
        if (date == null || time == null || !datePattern.matches(date) || !timePattern.matches(time)) return null
        val gender = if (isLiuyao) 0 else {
            val value = payload.get("gender") ?: return null
            if (!value.isJsonPrimitive || !value.asJsonPrimitive.isNumber || value.asString !in listOf("0", "1")) return null
            value.asInt
        }
        val input = ChartInput(civil = "$date $time", timeZone = zone, gender = gender, title = title)
        CalendarEngine().civil(input)
        val label = customLabel ?: when (target) {
            "bazi" -> "直接排八字"
            "ziwei" -> "直接排紫微"
            else -> "按时间起一卦"
        }
        return AgentSuggestion(label, target, input, true)
    }

    fun visibleText(text: String): String = hiddenMarker.replace(text, "").trim()

    fun systemPrompt(): String = """
        你是玄学排盘工具的调度助手。使用中文给出“推荐工具 / 原因 / 下一步”，正文控制在160字以内。
        只能在回复末尾单独一行给出一个 HTML 动作标记，不放进代码块。所有建议都由用户点击按钮确认，不能自行执行。
        支持以下动作：
        <!--AGENT_ACTION:{"type":"run_bazi_chart","label":"直接排八字","payload":{"realname":"姓名","date":"1998-08-12","time":"09:00","gender":0,"timeZone":"Asia/Shanghai"}}-->
        <!--AGENT_ACTION:{"type":"run_ziwei_chart","label":"直接排紫微","payload":{"date":"1996-03-21","time":"18:30","gender":1,"timeZone":"Asia/Shanghai"}}-->
        <!--AGENT_ACTION:{"type":"run_liuyao_chart","label":"按时间起一卦","payload":{"title":"具体占问","date":"2024-02-10","time":"09:30","timeZone":"Asia/Shanghai"}}-->
        <!--AGENT_ACTION:{"type":"navigate","target":"qimen","label":"打开奇门起局"}-->
        <!--AGENT_ACTION:{"type":"none"}-->
        八字和紫微必须由用户明确提供公历 YYYY-MM-DD、24小时制 HH:mm 和数字性别0男/1女，禁止推测、转换含糊日期或编造缺少的数据。
        六爻适用于具体事件，title必填。没有明确起卦日期或时刻时只输出 navigate 到 liuyao，让用户在页面确认；禁止用系统当前时间补齐。
        时区可选，payload.timeZone默认Asia/Shanghai；有明确时区时原样填写。夏令时重复时间需用户选择明确UTC偏移时区。
        navigate的target仅可为bazi、liuyao、ziwei、qimen、history。奇门仅通过navigate打开页面确认，禁止run_qimen_chart。
        当前原生版不支持focus_ziwei_palace；需要查看宫位时打开ziwei页面。禁止输出任何代码执行、网址跳转或未列出的动作。
    """.trimIndent()

    private fun navigationLabel(target: String): String = when (target) {
        "bazi" -> "打开八字排盘"
        "liuyao" -> "打开六爻排盘"
        "ziwei" -> "打开紫微排盘"
        "qimen" -> "打开奇门起局"
        else -> "打开历史记录"
    }

    private fun requiredString(obj: JsonObject, key: String): String =
        optionalString(obj, key) ?: throw IllegalArgumentException("Missing $key")

    private fun optionalString(obj: JsonObject, key: String): String? {
        if (!obj.has(key)) return null
        val value = obj.get(key)
        require(value.isJsonPrimitive && value.asJsonPrimitive.isString) { "String required: $key" }
        return value.asString
    }

    private fun insideFence(prefix: String): Boolean {
        var fence: String? = null
        prefix.lineSequence().forEach { line ->
            val trimmed = line.trimStart()
            val opening = when {
                trimmed.startsWith("~~~") -> "~~~"
                trimmed.startsWith("```") -> "```"
                else -> null
            }
            if (opening != null) {
                if (fence == null) fence = opening else if (fence == opening) fence = null
            }
        }
        return fence != null
    }

    /** Gson streaming parser is deliberately strict and rejects duplicate keys at every depth. */
    private fun readValue(reader: JsonReader, depth: Int): JsonElement {
        require(depth <= 8) { "JSON nesting too deep" }
        return when (reader.peek()) {
            JsonToken.BEGIN_OBJECT -> {
                reader.beginObject()
                val result = JsonObject()
                while (reader.hasNext()) {
                    require(result.size() < 64) { "Too many fields" }
                    val name = reader.nextName()
                    require(!result.has(name)) { "Duplicate JSON field" }
                    result.add(name, readValue(reader, depth + 1))
                }
                reader.endObject()
                result
            }
            JsonToken.BEGIN_ARRAY -> {
                reader.beginArray()
                val result = JsonArray()
                while (reader.hasNext()) {
                    require(result.size() < 64)
                    result.add(readValue(reader, depth + 1))
                }
                reader.endArray()
                result
            }
            JsonToken.STRING -> JsonPrimitive(reader.nextString())
            JsonToken.NUMBER -> JsonPrimitive(LazilyParsedNumber(reader.nextString()))
            JsonToken.BOOLEAN -> JsonPrimitive(reader.nextBoolean())
            JsonToken.NULL -> { reader.nextNull(); JsonNull.INSTANCE }
            else -> throw IllegalArgumentException("Invalid JSON value")
        }
    }
}
