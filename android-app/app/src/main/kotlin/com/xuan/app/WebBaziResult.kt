@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
package com.xuan.app

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.listSaver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.xuan.core.*
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter

private val BaziSelectionSaver=listSaver<BaziTransit.Selection,Int>(
    save={ listOf(it.cycle,it.year,it.month,it.day,it.time) },
    restore={ BaziTransit.Selection(it[0],it[1],it[2],it[3],it[4]) })

/** Non-scrolling page body: the host owns the single vertical scroll container and record actions. */
@Composable fun WebBaziResult(record:SavedChart,onAsk:()->Unit) {
    val p=LocalWebPalette.current
    val data=remember(record.input) { BaziWebData(record.input) }
    val transit=remember(record.input) { BaziTransit(record.input) }
    fun today()=LocalDate.now(ZoneId.of(record.input.timeZone))
    var selection by rememberSaveable(record.id,record.input,stateSaver=BaziSelectionSaver) { mutableStateOf(transit.locate(today())) }
    val years=transit.years(selection);val months=transit.months(selection);val days=transit.days(selection)
    val currentCycle=transit.cycles.getOrNull(selection.cycle)
    val currentYear=years.getOrNull(selection.year);val currentMonth=months.getOrNull(selection.month);val currentDay=days.getOrNull(selection.day)
    val extra=buildList {
        currentCycle?.takeIf { it.ganzhi!="童限" }?.let { add("大运" to it.ganzhi) }
        currentYear?.let { add("流年" to it.ganzhi) };currentMonth?.let { add("流月" to it.ganzhi) };currentDay?.let { add("流日" to it.ganzhi) }
    }
    val columns=remember(data,extra) { data.columns(extra) }
    Column(Modifier.fillMaxWidth(),verticalArrangement=Arrangement.spacedBy(18.dp)) {
        WebCard("基本信息") {
            Row(horizontalArrangement=Arrangement.spacedBy(10.dp)) {
                BaziInfoTile("姓名",record.input.title.ifBlank { "佚名" },Modifier.weight(1f))
                BaziInfoTile("性别",if(record.input.gender==0) "男" else "女",Modifier.weight(1f))
            }
            Row(horizontalArrangement=Arrangement.spacedBy(10.dp)) {
                BaziInfoTile("生肖","鼠牛虎兔龙蛇马羊猴鸡狗猪"[GanZhi.mod(data.local.year-4,12)].toString(),Modifier.weight(1f))
                BaziInfoTile("星座",baziConstellation(data.local.toLocalDate())+"座",Modifier.weight(1f))
            }
            BaziInfoTile("阳历",data.local.format(DateTimeFormatter.ofPattern("yyyy/MM/dd HH:mm")))
            val lunar=remember(data) { CalendarEngine().lunar(data.local.toLocalDate()) }
            BaziInfoTile("阴历","${lunar.year}年${if(lunar.isLeap) "闰" else ""}${"正二三四五六七八九十冬腊"[lunar.month-1]}月${BaziTransit.lunarDay(lunar.day)}  ${data.pillars.hour[1]}时")
            Text("${record.input.timeZone} · ${if(record.input.dayDivide=="zi") "23:00 子初换日" else "00:00 换日"} · 立春分年",color=p.muted,fontSize=11.sp,lineHeight=18.sp)
        }
        WebCard("四柱总览") {
            BaziPillarMatrix(columns)
            Text("左右滑动，查看四柱与当前岁运 ↔",color=p.muted,fontSize=11.sp)
            HorizontalDivider(color=p.border)
            val luck=transit.luck
            BaziInfoTile("起运","出生后${luck.years}年${luck.months}月${luck.days}日起运 · ${if(luck.forward) "顺行" else "逆行"}")
            BaziInfoTile("起运公历",luck.start.format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")))
        }
        WebCard {
            Text("EXPLORE A LITTLE DEEPER",color=p.primary,fontSize=10.sp,letterSpacing=1.5.sp)
            WebSectionTitle("看见结构，再聊细节。")
            Text("把盘面与自己的生活经验放在一起，从一个关心的问题开始。当前命盘会随对话一起带入。",color=p.muted,fontSize=13.sp,lineHeight=22.sp)
            WebPrimaryButton("带着这张盘，问问 AI ↗",onAsk)
            Text("传统文化探索 · 供交流与参考",color=p.muted,fontSize=11.sp)
        }
        WebCard("结构与关系") {
            Text("干支关系图",color=p.muted,fontSize=12.sp)
            val graphExtra=extra.filter { it.first!="流日" }
            BaziRelationDiagram(data.pillars.list()+graphExtra.map { it.second },listOf("年柱","月柱","日柱","时柱")+graphExtra.map { it.first },data.diagram(graphExtra.map { it.second }))
            BaziFinding("格局",data.structure)
            BaziFinding("日主强弱",data.strength)
            Text("五行旺衰",color=p.muted,fontSize=12.sp)
            FlowRow(horizontalArrangement=Arrangement.spacedBy(8.dp),verticalArrangement=Arrangement.spacedBy(8.dp)) {
                data.elements.forEach { (element,value) ->
                    Surface(color=p.tint,shape=RoundedCornerShape(7.dp)) { Text("$element：$value",Modifier.padding(9.dp),color=p.ink,fontSize=12.sp) }
                }
            }
        }
        WebCard("大运流年") {
            Text("点选岁运，联动上方表格与关系图；再次点选可取消",color=p.muted,fontSize=11.sp)
            BaziTimelineRow("大运",transit.cycles.map { listOf(it.startYear.toString(),it.ganzhi,"${it.startAge}岁",if(it.ganzhi=="童限") "流年" else BaziEngine().tenGod(data.pillars.day[0],it.ganzhi[0])) },selection.cycle,
                enabled={ transit.cycles[it].endYear>=transit.cycles[it].startYear }) { selection=transit.select(selection,BaziTransit.Level.CYCLE,it) }
            BaziTimelineRow("流年",years.map { listOf("${it.year}",it.ganzhi,"${it.age}岁",BaziEngine().tenGod(data.pillars.day[0],it.ganzhi[0])) },selection.year) { selection=transit.select(selection,BaziTransit.Level.YEAR,it) }
            BaziTimelineRow("流月",months.map { listOf(it.jie,"${it.start.monthValue}/${it.start.dayOfMonth}",it.ganzhi,BaziEngine().tenGod(data.pillars.day[0],it.ganzhi[0])) },selection.month) { selection=transit.select(selection,BaziTransit.Level.MONTH,it) }
            currentMonth?.let { Text("${it.jie}：${it.start.format(DateTimeFormatter.ofPattern("yyyy/M/d HH:mm"))} — ${it.end.format(DateTimeFormatter.ofPattern("yyyy/M/d HH:mm"))}",color=p.muted,fontSize=11.sp,lineHeight=18.sp) }
            if(currentYear!=null && months.isEmpty()) Text("当前年份超出本机完整节令数据范围（1900—2101 流年），流月、流日暂不可用。",color=p.muted,fontSize=12.sp,lineHeight=20.sp)
            BaziTimelineRow("流日",days.map { listOf("${it.date.monthValue}/${it.date.dayOfMonth}",it.lunar,it.ganzhi,BaziEngine().tenGod(data.pillars.day[0],it.ganzhi[0])) },selection.day) { selection=transit.select(selection,BaziTransit.Level.DAY,it) }
            val moving=listOfNotNull(currentCycle?.takeIf { it.ganzhi!="童限" }?.let { "大运" to it.ganzhi },currentYear?.let { "流年" to it.ganzhi },currentMonth?.let { "流月" to it.ganzhi },currentDay?.let { "流日" to it.ganzhi })
            moving.forEach { (label,gz) -> Text("$label $gz · 神煞：${data.stars(gz).joinToString("、").ifBlank { "—" }}",color=p.muted,fontSize=11.sp,lineHeight=19.sp) }
        }
    }
}

@Composable private fun BaziInfoTile(title:String,value:String,modifier:Modifier=Modifier) {
    val p=LocalWebPalette.current
    Column(modifier.fillMaxWidth().background(p.tint.copy(alpha=.5f),RoundedCornerShape(9.dp)).padding(12.dp),verticalArrangement=Arrangement.spacedBy(6.dp)) {
        Text(title,color=p.muted,fontSize=11.sp)
        Text(value,color=p.ink,fontSize=14.sp,fontWeight=FontWeight.Medium,lineHeight=21.sp)
    }
}

@Composable private fun BaziFinding(title:String,finding:BaziWebData.Finding) {
    val p=LocalWebPalette.current
    Column(Modifier.fillMaxWidth().background(p.tint.copy(alpha=.5f),RoundedCornerShape(9.dp)).padding(13.dp),verticalArrangement=Arrangement.spacedBy(7.dp)) {
        Text(title,color=p.muted,fontSize=12.sp)
        Text(finding.type,color=p.ink,fontSize=15.sp,fontWeight=FontWeight.SemiBold)
        Text(finding.description,color=p.muted,fontSize=12.sp,lineHeight=20.sp)
    }
}

@Composable private fun BaziPillarMatrix(columns:List<BaziWebData.Column>) {
    val p=LocalWebPalette.current
    val names=columns.first().fields.keys.toList()
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val fixedWidth=44.dp
        val natalWidth=(maxWidth-fixedWidth)/4
        val widths=columns.mapIndexed { index,col -> if(index<4) natalWidth else maxOf(80,(col.fields.getValue("神煞").lines().maxOfOrNull { it.length } ?: 0)*11+12).dp }
        val heights=names.map { name -> when(name) {
            "神煞"->(columns.mapIndexed { index,col -> col.fields.getValue(name).lines().sumOf { line -> kotlin.math.ceil(line.length*11.0/(widths[index].value-6).coerceAtLeast(1f)).toInt().coerceAtLeast(1) } }.max()*18+20).dp
            "藏干","副星"->76.dp
            else->42.dp
        } }
        Row(Modifier.fillMaxWidth()) {
            Column(Modifier.width(fixedWidth)) {
                BaziMatrixCell("\\",fixedWidth,42.dp,p.tint)
                names.forEachIndexed { i,name -> BaziMatrixCell(name,fixedWidth,heights[i],if(i%2==0) Color(0xFFF0F1F3) else Color(0xFFE5E7EB)) }
            }
            Column(Modifier.horizontalScroll(rememberScrollState())) {
                Row { columns.forEachIndexed { j,col -> BaziMatrixCell(col.title,widths[j],42.dp,p.tint) } }
                names.forEachIndexed { i,name ->
                    Row { columns.forEachIndexed { j,col ->
                        val value=col.fields.getValue(name)
                        BaziMatrixCell(value,widths[j],heights[i],if(i%2==0) Color(0xFFF0F1F3) else Color(0xFFE5E7EB),if(name=="天干" || name=="地支") baziElementColor(col.ganzhi[if(name=="天干") 0 else 1]) else p.ink,
                            "$name ${col.title} $value")
                    } }
                }
            }
        }
    }
}

