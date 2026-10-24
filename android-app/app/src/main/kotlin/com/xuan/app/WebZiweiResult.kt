@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
package com.xuan.app

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.xuan.core.*
import java.time.LocalDateTime

@Composable fun WebZiweiResult(record: SavedChart, onAsk: () -> Unit, focusPalace: String? = null, onViewChange: (ZiweiViewState) -> Unit = {}) {
    val p=LocalWebPalette.current; val natal=record.result; val m=natal.metadata
    val engine=remember { ZiweiHoroscope() }
    val soul=(0..11).firstOrNull { m["palace.$it.name"]=="命宫" } ?: 0
    var selected by rememberSaveable(record.id) { mutableStateOf(soul) }
    var hasFocus by rememberSaveable(record.id) { mutableStateOf(false) }
    LaunchedEffect(record.id,focusPalace) {
        val name=focusPalace?.let { AgentActions.normalizeZiweiPalace(it) }
        val index=(0..11).firstOrNull { m["palace.$it.name"]==name }
        if(index!=null) { selected=index;hasFocus=true }
    }
    var dialog by rememberSaveable(record.id) { mutableStateOf<Int?>(null) }
    var mode by rememberSaveable(record.id) { mutableStateOf("origin") }
    var dateText by rememberSaveable(record.id) { mutableStateOf(LocalDateTime.now().withSecond(0).withNano(0).toString()) }
    var rules by rememberSaveable { mutableStateOf(false) }
    var lastTap by remember(record.id) { mutableStateOf(0L) }
    var lastTapPalace by remember(record.id) { mutableStateOf<Int?>(null) }
    val publishView by rememberUpdatedState(onViewChange)
    val view=ZiweiViewState(record.id,dateText,mode,if(hasFocus) selected else -1)
    LaunchedEffect(view) { publishView(view) }
    val originalZone=m["原始时区"]?:record.input.timeZone
    val target=LocalDateTime.parse(dateText)
    val flow=remember(natal,dateText) { runCatching { engine.calculate(natal,target) }.getOrNull() }
    val scope=if(mode=="origin") null else flow?.scopes?.get(mode)
    val scopeTitle=scope?.let { it.stemBranch+ziweiScopeNames.getValue(mode) } ?: "本命 · 十二宫"
    val fly=if(hasFocus) engine.transformations(m.getValue("palace.$selected.stemBranch")[0]) else emptyList()
    val related=if(hasFocus) engine.related(selected) else emptyList()
    Column(Modifier.fillMaxWidth(),verticalArrangement=Arrangement.spacedBy(14.dp)) {
        WebCard("基础信息") {
          Column(verticalArrangement=Arrangement.spacedBy(8.dp)) {
            Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(10.dp)) {
                Column(Modifier.weight(1f),verticalArrangement=Arrangement.spacedBy(4.dp)) {
                    ZiweiInfo("姓名",record.input.title.ifBlank { "匿名" })
                    ZiweiInfo("性别",if(record.input.gender==0) "男" else "女")
                }
                Column(Modifier.weight(1f),verticalArrangement=Arrangement.spacedBy(4.dp)) {
                    ZiweiInfo("五行局",m["fiveElementsClass"].orEmpty())
                    ZiweiInfo("命主 / 身主",m["soul"].orEmpty()+" / "+m["body"].orEmpty())
                }
            }
            HorizontalDivider(color=p.border)
            ZiweiInfo("阳历",record.input.civil.take(10))
            ZiweiInfo("阴历",m["lunar"].orEmpty())
            Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween,verticalAlignment=Alignment.CenterVertically) {
                Text(record.input.civil.substringAfter(' ').take(5)+" · "+originalZone,fontSize=11.sp,color=p.muted,modifier=Modifier.weight(1f))
                TextButton(onClick={rules=!rules}) { Text("排盘规则 ${if(rules) "−" else "+"}",fontSize=11.sp) }
            }
            if(rules) {
                Text("按出生地民用钟表时间排盘；23 点换日，闰月十五／十六分界，正月初一换年，不校正真太阳时。",fontSize=12.sp,color=p.muted,lineHeight=20.sp)
                Text("亮度采用《紫微斗数全书》表，已修正旧版酉宫三项数据；四化采用戊右弼化科、庚太阴化科、壬左辅化科。",fontSize=12.sp,color=p.muted,lineHeight=20.sp)
            }
            if(m["lateZiRollover"]=="true") Text("晚子时按 ${m["calculationDate"]} 子时排盘；阴历为排盘历日。",fontSize=11.sp,color=p.secondary)
          }
        }
        Surface(color=Color.White,shape=RoundedCornerShape(14.dp),border=BorderStroke(1.dp,p.border)) {
            Column(Modifier.fillMaxWidth().padding(horizontal=8.dp,vertical=16.dp),verticalArrangement=Arrangement.spacedBy(12.dp)) {
                Row(Modifier.padding(horizontal=4.dp).fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween,verticalAlignment=Alignment.CenterVertically) {
                    WebSectionTitle("命盘总览");Text("$scopeTitle · 主星与四化",fontSize=9.sp,color=p.muted)
                }
                if(mode!="origin" && flow==null) Text("选定时间超出可用运限范围，请从下方时间轴选择大限。当前显示本命盘。",fontSize=12.sp,color=p.muted)
                BoxWithConstraints(Modifier.fillMaxWidth().background(p.tint,RoundedCornerShape(9.dp)).padding(3.dp)) {
                    val gap=3.dp;val w=(maxWidth-gap*3)/4;val h=144.dp
                    Column(verticalArrangement=Arrangement.spacedBy(gap)) {
                        listOf(listOf(3,4,5,6),listOf(2,-1,-1,7),listOf(1,-1,-1,8),listOf(0,11,10,9)).forEach { row ->
                            Row(Modifier.heightIn(min=h).height(IntrinsicSize.Min),horizontalArrangement=Arrangement.spacedBy(gap)) { row.forEach { index ->
                                if(index<0) Spacer(Modifier.width(w).fillMaxHeight()) else {
                                    Surface(Modifier.width(w).fillMaxHeight().clickable(role=Role.Button) {
                                        selected=index;hasFocus=true
                                        val now=android.os.SystemClock.uptimeMillis()
                                        if(lastTapPalace==index && now-lastTap<=280L) { dialog=index;lastTapPalace=null;lastTap=0L }
                                        else { lastTapPalace=index;lastTap=now }
                                    }
                                        .semantics { contentDescription="${displayZiweiName(m["palace.$index.name"].orEmpty())}，点选查看三方四正" },
                                        color=if(index==selected) p.tint else if(index in related) p.background else Color.White,
                                        shape=RoundedCornerShape(6.dp),border=BorderStroke(if(index==selected) 2.dp else 1.dp,if(index==selected) p.primary else if(index in related) p.secondary.copy(alpha=.4f) else p.border)) {
                                        Column(Modifier.padding(horizontal=5.dp,vertical=7.dp),verticalArrangement=Arrangement.spacedBy(4.dp)) {
                                            FlowRow(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(4.dp),verticalArrangement=Arrangement.spacedBy(2.dp)) {
                                                Text(displayZiweiName(m["palace.$index.name"].orEmpty()),fontSize=11.sp,fontWeight=FontWeight.SemiBold,color=p.ink)
                                                Text(m["palace.$index.stemBranch"].orEmpty(),fontSize=9.sp,color=p.muted)
                                            }
                                            val major=ziweiStars(m["palace.$index.majorStars"])
                                            Column(Modifier.weight(1f),verticalArrangement=Arrangement.spacedBy(3.dp)) {
                                                if(major.isEmpty()) Text("无主星",fontSize=11.sp,color=p.muted)
                                                major.forEach { star -> ZiweiStarLine(star,scope,compact=true) }
                                            }
                                            scope?.let { Text(ziweiScopePrefix.getValue(mode)+displayZiweiName(it.palaceNames[index]),fontSize=10.sp,color=p.secondary) }
                                            FlowRow(horizontalArrangement=Arrangement.spacedBy(4.dp)) {
                                                Text(m["palace.$index.decadal"].orEmpty().replace(",","–")+" 岁",fontSize=9.sp,color=p.muted)
                                                Text(if(m["palace.$index.isBody"]=="true") "身宫" else m["palace.$index.changsheng"].orEmpty(),fontSize=9.sp,color=if(m["palace.$index.isBody"]=="true") p.secondary else p.muted)
                                            }
                                            val flyTags=ziweiStars(m["palace.$index.majorStars"])+ziweiStars(m["palace.$index.minorStars"])
                                            val tags=flyTags.mapNotNull { star -> fly.indexOf(star[0]).takeIf { it>=0 }?.let { "飞"+ziweiMutagens[it] } }
                                            if(tags.isNotEmpty()) Text(tags.joinToString(" "),fontSize=9.sp,color=Color(0xFF966F38))
                                            Text("详情 ↗",Modifier.align(Alignment.End).clickable { selected=index;hasFocus=true;dialog=index }.padding(vertical=3.dp),fontSize=10.sp,color=p.muted)
                                        }
                                    }
                                }
                            } }
                        }
                    }
                    Column(Modifier.align(Alignment.Center).width(w*2+gap).height(h*2+gap).padding(6.dp),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.spacedBy(8.dp,Alignment.CenterVertically)) {
                        Text(scopeTitle,fontSize=10.sp,color=p.secondary)
                        Text("✳",fontSize=29.sp,color=p.secondary)
                        Text(record.input.title.ifBlank { "匿名命盘" },fontSize=16.sp,fontFamily=FontFamily.Serif,color=p.ink)
                        Text(record.input.civil.take(10),fontSize=10.sp,color=p.muted)
                        Text(m["fiveElementsClass"].orEmpty()+" · "+if(m["lateZiRollover"]=="true") "晚子时" else "${GanZhi.ZHI[m["timeIndex"]?.toIntOrNull()?.coerceIn(0,11) ?: 0]}时",fontSize=10.sp,color=p.muted)
                        Text("当前宫位  "+displayZiweiName(m["palace.$selected.name"].orEmpty()),fontSize=10.sp,color=p.ink)
                        Text("轻点宫位看关联\n点击「详情」展开",fontSize=9.sp,color=p.muted,textAlign=TextAlign.Center)
                    }
                }
                Text("● 当前宫位     ◌ 三方四正     禄 · 权 · 科 · 忌",fontSize=9.sp,color=p.muted)
                OutlinedButton(onClick={hasFocus=true;dialog=selected},modifier=Modifier.fillMaxWidth(),shape=RoundedCornerShape(8.dp)) { Text("查看${displayZiweiName(m["palace.$selected.name"].orEmpty())}完整信息 ↗",fontSize=12.sp) }
            }
        }
        WebCard {
            Text("EXPLORE A LITTLE DEEPER",fontSize=10.sp,color=p.secondary)
            WebSectionTitle("看见结构，再聊细节。")
            Text("把盘面与自己的生活经验放在一起，从一个关心的问题开始。当前命盘会随对话一起带入。",fontSize=13.sp,color=p.muted,lineHeight=22.sp)
            WebPrimaryButton("带着这张盘，问问 AI ↗",onAsk)
            Text("传统文化探索 · 供交流与参考",fontSize=10.sp,color=p.muted)
        }
        WebCard("运限时间轴") {
            ZiweiTimeline(record,flow,target,mode,engine) { nextMode,next -> mode=nextMode;dateText=next.toString();selected=soul;hasFocus=false }
        }
    }
    dialog?.let { index -> AlertDialog(onDismissRequest={dialog=null},title={Text("宫位完整信息",fontFamily=FontFamily.Serif)},text={
        Column(Modifier.verticalScroll(rememberScrollState()),verticalArrangement=Arrangement.spacedBy(12.dp)) {
            ZiweiPalaceDetails(natal,index,scope,flow,mode,engine,fly)
        }
    },confirmButton={TextButton(onClick={dialog=null}) { Text("关闭 ×") }}) }
}

