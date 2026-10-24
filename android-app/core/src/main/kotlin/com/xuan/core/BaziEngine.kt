package com.xuan.core

import java.time.LocalDateTime
import java.time.temporal.ChronoUnit

// Kotlin port of lunar-javascript 1.7.7 EightChar/Yun sect 1; static tables retain MIT notice.
data class LuckCycle(val ganzhi:String,val startYear:Int,val startAge:Int)
data class LuckStart(val forward:Boolean,val years:Int,val months:Int,val days:Int,val start:LocalDateTime,val cycles:List<LuckCycle>)
class BaziEngine(private val calendar:CalendarEngine=CalendarEngine()) {
    companion object {
        private val staticRows by lazy { BaziEngine::class.java.getResourceAsStream("/bazi-static.tsv")!!.bufferedReader().use { it.readLines().map { line -> line.split('\t') } } }
        private val hidden by lazy { staticRows.filter { it[0]=="H" }.associate { it[1][0] to it[2] } }
        private val nayin by lazy { staticRows.filter { it[0]=="N" }.associate { it[1] to it[2] } }
        private val stages=listOf("长生","沐浴","冠带","临官","帝旺","衰","病","死","墓","绝","胎","养")
        private val starts=listOf(11,6,2,9,2,9,5,0,8,3)
    }
    fun tenGod(self:Char,other:Char):String {
        val a=GanZhi.GAN.indexOf(self); val b=GanZhi.GAN.indexOf(other)
        require(a>=0 && b>=0) { "无效天干" }
        val same=a%2==b%2
        return when(GanZhi.mod(b/2-a/2,5)) { 0->if(same) "比肩" else "劫财";1->if(same) "食神" else "伤官";2->if(same) "偏财" else "正财";3->if(same) "七杀" else "正官";else->if(same) "偏印" else "正印" }
    }
    fun luck(input:ChartInput):LuckStart {
        val local=calendar.civil(input); val pillars=calendar.pillars(input)
        val yang=GanZhi.GAN.indexOf(pillars.year[0])%2==0
        val forward=yang==(input.gender==0)
        val jie=calendar.nearbyTerms(local.year).filter { it.name in CalendarEngine.jieNames }
        val prev=jie.last { it.civil<=local }.civil; val next=jie.first { it.civil>local }.civil
        val start=if(forward) local else prev; val end=if(forward) next else local
        fun hourIndex(value:LocalDateTime)=if(value.hour==23) 11 else (value.hour+1)/2
        var hours=hourIndex(end)-hourIndex(start)
        var days=ChronoUnit.DAYS.between(start.toLocalDate(),end.toLocalDate()).toInt()
        if(hours<0) { hours+=12; days-- }
        val partMonths=hours*10/30
        val totalMonths=days*4+partMonths
        val years=totalMonths/12; val months=totalMonths%12; val restDays=hours*10-partMonths*30
        val startSolar=local.plusYears(years.toLong()).plusMonths(months.toLong()).plusDays(restDays.toLong())
        val base=GanZhi.index(pillars.month)
        val cycles=(1..9).map { index -> val year=startSolar.year+(index-1)*10; LuckCycle(GanZhi.at(base+if(forward) index else -index),year,year-local.year+1) }
        return LuckStart(forward,years,months,restDays,startSolar,cycles)
    }
    fun calculate(input:ChartInput):ChartResult {
        val local=calendar.civil(input); val pillars=calendar.pillars(input); val lunar=calendar.lunar(local.toLocalDate()); val values=pillars.list()
        val day=values[2][0]; val dayIndex=GanZhi.GAN.indexOf(day); val fortune=luck(input)
        val names=listOf("年柱","月柱","日柱","时柱")
        val sections=mutableListOf(
            ChartSection("四柱",names.zip(values)),
            ChartSection("历法",listOf("公历" to input.civil,"农历" to "${lunar.year}年${if(lunar.isLeap) "闰" else ""}${lunar.month}月${lunar.day}日","性别" to if(input.gender==0) "男" else "女","日主" to "$day${"木火土金水"[dayIndex/2]}")),
            ChartSection("十神与藏干",values.mapIndexed { i,gz -> names[i] to "${if(i==2) "日主" else tenGod(day,gz[0])} · ${hidden[gz[1]].orEmpty().map { "$it${tenGod(day,it)}" }.joinToString(" / ")}" }),
            ChartSection("纳音与十二长生",values.mapIndexed { i,gz -> val idx=GanZhi.mod((GanZhi.ZHI.indexOf(gz[1])-starts[dayIndex])*(if(dayIndex%2==0) 1 else -1),12); names[i] to "${nayin[gz]} · ${stages[idx]} · 空亡${GanZhi.empty(gz)}" }),
            ChartSection("起运",listOf("方向" to if(fortune.forward) "顺行" else "逆行","出生后" to "${fortune.years}年${fortune.months}月${fortune.days}日起运","交运时间" to fortune.start.toString().replace('T',' '))),
            ChartSection("大运",fortune.cycles.map { "${it.startYear}—${it.startYear+9}年" to "${it.ganzhi} · ${it.startAge}—${it.startAge+9}岁 · ${tenGod(day,it.ganzhi[0])}" }),
            ChartSection("流年",(local.year..minOf(local.year+99,2199)).map { year -> val gz=GanZhi.at(year-4); "$year 年" to "$gz · ${tenGod(day,gz[0])} · 虚岁${year-local.year+1}" }),
        )
        sections.addAll(4,BaziDetails.sections(input,pillars))
        return ChartResult("bazi",input.title.ifBlank { "八字命盘" },sections,calendar.metadata(input)+mapOf("八字规则" to "bazi-civil-v1","起运规则" to "阴阳顺逆 / 节令 / sect 1"))
    }
}
