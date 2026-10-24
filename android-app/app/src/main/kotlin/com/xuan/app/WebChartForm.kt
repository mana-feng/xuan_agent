@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class,androidx.compose.material3.ExperimentalMaterial3Api::class)
package com.xuan.app

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.xuan.core.*
import java.time.*
import java.time.format.DateTimeFormatter

private val formTitles=mapOf("bazi" to "八字排盘","ziwei" to "紫微排盘","liuyao" to "六爻起卦","qimen" to "奇门遁甲")
private val formSubtitles=mapOf("bazi" to "从出生时刻出发，了解你的四柱、五行与人生节律。","ziwei" to "以出生时刻安星定宫，探索命宫、星曜与人生的不同面向。","liuyao" to "一事一问，让卦象为当下的问题提供新的视角。","qimen" to "把问题安放在此刻，从九宫之间找到思路。")
@Composable fun WebChartForm(state:AppState,model:ChartViewModel,navigate:(String)->Unit) {
 val p=LocalWebPalette.current;val type=state.chartType;val input=state.form;val o=state.options
 var dateOpen by rememberSaveable(type) { mutableStateOf(false) }
 LaunchedEffect(type,o.useNow) { if(type=="qimen" && o.useNow) while(true) {
  model.tickCurrentTime()
  kotlinx.coroutines.delay(1000)
 } }
 fun changeCalendar(lunar:Boolean) {
  try {
   val solar=ChartDraft.resolve(input,o).civil
   val date=LocalDate.parse(solar.substringBefore(' '))
   val ld=CalendarEngine().lunar(date)
   val civil=if(lunar) "%04d-%02d-%02d %s".format(ld.year,ld.month,ld.day,solar.substringAfter(' ')) else solar
   model.editOptions(o.copy(lunarInput=lunar,leap=lunar && ld.isLeap,preview=emptyList()))
   model.editForm(input.copy(civil=civil))
  }catch(e:Exception){model.reportError(e.message?:"请核对日期")}
 }
 Column(verticalArrangement=Arrangement.spacedBy(16.dp)) {
  WebHeading(formTitles[type].orEmpty(),formSubtitles[type].orEmpty())
  if(state.result!=null) Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween,verticalAlignment=Alignment.CenterVertically) {
   Text(if(state.editingId!=null) "正在修改当前记录" else "填写信息，开始新的探索",fontSize=11.sp,color=p.muted)
   TextButton(onClick=model::resetForm) {Text(if(type in listOf("bazi","ziwei")) "新建命盘" else "新建${if(type=="qimen")"起局" else "卦象"}",fontSize=12.sp)}
  }
  Surface(color=p.tint,shape=RoundedCornerShape(5.dp)) { Text(when(type){"bazi"->"BAZI · FOUR PILLARS";"ziwei"->"ZIWEI · ASTROLOGY";"liuyao"->"LIUYAO · DIVINATION";else->"QIMEN DUNJIA"},Modifier.padding(horizontal=10.dp,vertical=6.dp),fontSize=9.sp,letterSpacing=1.sp,color=p.primary) }
  if(type!="qimen") Row(Modifier.fillMaxWidth().padding(vertical=7.dp),horizontalArrangement=Arrangement.SpaceBetween) {
   listOf("1  填写信息","2  查看${if(type=="liuyao") "卦象" else "命盘"}","3  深入解读").forEachIndexed { i,text->Text(text,fontSize=11.sp,color=if(i==0)p.primary else p.muted) }
  }
  WebCard {
   WebSectionTitle(if(type=="qimen") "01  这一局，想问什么" else "${if(type in listOf("bazi","ziwei")) "人" else "问"}  基本信息")
   WebField(input.title,{model.editForm(input.copy(title=it.take(when(type){"bazi","ziwei"->30;"liuyao"->200;else->100})))},when(type){"bazi","ziwei"->"称呼  选填";"liuyao"->"想问的事";else->"问题或记录名称  选填"},when(type){"bazi","ziwei"->"怎么称呼你？";"liuyao"->"例如：这次合作的推进情况如何？";else->"例如：新项目应该如何安排？"},singleLine=type!="liuyao")
   if(type=="liuyao") {
    Text("性别  选填",fontSize=13.sp,color=p.ink)
    WebSegments(listOf("未填写","男","女"),if(o.genderSet)input.gender+1 else 0){ choice->
     model.editOptions(o.copy(genderSet=choice!=0));model.editForm(input.copy(gender=if(choice==2)1 else 0))
    }
   } else if(type!="qimen") { Text("性别",fontSize=13.sp,color=p.ink);WebSegments(listOf("男","女"),input.gender){model.editForm(input.copy(gender=it))} }
   HorizontalDivider(Modifier.padding(vertical=3.dp),color=p.border)
   Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically) {
    Text(if(type in listOf("bazi","ziwei")) "出生时间" else if(type=="qimen") "起局时间" else "起卦时间",fontSize=17.sp,fontFamily=FontFamily.Serif,color=p.ink,modifier=Modifier.weight(1f))
    Surface(shape=RoundedCornerShape(12.dp),color=p.tint) { Text(input.timeZone,Modifier.padding(horizontal=9.dp,vertical=5.dp),fontSize=9.sp,color=p.primary) }
   }
   if(type in listOf("bazi","ziwei")) { Text("历法",fontSize=13.sp,color=p.ink);WebSegments(listOf("阳历（公历）","阴历（农历）"),if(o.lunarInput)1 else 0){changeCalendar(it==1)} }
   Column(Modifier.fillMaxWidth().background(Brush.horizontalGradient(listOf(p.tint,p.accent.copy(alpha=.08f))),RoundedCornerShape(11.dp)).padding(15.dp),verticalArrangement=Arrangement.spacedBy(10.dp)) {
    Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(12.dp)) {
     Text("◷",fontSize=26.sp,color=p.primary)
     Column(verticalArrangement=Arrangement.spacedBy(4.dp)) {
      Text(if(o.useNow) "当前时间 · 自动更新" else if(o.lunarInput) "农历日期 · 精确到分钟" else "公历日期 · 精确到分钟",fontSize=10.sp,color=p.muted)
      Text(input.civil.substringBefore(' ').replace("-"," / ")+(if(o.lunarInput && o.leap) " 闰月" else ""),fontSize=15.sp,color=p.ink)
      Text(input.civil.substringAfter(' ',"00:00").take(if(type=="qimen")8 else 5),fontSize=28.sp,color=p.primary)
     }
    }
    HorizontalDivider(color=p.border)
    OutlinedButton(onClick={dateOpen=true},modifier=Modifier.fillMaxWidth(),shape=RoundedCornerShape(7.dp),colors=ButtonDefaults.outlinedButtonColors(containerColor=Color.White)) { Text("修改时间",fontSize=12.sp) }
    if(type in listOf("liuyao","qimen")) TextButton(onClick=model::restoreNow) { Text("恢复现在",fontSize=11.sp) }
    val alternate=remember(input.civil,o.lunarInput,o.leap) { runCatching {
     val solar=ChartDraft.resolve(input,o.copy(overlapChoice="earlier")).civil
     if(o.lunarInput) "对应公历  ${solar.substringBefore(' ')}" else CalendarEngine().lunar(LocalDate.parse(solar.substringBefore(' '))).let { "对应农历  ${it.year}年${if(it.isLeap)"闰" else ""}${it.month}月${it.day}日" }
    }.getOrDefault("请核对日期") }
    HorizontalDivider(color=p.border)
    Text(alternate,fontSize=12.sp,color=p.ink)
   }
   Text(if(type=="qimen") "默认使用现在，也可以指定需要回看的时刻。" else "请按所选历法填写日期，并核对对应日期。",fontSize=11.sp,lineHeight=19.sp,color=p.muted)
   WebCalendarSettings(state,model)
   if(type=="bazi") {
    Text("四柱预览",fontSize=11.sp,color=p.muted)
    val pillars=remember(input,o.lunarInput,o.leap,o.overlapChoice) {runCatching { CalendarEngine().pillars(ChartDraft.resolve(input,o)).list() }.getOrNull()}
    Row(horizontalArrangement=Arrangement.spacedBy(8.dp)) { (pillars?:listOf("—","—","—","—")).forEach { Surface(color=p.tint,shape=RoundedCornerShape(6.dp)) { Text(it,Modifier.padding(12.dp),color=p.primary,fontSize=16.sp) } } }
   }
   if(type=="ziwei") Text("23:00—23:59 为晚子时，按次日排盘；闰月十五日后按下月安星。",fontSize=11.sp,color=p.muted,lineHeight=19.sp)
   if(type=="liuyao") WebCastingForm(state,model)
   Text(if(type=="qimen") "按所选时区确认时刻后，统一换算为北京时间起局。" else "确认信息后生成${if(type=="liuyao") "卦象" else "命盘"}，再结合 AI 对话逐步解读。",fontSize=11.sp,color=p.muted,lineHeight=20.sp)
   WebPrimaryButton(if(state.busy) "正在排盘…" else if(type=="qimen") "开始起局  ↗" else if(type=="liuyao") "开始排盘  →" else "开始排盘  →",{model.calculate()},!state.busy && ChartDraft.canSubmit(type,input,o))
   if(type=="liuyao") TextButton(onClick=model::resetForm){Text("重置信息",fontSize=11.sp)}
  }
  WebCard {
   Text(if(type=="qimen") "时家转盘 · 符头拆补" else "✧",color=p.primary,fontSize=22.sp)
   WebSectionTitle(if(type=="qimen") "一时，一问，一局" else if(type=="liuyao") "一事一问，心念专注" else "每个时刻，都有来处")
   Text(when(type){"qimen"->"九宫呈现星、门、神与天地盘，点击宫位可查看完整信息。\n\n北京时间 UTC+08:00\n23:00 换日 · 交节时刻切换\n中五寄坤二 · 天禽随芮";"liuyao"->"先明确想问的事，再选择起卦方式。每一爻都从下向上记录，完成后可以保存卦象继续提问。";else->"准确的出生时间，是理解命盘的起点。你可以先向家人确认，或查看出生证明。\n\n01  先确认使用的是阳历还是阴历。\n02  出生时间不确定时，请先核对，不必急于填写。\n03  排盘后可以保存记录，日后继续查看与提问。"},color=p.muted,fontSize=12.sp,lineHeight=23.sp)
   TextButton(onClick={navigate("agent")}) { Text("不确定怎么填？问问 AI  →",fontSize=12.sp) }
  }
 }
 if(dateOpen) WebDateTimeDialog(input,o,title=if(type in listOf("bazi","ziwei")) if(o.lunarInput)"农历出生时间" else "公历出生时间" else if(type=="qimen")"起局时间" else "起卦时间",onDismiss={dateOpen=false},onConfirm={civil,leap->
  val changed=o.copy(leap=leap,useNow=false,preview=emptyList())
  model.editOptions(changed);model.editForm(input.copy(civil=civil));dateOpen=false
 })
}

