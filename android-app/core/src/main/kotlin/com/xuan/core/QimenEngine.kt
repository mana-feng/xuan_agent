package com.xuan.core

import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZoneOffset

/** Native port of qfdk/qimen (xuan-1), time-family rotating board / FuTou ChaiBu. */
class QimenEngine(private val calendar: CalendarEngine = CalendarEngine()) {
    fun chart(input: ChartInput): QimenChart {
        val entered = calendar.civil(input)
        val instant = entered.atZone(ZoneId.of(input.timeZone)).toInstant()
        val beijing = LocalDateTime.ofInstant(instant, ZoneOffset.ofHours(8))
        require(beijing.year in 1900..2099) { "奇门排盘支持 1900—2099 年" }
        val fixed = input.copy(civil=beijing.toString().replace('T',' '),timeZone="+08:00",dayDivide="zi",yearDivide="lichun")
        val pillars = calendar.pillars(fixed)
        val term = (calendar.terms(beijing.year-1) + calendar.terms(beijing.year))
            .filter { !it.civil.isAfter(beijing) }.maxByOrNull { it.civil } ?: error("缺少前一节气")
        val fuTou = GanZhi.index(pillars.day).let { it-it%5 }
        val branch = GanZhi.ZHI[fuTou%12]
        val yuan = when (branch) { in "子午卯酉" -> 0; in "寅申巳亥" -> 1; else -> 2 }
        val rule = RULES.getValue(term.name)
        val direction = if (rule.first) 1 else -1
        val number = rule.second[yuan].digitToInt()
        val earth = spread(number,0,direction)
        val hourIndex = GanZhi.index(pillars.hour)
        val xun = YI[hourIndex/10].toString()
        val dayXun = YI[GanZhi.index(pillars.day)/10].toString()
        val rawOrigin = earth.entries.first { it.value == xun }.key
        val origin = lodge(rawOrigin)
        val hourStem = pillars.hour[0].toString()
        val landing = if (hourStem == "甲") origin else lodge(earth.entries.first { it.value == hourStem }.key)
        val rotation = GanZhi.mod(ORDER.indexOf(landing)-ORDER.indexOf(origin),8)
        val heaven = rotate(earth,rotation).toMutableMap().apply { put(5,earth.getValue(5)) }
        val stars = rotate(STARS,rotation).toMutableMap().apply { put(5,"") }
        val rawDoor = GanZhi.mod(rawOrigin-1+direction*(hourIndex%10),9)+1
        val doorLanding = lodge(rawDoor)
        val doorRotation = GanZhi.mod(ORDER.indexOf(doorLanding)-ORDER.indexOf(origin),8)
        val doors = rotate(DOORS,doorRotation).toMutableMap().apply { put(5,"") }
        val spirits = mutableMapOf(5 to "")
        val start = ORDER.indexOf(landing)
        SHEN.forEachIndexed { i, name -> spirits[ORDER[GanZhi.mod(start+direction*i,8)]]=name }
        val hiddenStart = if (hourStem == "甲") 5 else rawDoor
        val hiddenYi = if (hourStem == "甲") xun else hourStem
        val hidden = spread(hiddenStart,YI.indexOf(hiddenYi[0]),direction)
        val empty = GanZhi.empty(pillars.hour).map { it.toString() }
        val emptyPalaces = empty.map { BRANCH_GONG.getValue(it[0]) }
        val ma = when (pillars.hour[1]) { in "寅午戌" -> '申'; in "申子辰" -> '寅'; in "巳酉丑" -> '亥'; else -> '巳' }
        return QimenChart(pillars,term.name,if (rule.first) "yang" else "yin",number,listOf("上元","中元","下元")[yuan],
            xun,dayXun,landing,origin,BASE_STAR.getValue(origin),doorLanding,DOORS.getValue(origin),
            empty,emptyPalaces,ma.toString(),BRANCH_GONG.getValue(ma),earth,heaven,stars,doors,spirits,hidden,beijing,rawDoor)
    }

