package com.xuan.core

import kotlin.random.Random

/** Bottom to top: 0=yin, 1=yang, 3=moving yang, 4=moving yin. */
class LiuyaoEngine(private val calendar: CalendarEngine = CalendarEngine()) {
    fun structure(lines: List<Int>, dayGz: String): LiuyaoChart {
        require(lines.size == 6 && lines.all { it in listOf(0,1,3,4) }) { "六爻必须为六个 0、1、3、4，自下而上" }
        GanZhi.index(dayGz)
        val mark = lines.joinToString("") { (it % 2).toString() }
        val shi = shi(mark)
        val gong = palace(mark, shi)
        val gz = najia(mark)
        val relatives = relatives(gz, gong)
        val missing = QIN.filter { it !in relatives }
        val pureGz = najia(YAO[gong] + YAO[gong])
        val pureQin = relatives(pureGz, gong)
        val hidden = if (missing.isEmpty()) null else LiuyaoHidden(
            missing.map { pureQin.indexOf(it) }.filter { it >= 0 }, pureQin, pureGz.map(::withElement))
        val moving = lines.indices.filter { lines[it] > 2 }
        val changed = if (moving.isEmpty()) null else {
            val code = lines.joinToString("") { if (it == 1 || it == 4) "1" else "0" }
            val ngz = najia(code)
            LiuyaoChanged(code, names.getValue(code), GUA[palace(code, shi(code))], relatives(ngz, gong), ngz.map(::withElement))
        }
        val stem = GanZhi.GAN.indexOf(dayGz[0])
        val spiritStart = when (stem) { 0,1 -> 0; 2,3 -> 1; 4 -> 2; 5 -> 3; 6,7 -> 4; else -> 5 }
        return LiuyaoChart(mark, names.getValue(mark), GUA[gong], type(mark), listOf(shi, if (shi > 3) shi-3 else shi+3),
            relatives, gz.map(::withElement), List(6) { SHEN[(spiritStart + it) % 6] }, moving, hidden, changed)
    }

    fun calculate(input: ChartInput, lines: List<Int>): ChartResult {
        val pillars = calendar.pillars(input)
        val c = structure(lines, pillars.day)
        val sections = listOf(
            ChartSection("卦象", listOf("本卦" to "${c.name}（${c.palace}宫 ${c.kind}）",
                "变卦" to (c.changed?.let { "${it.name}（${it.palace}宫）" } ?: "无动爻"),
                "四柱" to pillars.list().joinToString(" "), "旬空" to GanZhi.empty(pillars.day))),
            ChartSection("六爻（自上而下）", (5 downTo 0).map { i ->
                val label = when (i+1) { c.shiYing[0] -> "世"; c.shiYing[1] -> "应"; else -> "" }
                val hidden = c.hidden?.takeIf { i in it.seats }?.let { "伏 ${it.relatives[i]}${it.ganZhiElements[i]}" } ?: ""
                val changed = c.changed?.let { "变 ${it.relatives[i]}${it.ganZhiElements[i]}" } ?: ""
                val symbol = if (lines[i] % 2 == 1) "━━━━" else "━　━"
                val motion = if (lines[i] == 3) "○" else if (lines[i] == 4) "×" else ""
                "${i+1}爻 $label" to "${c.spirits[i]} ${c.relatives[i]}${c.ganZhiElements[i]} $symbol$motion $hidden $changed".trim()
            })
        )
        return ChartResult("liuyao", input.title.ifBlank { "六爻 · ${c.name}" }, sections,
            calendar.metadata(input) + mapOf("算法" to "原生 Kotlin 纳甲", "爻编码" to "自下而上 0阴静、1阳静、3阳动、4阴动", "原始爻" to lines.joinToString(",")))
    }

    fun numberCast(upper: Int, lower: Int, moving: Int? = null): List<Int> {
        require(upper > 0 && lower > 0 && (moving == null || moving > 0)) { "起卦数字必须为正整数" }
        val order = listOf("111","110","101","100","011","010","001","000")
        val lines = (order[(lower-1)%8] + order[(upper-1)%8]).map { it.digitToInt() }.toMutableList()
        if (moving != null) { val i=(moving-1)%6; lines[i] = if (lines[i] == 1) 3 else 4 }
        return lines
    }

    fun timeCast(input: ChartInput): List<Int> {
        val civil = calendar.civil(input)
        val date = civil.toLocalDate().plusDays(if (input.dayDivide == "zi" && civil.hour == 23) 1 else 0)
        val lunar = calendar.lunar(date)
        val yearBranch = if (input.yearDivide == "lichun") GanZhi.ZHI.indexOf(calendar.pillars(input).year[1])
            else GanZhi.mod(lunar.year-4,12)
        val month = lunar.month + if (lunar.isLeap && input.leapMonth == "add-twelve") 12 else 0
        val hour = (civil.hour+1)/2%12+1
        val sum = yearBranch+1+month+lunar.day
        return numberCast((sum-1)%8+1,(sum+hour-1)%8+1,(sum+hour-1)%6+1)
    }