@Composable private fun WebCalendarSettings(state:AppState,model:ChartViewModel) {
 val p=LocalWebPalette.current;val f=state.form;val o=state.options;val type=state.chartType
 var open by rememberSaveable(type){mutableStateOf(false)}
 var zone by rememberSaveable(f.timeZone) {mutableStateOf(f.timeZone)}
 Column(verticalArrangement=Arrangement.spacedBy(10.dp)) {
  HorizontalDivider(color=p.border)
  Row(Modifier.fillMaxWidth().clickable{open=!open}.padding(vertical=6.dp),horizontalArrangement=Arrangement.SpaceBetween) {Text("时间与排盘口径",fontSize=13.sp,color=p.ink);Text(if(open)"收起 −" else "调整 +",fontSize=12.sp,color=p.primary)}
  Text("${f.timeZone} · 钟表时间 · ${if(type=="ziwei" || type=="qimen" || f.dayDivide=="zi") "23:00" else "00:00"} 换日",fontSize=10.sp,color=p.muted)
  if(open) {
   Text("日期和时间按这个时区填写",fontSize=12.sp,color=p.ink)
   FlowRow(horizontalArrangement=Arrangement.spacedBy(5.dp),verticalArrangement=Arrangement.spacedBy(5.dp)) {
    listOf("Asia/Shanghai" to "北京 / 上海","Asia/Hong_Kong" to "香港","Asia/Singapore" to "新加坡","Asia/Tokyo" to "东京","America/New_York" to "纽约","America/Los_Angeles" to "洛杉矶","Europe/London" to "伦敦","Australia/Sydney" to "悉尼","UTC" to "UTC").forEach { (id,label)->WebPill(label,f.timeZone==id){model.editForm(f.copy(timeZone=id));model.editOptions(o.copy(overlapChoice="reject",preview=emptyList()))} }
   }
   WebField(zone,{zone=it},"其他时区名称","如 Europe/Paris")
   TextButton(onClick={try{ZoneId.of(zone.trim());model.editForm(f.copy(timeZone=zone.trim()));model.editOptions(o.copy(overlapChoice="reject",preview=emptyList()))}catch(e:Exception){model.reportError("请输入有效时区名称")}}){Text("应用时区")}
   if(type in listOf("bazi","liuyao")) {
    Text("子时日界",fontSize=12.sp,color=p.ink)
    WebSegments(listOf("00:00 换日","23:00 换日"),if(f.dayDivide=="zi")1 else 0){model.editForm(f.copy(dayDivide=if(it==0)"midnight" else "zi"))}
    Text(if(f.dayDivide=="midnight") "日柱零点换日；23点后的子时时干按次日日干推算。" else "23点起日柱按次日，子时时干随次日日干推算。",fontSize=10.sp,color=p.muted,lineHeight=18.sp)
   }
   if(type=="liuyao") {
    Text("时间起卦的年支取数",fontSize=12.sp,color=p.ink)
    WebSegments(listOf("立春换年（旧版）","春节换年"),if(f.yearDivide=="lunar")1 else 0){model.editForm(f.copy(yearDivide=if(it==0)"lichun" else "lunar"));model.editOptions(o.copy(preview=emptyList()))}
    Text("时间起卦的闰月取数",fontSize=12.sp,color=p.ink)
    WebSegments(listOf("原月数加12（旧版）","按原月数"),if(f.leapMonth=="same-month")1 else 0){model.editForm(f.copy(leapMonth=if(it==0)"add-twelve" else "same-month"));model.editOptions(o.copy(preview=emptyList()))}
   }
   Text("夏令时结束时，重复出现的钟表时间",fontSize=12.sp,color=p.ink)
   FlowRow(horizontalArrangement=Arrangement.spacedBy(5.dp),verticalArrangement=Arrangement.spacedBy(5.dp)) {listOf("reject" to "遇到重复时提醒","earlier" to "较早的一次","later" to "较晚的一次").forEach { (id,name)->WebPill(name,o.overlapChoice==id){model.editOptions(o.copy(overlapChoice=id,preview=emptyList()))}}}
   Text("按所选时区的钟表时间填写，不校正真太阳时。记录会保留原时区、钟面时间和当前规则。",fontSize=10.sp,color=p.muted,lineHeight=18.sp)
  }
 }
}

