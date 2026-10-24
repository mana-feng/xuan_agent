package com.xuan.app
import com.xuan.core.*
import java.time.*
import java.time.format.DateTimeFormatter

data class FormOptions(val lunarInput:Boolean=false,val leap:Boolean=false,val casting:String="时间",val numbers:String="",val manual:List<Int> = listOf(1,0,1,0,1,0),val preview:List<Int> = emptyList(),val chars:String="",val mainGua:String="111111",val changedGua:String="",val overlapChoice:String="reject",val useNow:Boolean=false)
object ChartDraft {
 fun resolve(input:ChartInput,options:FormOptions):ChartInput {
  var resolved=if(options.lunarInput) {
   val parts=input.civil.substringBefore(' ').split('-').map { it.toInt() }
   require(parts.size==3){"农历日期格式应为 YYYY-MM-DD"}
   val date=CalendarEngine().solar(parts[0],parts[1],parts[2],options.leap)
   input.copy(civil="$date ${input.civil.substringAfter(' ')}")
  } else input
  val local=LocalDateTime.parse(resolved.civil,DateTimeFormatter.ofPattern("uuuu-MM-dd HH:mm[:ss]"))
  val zone=try{ZoneId.of(resolved.timeZone)}catch(e:Exception){throw IllegalArgumentException("时区无效")}
  val offsets=zone.rules.getValidOffsets(local)
  require(offsets.isNotEmpty()) { "该本地时间因夏令时不存在" }
  if(offsets.size>1) {
   require(options.overlapChoice in listOf("earlier","later")) { "该时刻因夏令时重复，请在时间设置中选择较早或较晚的一次" }
   resolved=resolved.copy(timeZone=offsets[if(options.overlapChoice=="later") offsets.lastIndex else 0].id)
  }
  CalendarEngine().civil(resolved)
  return resolved
 }
 fun tag(result:ChartResult,input:ChartInput,options:FormOptions):ChartResult = result.copy(title=input.title.ifBlank { result.title },metadata=result.metadata+mapOf(
  "原始输入" to input.civil,"原始时区" to input.timeZone,"日期输入" to if(options.lunarInput) "lunar" else "solar","原始闰月" to options.leap.toString(),
  "起卦方式" to options.casting,"起卦数字" to options.numbers,"手工爻" to options.manual.joinToString(","),"起卦预览" to options.preview.joinToString(","),"起卦汉字" to options.chars,"本卦选择" to options.mainGua,"变卦选择" to options.changedGua,"重复时刻选择" to options.overlapChoice))
 fun restore(record:SavedChart):Pair<ChartInput,FormOptions> {
  val m=record.result.metadata
  val lunar=m["日期输入"]=="lunar" || m.containsKey("原始农历输入")
  val input=record.input.copy(civil=m["原始输入"]?:m["原始农历输入"]?:record.input.civil,timeZone=m["原始时区"]?:record.input.timeZone)
  fun lines(key:String)=m[key].orEmpty().split(',').mapNotNull { it.toIntOrNull() }.takeIf { it.size==6 && it.all { n->n in listOf(0,1,3,4) } }
  val manual=lines("手工爻")?:lines("原始爻")?:FormOptions().manual
  val casting=m["起卦方式"]?.takeIf { it in listOf("时间","随机","数字","手动")+LiuyaoCasting.methods }?:if(record.result.type=="liuyao" && m.containsKey("原始爻")) "手动" else "时间"
  return input to FormOptions(lunar,m["原始闰月"]=="true",casting,m["起卦数字"].orEmpty(),manual,lines("起卦预览")?:emptyList(),m["起卦汉字"].orEmpty(),m["本卦选择"]?:"111111",m["变卦选择"].orEmpty(),m["重复时刻选择"]?:"reject")
 }
}