    /** true is a 3-point coin side; false is a 2-point side. */
    fun coinLine(coins: List<Boolean>): Int {
        require(coins.size == 3) { "每爻需三枚铜钱" }
        return listOf(4,1,0,3)[coins.count { it }]
    }
    fun randomCast(random: Random = Random.Default): List<Int> = List(6) { coinLine(List(3) { random.nextBoolean() }) }

    private fun shi(mark: String): Int {
        val n=mark.take(3); val w=mark.takeLast(3)
        return when {
            w[2]==n[2] && w[1]!=n[1] && w[0]!=n[0] -> 2
            w[2]!=n[2] && w[1]==n[1] && w[0]==n[0] -> 5
            w[1]==n[1] && w[0]!=n[0] && w[2]!=n[2] -> 4
            w[1]!=n[1] && w[0]==n[0] && w[2]==n[2] -> 3
            w[0]==n[0] && w[1]!=n[1] && w[2]!=n[2] -> 4
            w[0]!=n[0] && w[1]==n[1] && w[2]==n[2] -> 1
            w==n -> 6
            else -> 3
        }
    }
    private fun palace(mark: String, shi: Int): Int {
        val n=mark.take(3); val w=mark.takeLast(3)
        val home = when {
            w[1]!=n[1] && w[0]==n[0] && w[2]==n[2] -> n
            shi in listOf(1,2,3,6) -> w
            else -> n.map { if (it=='1') '0' else '1' }.joinToString("")
        }
        return YAO.indexOf(home)
    }
    private fun najia(mark: String): List<String> =
        listOf(NAJIA[YAO.indexOf(mark.take(3))][0], NAJIA[YAO.indexOf(mark.takeLast(3))][1]).flatMap { row -> row.drop(1).map { "${row[0]}$it" } }
    private fun relatives(gz: List<String>, gong: Int) = gz.map { QIN[GanZhi.mod(GUA5[gong]-ZHI5[GanZhi.ZHI.indexOf(it[1])],5)] }
    private fun withElement(gz: String) = gz + ELEMENT[ZHI5[GanZhi.ZHI.indexOf(gz[1])]]
    private fun type(mark: String): String {
        val n=mark.take(3); val w=mark.takeLast(3)
        return when {
            w[1]==n[1] && w[0]!=n[0] && w[2]!=n[2] -> "游魂"
            w[1]!=n[1] && w[0]==n[0] && w[2]==n[2] -> "归魂"
            w==n || setOf(n,w)==setOf("100","111") -> "六冲"
            listOf("否","困","旅","豫","节","贲","复","泰").any { names.getValue(mark).contains(it) } -> "六合"
            else -> ""
        }
    }
    companion object {
        private val YAO=listOf("111","011","101","001","110","010","100","000")
        private val GUA=listOf("乾","巽","离","艮","兑","坎","震","坤")
        private val GUA5=listOf(3,0,1,2,3,4,0,2)
        private val ZHI5=listOf(4,2,0,0,2,1,1,2,3,3,2,4)
        private val ELEMENT=listOf("木","火","土","金","水")
        private val QIN=listOf("兄弟","父母","官鬼","妻财","子孙")
        private val SHEN=listOf("青龙","朱雀","勾陈","螣蛇","白虎","玄武")
        private val NAJIA=listOf(listOf("甲子寅辰","壬午申戌"),listOf("辛丑亥酉","辛未巳卯"),listOf("己卯丑亥","己酉未巳"),listOf("丙辰午申","丙戌子寅"),listOf("丁巳卯丑","丁亥酉未"),listOf("戊寅辰午","戊申戌子"),listOf("庚子寅辰","庚午申戌"),listOf("乙未巳卯","癸丑亥酉"))
        private val names: Map<String,String> by lazy {
            LiuyaoEngine::class.java.getResourceAsStream("/liuyao-names.tsv")!!.bufferedReader().useLines { rows ->
                rows.filter { it.isNotBlank() }.associate { val cells=it.trimStart('\uFEFF').split('\t'); cells[0] to cells[1] }
            }
        }
    }
}
data class LiuyaoHidden(val seats: List<Int>, val relatives: List<String>, val ganZhiElements: List<String>)
data class LiuyaoChanged(val mark: String, val name: String, val palace: String, val relatives: List<String>, val ganZhiElements: List<String>)
data class LiuyaoChart(
    val mark: String, val name: String, val palace: String, val kind: String, val shiYing: List<Int>,
    val relatives: List<String>, val ganZhiElements: List<String>, val spirits: List<String>, val moving: List<Int>,
    val hidden: LiuyaoHidden?, val changed: LiuyaoChanged?
)