@Composable private fun WebCastingForm(state:AppState,model:ChartViewModel) {
 val p=LocalWebPalette.current;val o=state.options
 var choice by rememberSaveable {mutableIntStateOf(-1)}
 var guaPicker by rememberSaveable {mutableIntStateOf(0)}
 Column(verticalArrangement=Arrangement.spacedBy(12.dp)) {
  WebSectionTitle("选择起卦方式")
  FlowRow(horizontalArrangement=Arrangement.spacedBy(5.dp),verticalArrangement=Arrangement.spacedBy(5.dp)) {LiuyaoCasting.methods.forEach {method->WebPill(method,o.casting==method){model.editOptions(o.copy(casting=method,preview=emptyList(),manual=List(6){-1}))}}}
  when(o.casting) {
   "电脑自动"->Text("电脑自动起卦，系统为你随机生成卦象。",fontSize=12.sp,color=p.muted)
   "在线起卦"->{Text("心念专注，从初爻开始，每次摇出一爻。",fontSize=12.sp,color=p.muted);LinearProgressIndicator(progress={o.preview.size/6f},modifier=Modifier.fillMaxWidth());Text("${o.preview.size} / 6 爻",fontSize=12.sp,color=p.primary)}
   "手工指定","手动"->{Text("自下而上记录，点击每爻选择阴阳动静。",fontSize=12.sp,color=p.muted);for(i in 5 downTo 0) OutlinedButton(onClick={choice=i},modifier=Modifier.fillMaxWidth(),shape=RoundedCornerShape(7.dp)){Text("${yaoLabel(i)}　${yaoGlyph(o.manual.getOrElse(i){-1})}",fontSize=14.sp)}}
   "时间起卦","时间"->Text("按所选时间和排盘口径生成卦象。",fontSize=12.sp,color=p.muted)
   "单数起卦"->WebField(o.numbers,{model.editOptions(o.copy(numbers=it.filter(Char::isDigit).take(12),preview=emptyList()))},"一组数字","请输入数字")
   "双数起卦"->{val n=o.numbers.split('|');WebField(n.getOrElse(0){""},{model.editOptions(o.copy(numbers=it.filter(Char::isDigit).take(12)+"|"+n.getOrElse(1){""},preview=emptyList()))},"第一组数字");WebField(n.getOrElse(1){""},{model.editOptions(o.copy(numbers=n.getOrElse(0){""}+"|"+it.filter(Char::isDigit).take(12),preview=emptyList()))},"第二组数字")}
   "汉字起卦"->WebField(o.chars,{model.editOptions(o.copy(chars=it.take(10),preview=emptyList()))},"输入汉字","至少 2 个汉字，按笔画数起卦")
   "卦名起卦"->{OutlinedButton(onClick={guaPicker=1},modifier=Modifier.fillMaxWidth()){Text("本卦：${LiuyaoCasting.guaNames[o.mainGua]?:"请选择"}")};OutlinedButton(onClick={guaPicker=2},modifier=Modifier.fillMaxWidth()){Text("变卦：${LiuyaoCasting.guaNames[o.changedGua]?:"无变卦"}")}}
   "数字"->WebField(o.numbers,{model.editOptions(o.copy(numbers=it,preview=emptyList()))},"上卦、下卦、动爻（可选）")
  }
  if(o.casting !in listOf("手工指定","手动")) {
   if(o.casting=="在线起卦" && o.preview.size>=6) TextButton(onClick={model.editOptions(o.copy(preview=emptyList()))}){Text("重新摇卦")}
   else OutlinedButton(onClick={model.generateCasting()},modifier=Modifier.fillMaxWidth(),shape=RoundedCornerShape(7.dp)){Text(if(o.casting=="在线起卦") "摇第 ${o.preview.size+1} 爻" else if(o.preview.isEmpty()) "生成卦象" else "重新生成",fontSize=13.sp)}
   if(o.preview.isNotEmpty()) Column(Modifier.fillMaxWidth().background(p.tint,RoundedCornerShape(8.dp)).padding(14.dp),verticalArrangement=Arrangement.spacedBy(7.dp)) {
    Text("卦象预览",fontSize=12.sp,color=p.ink)
    for(i in 5 downTo 0) Text("${yaoLabel(i)}　${yaoGlyph(o.preview.getOrElse(i){-1})}",fontSize=14.sp,color=p.primary)
   }
  }
 }
 if(choice>=0) AlertDialog(onDismissRequest={choice=-1},title={Text("选择${yaoLabel(choice)}")},text={Column(verticalArrangement=Arrangement.spacedBy(7.dp)){listOf(0,1,3,4,-1).forEach { n->OutlinedButton(onClick={val manual=o.manual.toMutableList();manual[choice]=n;model.editOptions(o.copy(manual=manual));choice=-1},modifier=Modifier.fillMaxWidth()){Text(yaoGlyph(n))}}}},confirmButton={TextButton(onClick={choice=-1}){Text("取消")}})
 if(guaPicker!=0) Dialog(onDismissRequest={guaPicker=0}) {Surface(shape=RoundedCornerShape(16.dp),color=Color.White){Column(Modifier.fillMaxWidth().heightIn(max=560.dp).padding(18.dp)){WebSectionTitle(if(guaPicker==1)"选择本卦" else "选择变卦");Column(Modifier.weight(1f,false).verticalScroll(rememberScrollState())){val choices=if(guaPicker==2) mapOf("" to "无变卦")+LiuyaoCasting.guaNames else LiuyaoCasting.guaNames;choices.forEach {(mark,name)->TextButton(onClick={model.editOptions(if(guaPicker==1)o.copy(mainGua=mark,preview=emptyList()) else o.copy(changedGua=mark,preview=emptyList()));guaPicker=0},modifier=Modifier.fillMaxWidth()){Text(name)}}};TextButton(onClick={guaPicker=0}){Text("取消")}}}}
}
fun yaoLabel(i:Int)=listOf("初爻","二爻","三爻","四爻","五爻","上爻").getOrElse(i){"爻"}
fun yaoGlyph(n:Int)=when(n){0->"━　━  少阴";1->"━━━━  少阳";3->"━━━━ ○ 老阳";4->"━　━ × 老阴";else->"请选择"}

