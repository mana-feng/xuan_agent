package com.xuan.app
import com.xuan.core.*

data class FormOptions(val lunarInput:Boolean=false,val leap:Boolean=false,val casting:String="时间",val numbers:String="",val manual:List<Int> = listOf(1,0,1,0,1,0))
object ChartDraft {
    fun resolve(input:ChartInput,options:FormOptions):ChartInput {
        val resolved=if(options.lunarInput) {
            val parts=input.civil.substringBefore(' ').split('-').map { it.toInt() }
            require(parts.size==3){"农历日期格式应为 YYYY-MM-DD"}
            val date=CalendarEngine().solar(parts[0],parts[1],parts[2],options.leap)
            input.copy(civil="$date ${input.civil.substringAfter(' ')}")
        } else input
        CalendarEngine().civil(resolved)
        return resolved
    }
    fun tag(result:ChartResult,input:ChartInput,options:FormOptions):ChartResult = result.copy(title=input.title.ifBlank { result.title },metadata=result.metadata+mapOf(
        "原始输入" to input.civil,"日期输入" to if(options.lunarInput) "lunar" else "solar","原始闰月" to options.leap.toString(),
        "起卦方式" to options.casting,"起卦数字" to options.numbers,"手工爻" to options.manual.joinToString(",")))
    fun restore(record:SavedChart):Pair<ChartInput,FormOptions> {
        val m=record.result.metadata
        val lunar=m["日期输入"]=="lunar" || m.containsKey("原始农历输入")
        val input=record.input.copy(civil=m["原始输入"]?:m["原始农历输入"]?:record.input.civil)
        val lines=(m["手工爻"]?:m["原始爻"]).orEmpty().split(',').mapNotNull { it.toIntOrNull() }.takeIf { it.size==6 && it.all { n->n in listOf(0,1,3,4) } }?:FormOptions().manual
        val casting=m["起卦方式"]?.takeIf { it in listOf("时间","随机","数字","手动") }?:if(record.result.type=="liuyao" && m.containsKey("原始爻")) "手动" else "时间"
        return input to FormOptions(lunar,m["原始闰月"]=="true",casting,m["起卦数字"].orEmpty(),lines)
    }
}