@Composable private fun BaziMatrixCell(text:String,width:Dp,height:Dp,background:Color,color:Color=LocalWebPalette.current.ink,description:String=text) {
    Box(Modifier.width(width).height(height).background(background).padding(horizontal=3.dp,vertical=4.dp).semantics { contentDescription=description },contentAlignment=Alignment.Center) {
        Text(text,color=color,fontSize=11.sp,lineHeight=18.sp,textAlign=TextAlign.Center)
    }
}

@Composable private fun BaziTimelineRow(title:String,items:List<List<String>>,selected:Int,enabled:(Int)->Boolean={true},onSelect:(Int)->Unit) {
    if(items.isEmpty()) return
    val p=LocalWebPalette.current;val state=rememberLazyListState()
    LaunchedEffect(selected,items) { if(selected in items.indices) state.animateScrollToItem(selected) }
    Column(verticalArrangement=Arrangement.spacedBy(9.dp)) {
        Text(title,color=p.ink,fontSize=14.sp,fontWeight=FontWeight.SemiBold)
        HorizontalDivider(color=p.border)
        LazyRow(state=state,horizontalArrangement=Arrangement.spacedBy(7.dp),modifier=Modifier.fillMaxWidth()) {
            itemsIndexed(items) { i,lines ->
                Surface(modifier=Modifier.width(78.dp).selectable(selected=i==selected,enabled=enabled(i),role=Role.RadioButton,onClick={onSelect(i)}).semantics { contentDescription="$title ${lines.joinToString(" ")}${if(i==selected) " 已选" else ""}" },
                    shape=RoundedCornerShape(9.dp),color=if(i==selected) p.tint else Color.White,border=BorderStroke(1.dp,if(i==selected) p.primary.copy(alpha=.4f) else p.border)) {
                    Column(Modifier.padding(horizontal=4.dp,vertical=11.dp),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.spacedBy(6.dp)) {
                        lines.forEachIndexed { row,text -> Text(text,color=if(!enabled(i)) p.muted.copy(alpha=.45f) else if(i==selected) p.primary else p.ink,fontSize=if(row==1) 15.sp else 11.sp,fontWeight=if(row==1) FontWeight.SemiBold else FontWeight.Normal) }
                    }
                }
            }
        }
    }
}

