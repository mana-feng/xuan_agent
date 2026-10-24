package com.xuan.app

import com.xuan.core.*

/** The on-screen table and clipboard share the same original six states and changed-line roles. */
object LiuyaoExport {
 data class Data(val lines:List<Int>,val pillars:Pillars,val chart:LiuyaoChart,val changed:LiuyaoChart?)
 fun data(record:SavedChart):Data {
  val lines=record.result.metadata["原始爻"].orEmpty().split(',').mapNotNull { it.toIntOrNull() }
  val pillars=CalendarEngine().pillars(record.input)
  val chart=LiuyaoEngine().structure(lines,pillars.day)
  val changed=chart.changed?.let { LiuyaoEngine().structure(it.mark.map(Char::digitToInt),pillars.day) }
  return Data(lines,pillars,chart,changed)
 }
 fun gender(record:SavedChart):String = if(record.result.metadata["性别填写"]=="false") "未填写" else if(record.input.gender==1) "女" else "男"
 fun clock(record:SavedChart):String = "${record.result.metadata["原始输入"]?:record.input.civil} · ${record.result.metadata["原始时区"]?:record.input.timeZone}"
 fun rule(record:SavedChart):String = buildString {
  append("${record.result.metadata["原始时区"]?:record.input.timeZone} · 钟表时间 · ${if(record.input.dayDivide=="zi")"23:00" else "00:00"} 换日")
  append(" · ${if(record.input.yearDivide=="lunar")"春节换年" else "立春换年"}")
  append(" · 闰月${if(record.input.leapMonth=="same-month")"按原月数" else "原月数加12"}")
  when(record.result.metadata["重复时刻选择"]) {"earlier"->append(" · 重复时刻取较早的一次");"later"->append(" · 重复时刻取较晚的一次")}
 }
 fun element(palace:String)=mapOf("乾" to "金","兑" to "金","巽" to "木","震" to "木","离" to "火","坎" to "水","艮" to "土","坤" to "土")[palace]?:"—"
 fun glyph(n:Int)=if(n%2==1) "━━━━" else "━　━"
 fun lineName(n:Int)=when(n){0->"少阴";1->"少阳";3->"老阳";4->"老阴";else->"—"}
 fun label(i:Int)=listOf("初爻","二爻","三爻","四爻","五爻","上爻")[i]
 fun role(chart:LiuyaoChart?,i:Int)=when(i+1){chart?.shiYing?.get(0)->"世";chart?.shiYing?.get(1)->"应";else->""}
 fun motion(n:Int)=when(n){3->"○";4->"×";else->""}
 fun text(record:SavedChart):String {
  val d=data(record);val c=d.chart
  return buildString {
   appendLine(clock(record));appendLine("排盘口径：${rule(record)}")
   appendLine("规则版本：${record.result.metadata["规则版本"]?:"calendar-civil-v1"}")
   appendLine("占问：${com.google.gson.Gson().toJson(record.input.title)}")
   appendLine("性别：${gender(record)}");appendLine("起卦方式：${record.result.metadata["起卦方式"]?:"未记录"}")
   appendLine("四柱：${d.pillars.list().joinToString(" ")}（旬空：${GanZhi.empty(d.pillars.day)}）")
   appendLine("本卦：${c.name} / ${c.palace}宫 · 五行：${element(c.palace)} · ${c.kind.ifBlank { "—" }}")
   appendLine("变卦：${c.changed?.let { "${it.name} / ${it.palace}宫 · 五行：${element(it.palace)} · ${d.changed?.kind?.ifBlank { "—" }}" }?:"无变卦（静卦）"}")
   appendLine("爻序：自上而下（上爻→初爻）；○ 阳动，× 阴动")
   appendLine("爻位 | 六神 | 伏神 | 本卦六亲干支 | 本卦爻象 | 动爻 | 本卦世应 | 变卦六亲干支 | 变卦爻象 | 变卦世应")
   for(i in 5 downTo 0) {
    val hidden=c.hidden?.takeIf { i in it.seats }?.let { it.relatives[i]+it.ganZhiElements[i] }.orEmpty()
    val changed=c.changed
    val values=listOf(label(i),c.spirits[i],hidden,c.relatives[i]+c.ganZhiElements[i],glyph(d.lines[i]),motion(d.lines[i]),role(c,i),changed?.let { it.relatives[i]+it.ganZhiElements[i] }.orEmpty(),changed?.let { glyph(it.mark[i].digitToInt()) }.orEmpty(),role(d.changed,i))
    appendLine(values.joinToString(" | "){it.ifBlank { "—" }})
   }
   appendLine("原始参数（初爻→上爻）：${d.lines.joinToString(",")}")
   append("初爻在下，自下而上成卦；0 少阴、1 少阳、3 老阳、4 老阴")
  }
 }
}
