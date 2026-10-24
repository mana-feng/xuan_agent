package com.xuan.app

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.gson.JsonParser
import com.xuan.core.*

private val guaciData by lazy { JsonParser.parseReader(object {}.javaClass.getResourceAsStream("/liuyao-guaci.json")!!.reader(Charsets.UTF_8)).asJsonArray.associate { element->val o=element.asJsonObject;o["code"].asJsonArray.joinToString(""){it.asInt.toString()} to o } }
@Composable fun WebLiuyaoResult(record:SavedChart,onAsk:()->Unit) {
 val p=LocalWebPalette.current
 val data=remember(record) {runCatching {LiuyaoExport.data(record)}.getOrNull()}
 if(data==null){WebCard("卦象数据不完整"){Text("请返回起卦页面核对后重新排盘。")};return}
 val lines=data.lines;val pillars=data.pillars;val c=data.chart
 var expanded by rememberSaveable(record.id){mutableStateOf(false)}
 Column(verticalArrangement=Arrangement.spacedBy(16.dp)) {
  Text(LiuyaoExport.rule(record),fontSize=11.sp,lineHeight=20.sp,color=p.muted)
  WebCard("起卦概要") {
   LiuInfo("起卦主题",record.input.title)
   LiuInfo("性别",LiuyaoExport.gender(record))
   LiuInfo("起卦时间",LiuyaoExport.clock(record))
   LiuInfo("起卦方式",record.result.metadata["起卦方式"].orEmpty())
   LiuInfo("四柱",pillars.list().joinToString("　"));LiuInfo("旬空",GanZhi.empty(pillars.day))
  }
  WebCard("卦象总览") {
   LiuInfo("本卦",c.name+" · "+c.palace+"宫 · "+c.kind.ifBlank { "—" })
   LiuInfo("卦宫与五行","${c.palace}宫 · 五行：${LiuyaoExport.element(c.palace)}")
   LiuInfo("世应","世：${LiuyaoExport.label(c.shiYing[0]-1)} · 应：${LiuyaoExport.label(c.shiYing[1]-1)}")
   Text("可结合世应、动爻与变卦解读",fontSize=12.sp,color=p.muted)
   val main=guaciData[c.mark]
   if(main!=null){Text(main["describe"].asString,color=p.muted,fontSize=12.sp,lineHeight=21.sp);Text(main["guaci"].asString,color=p.ink,fontSize=14.sp,lineHeight=25.sp)}
   HorizontalDivider(color=p.border)
   LiuInfo("变卦",c.changed?.let { "${it.name} · ${it.palace}宫 · ${data.changed?.kind?.ifBlank { "—" }}" }?:"无变卦")
   c.changed?.let { changed->
    LiuInfo("卦宫与五行","${changed.palace}宫 · 五行：${LiuyaoExport.element(changed.palace)}")
    Text("变卦已生成 · 动爻生成的变卦，建议结合世应及动爻解读",fontSize=12.sp,color=p.muted,lineHeight=21.sp)
    guaciData[changed.mark]?.let { entry->Text(entry["guaci"].asString,color=p.muted,fontSize=13.sp,lineHeight=23.sp) }
   }?:Text("本卦静卦 · 无动爻，静观其变",fontSize=12.sp,color=p.muted)
  }
  WebCard {
   Text("EXPLORE A LITTLE DEEPER",fontSize=9.sp,letterSpacing=1.sp,color=p.primary)
   WebSectionTitle("看见结构，再聊细节。")
   Text("把盘面与自己的生活经验放在一起，从一个关心的问题开始。当前命盘会随对话一起带入。",fontSize=12.sp,color=p.muted,lineHeight=22.sp)
   WebPrimaryButton("带着这张盘，问问 AI  ↗",onAsk)
   Text("传统文化探索 · 供交流与参考",fontSize=10.sp,color=p.muted)
  }
  WebCard("六爻明细") {
   Text("自上而下展示，初爻在下；横向滑动可查看变卦与伏神。",fontSize=10.sp,color=p.muted)
   Column(Modifier.horizontalScroll(rememberScrollState()).width(820.dp)) {
    LiuTableRow(listOf("爻位","六神","原卦六亲（含伏神）","原卦","变卦六亲","变卦爻"),true)
    for(i in 5 downTo 0) {
     val hidden=c.hidden?.takeIf { i in it.seats }?.let { "伏神："+it.relatives[i]+it.ganZhiElements[i] }.orEmpty()
     val main=listOf(LiuyaoExport.glyph(lines[i]),LiuyaoExport.motion(lines[i]),LiuyaoExport.role(c,i),if(lines[i]>2)"动" else "").filter {it.isNotBlank()}.joinToString(" ")
     val changed=c.changed?.let { listOf(LiuyaoExport.glyph(it.mark[i].digitToInt()),LiuyaoExport.role(data.changed,i)).filter {s->s.isNotBlank()}.joinToString(" ") }.orEmpty()
     LiuTableRow(listOf(LiuyaoExport.label(i),c.spirits[i],c.relatives[i]+c.ganZhiElements[i]+if(hidden.isNotBlank())"\n$hidden" else "",main,c.changed?.let { it.relatives[i]+it.ganZhiElements[i] }.orEmpty(),changed),false)
    }
   }
  }
  WebCard("起卦参数") {
   Text("初爻至上爻，保留本次起卦的六爻状态。",fontSize=11.sp,color=p.muted)
   Text("原始参数（初爻→上爻）：${lines.joinToString(",")}",fontSize=12.sp,color=p.ink)
   Text(if(c.moving.isEmpty())"六爻皆静" else "${c.moving.size} 个动爻",fontSize=11.sp,color=p.primary)
   for(i in 5 downTo 0) Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween) {
    Text(LiuyaoExport.label(i),fontSize=12.sp,color=p.muted)
    Text(LiuyaoExport.glyph(lines[i])+" "+LiuyaoExport.motion(lines[i]),fontSize=16.sp,color=if(lines[i]>2)p.primary else p.ink)
    Text("${LiuyaoExport.lineName(lines[i])}（${lines[i]}）",fontSize=12.sp,color=p.muted)
   }
   Text("初爻在下，自下而上成卦 · ○ 阳动　× 阴动",fontSize=10.sp,color=p.muted,lineHeight=20.sp)
  }
  WebCard("卦辞与爻辞") {
   guaciData[c.mark]?.let { Text(it["guaci"].asString,color=p.ink,fontSize=14.sp,lineHeight=25.sp) }
   TextButton(onClick={expanded=!expanded}){Text(if(expanded)"收起原文 −" else "展开本卦原文 +")}
   if(expanded) guaciData[c.mark]?.let { entry->
    entry["guaciDetailed"]?.asJsonArray?.forEach { o->o.asJsonObject.entrySet().forEach { e->Text(e.value.asString.trim(),fontSize=13.sp,color=p.ink,lineHeight=24.sp) } }
    entry["yaoci"]?.asJsonArray?.forEachIndexed { i,o->Text(o.asJsonObject["yao"].asString,color=if(i in c.moving)p.primary else p.ink,fontSize=14.sp,fontWeight=if(i in c.moving)FontWeight.Bold else FontWeight.Normal);Text(o.asJsonObject["yaoDetailed"].asString.trim(),fontSize=12.sp,color=p.muted,lineHeight=22.sp) }
   }
  }
 }
}
@Composable private fun LiuInfo(label:String,value:String){Column(verticalArrangement=Arrangement.spacedBy(5.dp)){Text(label,color=LocalWebPalette.current.muted,fontSize=11.sp);Text(value.ifBlank {"—"},color=LocalWebPalette.current.ink,fontSize=14.sp,lineHeight=23.sp)}}
@Composable private fun LiuTableRow(values:List<String>,header:Boolean){val p=LocalWebPalette.current;Row(Modifier.fillMaxWidth().background(if(header)p.tint else Color.White).padding(vertical=10.dp)){values.forEachIndexed { i,text->Text(text.ifBlank {"—"},Modifier.width(listOf(65,75,160,180,180,160)[i].dp).padding(horizontal=7.dp),fontSize=12.sp,color=p.ink,lineHeight=21.sp,fontWeight=if(header)FontWeight.Bold else FontWeight.Normal)}};HorizontalDivider(color=p.border)}