private val ziweiScopeNames=linkedMapOf("origin" to "本命","decadal" to "大限","yearly" to "流年","monthly" to "流月","daily" to "流日","age" to "小限","hourly" to "流时")
private val ziweiScopePrefix=mapOf("decadal" to "大","age" to "小","yearly" to "年","monthly" to "月","daily" to "日","hourly" to "时")
private val ziweiMutagens=listOf("禄","权","科","忌")
private fun displayZiweiName(name:String)=if(name=="仆役") "交友" else name
private fun ziweiStars(value:String?)=value.orEmpty().split(',').filter { it.isNotBlank() }.map { it.split(':') }
@Composable private fun ZiweiInfo(label:String,value:String) {
    val p=LocalWebPalette.current
    Row(horizontalArrangement=Arrangement.spacedBy(8.dp)) {
        Text(label,Modifier.width(if(label=="命主 / 身主") 64.dp else 34.dp),fontSize=10.sp,color=p.muted)
        Text(value,fontSize=12.sp,color=p.ink)
    }
}
@Composable private fun ZiweiStarLine(star:List<String>,scope:ZiweiScope?,compact:Boolean=false) {
    val p=LocalWebPalette.current
    val natalTag=star.getOrNull(2).orEmpty();val flowTag=scope?.transformations?.indexOf(star[0]) ?: -1
    FlowRow(horizontalArrangement=Arrangement.spacedBy(2.dp),verticalArrangement=Arrangement.spacedBy(2.dp)) {
        Text(star[0],fontSize=if(compact) 14.sp else 17.sp,fontFamily=FontFamily.Serif,color=p.ink)
        Text(star.getOrNull(1).orEmpty(),fontSize=9.sp,color=p.muted)
        if(natalTag.isNotEmpty()) Text(natalTag,fontSize=9.sp,color=if(natalTag=="忌") Color(0xFF986036) else p.accent)
        if(flowTag>=0) Text(ziweiScopePrefix[scope?.key].orEmpty()+ziweiMutagens[flowTag],fontSize=9.sp,color=p.primary)
    }
}
@Composable private fun ZiweiPalaceDetails(natal:ChartResult,index:Int,scope:ZiweiScope?,flow:ZiweiFlow?,mode:String,engine:ZiweiHoroscope,fly:List<String>) {
    val p=LocalWebPalette.current;val m=natal.metadata;val key="palace.$index."
    Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween) { Text(displayZiweiName(m[key+"name"].orEmpty()),fontSize=23.sp,color=p.ink,fontFamily=FontFamily.Serif);Text(m[key+"stemBranch"].orEmpty(),color=p.muted) }
    listOf("主星" to "majorStars","辅星" to "minorStars","杂曜" to "adjectiveStars").forEach { (label,kind) ->
        Text(label,fontSize=11.sp,color=p.muted)
        val stars=ziweiStars(m[key+kind])
        if(stars.isEmpty()) Text("无",fontSize=12.sp,color=p.muted)
        FlowRow(horizontalArrangement=Arrangement.spacedBy(12.dp),verticalArrangement=Arrangement.spacedBy(8.dp)) {
            stars.forEach { star ->
                if(kind=="adjectiveStars") Surface(color=p.tint,shape=RoundedCornerShape(5.dp)) {
                    Text(star[0],Modifier.padding(horizontal=6.dp,vertical=2.dp),fontSize=12.sp,color=p.ink)
                } else ZiweiStarLine(star,scope)
            }
        }
        HorizontalDivider(color=p.border)
    }
    if(flow!=null && mode!="origin") {
        Text("运限宫位",fontSize=11.sp,color=p.muted)
        val order=listOf("hourly","daily","monthly","yearly","decadal","age")
        FlowRow(horizontalArrangement=Arrangement.spacedBy(6.dp),verticalArrangement=Arrangement.spacedBy(5.dp)) {
            order.forEach { key -> flow.scopes[key]?.let { Text(ziweiScopePrefix.getValue(key)+displayZiweiName(it.palaceNames[index]),fontSize=10.sp,color=p.secondary) } }
        }
        val stars=order.filter {it!="age"}.flatMap {flow.scopes[it]?.stars?.get(index).orEmpty()}.distinct()
        if(stars.isNotEmpty()) {
            Text("运限星曜",fontSize=11.sp,color=p.muted)
            FlowRow(horizontalArrangement=Arrangement.spacedBy(8.dp),verticalArrangement=Arrangement.spacedBy(5.dp)) {
                stars.forEach { star -> Surface(color=p.tint,shape=RoundedCornerShape(5.dp)) { Text(star,Modifier.padding(horizontal=6.dp,vertical=2.dp),fontSize=12.sp,color=p.ink) } }
            }
        }
    }
    val deities=if(mode=="yearly" && flow!=null) engine.yearlyDeities(index,flow.scopes.getValue("yearly").stemBranch[1]) else m[key+"jiangqian"].orEmpty() to m[key+"suiqian"].orEmpty()
    listOf("大限" to (m[key+"decadal"].orEmpty().replace(",","–")+" 岁"),"长生十二神" to m[key+"changsheng"].orEmpty(),"博士十二神" to m[key+"boshi"].orEmpty(),"将前 / 岁前" to "${deities.first} / ${deities.second}","小限年龄" to m[key+"ages"].orEmpty().replace(",","、")).forEach { (label,value) -> Text("$label  $value",fontSize=12.sp,color=p.ink,lineHeight=20.sp) }
    val related=engine.related(index)
    val all=related.flatMap { i -> ziweiStars(m["palace.$i.majorStars"])+ziweiStars(m["palace.$i.minorStars"]) }
    Text("三方四正 · 本命四化",fontSize=11.sp,color=p.muted)
    Text(ziweiMutagens.joinToString(" · ") { tag -> "$tag ${if(all.any { it.getOrNull(2)==tag }) "●" else "○"}" },fontSize=13.sp,color=p.secondary)
    val flyText=(0..11).mapNotNull { i ->
        val stars=(ziweiStars(m["palace.$i.majorStars"])+ziweiStars(m["palace.$i.minorStars"])).map { it[0] }
        val tags=fly.mapIndexedNotNull { n,star -> if(star in stars) ziweiMutagens[n] else null }
        if(tags.isEmpty()) null else displayZiweiName(m["palace.$i.name"].orEmpty())+tags.joinToString("")
    }.joinToString("、")
    Text("飞化：$flyText",fontSize=12.sp,color=Color(0xFF966F38),lineHeight=21.sp)
}

