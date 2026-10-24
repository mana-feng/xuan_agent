package com.xuan.app

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
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
 val lines=remember(record.result){record.result.metadata["原始爻"].orEmpty().split(',').mapNotNull { it.toIntOrNull() }}
 val pair=remember(record) {runCatching {val pillars=CalendarEngine().pillars(record.input);pillars to LiuyaoEngine().structure(lines,pillars.day)}.getOrNull()}
 if(pair==null){WebCard("卦象数据不完整"){Text("请返回起卦页面核对后重新排盘。")};return}
 val (pillars,c)=pair
 var expanded by rememberSaveable(record.id){mutableStateOf(false)}
 Column(verticalArrangement=Arrangement.spacedBy(16.dp)) {
  WebCard("起卦概要") {
   LiuInfo("占卜事项",record.input.title)
   LiuInfo("起卦时间",record.input.civil+" · "+(record.result.metadata["原始时区"]?:record.input.timeZone))
   LiuInfo("起卦方式",record.result.metadata["起卦方式"].orEmpty())
   LiuInfo("四柱",pillars.list().joinToString("　"));LiuInfo("旬空",GanZhi.empty(pillars.day))
  }
  WebCard("卦象总览") {
   LiuInfo("本卦",c.name+" · "+c.palace+"宫 "+c.kind)
   LiuInfo("世应","世在${c.shiYing[0]}爻 · 应在${c.shiYing[1]}爻")
   val main=guaciData[c.mark]
   if(main!=null){Text(main["describe"].asString,color=p.muted,fontSize=12.sp,lineHeight=21.sp);Text(main["guaci"].asString,color=p.ink,fontSize=14.sp,lineHeight=25.sp)}
   HorizontalDivider(color=p.border)
   LiuInfo("变卦",c.changed?.let { "${it.name} · ${it.palace}宫" }?:"无动爻，本卦不变")
   c.changed?.let { changed->guaciData[changed.mark]?.let { data->Text(data["guaci"].asString,color=p.muted,fontSize=13.sp,lineHeight=23.sp) } }
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
   Column(Modifier.horizontalScroll(rememberScrollState()).width(650.dp)) {
    LiuTableRow(listOf("爻位","六神","原卦六亲 / 纳甲","爻象","世应","变卦六亲 / 纳甲","伏神"),true)
    for(i in 5 downTo 0) {
     val hidden=c.hidden?.takeIf { i in it.seats }?.let { it.relatives[i]+it.ganZhiElements[i] }.orEmpty()
     LiuTableRow(listOf(yaoLabel(i),c.spirits[i],c.relatives[i]+c.ganZhiElements[i],yaoGlyph(lines[i]).substringBefore("  "),when(i+1){c.shiYing[0]->"世";c.shiYing[1]->"应";else->""},c.changed?.let { it.relatives[i]+it.ganZhiElements[i] }.orEmpty(),hidden),false)
    }
   }
  }
  WebCard("卦辞与爻辞") {
   TextButton(onClick={expanded=!expanded}){Text(if(expanded)"收起原文 −" else "展开本卦原文 +")}
   if(expanded) guaciData[c.mark]?.let { data->
    data["guaciDetailed"]?.asJsonArray?.forEach { o->o.asJsonObject.entrySet().forEach { e->Text(e.value.asString.trim(),fontSize=13.sp,color=p.ink,lineHeight=24.sp) } }
    data["yaoci"]?.asJsonArray?.forEachIndexed { i,o->Text(o.asJsonObject["yao"].asString,color=if(i in c.moving)p.primary else p.ink,fontSize=14.sp,fontWeight=if(i in c.moving)FontWeight.Bold else FontWeight.Normal);Text(o.asJsonObject["yaoDetailed"].asString.trim(),fontSize=12.sp,color=p.muted,lineHeight=22.sp) }
   }
  }
 }
}
@Composable private fun LiuInfo(label:String,value:String){Column(verticalArrangement=Arrangement.spacedBy(5.dp)){Text(label,color=LocalWebPalette.current.muted,fontSize=11.sp);Text(value,color=LocalWebPalette.current.ink,fontSize=14.sp,lineHeight=23.sp)}}
@Composable private fun LiuTableRow(values:List<String>,header:Boolean){val p=LocalWebPalette.current;Row(Modifier.fillMaxWidth().background(if(header)p.tint else Color.White).padding(vertical=10.dp)){values.forEachIndexed { i,text->Text(text,Modifier.width(listOf(55,55,122,100,40,145,133)[i].dp).padding(horizontal=5.dp),fontSize=11.sp,color=p.ink,lineHeight=20.sp,fontWeight=if(header)FontWeight.Bold else FontWeight.Normal)}};HorizontalDivider(color=p.border)}
