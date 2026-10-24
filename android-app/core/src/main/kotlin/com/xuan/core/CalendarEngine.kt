package com.xuan.core

import java.time.*
import java.time.format.DateTimeFormatter
import java.time.format.ResolverStyle
import java.time.temporal.ChronoUnit

class CalendarEngine {
    companion object {
        private data class Month(val year:Int,val signedMonth:Int,val days:Int,val start:LocalDate)
        private val formatter = DateTimeFormatter.ofPattern("uuuu-MM-dd HH:mm[:ss]").withResolverStyle(ResolverStyle.STRICT)
        private val records by lazy {
            CalendarEngine::class.java.getResourceAsStream("/calendar.tsv")!!.bufferedReader().use { it.readLines().filter { line -> !line.startsWith("#") && line.isNotBlank() }.map { line -> line.split('\t') } }
        }
        private val months by lazy { records.filter { it[0]=="M" }.map { Month(it[1].toInt(),it[2].toInt(),it[3].toInt(),LocalDate.parse(it[4])) }.sortedBy { it.start } }
        private val allTerms by lazy { records.filter { it[0]=="T" }.map { SolarTerm(it[1],LocalDateTime.parse(it[2],formatter)) }.sortedBy { it.civil } }
        val jieNames = listOf("立春","惊蛰","清明","立夏","芒种","小暑","立秋","白露","寒露","立冬","大雪","小寒")
    }
    fun civil(input: ChartInput): LocalDateTime {
        require(input.gender in 0..1) { "性别参数无效" }
        require(input.dayDivide in listOf("midnight","zi")) { "不支持的换日规则" }
        require(input.yearDivide in listOf("lichun","lunar") && input.leapMonth in listOf("add-twelve","same-month")) { "不支持的起卦规则" }
        val local = try { LocalDateTime.parse(input.civil.trim(),formatter) } catch(e:Exception) { throw IllegalArgumentException("日期时间无效，请使用 YYYY-MM-DD HH:mm 格式",e) }
        require(local.year in 1900..2099) { "支持 1900—2099 年" }
        val zone = try { ZoneId.of(input.timeZone) } catch(e:Exception) { throw IllegalArgumentException("时区无效",e) }
        val offsets = zone.rules.getValidOffsets(local)
        require(offsets.size == 1) { if(offsets.isEmpty()) "该本地时间因夏令时不存在" else "该本地时间因夏令时重复，请使用明确的 UTC 偏移时区" }
        return local
    }
    fun lunar(date: LocalDate): LunarDate {
        var lo=0; var hi=months.lastIndex
        while(lo<=hi) { val mid=(lo+hi) ushr 1; if(months[mid].start<=date) lo=mid+1 else hi=mid-1 }
        require(hi>=0) { "日期超出历法数据范围" }
        val month=months[hi]; val day=ChronoUnit.DAYS.between(month.start,date).toInt()+1
        require(day in 1..month.days) { "日期超出历法数据范围" }
        return LunarDate(month.year,kotlin.math.abs(month.signedMonth),day,month.signedMonth<0,month.days)
    }
    fun solar(year: Int, month: Int, day: Int, isLeap: Boolean = false): LocalDate {
        val value=months.firstOrNull { it.year==year && it.signedMonth==(if(isLeap) -month else month) } ?: throw IllegalArgumentException("该年份不存在所选农历月份")
        require(day in 1..value.days) { "该农历月只有 ${value.days} 天" }
        return value.start.plusDays((day-1).toLong())
    }
    fun terms(year: Int): List<SolarTerm> = allTerms.filter { it.civil.year==year }
    fun nearbyTerms(year:Int):List<SolarTerm> = allTerms.filter { it.civil.year in year-1..year+1 }
    fun pillars(input: ChartInput): Pillars {
        val local=civil(input)
        val spring=terms(local.year).first { it.name=="立春" }.civil
        val year=if(local<spring) local.year-1 else local.year
        val yearIndex=GanZhi.mod(year-4,60)
        val jie=nearbyTerms(local.year).last { it.name in jieNames && it.civil<=local }
        val monthIndex=jieNames.indexOf(jie.name)
        val monthGan=GanZhi.mod((yearIndex%10%5)*2+2+monthIndex,10)
        val monthZhi=GanZhi.mod(monthIndex+2,12)
        val baseDay=ChronoUnit.DAYS.between(LocalDate.of(2000,1,7),local.toLocalDate()).toInt()
        val day=baseDay+if(input.dayDivide=="zi" && local.hour==23) 1 else 0
        val timeDay=baseDay+if(local.hour==23) 1 else 0
        val timeZhi=((local.hour+1)/2)%12
        val timeGan=GanZhi.mod(GanZhi.mod(timeDay,10)%5*2+timeZhi,10)
        return Pillars(GanZhi.at(yearIndex),"${GanZhi.GAN[monthGan]}${GanZhi.ZHI[monthZhi]}",GanZhi.at(day),"${GanZhi.GAN[timeGan]}${GanZhi.ZHI[timeZhi]}")
    }
    fun metadata(input: ChartInput): Map<String, String> {
        val local=civil(input); val zoned=local.atZone(ZoneId.of(input.timeZone))
        return linkedMapOf("输入时间" to local.toString().replace('T',' '),"输入时区" to input.timeZone,"UTC偏移" to zoned.offset.toString(),"时间戳" to zoned.toInstant().toEpochMilli().toString(),"换日" to if(input.dayDivide=="zi") "23:00" else "00:00","历法" to "lunar-javascript@1.7.7 数据 / Kotlin 算法","规则版本" to "calendar-civil-v1")
    }
}
