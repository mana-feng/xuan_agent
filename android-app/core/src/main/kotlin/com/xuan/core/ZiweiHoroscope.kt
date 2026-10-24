package com.xuan.core

import java.time.LocalDate
import java.time.LocalDateTime
import java.time.temporal.ChronoUnit

/** Civil-clock Ziwei flows, ported from iztro 2.5.7 FunctionalAstrolabe.
 * Lunar new year/month boundaries and leap-month day 16 match the mobile web.
 */
class ZiweiHoroscope(private val calendar: CalendarEngine = CalendarEngine()) {
    private fun mod(i: Int, base: Int = 12) = Math.floorMod(i, base)
    private fun branchPalace(c: Char) = mod(GanZhi.ZHI.indexOf(c) - 2)
    fun calculate(natal: ChartResult, target: LocalDateTime): ZiweiFlow? {
        require(natal.type == "ziwei")
        val date = target.toLocalDate().plusDays(if (target.hour == 23) 1 else 0)
        val lunar = calendar.lunar(date)
        val birth = calendar.lunar(LocalDate.parse(natal.metadata.getValue("calculationDate")))
        val age = lunar.year - birth.year + 1
        if (age < 1) return null
        val ranges = (0..11).map { natal.metadata.getValue("palace.$it.decadal").split(',').map(String::toInt) }
        var decade = ranges.indexOfFirst { age in it[0]..it[1] }
        var childhood = false
        if (decade < 0 && age <= 6) {
            val childName = listOf("命宫", "财帛", "疾厄", "夫妻", "福德", "官禄")[age - 1]
            decade = (0..11).first { natal.metadata["palace.$it.name"] == childName }
            childhood = true
        }
        if (decade < 0) return null
        val ageCycle = mod(age - 1, 120) + 1
        val small = (0..11).first { natal.metadata.getValue("palace.$it.ages").split(',').map(String::toInt).contains(ageCycle) }
        val yearGz = GanZhi.at(lunar.year - 4)
        val yearIndex = branchPalace(yearGz[1])
        val monthOffset = lunar.month - 1 + if (lunar.isLeap && lunar.day > 15) 1 else 0
        val monthStem = mod(GanZhi.GAN.indexOf(yearGz[0]) % 5 * 2 + 2 + monthOffset, 10)
        val monthGz = "${GanZhi.GAN[monthStem]}${GanZhi.ZHI[mod(monthOffset + 2)]}"
        val birthMonth = birth.month + if (birth.isLeap && birth.day > 15) 1 else 0
        val monthIndex = mod(yearIndex - birthMonth + natal.metadata.getValue("timeIndex").toInt() + monthOffset + 1)
        val dayIndex = mod(monthIndex + lunar.day - 1)
        val dayGz = GanZhi.at(ChronoUnit.DAYS.between(LocalDate.of(2000, 1, 7), date).toInt())
        val timeIndex = if (target.hour == 23) 0 else (target.hour + 1) / 2
        val hourGz = "${GanZhi.GAN[mod(GanZhi.GAN.indexOf(dayGz[0]) % 5 * 2 + timeIndex, 10)]}${GanZhi.ZHI[timeIndex]}"
        fun scope(key: String, index: Int, gz: String) = ZiweiScope(key, index, gz,
            (0..11).map { ZiweiRules.palaceNames[mod(it - index)] },
            ZiweiRules.transformations[GanZhi.GAN.indexOf(gz[0])], flowStars(key, gz))
        return ZiweiFlow(date, lunar, age, childhood, linkedMapOf(
            "decadal" to scope("decadal", decade, natal.metadata.getValue("palace.$decade.stemBranch")),
            "age" to scope("age", small, natal.metadata.getValue("palace.$small.stemBranch")),
            "yearly" to scope("yearly", yearIndex, yearGz),
            "monthly" to scope("monthly", monthIndex, monthGz),
            "daily" to scope("daily", dayIndex, dayGz),
            "hourly" to scope("hourly", mod(dayIndex + timeIndex), hourGz)))
    }
    fun dateForAge(natal: ChartResult, age: Int): LocalDate {
        require(age >= 1)
        val birth = calendar.lunar(LocalDate.parse(natal.metadata.getValue("calculationDate")))
        return calendar.solar(birth.year + age - 1, 1, 1)
    }
    fun months(year: Int): List<ZiweiMonth> = (1..12).flatMap { month ->
        listOf(false, true).mapNotNull { leap -> runCatching {
            val start = calendar.solar(year, month, 1, leap)
            ZiweiMonth(month, leap, start, calendar.lunar(start).monthDays)
        }.getOrNull() }
    }.sortedBy { it.start }

    fun transformations(stem: Char): List<String> = ZiweiRules.transformations[GanZhi.GAN.indexOf(stem)]
    fun related(index: Int) = listOf(index, mod(index + 4), mod(index + 6), mod(index + 8))
    fun yearlyDeities(index: Int, yearBranch: Char): Pair<String, String> {
        val branch = GanZhi.ZHI.indexOf(yearBranch)
        val start = branchPalace("子酉午卯"[branch % 4])
        return listOf("将星", "攀鞍", "岁驿", "息神", "华盖", "劫煞", "灾煞", "天煞", "指背", "咸池", "月煞", "亡神")[mod(index - start)] to
            listOf("岁建", "晦气", "丧门", "贯索", "官符", "小耗", "大耗", "龙德", "白虎", "天德", "吊客", "病符")[mod(index - branchPalace(yearBranch))]
    }
    private fun flowStars(scope: String, gz: String): List<List<String>> {
        val result = List(12) { mutableListOf<String>() }
        if (scope == "age") return result
        val stem = GanZhi.GAN.indexOf(gz[0]); val branch = GanZhi.ZHI.indexOf(gz[1])
        val prefix = mapOf("decadal" to "运", "yearly" to "流", "monthly" to "月", "daily" to "日", "hourly" to "时").getValue(scope)
        fun add(name: String, index: Int) { result[mod(index)].add(prefix + name) }
        val lu = branchPalace("寅卯巳午巳午申酉亥子"[stem])
        add("魁", branchPalace("丑子亥亥丑子丑午卯卯"[stem]))
        add("钺", branchPalace("未申酉酉未申未寅巳巳"[stem]))
        add("昌", branchPalace("巳午申酉申酉亥子寅卯"[stem]))
        add("曲", branchPalace("酉申午巳午巳卯寅子亥"[stem]))
        add("禄", lu); add("羊", lu + 1); add("陀", lu - 1)
        add("马", branchPalace("寅亥申巳"[branch % 4]))
        add("鸾", 1 - branch); add("喜", 7 - branch)
        if (scope == "yearly") result[mod(8 - branch)].add(0, "年解")
        return result
    }
}
data class ZiweiScope(val key: String, val index: Int, val stemBranch: String, val palaceNames: List<String>, val transformations: List<String>, val stars: List<List<String>>)
data class ZiweiFlow(val date: LocalDate, val lunar: LunarDate, val nominalAge: Int, val childhood: Boolean, val scopes: Map<String, ZiweiScope>)
data class ZiweiMonth(val month: Int, val leap: Boolean, val start: LocalDate, val days: Int)