    fun calculate(input: ChartInput): ChartResult {
        val c=chart(input)
        val sections = mutableListOf(ChartSection("排局",listOf(
            "四柱" to c.pillars.list().joinToString(" "),
            "局数" to "${if(c.yinYang=="yang") "阳遁" else "阴遁"}${c.number}局 ${c.yuan}",
            "节气" to c.term, "时旬首" to c.xun, "日旬首" to c.dayXun,
            "值符" to "${c.zhiFuStar} 原${c.zhiFuOrigin}宫 → ${c.zhiFuPalace}宫",
            "值使" to "${c.zhiShiDoor} → ${c.zhiShiPalace}宫",
            "旬空" to c.emptyBranches.joinToString(""), "驿马" to "${c.horseBranch}（${c.horsePalace}宫）")))
        (1..9).forEach { g -> sections += ChartSection("${GONG[g-1]}${g}宫",listOf(
            "地盘" to c.earth.getValue(g),"天盘" to c.heaven.getValue(g),"九星" to c.stars.getValue(g),
            "八门" to c.doors.getValue(g),"八神" to c.spirits.getValue(g),"暗干" to c.hidden.getValue(g),
            "空亡" to if(g in c.emptyPalaces) "是" else "否","驿马" to if(g==c.horsePalace) "是" else "否")) }
        return ChartResult("qimen",input.title.ifBlank { "奇门遁甲" },sections,
            calendar.metadata(input)+mapOf("算法" to "时家转盘·符头拆补 / Kotlin",
                "计算时钟" to "北京时间 UTC+08:00","计算时间" to c.beijing.toString(),"换日" to "23:00",
                "节气规则" to "精确交接时刻","寄宫" to "中五寄坤二，天禽随芮","来源" to "qfdk/qimen 1d0d1c5 xuan-1"))
    }

    private fun lodge(palace:Int) = if (palace==5) 2 else palace
    private fun spread(anchor:Int,start:Int,direction:Int):Map<Int,String> =
        (0..8).associate { i -> GanZhi.mod(anchor-1+direction*i,9)+1 to YI[GanZhi.mod(start+i,9)].toString() }
    private fun rotate(board:Map<Int,String>,step:Int):Map<Int,String> =
        ORDER.indices.associate { i -> ORDER[(i+step)%8] to board.getValue(ORDER[i]) }

    companion object {
        private const val YI="戊己庚辛壬癸丁丙乙"
        private val ORDER=listOf(1,8,3,4,9,2,7,6)
        private val GONG=listOf("坎","坤","震","巽","中","乾","兑","艮","离")
        private val SHEN=listOf("值符","腾蛇","太阴","六合","白虎","玄武","九地","九天")
        private val BASE_STAR=mapOf(1 to "天蓬",2 to "天芮",3 to "天冲",4 to "天辅",5 to "天禽",6 to "天心",7 to "天柱",8 to "天任",9 to "天英")
        private val STARS=BASE_STAR + (2 to "禽芮")
        private val DOORS=mapOf(1 to "休门",8 to "生门",3 to "伤门",4 to "杜门",9 to "景门",2 to "死门",7 to "惊门",6 to "开门")
        private val BRANCH_GONG="子丑寅卯辰巳午未申酉戌亥".toList().zip(listOf(1,8,8,3,4,4,9,2,2,7,6,6)).toMap()
        private val RULES=mapOf(
            "冬至" to (true to "174"),"惊蛰" to (true to "174"),"小寒" to (true to "285"),
            "大寒" to (true to "396"),"春分" to (true to "396"),"雨水" to (true to "963"),
            "清明" to (true to "417"),"立夏" to (true to "417"),"立春" to (true to "852"),
            "谷雨" to (true to "528"),"小满" to (true to "528"),"芒种" to (true to "639"),
            "夏至" to (false to "936"),"白露" to (false to "936"),"小暑" to (false to "825"),
            "大暑" to (false to "714"),"秋分" to (false to "714"),"立秋" to (false to "258"),
            "寒露" to (false to "693"),"立冬" to (false to "693"),"处暑" to (false to "147"),
            "霜降" to (false to "582"),"小雪" to (false to "582"),"大雪" to (false to "471"))
    }
}
data class QimenChart(
    val pillars:Pillars,val term:String,val yinYang:String,val number:Int,val yuan:String,val xun:String,val dayXun:String,
    val zhiFuPalace:Int,val zhiFuOrigin:Int,val zhiFuStar:String,val zhiShiPalace:Int,val zhiShiDoor:String,
    val emptyBranches:List<String>,val emptyPalaces:List<Int>,val horseBranch:String,val horsePalace:Int,
    val earth:Map<Int,String>,val heaven:Map<Int,String>,val stars:Map<Int,String>,val doors:Map<Int,String>,
    val spirits:Map<Int,String>,val hidden:Map<Int,String>,val beijing:LocalDateTime,val rawDoorPalace:Int
)
