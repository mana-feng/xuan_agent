package com.xuan.app

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.cos
import kotlin.math.sin

private data class ExplorationTool(val key:String,val symbol:String,val title:String,val subtitle:String,val summary:String,val tags:List<String>,val prompt:String)
private val explorationTools=listOf(
    ExplorationTool("bazi","八","八字排盘","出生信息明确时优先","适合命盘总览、长期运势、十神格局和大运节奏。",listOf("长期趋势","命局结构","大运流年"),"我有明确出生时间，请判断是否该走八字排盘，并带我打开对应页面。"),
    ExplorationTool("liuyao","☷","六爻排盘","具体问题与短期决策","适合有单一问题、短期决策、事件走势和结果判断。",listOf("具体问题","短期判断","事件走势"),"我现在有一个具体问题要判断，请判断是否应该走六爻排盘，并带我打开页面。"),
    ExplorationTool("ziwei","✦","紫微排盘","命盘结构与宫位主题","适合看命宫、三方四正、人生主题、事业与关系结构。",listOf("宫位结构","人生主题","长期画像"),"我想看命盘结构和人生主题，请判断是否应该走紫微排盘，并直接带我打开页面。"),
    ExplorationTool("qimen","▦","奇门起局","时空方位与事件筹划","结合起局时间与九宫格局，探索事件时机、行动方向和局势。",listOf("事件时机","九宫格局","行动方向"),"我想用奇门遁甲分析事件时机和行动方向，请带我打开奇门起局页面，告诉我需要确认哪些信息。")
)
private val explorationPrompts=listOf(
    "帮我选盘" to "我现在还不确定该用八字、六爻、紫微还是奇门，请先帮我选最合适的排盘工具。",
    "打开八字" to "我已经准备好出生信息了，请直接带我去八字排盘，并告诉我先填什么。",
    "打开紫微" to "我想看命盘格局，请直接带我去紫微排盘，并说清楚为什么选它。",
    "打开奇门" to "请带我打开奇门起局页面，我会在页面确认起局时间和问题。",
    "看事业宫" to "如果当前已经有紫微盘，请直接带我查看事业宫；如果还没有，请告诉我还缺哪些出生信息。",
    "查看历史" to "我想先看之前生成过的盘，请带我打开历史记录页面。"
)