@Composable private fun BaziRelationDiagram(values:List<String>,labels:List<String>,diagram:Pair<List<BaziDetails.RelationEdge>,List<BaziDetails.RelationEdge>>) {
    val p=LocalWebPalette.current
    var selected by remember(values) { mutableStateOf<Pair<Boolean,BaziDetails.RelationEdge>?>(null) }
    var node by remember(values) { mutableStateOf<Pair<Boolean,Int>?>(null) }
    val width=76.dp*values.size
    fun active(edge:BaziDetails.RelationEdge,gan:Boolean)=selected==(gan to edge) || node?.let { it.first==gan && (it.second==edge.from || it.second==edge.to) }==true
    fun toggleRelation(edge:BaziDetails.RelationEdge,gan:Boolean) { node=null;selected=if(selected==(gan to edge)) null else gan to edge }
    Column(verticalArrangement=Arrangement.spacedBy(8.dp)) {
        Column(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState())) {
            diagram.first.sortedWith(compareBy({ minOf(it.from,it.to) },{ maxOf(it.from,it.to) })).forEach { edge -> BaziRelationLine(edge,true,values,labels,width,active(edge,true)) { toggleRelation(edge,true) } }
            Row(Modifier.width(width).padding(top=12.dp)) {
                Text("原局 · 四柱",Modifier.width(76.dp*4).background(p.tint).padding(horizontal=10.dp,vertical=7.dp),fontSize=11.sp,color=p.muted)
                if(values.size>4) Text("岁运 · 当前",Modifier.width(76.dp*(values.size-4)).background(p.accent.copy(alpha=.08f)).padding(horizontal=10.dp,vertical=7.dp),fontSize=11.sp,color=p.muted)
            }
            Row(Modifier.width(width).padding(vertical=9.dp)) {
                values.forEachIndexed { i,gz ->
                    Column(Modifier.width(76.dp).padding(horizontal=4.dp).background(if(i==2) p.tint else p.background,RoundedCornerShape(8.dp)).padding(vertical=9.dp),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.spacedBy(7.dp)) {
                        Text(labels[i],color=p.muted,fontSize=11.sp)
                        listOf(true,false).forEach { gan ->
                            val value=gz[if(gan) 0 else 1]
                            val target=node==(gan to i) || selected?.let { it.first==gan && (it.second.from==i || it.second.to==i) }==true
                            Surface(Modifier.size(36.dp).selectable(node==(gan to i),role=Role.Button,onClick={selected=null;node=if(node==(gan to i)) null else gan to i}).semantics { contentDescription="定位${labels[i]}${if(gan) "天干" else "地支"}$value" },color=if(target) p.tint else Color.White,shape=RoundedCornerShape(8.dp),border=BorderStroke(if(target) 2.dp else 1.dp,if(target) p.primary else p.border)) {
                                Box(contentAlignment=Alignment.Center) { Text(value.toString(),color=baziElementColor(value),fontSize=20.sp,fontWeight=FontWeight.SemiBold) }
                            }
                        }
                        if(i==2) Text("日主",fontSize=9.sp,color=p.primary)
                    }
                }
            }
            diagram.second.sortedWith(compareBy({ minOf(it.from,it.to) },{ maxOf(it.from,it.to) })).forEach { edge -> BaziRelationLine(edge,false,values,labels,width,active(edge,false)) { toggleRelation(edge,false) } }
        }
        Text(if(diagram.first.isEmpty() && diagram.second.isEmpty()) "暂无可显示的干支关系" else "点关系，查看基础含义 · 左右滑动查看完整柱位 ↔",color=p.muted,fontSize=11.sp,lineHeight=18.sp)
    }
    selected?.let { (gan,edge) ->
        val index=if(gan) 0 else 1
        val kind=if(gan) "天干" else "地支"
        AlertDialog(onDismissRequest={selected=null},title={Text("${edge.label} · 关系说明")},text={Column(verticalArrangement=Arrangement.spacedBy(14.dp)) {
            Text("${labels[edge.from]} $kind ${values[edge.from][index]} ↔ ${labels[edge.to]} $kind ${values[edge.to][index]}")
            Text(baziRelationMeaning(edge,values[edge.from][index]==values[edge.to][index]))
        }},confirmButton={TextButton(onClick={selected=null}) { Text("关闭") }})
    }
}

