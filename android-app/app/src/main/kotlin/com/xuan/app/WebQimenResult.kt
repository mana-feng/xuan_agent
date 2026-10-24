package com.xuan.app

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.xuan.core.*

private data class WebQimenCell(val number:Int,val name:String,val direction:String,val element:String)
private val webQimenCells=listOf(WebQimenCell(4,"巽","东南","木"),WebQimenCell(9,"离","南","火"),WebQimenCell(2,"坤","西南","土"),WebQimenCell(3,"震","东","木"),WebQimenCell(5,"中","中宫","土"),WebQimenCell(7,"兑","西","金"),WebQimenCell(8,"艮","东北","土"),WebQimenCell(1,"坎","北","水"),WebQimenCell(6,"乾","西北","金"))
@OptIn(ExperimentalMaterial3Api::class)
@Composable fun WebQimenResult(record:SavedChart,onAsk:()->Unit) {
    val p=LocalWebPalette.current
    val originalZone=record.result.metadata["原始时区"]?:record.input.timeZone
    val originalCivil=record.result.metadata["原始输入"]?:record.input.civil
    val chart=remember(record.input) { runCatching { QimenEngine().chart(record.input) }.getOrNull() }
    var list by rememberSaveable(record.id) { mutableStateOf(false) }
    var selected by rememberSaveable(record.id) { mutableStateOf(2) }
    var details by rememberSaveable(record.id) { mutableStateOf(false) }
    var rules by rememberSaveable(record.id) { mutableStateOf(false) }
    if(chart==null) { WebCard("还没有可显示的九宫盘") { Text("起局时间无效，请修改起局信息。",color=p.muted) };return }
    Column(Modifier.fillMaxWidth(),verticalArrangement=Arrangement.spacedBy(14.dp)) {
        WebCard {
            Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween,verticalAlignment=Alignment.CenterVertically) {
                Column(Modifier.weight(1f),verticalArrangement=Arrangement.spacedBy(7.dp)) {
                    Text("${chart.term} · ${chart.yuan}",fontSize=11.sp,color=p.secondary)
                    Text(record.input.title.ifBlank { "未命名起局" },fontFamily=FontFamily.Serif,fontSize=22.sp,color=p.ink)
                }
                Surface(color=p.tint,shape=RoundedCornerShape(7.dp)) { Text("${if(chart.yinYang=="yang") "阳遁" else "阴遁"} ${chart.number} 局",Modifier.padding(10.dp),color=p.primary,fontSize=15.sp,fontWeight=FontWeight.SemiBold) }
            }
            HorizontalDivider(color=p.border)
            QimenSummaryLine("北京时间 · UTC+08:00",chart.beijing.toString().replace('T',' '))
            QimenSummaryLine("四柱",chart.pillars.list().joinToString("　"))
            QimenSummaryLine("值符 / 值使","${chart.zhiFuStar} ${chart.zhiFuPalace}宫 / ${chart.zhiShiDoor} ${chart.zhiShiPalace}宫")
            if(originalZone!="Asia/Shanghai") Text("输入时刻：$originalCivil · $originalZone",fontSize=11.sp,color=p.muted)
        }
        Surface(color=Color.White,shape=RoundedCornerShape(14.dp),border=BorderStroke(1.dp,p.border)) {
            Column(Modifier.fillMaxWidth().padding(12.dp),verticalArrangement=Arrangement.spacedBy(12.dp)) {
                Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.SpaceBetween) {
                    Column(verticalArrangement=Arrangement.spacedBy(5.dp)) { WebSectionTitle("九宫盘");Text("南上北下 · 点选宫位",fontSize=11.sp,color=p.muted) }
                    Row(horizontalArrangement=Arrangement.spacedBy(4.dp)) { WebPill("九宫",!list) { list=false };WebPill("列表",list) { list=true } }
                }
                if(list) {
                    webQimenCells.chunked(2).forEach { row ->
                        Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(5.dp)) {
                            row.forEach { cell -> QimenCell(chart,cell,cell.number==selected,true,Modifier.weight(1f).heightIn(min=150.dp)) { selected=cell.number;details=true } }
                            if(row.size==1) Spacer(Modifier.weight(1f))
                        }
                    }
                } else {
                    Column(verticalArrangement=Arrangement.spacedBy(5.dp)) {
                        webQimenCells.chunked(3).forEach { row -> Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(5.dp)) {
                            row.forEach { cell -> QimenCell(chart,cell,cell.number==selected,false,Modifier.weight(1f).heightIn(min=157.dp)) { selected=cell.number;details=true } }
                        } }
                    }
                }
                Text("天 / 地 / 暗：天盘、地盘、暗干\n符：值符 · 使：值使 · 空：旬空 · 马：驿马",fontSize=10.sp,color=p.muted,lineHeight=19.sp)
            }
        }
        WebCard {
            WebSectionTitle("从盘面，到具体问题")
            Text("将这张九宫盘与起局问题带入对话，逐步梳理。",fontSize=13.sp,color=p.muted,lineHeight=22.sp)
            WebPrimaryButton("开始 AI 解读 ↗",onAsk)
        }
        WebCard {
            Row(Modifier.fillMaxWidth().clickable(role=Role.Button) { rules=!rules },horizontalArrangement=Arrangement.SpaceBetween) {
                Text("排盘规则与时间说明",fontSize=14.sp,color=p.ink);Text(if(rules) "−" else "+",color=p.primary)
            }
            if(rules) {
                Text("时家转盘 · 符头拆补，统一北京时间 UTC+08:00 起局，23:00 换日，按精确交节时刻切换节气。",fontSize=12.sp,color=p.muted,lineHeight=21.sp)
                Text("中五寄坤二，天禽随芮。暗干采用时干加值使真实落宫，三奇六仪按宫数阳顺阴逆；值使入中五从五宫起算，门显示寄坤二。",fontSize=12.sp,color=p.muted,lineHeight=21.sp)
                Text("输入时刻：$originalCivil（$originalZone）。\n规则版本 qimen-civil-v1 · qfdk/qimen / xuan-1",fontSize=11.sp,color=p.muted,lineHeight=21.sp)
            }
        }
    }
    if(details) {
        val cell=webQimenCells.first { it.number==selected }
        val maxHeight=(LocalConfiguration.current.screenHeightDp*.85f).dp
        ModalBottomSheet(onDismissRequest={details=false},sheetState=rememberModalBottomSheetState(skipPartiallyExpanded=true),dragHandle=null,
            containerColor=Color.White,shape=RoundedCornerShape(topStart=20.dp,topEnd=20.dp)) {
            Column(Modifier.fillMaxWidth().heightIn(max=maxHeight).verticalScroll(rememberScrollState()).padding(20.dp),verticalArrangement=Arrangement.spacedBy(16.dp)) {
                Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween,verticalAlignment=Alignment.CenterVertically) {
                    Column(Modifier.weight(1f),verticalArrangement=Arrangement.spacedBy(5.dp)) {
                        Text("当前选中",fontSize=10.sp,color=p.muted)
                        Text("${cell.name}$selected 宫",fontFamily=FontFamily.Serif,fontSize=24.sp,color=p.ink)
                        Text("${cell.direction} · ${cell.element}",fontSize=12.sp,color=p.muted)
                    }
                    OutlinedButton(onClick={details=false}) { Text("关闭 ×") }
                }
                val fields=listOf("九星" to chart.stars[selected],"八门" to chart.doors[selected],"八神" to chart.spirits[selected],"天盘干" to if(selected==5) "—" else chart.heaven[selected],"地盘干" to chart.earth[selected],"暗干" to chart.hidden[selected])
                fields.chunked(3).forEach { row ->
                    Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(12.dp)) {
                        row.forEach { (key,value) -> Column(Modifier.weight(1f),verticalArrangement=Arrangement.spacedBy(7.dp)) {
                            Text(key,fontSize=12.sp,color=p.muted);Text(value.orEmpty().ifBlank { "—" },color=p.ink,fontSize=18.sp)
                        } }
                    }
                }
                HorizontalDivider(color=p.border)
                if(selected==5) Text("中宫不单独排门、神。天禽随天芮转动，中五寄干随芮同宫。",fontSize=13.sp,color=p.muted,lineHeight=23.sp)
                else if(selected==2) Text("中宫地盘寄于坤二，天禽与中五天盘寄干随天芮转动。",fontSize=13.sp,color=p.muted,lineHeight=23.sp)
                val marks=qimenMarks(chart,selected)
                if(marks.isNotEmpty()) Text(marks.joinToString(" · "),fontSize=12.sp,color=p.primary)
                Text("旬空 ${chart.emptyBranches.joinToString("")} · 驿马 ${chart.horseBranch}",fontSize=11.sp,color=p.muted)
                Spacer(Modifier.height(8.dp))
            }
        }
    }
}
@Composable private fun QimenSummaryLine(label:String,value:String) {
    val p=LocalWebPalette.current

    Column(verticalArrangement=Arrangement.spacedBy(5.dp)) { Text(label,fontSize=11.sp,color=p.muted);Text(value,fontSize=14.sp,color=p.ink,lineHeight=22.sp) }
}
private fun qimenMarks(chart:QimenChart,n:Int)=if(n==5) emptyList() else listOfNotNull(if(chart.zhiFuPalace==n) "符" else null,if(chart.zhiShiPalace==n) "使" else null,if(n in chart.emptyPalaces) "空" else null,if(chart.horsePalace==n) "马" else null)
@Composable private fun QimenCell(chart:QimenChart,cell:WebQimenCell,selected:Boolean,list:Boolean,modifier:Modifier,onClick:()->Unit) {
    val p=LocalWebPalette.current;val n=cell.number
    Surface(modifier.clickable(role=Role.Button,onClick=onClick).semantics { contentDescription="${cell.name}${cell.number}宫，查看详情" },color=if(selected) p.tint else if(n==5) p.background else Color.White,
        shape=RoundedCornerShape(8.dp),border=BorderStroke(1.dp,if(selected) p.primary else p.border)) {
        Column(Modifier.padding(if(list) 13.dp else 7.dp),verticalArrangement=Arrangement.spacedBy(7.dp)) {
            Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween) {
                Text("${cell.name} $n",fontSize=12.sp,color=p.ink,fontWeight=FontWeight.SemiBold);Text(cell.direction,fontSize=9.sp,color=p.muted)
            }
            if(n==5) {
                Text("中",fontSize=29.sp,color=p.secondary,fontFamily=FontFamily.Serif,modifier=Modifier.align(Alignment.CenterHorizontally))
                Text("地盘 ${chart.earth[5]}",fontSize=11.sp,color=p.muted,modifier=Modifier.align(Alignment.CenterHorizontally))
                Text("天禽随芮",fontSize=10.sp,color=p.muted,modifier=Modifier.align(Alignment.CenterHorizontally))
            } else {
                Text(chart.spirits[n].orEmpty(),fontSize=12.sp,color=p.secondary)
                Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween) {
                    Text(chart.stars[n].orEmpty(),fontSize=15.sp,color=p.ink,fontFamily=FontFamily.Serif)
                    Text(chart.doors[n].orEmpty(),fontSize=15.sp,color=p.primary,fontWeight=FontWeight.SemiBold,fontFamily=FontFamily.Serif)
                }
                Text("天 ${chart.heaven[n]}  地 ${chart.earth[n]}  暗 ${chart.hidden[n]}",fontSize=10.sp,color=p.ink)
                val marks=qimenMarks(chart,n).joinToString(" · ")+if(n==2) "  寄 ${chart.earth[5]}" else ""
                Text(marks,fontSize=10.sp,color=p.secondary)
            }
        }
    }
}
