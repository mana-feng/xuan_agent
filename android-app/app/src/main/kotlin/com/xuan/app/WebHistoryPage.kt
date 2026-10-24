package com.xuan.app

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@OptIn(ExperimentalLayoutApi::class)
@Composable fun WebHistoryPage(state:AppState,model:ChartViewModel,openRecord:(SavedChart)->Unit,openChat:(Conversation)->Unit,exportAll:()->Unit,importAll:()->Unit,exportChart:(SavedChart)->Unit,exportChat:(Conversation)->Unit,startExploring:()->Unit={}) {
    val p=LocalWebPalette.current
    var query by rememberSaveable { mutableStateOf("") }
    var type by rememberSaveable { mutableStateOf("all") }
    var gender by rememberSaveable { mutableStateOf<Int?>(null) }
    var sortName by rememberSaveable { mutableStateOf(false) }
    var descending by rememberSaveable { mutableStateOf(true) }
    var page by rememberSaveable { mutableIntStateOf(1) }
    var pendingChart by remember { mutableStateOf<SavedChart?>(null) }
    var pendingChat by remember { mutableStateOf<Conversation?>(null) }
    val queryTrimmed=query.trim()
    val charts=state.records.filter { record ->
        (type=="all" || type==record.result.type) && (gender==null || record.result.type!="qimen" && record.input.gender==gender &&
            (record.result.type!="liuyao" || record.result.metadata["性别填写"]!="false")) &&
            "${record.result.title} ${record.input.title} ${record.input.civil} ${chartTypeName(record.result.type)}".contains(queryTrimmed,true)
    }.let { records ->
        val ordered=if(sortName) records.sortedWith(compareBy(String.CASE_INSENSITIVE_ORDER) { it.result.title }) else records.sortedBy { it.createdAt }
        if(descending) ordered.reversed() else ordered
    }
    val chats=if(type in listOf("all","chat") && gender==null) state.conversations.filter { conversation ->
        (conversation.title+" "+conversation.messages.joinToString(" ") { it.content }).contains(queryTrimmed,true)
    }.let { if(sortName) it.sortedWith(compareBy(String.CASE_INSENSITIVE_ORDER) { chat -> chat.title }).let { sorted -> if(descending) sorted.reversed() else sorted } else if(descending) it else it.reversed() } else emptyList()
    val total=charts.size+chats.size
    val totalPages=maxOf(1,(total+11)/12)
    val currentPage=page.coerceIn(1,totalPages)
    val start=(currentPage-1)*12
    LaunchedEffect(query,type,gender,sortName,descending) { page=1 }
    fun reset() { query="";type="all";gender=null;sortName=false;descending=true;page=1 }
    val filtered=queryTrimmed.isNotEmpty() || type!="all" || gender!=null
    Column(verticalArrangement=Arrangement.spacedBy(16.dp)) {
        WebHeading("每一次探索，都有迹可循","回到曾经的问题，也许会有新的理解。查看并管理保存在本机中的命盘。")
        Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.End) { OutlinedButton(onClick=model::refreshRecords) { Text("刷新记录",fontSize=11.sp) } }
        OutlinedTextField(query,{query=it},placeholder={Text("搜索姓名或起卦主题",fontSize=13.sp)},leadingIcon={Text("⌕",fontSize=24.sp,color=p.muted)},trailingIcon={if(query.isNotEmpty()) TextButton(onClick={query=""}) { Text("×",fontSize=22.sp) }},singleLine=true,modifier=Modifier.fillMaxWidth())
        Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.End) {
            OutlinedButton(onClick={sortName=!sortName}) { Text(if(sortName) "按姓名主题" else "按保存时间",fontSize=11.sp) }
            Spacer(Modifier.width(8.dp))
            OutlinedButton(onClick={descending=!descending}) { Text(if(descending) "↓ 降序" else "↑ 升序",fontSize=11.sp) }
        }
        FlowRow(horizontalArrangement=Arrangement.spacedBy(4.dp),verticalArrangement=Arrangement.spacedBy(4.dp)) {
            listOf("all" to "全部","bazi" to "八字","ziwei" to "紫微","liuyao" to "六爻","qimen" to "奇门","chat" to "对话").forEach { (id,label) -> WebPill(label,type==id,{type=id;if(id in listOf("qimen","chat")) gender=null}) }
        }
        if(type !in listOf("qimen","chat")) Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(4.dp)) {
            Text("性别",fontSize=11.sp,color=p.muted,modifier=Modifier.padding(end=5.dp))
            WebPill("全部",gender==null,{gender=null});WebPill("男",gender==0,{gender=0});WebPill("女",gender==1,{gender=1})
        }
        WebCard {
            if(total==0) Column(Modifier.fillMaxWidth().padding(vertical=26.dp),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.spacedBy(16.dp)) {
                Text("◇",fontSize=38.sp,color=p.accent)
                Text(if(filtered) "没有找到相关记录" else "你的探索，从这里开始",fontFamily=FontFamily.Serif,fontSize=20.sp,color=p.ink)
                Text(if(filtered) "试试其他关键词、性别或排盘类型。" else "完成排盘后，点击「保存到本机」，就能在这里再次打开。",fontSize=12.sp,color=p.muted,lineHeight=22.sp)
                if(filtered) OutlinedButton(onClick={reset()}) { Text("清除筛选") } else WebPrimaryButton("开始探索",startExploring)
            }
            charts.forEachIndexed { index,record -> if(index in start until start+12) {
                Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(10.dp)) {
                    Column(Modifier.weight(1f).clickable { openRecord(record) }.padding(vertical=10.dp),verticalArrangement=Arrangement.spacedBy(5.dp)) {
                        Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(8.dp)) {
                            Text(when(record.result.type) { "qimen"->"▦";"liuyao"->"☷";"ziwei"->"✦";else->"八" },fontSize=20.sp,color=p.accent)
                            Text(record.result.title.ifBlank { "未命名命盘" },fontSize=13.sp,color=p.ink,fontWeight=FontWeight.SemiBold,maxLines=1,overflow=TextOverflow.Ellipsis)
                        }
                        Text("${chartTypeName(record.result.type)} · ${if(record.result.type in listOf("liuyao","qimen")) "起局" else "出生"}：${record.input.civil}"+if(record.result.type in listOf("bazi","ziwei")) " · ${if(record.input.gender==0) "男" else "女"}" else "",fontSize=10.sp,color=p.muted,lineHeight=18.sp)
                        Text("保存于 ${historyDate(record.createdAt)}",fontSize=10.sp,color=p.muted)
                    }
                    Column {
                        TextButton(onClick={exportChart(record)},contentPadding=PaddingValues(horizontal=5.dp,vertical=0.dp)) { Text("导出",fontSize=11.sp) }
                        TextButton(onClick={pendingChart=record},contentPadding=PaddingValues(horizontal=5.dp,vertical=0.dp)) { Text("删除",fontSize=11.sp,color=p.muted) }
                    }
                    Text("›",fontSize=20.sp,color=p.muted,modifier=Modifier.clickable { openRecord(record) }.padding(4.dp))
                }
                HorizontalDivider(color=p.border)
            } }
            chats.forEachIndexed { index,chat -> if(charts.size+index in start until start+12) {
                Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(10.dp)) {
                    Column(Modifier.weight(1f).clickable(enabled=!state.sending && !state.chatUnsaved) { openChat(chat) }.padding(vertical=10.dp),verticalArrangement=Arrangement.spacedBy(5.dp)) {
                        Text("◌  ${chat.title.ifBlank { "未命名对话" }}",fontSize=13.sp,color=p.ink,fontWeight=FontWeight.SemiBold,maxLines=1,overflow=TextOverflow.Ellipsis)
                        Text("AI 对话 · ${chat.messages.size} 条消息${if(chat.chartText.isNotBlank()) " · 已关联盘面" else ""}",fontSize=10.sp,color=p.muted)
                        chat.messages.lastOrNull()?.let { Text(AgentActions.visibleText(it.content),fontSize=10.sp,color=p.muted,maxLines=1,overflow=TextOverflow.Ellipsis) }
                    }
                    Column {
                        TextButton(onClick={exportChat(chat)},contentPadding=PaddingValues(horizontal=5.dp,vertical=0.dp)) { Text("导出",fontSize=11.sp) }
                        TextButton(onClick={pendingChat=chat},enabled=!state.sending && !state.chatUnsaved,contentPadding=PaddingValues(horizontal=5.dp,vertical=0.dp)) { Text("删除",fontSize=11.sp,color=p.muted) }
                    }
                    Text("›",fontSize=20.sp,color=p.muted)
                }
                HorizontalDivider(color=p.border)
            } }
        }
        Text("共 $total 条记录 · ${charts.size} 条命盘 · ${chats.size} 个对话 · 第 $currentPage / $totalPages 页",fontSize=11.sp,color=p.muted,lineHeight=20.sp)
        Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.End) {
            OutlinedButton(onClick={page=currentPage-1},enabled=currentPage>1) { Text("上一页",fontSize=11.sp) };Spacer(Modifier.width(8.dp));OutlinedButton(onClick={page=currentPage+1},enabled=currentPage<totalPages) { Text("下一页",fontSize=11.sp) }
        }
        if(filtered) TextButton(onClick={reset()}) { Text("清除筛选",fontSize=12.sp) }
        WebCard {
            Row(horizontalArrangement=Arrangement.spacedBy(8.dp)) { OutlinedButton(onClick=exportAll) { Text("导出备份",fontSize=12.sp) };OutlinedButton(onClick=importAll,enabled=!state.sending && !state.chatUnsaved) { Text("导入备份",fontSize=12.sp) } }
            Text("备份包含保存在本机的排盘与对话，不含 API Key。导入时，相同编号的记录会合并。",fontSize=11.sp,color=p.muted,lineHeight=20.sp)
        }
    }
    pendingChart?.let { record -> AlertDialog(onDismissRequest={pendingChart=null},title={Text("删除确认")},text={Text("确定要删除这条排盘记录吗？\n${record.result.title}")},confirmButton={TextButton(onClick={model.deleteRecord(record.id);pendingChart=null}) { Text("删除") }},dismissButton={TextButton(onClick={pendingChart=null}) { Text("取消") }}) }
    pendingChat?.let { chat -> AlertDialog(onDismissRequest={pendingChat=null},title={Text("删除确认")},text={Text("确定要删除这条对话记录吗？\n${chat.title}")},confirmButton={TextButton(onClick={model.deleteChat(chat.id);pendingChat=null},enabled=!state.sending && !state.chatUnsaved) { Text("删除") }},dismissButton={TextButton(onClick={pendingChat=null}) { Text("取消") }}) }
}

private fun historyDate(time:Long):String=DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm").withZone(ZoneId.systemDefault()).format(Instant.ofEpochMilli(time))