@Composable private fun BaziRelationLine(edge:BaziDetails.RelationEdge,gan:Boolean,values:List<String>,labels:List<String>,width:Dp,highlight:Boolean,onClick:()->Unit) {
    val p=LocalWebPalette.current;val index=if(gan) 0 else 1
    Box(Modifier.width(width).height(30.dp).background(if(highlight) p.tint else Color.Transparent).clickable(onClick=onClick).semantics {
        contentDescription="查看关系：${labels[edge.from]}${values[edge.from][index]} ${edge.label} ${labels[edge.to]}${values[edge.to][index]}"
    }) {
        Canvas(Modifier.fillMaxSize()) {
            val left=size.width*(edge.from+.5f)/values.size;val right=size.width*(edge.to+.5f)/values.size
            drawLine(if(highlight) p.primary else p.border,Offset(left,size.height/2),Offset(right,size.height/2),if(highlight) 2.dp.toPx() else 1.dp.toPx())
            drawCircle(p.primary,2.dp.toPx(),Offset(left,size.height/2));drawCircle(p.primary,2.dp.toPx(),Offset(right,size.height/2))
        }
        Text(edge.label,modifier=Modifier.offset(x=76.dp*(edge.from+edge.to+1)/2-23.dp,y=5.dp).width(46.dp).background(Color.White),textAlign=TextAlign.Center,color=p.primary,fontSize=11.sp)
        Text(values[edge.from][index].toString(),Modifier.offset(x=76.dp*edge.from+30.dp,y=5.dp).background(Color.White),color=baziElementColor(values[edge.from][index]),fontSize=11.sp)
        Text(values[edge.to][index].toString(),Modifier.offset(x=76.dp*edge.to+30.dp,y=5.dp).background(Color.White),color=baziElementColor(values[edge.to][index]),fontSize=11.sp)
    }
}

