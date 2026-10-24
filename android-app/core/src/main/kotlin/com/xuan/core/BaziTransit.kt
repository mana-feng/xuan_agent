package com.xuan.core

import java.time.LocalDate
import java.time.LocalDateTime
import java.time.temporal.ChronoUnit

/** Linked web luck selectors. Civil clock arithmetic deliberately never crosses a device-zone DST instant. */
class BaziTransit(val input:ChartInput, private val calendar:CalendarEngine=CalendarEngine()) {
    data class Cycle(val ganzhi:String,val startYear:Int,val endYear:Int,val startAge:Int)
    data class Year(val year:Int,val ganzhi:String,val age:Int)
    data class Month(val jie:String,val ganzhi:String,val start:LocalDateTime,val end:LocalDateTime)
    data class Day(val date:LocalDate,val ganzhi:String,val lunar:String)
    data class Time(val start:LocalDateTime,val ganzhi:String)
    data class Selection(val cycle:Int=0,val year:Int=0,val month:Int=0,val day:Int=0,val time:Int=0)
    enum class Level { CYCLE,YEAR,MONTH,DAY,TIME }
    val birth=calendar.civil(input)
    val pillars=calendar.pillars(input)
    val luck=BaziEngine(calendar).luck(input)
    val cycles=listOf(Cycle("童限",birth.year,luck.start.year-1,1))+luck.cycles.map { Cycle(it.ganzhi,it.startYear,it.startYear+9,it.startAge) }
    private val monthCache=mutableMapOf<Int,List<Month>>()
    private val dayCache=mutableMapOf<Month,List<Day>>()
    fun years(selection:Selection):List<Year> = cycles.getOrNull(selection.cycle)?.let { cycle ->
        (cycle.startYear..cycle.endYear).map { Year(it,GanZhi.at(it-4),it-birth.year+1) }
    }.orEmpty()
    fun months(year:Int):List<Month> = monthCache.getOrPut(year) {
        // The native bundled ephemeris contains complete spring-year intervals through 2101 only.
        val jie=calendar.nearbyTerms(year).filter { it.name in CalendarEngine.jieNames }
        val spring=jie.firstOrNull { it.name=="立春" && it.civil.year==year }
        if(spring==null) emptyList() else {
            val boundaries=jie.filter { it.civil>=spring.civil }.take(13)
            if(boundaries.size!=13) emptyList() else (0..11).map { i ->
                val gan=GanZhi.mod(GanZhi.mod(year-4,10)%5*2+2+i,10)
                Month(boundaries[i].name,"${GanZhi.GAN[gan]}${GanZhi.ZHI[(i+2)%12]}",boundaries[i].civil,boundaries[i+1].civil)
            }
        }
    }
    fun months(selection:Selection):List<Month> = years(selection).getOrNull(selection.year)?.let { months(it.year) }.orEmpty()
    fun days(month:Month):List<Day> = dayCache.getOrPut(month) {
        val start=month.start.toLocalDate(); val end=month.end.toLocalDate()
        (0 until ChronoUnit.DAYS.between(start,end).toInt()).map { offset ->
            val date=start.plusDays(offset.toLong()); val lunar=calendar.lunar(date)
            Day(date,dayGanzhi(date),if(lunar.day==1) "${if(lunar.isLeap) "闰" else ""}${lunar.month}月" else lunarDay(lunar.day))
        }
    }
    fun days(selection:Selection):List<Day> = months(selection).getOrNull(selection.month)?.let(::days).orEmpty()
    fun times(date:LocalDate):List<Time> = (0..11).map { branch ->
        val start=if(branch==0) date.minusDays(1).atTime(23,0) else date.atTime(branch*2-1,0)
        val dayIndex=GanZhi.index(dayGanzhi(date))
        Time(start,"${GanZhi.GAN[(dayIndex%10%5*2+branch)%10]}${GanZhi.ZHI[branch]}")
    }
    fun times(selection:Selection):List<Time> = days(selection).getOrNull(selection.day)?.let { times(it.date) }.orEmpty()
    fun select(selection:Selection,level:Level,index:Int):Selection {
        val size=when(level) { Level.CYCLE->cycles.size;Level.YEAR->years(selection).size;Level.MONTH->months(selection).size;Level.DAY->days(selection).size;Level.TIME->times(selection).size }
        require(index in 0 until size) { "时间选择超出范围" }
        require(level!=Level.CYCLE || cycles[index].endYear>=cycles[index].startYear) { "童限不足一年，无独立流年" }
        return when(level) {
            Level.CYCLE->Selection(cycle=index)
            Level.YEAR->selection.copy(year=index,month=0,day=0,time=0)
            Level.MONTH->selection.copy(month=index,day=0,time=0)
            Level.DAY->selection.copy(day=index,time=0)
            Level.TIME->selection.copy(time=index)
        }
    }
    fun locate(date:LocalDate):Selection {
        val spring=calendar.terms(date.year).firstOrNull { it.name=="立春" }?.civil?.toLocalDate()
        val year=if(spring!=null && date<spring) date.year-1 else date.year
        val available=cycles.indices.filter { cycles[it].endYear>=cycles[it].startYear }
        val cycle=available.lastOrNull { cycles[it].startYear<=year } ?: available.first()
        var state=Selection(cycle=cycle)
        state=state.copy(year=years(state).indexOfFirst { it.year==year }.coerceAtLeast(0))
        state=state.copy(month=months(state).indexOfFirst { date>=it.start.toLocalDate() && date<it.end.toLocalDate() }.coerceAtLeast(0))
        return state.copy(day=days(state).indexOfFirst { it.date==date }.coerceAtLeast(0))
    }
    companion object {
        fun dayGanzhi(date:LocalDate)=GanZhi.at(ChronoUnit.DAYS.between(LocalDate.of(2000,1,7),date).toInt())
        fun lunarDay(day:Int):String = when(day) { 10->"初十";20->"二十";30->"三十";else->listOf("初","十","廿")[(day-1)/10]+"一二三四五六七八九"[(day-1)%10] }
    }
}