@OptIn(ExperimentalLayoutApi::class)
@Composable fun WebAgentPage(state:AppState,model:ChartViewModel,navigate:(String)->Unit) {
    val p=LocalWebPalette.current
    val clipboard=LocalClipboardManager.current
    var exportChatId by rememberSaveable { mutableStateOf<String?>(null) }
    val exportChat=rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri -> uri?.let { target -> exportChatId?.let { id -> model.exportBackup(target,chatId=id) } } }
    val disabled=state.sending || state.chatUnsaved
    Column(verticalArrangement=Arrangement.spacedBy(20.dp)) {
        Box(Modifier.fillMaxWidth().heightIn(min=215.dp).clip(RoundedCornerShape(12.dp))) {
            ExplorationArt(Modifier.align(Alignment.TopEnd).offset(x=40.dp).size(200.dp))
            Column(Modifier.padding(top=14.dp,bottom=12.dp),verticalArrangement=Arrangement.spacedBy(13.dp)) {
                Text("传统智慧 · 当代视角",color=p.accent,fontSize=10.sp,letterSpacing=3.sp)
                Column {
                    Text("观象，知己。",fontFamily=FontFamily.Serif,fontSize=29.sp,lineHeight=44.sp,color=p.ink)
                    Text("从你的一个问题开始。",fontFamily=FontFamily.Serif,fontSize=27.sp,lineHeight=43.sp,color=p.accent)
                }
                Text("把心中的疑问交给 AI，一起寻找适合你的探索方式。",color=p.muted,fontSize=11.sp,lineHeight=21.sp,modifier=Modifier.widthIn(max=280.dp))
            }
        }
        WebCard {
            if(state.chat?.chartText?.isNotBlank()==true || state.contextItems.isNotEmpty()) {
                Text("已关联盘面",color=p.accent,fontSize=11.sp,fontWeight=FontWeight.SemiBold)
                FlowRow(horizontalArrangement=Arrangement.spacedBy(5.dp),verticalArrangement=Arrangement.spacedBy(5.dp)) {
                    chatContextLabels(state.chat,state.contextItems).forEach { label->Surface(color=p.tint,shape=RoundedCornerShape(6.dp)) { Text(label,Modifier.padding(8.dp),fontSize=11.sp,color=p.ink) } }
                }
                Text("发送提问时会一并提供关联盘面。",fontSize=10.sp,color=p.muted)
                HorizontalDivider(color=p.border)
            }
            if(!state.chat?.messages.isNullOrEmpty()) {
                val messageScroll=rememberScrollState()
                LaunchedEffect(state.chat?.messages?.size,state.sending,state.streamingText.length) { messageScroll.animateScrollTo(messageScroll.maxValue) }
                Column(Modifier.fillMaxWidth().heightIn(max=360.dp).verticalScroll(messageScroll),verticalArrangement=Arrangement.spacedBy(14.dp)) {
                    state.chat!!.messages.forEach { message ->
                        val user=message.role=="user"
                        val text=if(user) message.content else AgentActions.visibleText(message.content)
                        Row(Modifier.fillMaxWidth(),horizontalArrangement=if(user) Arrangement.End else Arrangement.Start,verticalAlignment=Alignment.Top) {
                            if(!user) Surface(color=p.tint,shape=RoundedCornerShape(10.dp)) { Text("AI",Modifier.padding(8.dp),fontSize=11.sp,color=p.accent) }
                            Spacer(Modifier.width(7.dp))
                            Surface(Modifier.weight(1f),color=if(user) p.primary else p.background,shape=RoundedCornerShape(if(user) 13.dp else 2.dp,if(user) 2.dp else 13.dp,13.dp,13.dp)) {
                                Column(Modifier.padding(13.dp),verticalArrangement=Arrangement.spacedBy(8.dp)) {
                                    SelectionContainer { Text(text,color=if(user) Color.White else p.ink,fontSize=13.sp,lineHeight=24.sp) }
                                    Row {
                                        Text(if(user) "我" else "AI",fontSize=9.sp,color=if(user) Color.White.copy(alpha=.7f) else p.muted,modifier=Modifier.weight(1f))
                                        Text("复制",color=if(user) Color.White else p.accent,fontSize=10.sp,modifier=Modifier.clickable { clipboard.setText(AnnotatedString(text)) }.padding(4.dp))
                                    }
                                    if(!user) AgentActions.parse(message.content)?.let { action ->
                                        Text("下一步建议",fontSize=11.sp,fontWeight=FontWeight.SemiBold,color=p.accent)
                                        action.input?.let { input -> Text("${input.civil} · ${input.timeZone}${if(action.target in listOf("bazi","ziwei")) if(input.gender==0) " · 男" else " · 女" else ""}",fontSize=11.sp,color=p.muted) }
                                        WebPrimaryButton(action.label,{
                                            if(action.target=="history") navigate("history") else { model.applySuggestion(action) }
                                        },enabled=!disabled && !state.busy)
                                    }
                                }
                            }
                            if(user) { Spacer(Modifier.width(7.dp));Surface(color=p.tint,shape=RoundedCornerShape(10.dp)) { Text("我",Modifier.padding(8.dp),fontSize=11.sp,color=p.accent) } }
                        }
                    }
                    if(state.sending) {
                        if(state.streamingText.isNotBlank()) Surface(color=p.background,shape=RoundedCornerShape(12.dp)) { SelectionContainer { Text(AgentActions.visibleText(state.streamingText),Modifier.fillMaxWidth().padding(13.dp),fontSize=13.sp,lineHeight=24.sp,color=p.ink) } }
                        Text(if(state.streamingText.isBlank()) "正在整理操作建议…" else "AI 正在回复…",fontSize=12.sp,color=p.muted)
                        LinearProgressIndicator(Modifier.fillMaxWidth(),color=p.accent)
                    }
                }
                HorizontalDivider(color=p.border)
            }
            if(state.chatUnsaved) {
                Surface(color=MaterialTheme.colorScheme.errorContainer,shape=RoundedCornerShape(9.dp)) {
                    Column(Modifier.padding(12.dp),verticalArrangement=Arrangement.spacedBy(8.dp)) {
                        Text("回复已收到，尚未保存到本机。请保留此页并重试保存，或导出当前对话。",fontSize=12.sp,lineHeight=20.sp)
                        WebPrimaryButton("仅保存回复（不调用 API）",model::retrySaveChat,!state.sending)
                        TextButton(onClick={exportChatId=state.chat?.id;exportChat.launch("玄学AI-未保存对话.json")}) { Text("导出当前对话") }
                    }
                }
            }
            OutlinedTextField(state.chatDraft,model::editChatDraft,placeholder={Text("最近有什么想了解的？例如：我正在考虑换工作，该从哪个角度看看……",fontSize=13.sp,lineHeight=24.sp)},enabled=!disabled,minLines=4,maxLines=8,modifier=Modifier.fillMaxWidth(),shape=RoundedCornerShape(9.dp),colors=OutlinedTextFieldDefaults.colors(focusedBorderColor=Color.Transparent,unfocusedBorderColor=Color.Transparent,disabledBorderColor=Color.Transparent))
            Row(verticalAlignment=Alignment.Bottom,horizontalArrangement=Arrangement.spacedBy(10.dp)) {
                Text(if(state.sending) "Agent 正在调用已配置的模型" else if(state.config.baseUrl.isBlank()) "请先在设置页面配置 AI API，再开始对话" else "支持“帮我选盘 / 直接排盘 / 查看历史记录”",fontSize=9.sp,lineHeight=16.sp,color=p.muted,modifier=Modifier.weight(1f))
                Box(Modifier.width(132.dp)) { WebPrimaryButton(if(state.sending) "发送中..." else "开始探索 ↗",{model.send(state.chatDraft)},!disabled && state.chatDraft.isNotBlank()) }
            }
            if(!state.chat?.messages.isNullOrEmpty() || state.result!=null) FlowRow(horizontalArrangement=Arrangement.spacedBy(8.dp),verticalArrangement=Arrangement.spacedBy(2.dp)) {
                TextButton(onClick={model.newChat()},enabled=!disabled) { Text("新对话",fontSize=11.sp) }
                if(state.result!=null) TextButton(onClick={model.newChat(true)},enabled=!disabled) { Text("关联当前盘",fontSize=11.sp) }
                TextButton(onClick={navigate("settings")}) { Text("API 设置",fontSize=11.sp) }
                if(!state.chat?.messages.isNullOrEmpty()) TextButton(onClick={exportChatId=state.chat?.id;exportChat.launch("玄学AI-对话.json")}) { Text("导出对话",fontSize=11.sp) }
                if(state.sending) TextButton(onClick=model::cancelChat) { Text("取消请求",fontSize=11.sp) }
                else if(state.error.isNotBlank() && !state.chatUnsaved && state.chat?.messages?.lastOrNull()?.role=="user") TextButton(onClick={state.chat?.messages?.lastOrNull()?.content?.let(model::send)}) { Text("重试发送",fontSize=11.sp) }
            }
        }
        Column(verticalArrangement=Arrangement.spacedBy(8.dp)) {
            Text("试着问问",fontSize=10.sp,color=p.muted)
            FlowRow(horizontalArrangement=Arrangement.spacedBy(6.dp),verticalArrangement=Arrangement.spacedBy(6.dp)) { explorationPrompts.forEach { (label,prompt) ->
                OutlinedButton(onClick={model.editChatDraft(prompt);model.send(prompt)},enabled=!disabled,contentPadding=PaddingValues(horizontal=12.dp,vertical=0.dp),modifier=Modifier.heightIn(min=35.dp)) { Text("$label  ↗",fontSize=10.sp) }
            } }
        }
        WebSectionTitle("选择一种方式，开始探索")
        explorationTools.forEach { tool ->
            WebCard {
                Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(12.dp)) {
                    Surface(color=p.tint,shape=RoundedCornerShape(11.dp)) { Text(tool.symbol,Modifier.padding(11.dp),fontSize=23.sp,color=p.accent) }
                    Column(verticalArrangement=Arrangement.spacedBy(4.dp)) { Text(tool.title,fontFamily=FontFamily.Serif,fontSize=19.sp,color=p.ink,fontWeight=FontWeight.SemiBold);Text(tool.subtitle,fontSize=12.sp,color=p.muted) }
                }
                Text(tool.summary,fontSize=13.sp,color=p.muted,lineHeight=23.sp)
                FlowRow(horizontalArrangement=Arrangement.spacedBy(6.dp),verticalArrangement=Arrangement.spacedBy(6.dp)) { tool.tags.forEach { tag -> Surface(color=p.background,shape=RoundedCornerShape(5.dp)) { Text(tag,Modifier.padding(horizontal=7.dp,vertical=4.dp),fontSize=11.sp,color=p.ink) } } }
                HorizontalDivider(color=p.border)
                Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(8.dp)) { Box(Modifier.weight(1f)) { WebPrimaryButton("开始排盘 ↗",{navigate(tool.key)}) };TextButton(onClick={model.editChatDraft(tool.prompt);model.send(tool.prompt)},enabled=!disabled) { Text("问问 AI",fontSize=12.sp) } }
            }
        }
        Row(verticalAlignment=Alignment.CenterVertically) { Text("最近的探索",fontFamily=FontFamily.Serif,fontSize=21.sp,color=p.ink,modifier=Modifier.weight(1f));TextButton(onClick={navigate("history")}) { Text("查看全部 →",fontSize=11.sp) } }
        if(state.records.isEmpty()) Text("还没有保存记录。完成排盘后，点击「保存到本机」即可在这里回顾。",fontSize=12.sp,color=p.muted,lineHeight=22.sp)
        else state.records.sortedByDescending { it.createdAt }.take(3).forEach { record ->
            Row(Modifier.fillMaxWidth().clickable { model.openRecord(record) }.padding(vertical=8.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(10.dp)) {
                Surface(color=p.tint,shape=RoundedCornerShape(9.dp)) { Text(explorationTools.firstOrNull { it.key==record.result.type }?.symbol?:"◇",Modifier.padding(9.dp),fontSize=18.sp,color=p.accent) }
                Column(Modifier.weight(1f),verticalArrangement=Arrangement.spacedBy(4.dp)) { Text(record.result.title,fontSize=13.sp,color=p.ink,fontWeight=FontWeight.SemiBold);Text("${chartTypeName(record.result.type)} · ${record.input.civil}",fontSize=10.sp,color=p.muted) }
                Text("›",color=p.muted,fontSize=20.sp)
            }
        }
        Text("传统文化提供思考的视角，每一次选择，都由你自己决定。",modifier=Modifier.fillMaxWidth(),fontSize=10.sp,lineHeight=18.sp,color=p.muted)
    }
}

@Composable private fun ExplorationArt(modifier:Modifier) {
    val color=LocalWebPalette.current.secondary.copy(alpha=.12f)
    Box(modifier) {
        Canvas(Modifier.fillMaxSize()) { drawCircle(color,90.dp.toPx(),style=Stroke(1.dp.toPx()));drawCircle(color,61.dp.toPx(),style=Stroke(1.dp.toPx())) }
        Text("☯",Modifier.align(Alignment.Center),fontSize=64.sp,color=color)
        listOf("☰","☱","☲","☳","☴","☵","☶","☷").forEachIndexed { index,symbol ->
            val angle=(index*45-90)*Math.PI/180
            Text(symbol,Modifier.align(Alignment.Center).offset(x=(73*cos(angle)).dp,y=(73*sin(angle)).dp),fontSize=24.sp,color=color)
        }
    }
}

internal fun chartTypeName(type:String)=when(type) { "bazi"->"八字";"ziwei"->"紫微";"liuyao"->"六爻";"qimen"->"奇门";else->type }