private fun baziElementColor(c:Char)=when(BaziWebData.element(c)) { '木'->Color(0xFF34894A);'火'->Color(0xFFC43B32);'土'->Color(0xFF795548);'金'->Color(0xFFA47A13);else->Color(0xFF2179AD) }
private fun baziConstellation(date:LocalDate):String {
    val boundary=listOf(20,19,21,20,21,22,23,23,23,24,23,22)
    val names=listOf("摩羯","水瓶","双鱼","白羊","金牛","双子","巨蟹","狮子","处女","天秤","天蝎","射手","摩羯")
    return names[date.monthValue-1+if(date.dayOfMonth>=boundary[date.monthValue-1]) 1 else 0]
}
private fun baziRelationMeaning(edge:BaziDetails.RelationEdge,same:Boolean):String = when(edge.type) {
    "ganHe"->"天干五合表示两干相合、彼此牵连；有合不等于已经合化。"
    "ganChong"->"天干相冲表示两干相对、彼此制约。"
    "zhiHe"->"地支六合表示两支相合、彼此牵连；不据此直接判断成化。"
    "chong"->"地支相冲表示两支相对、彼此冲动。"
    "xing"->if(same) "自刑指辰、午、酉、亥各自与同支相见所成的刑。" else "相刑表示地支之间相互牵制、关系不协调。"
    "sanHe"->"三合指三支依生、旺、墓相合，聚向同一五行；有合不等于已化。"
    "banHe"->"半合指同一三合组中两种不同地支的相合，尚非完整三合。"
    "sanHui"->"三会指同一方位、同一季节的三支会聚。"
    "hai"->"相害指两支之间相互牵制、不相协调的关系。"
    "po"->"相破指地支之间相互破损、牵制的关系。"
    "anHe"->"暗合从地支所藏天干的相合配对，观察两支间的隐含联系。"
    else->"传统干支关系仅记录结构，不直接判断吉凶。"
}