@Composable private fun ZiweiTimeline(record:SavedChart,flow:ZiweiFlow?,target:LocalDateTime,mode:String,engine:ZiweiHoroscope,onSelect:(String,LocalDateTime)->Unit) {
    val m=record.result.metadata
    val decades=(0..11).map { i -> i to m.getValue("palace.$i.decadal").split(',').map(String::toInt) }.sortedBy { it.second[0] }
    ZiweiTimelineRow("大限",decades.indexOfFirst { it.first==flow?.scopes?.get("decadal")?.index }) { decades.forEach { (i,range) ->
        val date=runCatching { engine.dateForAge(record.result,range[0]) }.getOrNull()
        if(date!=null && date.year in 1900..2099) ZiweiTimelineItem("${range[0]}–${range[1]} 岁",displayZiweiName(m["palace.$i.name"].orEmpty())+" "+m["palace.$i.stemBranch"],flow?.scopes?.get("decadal")?.index==i) {
            onSelect(if(mode=="decadal" && flow?.scopes?.get("decadal")?.index==i) "origin" else "decadal",if(flow?.scopes?.get("decadal")?.index==i) target else date.atStartOfDay())
        }
    } }
    val range=decades.firstOrNull { it.first==flow?.scopes?.get("decadal")?.index }?.second
    if(range!=null && mode!="origin") ZiweiTimelineRow("流年",(flow?.nominalAge ?: range[0])-range[0]) { (range[0]..range[1]).forEach { age ->
        val date=runCatching { engine.dateForAge(record.result,age) }.getOrNull()
        if(date!=null && date.year in 1900..2099) ZiweiTimelineItem("${date.year} · $age 岁",GanZhi.at(CalendarEngine().lunar(date).year-4),mode!="origin" && mode!="decadal" && flow?.nominalAge==age) { onSelect(if(mode=="yearly" && flow?.nominalAge==age) "decadal" else "yearly",if(mode=="yearly" && flow?.nominalAge==age) target else date.atStartOfDay()) }
    } }
    if(flow!=null && mode in listOf("yearly","monthly","daily")) {
        val months=remember(flow.lunar.year) { engine.months(flow.lunar.year) }
        ZiweiTimelineRow("流月",months.indexOfFirst { it.month==flow.lunar.month && it.leap==flow.lunar.isLeap }) { months.forEach { month ->
            val active=flow.lunar.month==month.month && flow.lunar.isLeap==month.leap
            val sample=runCatching { engine.calculate(record.result,month.start.atStartOfDay()) }.getOrNull()
            ZiweiTimelineItem((if(month.leap) "闰" else "")+"${month.month}月",if(active) flow.scopes.getValue("monthly").stemBranch else sample?.scopes?.get("monthly")?.stemBranch.orEmpty(),mode in listOf("monthly","daily") && active) { onSelect(if(active && mode in listOf("monthly","daily")) "yearly" else "monthly",if(active && mode in listOf("monthly","daily")) target else month.start.atStartOfDay()) }
        } }
    }
}
@Composable private fun ZiweiTimelineRow(title:String,activeIndex:Int=0,content:@Composable RowScope.()->Unit) {
    val p=LocalWebPalette.current
    val scroll=rememberScrollState();val density=LocalDensity.current
    LaunchedEffect(activeIndex) { scroll.scrollTo(with(density) { (92.dp*activeIndex.coerceAtLeast(0)).roundToPx() }) }
    Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min),verticalAlignment=Alignment.CenterVertically) {
        Text(title,Modifier.width(44.dp),fontSize=12.sp,fontWeight=FontWeight.SemiBold,color=p.ink)
        Row(Modifier.weight(1f).horizontalScroll(scroll),horizontalArrangement=Arrangement.spacedBy(6.dp),content=content)
    }
}
@Composable private fun ZiweiTimelineItem(title:String,subtitle:String,selected:Boolean,onClick:()->Unit) {
    val p=LocalWebPalette.current
    Surface(Modifier.width(86.dp).clickable(role=Role.Button,onClick=onClick),shape=RoundedCornerShape(8.dp),color=if(selected) p.tint else Color.White,border=BorderStroke(1.dp,if(selected) p.primary else p.border)) {
        Column(Modifier.padding(horizontal=8.dp,vertical=7.dp),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.spacedBy(3.dp)) {
            Text(title,fontSize=12.sp,fontWeight=FontWeight.SemiBold,color=p.ink);Text(subtitle,fontSize=10.sp,color=p.muted)
        }
    }
}