@Composable private fun WebDateTimeDialog(input:ChartInput,options:FormOptions,title:String,onDismiss:()->Unit,onConfirm:(String,Boolean)->Unit) {
 val p=LocalWebPalette.current;val parts=input.civil.replace(' ', '-').replace(':','-').split('-')
 var year by rememberSaveable {mutableStateOf(parts.getOrElse(0){"2000"})};var month by rememberSaveable {mutableStateOf(parts.getOrElse(1){"01"})};var day by rememberSaveable {mutableStateOf(parts.getOrElse(2){"01"})};var hour by rememberSaveable {mutableStateOf(parts.getOrElse(3){"00"})};var minute by rememberSaveable {mutableStateOf(parts.getOrElse(4){"00"})};var leap by rememberSaveable {mutableStateOf(options.leap)};var error by rememberSaveable {mutableStateOf("")}
 fun civil()="%04d-%02d-%02d %02d:%02d".format(year.toInt(),month.toInt(),day.toInt(),hour.toInt(),minute.toInt())
 ModalBottomSheet(onDismissRequest=onDismiss,sheetState=rememberModalBottomSheetState(skipPartiallyExpanded=true),dragHandle=null,containerColor=Color.White,shape=RoundedCornerShape(topStart=20.dp,topEnd=20.dp)) {Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(20.dp),verticalArrangement=Arrangement.spacedBy(16.dp)) {
  Text("${input.timeZone} · 按该时区钟表时间填写",fontSize=10.sp,color=p.muted)
  Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.SpaceBetween){WebSectionTitle(title);TextButton(onClick=onDismiss){Text("×",fontSize=24.sp)}}
  Row(horizontalArrangement=Arrangement.spacedBy(8.dp)) {DateNumber(year,{year=it;error=""},"年份",Modifier.weight(1.35f));DateNumber(month,{month=it;error=""},"月份",Modifier.weight(1f));DateNumber(day,{day=it;error=""},"日期",Modifier.weight(1f))}
  if(options.lunarInput) Row(verticalAlignment=Alignment.CenterVertically) {Checkbox(leap,{leap=it;error=""});Text("闰月",fontSize=13.sp)}
  Text("时间  24 小时制",fontSize=12.sp,color=p.ink)
  Row(horizontalArrangement=Arrangement.spacedBy(10.dp),verticalAlignment=Alignment.CenterVertically) {DateNumber(hour,{hour=it;error=""},"小时",Modifier.weight(1f));Text(":");DateNumber(minute,{minute=it;error=""},"分钟",Modifier.weight(1f))}
  val draftCivil=runCatching {civil()}.getOrNull()
  val liveError=if(draftCivil==null) "请填写完整的年、月、日、时、分" else ChartDraft.dateEditorError(input.copy(civil=draftCivil),options.copy(leap=leap))
  val canConfirm=liveError.isEmpty()
  val hint=runCatching {val solar=ChartDraft.resolve(input.copy(civil=civil()),options.copy(leap=leap,overlapChoice="earlier")).civil;val ld=CalendarEngine().lunar(LocalDate.parse(solar.substringBefore(' ')));if(options.lunarInput)"对应公历 $solar" else "农历 ${ld.year}年${if(ld.isLeap)"闰" else ""}${ld.month}月${ld.day}日"}.getOrNull()
  Text(hint?:"请填写 1900—2099 年内有效的日期时间",fontSize=11.sp,color=p.muted,lineHeight=19.sp)
  val visibleError=error.ifEmpty {if(year.length==4 && listOf(month,day,hour,minute).all {it.isNotBlank()}) liveError else ""}
  if(visibleError.isNotEmpty()) Text(visibleError,color=MaterialTheme.colorScheme.error,fontSize=12.sp)
  Row(horizontalArrangement=Arrangement.spacedBy(10.dp),verticalAlignment=Alignment.CenterVertically) {OutlinedButton(onClick=onDismiss){Text("取消")};Box(Modifier.weight(1f)){WebPrimaryButton("确认时间  →",{try{val c=civil();ChartDraft.resolve(input.copy(civil=c),options.copy(leap=leap));onConfirm(c,leap)}catch(e:Exception){error=e.message?:"日期时间无效"}},canConfirm)}}
 }}
}
@Composable private fun DateNumber(value:String,edit:(String)->Unit,label:String,modifier:Modifier) {Column(modifier,verticalArrangement=Arrangement.spacedBy(6.dp)){OutlinedTextField(value,{edit(it.filter(Char::isDigit).take(if(label=="年份")4 else 2))},singleLine=true,label={Text(label,fontSize=11.sp)},keyboardOptions=KeyboardOptions(keyboardType=KeyboardType.Number),textStyle=LocalTextStyle.current.copy(fontSize=16.sp),shape=RoundedCornerShape(8.dp))}}
