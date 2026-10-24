package com.xuan.core

import java.time.LocalDate
import java.time.LocalDateTime

/** civil is a wall-clock date/time in timeZone, never the device's implicit zone. */
data class ChartInput(
    val civil: String,
    val timeZone: String = "Asia/Shanghai",
    val gender: Int = 0,
    val dayDivide: String = "midnight",
    val title: String = "",
    val yearDivide: String = "lichun",
    val leapMonth: String = "add-twelve",
)
data class ChartSection(val title: String, val rows: List<Pair<String, String>>)
data class ChartResult(val type: String, val title: String, val sections: List<ChartSection>, val metadata: Map<String, String>) {
    fun asText(): String = buildString {
        appendLine(title)
        sections.forEach { section -> appendLine("\n${section.title}"); section.rows.forEach { (key, value) -> appendLine("$key：$value") } }
        appendLine("\n计算规则"); metadata.forEach { (key, value) -> appendLine("$key：$value") }
    }
}
data class LunarDate(val year: Int, val month: Int, val day: Int, val isLeap: Boolean, val monthDays: Int)
data class SolarTerm(val name: String, val civil: LocalDateTime)
data class Pillars(val year: String, val month: String, val day: String, val hour: String) {
    fun list() = listOf(year, month, day, hour)
}
object GanZhi {
    const val GAN = "甲乙丙丁戊己庚辛壬癸"
    const val ZHI = "子丑寅卯辰巳午未申酉戌亥"
    fun mod(n: Int, base: Int) = Math.floorMod(n, base)
    fun at(n: Int) = "${GAN[mod(n, 10)]}${ZHI[mod(n, 12)]}"
    fun index(gz: String): Int = (0..59).firstOrNull { at(it) == gz } ?: error("无效干支：$gz")
    fun empty(gz: String): String = listOf("戌亥", "申酉", "午未", "辰巳", "寅卯", "子丑")[index(gz) / 10]
}
