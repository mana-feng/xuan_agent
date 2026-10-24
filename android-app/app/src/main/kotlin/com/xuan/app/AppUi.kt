@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class, androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
package com.xuan.app

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.xuan.core.ChartInput

private val Jade=Color(0xFF216A56)
private val Ink=Color(0xFF143F35)
private val Paper=Color(0xFFF7F5EF)
private val modules=listOf("bazi" to "八字","liuyao" to "六爻","ziwei" to "紫微","qimen" to "奇门")
private fun label(type:String)=modules.firstOrNull { it.first==type }?.second?:type

@Composable fun XuanApp(model:ChartViewModel) {
    val state by model.state.collectAsState()
    var page by rememberSaveable { mutableIntStateOf(0) }
    var showResult by rememberSaveable { mutableStateOf(false) }
    val scroll=rememberLazyListState()
    val clipboard=LocalClipboardManager.current
    val snackbar=remember { SnackbarHostState() }
    var exportChartId by rememberSaveable { mutableStateOf<String?>(null) }
    var exportChatId by rememberSaveable { mutableStateOf<String?>(null) }
    val exporter=rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri -> uri?.let { model.exportBackup(it,exportChartId,exportChatId) } }
    val importer=rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { it?.let(model::importBackup) }
    LaunchedEffect(state.notice) { if(state.notice.isNotBlank()) { snackbar.showSnackbar(state.notice);model.clearNotice() } }
    LaunchedEffect(state.result?.id) { if(state.result!=null){showResult=true;scroll.scrollToItem(0)} }
    MaterialTheme(colorScheme=lightColorScheme(primary=Jade,onPrimary=Color.White,background=Paper,surface=Color.White,surfaceVariant=Color(0xFFEAEFE9),secondary=Ink),typography=Typography()) {
        Scaffold(containerColor=Paper,snackbarHost={SnackbarHost(snackbar)},topBar={
            Surface(color=Ink) { Row(Modifier.fillMaxWidth().padding(horizontal=22.dp,vertical=16.dp),verticalAlignment=Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) { Text("玄 枢",color=Color.White,fontSize=23.sp,fontWeight=FontWeight.Bold);Text("离线排盘 · 本机记录",color=Color(0xFFBFD5C8),fontSize=12.sp) }
                Surface(color=Color(0xFF2C5B4B),shape=MaterialTheme.shapes.large) { Text("本机离线",Modifier.padding(horizontal=12.dp,vertical=7.dp),color=Color(0xFFE3EFD8),fontSize=11.sp) }
            } }
        },bottomBar={ NavigationBar(containerColor=Color.White) {
            listOf("排盘","记录","AI 对话","设置").forEachIndexed { i,name -> NavigationBarItem(selected=page==i,onClick={page=i},icon={Text(listOf("盘","录","问","设")[i],fontSize=18.sp,fontWeight=FontWeight.Bold)},label={Text(name)}) }
        } }) { padding ->
            LazyColumn(state=scroll,modifier=Modifier.fillMaxSize().padding(padding).imePadding(),contentPadding=PaddingValues(16.dp),verticalArrangement=Arrangement.spacedBy(14.dp)) {
                if(state.error.isNotBlank()) item { Card(colors=CardDefaults.cardColors(containerColor=MaterialTheme.colorScheme.errorContainer)) { Column(Modifier.padding(16.dp)) { Text(state.error,color=MaterialTheme.colorScheme.onErrorContainer);TextButton(onClick=model::clearError){Text("知道了")} } } }
                when(page) {
                    0 -> {
                        if(showResult && state.result!=null) {
                            val record=state.result!!
                            item { Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically) { TextButton(onClick={showResult=false}){Text("‹ 返回输入")};Spacer(Modifier.weight(1f));Text(label(record.result.type),color=Jade,fontWeight=FontWeight.Bold) } }
                            item { Text(record.result.title,fontSize=25.sp,fontWeight=FontWeight.Bold,color=Ink) }
                            item { Text("${record.input.civil} · ${record.input.timeZone}",style=MaterialTheme.typography.bodySmall,color=Color(0xFF64736A)) }
                            item { FlowRow(horizontalArrangement=Arrangement.spacedBy(8.dp)) {
                                Button(onClick=model::saveResult,enabled=!state.saved){Text(if(state.saved) "已保存" else "保存此盘")}
                                OutlinedButton(onClick={model.newChat(true);page=2}){Text("携盘问 AI")}
                                OutlinedButton(onClick={clipboard.setText(AnnotatedString(record.result.asText()))}){Text("复制结果")}
                            } }
                            item { ChartResultView(record.result) }
                        } else {
                            item { Column { Text("择一门，起一盘",fontSize=27.sp,fontWeight=FontWeight.Bold,color=Ink);Text("四类排盘，无需联网即可使用。",Modifier.padding(top=6.dp),color=Color(0xFF69776C)) } }
                            item { FlowRow(horizontalArrangement=Arrangement.spacedBy(8.dp)) { modules.forEach { (key,name) -> FilterChip(selected=state.chartType==key,onClick={model.chooseType(key)},label={Text(name,Modifier.padding(horizontal=10.dp,vertical=3.dp))}) } } }
                            item { ChartForm(state,model) }
                            if(state.result!=null) item { OutlinedButton(onClick={showResult=true},modifier=Modifier.fillMaxWidth()){Text("查看上一张${label(state.result!!.result.type)}结果")} }
                        }
                    }
                    1 -> {
                        item { Text("本机档案",fontSize=27.sp,fontWeight=FontWeight.Bold,color=Ink) }
                        item { Text("${state.records.size} 条排盘记录 · ${state.conversations.size} 个对话",color=Color(0xFF69776C)) }
                        item { Row(horizontalArrangement=Arrangement.spacedBy(8.dp)) {
                            OutlinedButton(onClick={exportChartId=null;exportChatId=null;exporter.launch("玄枢备份-${java.time.LocalDate.now()}.json")}){Text("导出备份")}
                            OutlinedButton(onClick={importer.launch(arrayOf("application/json","text/plain"))}){Text("导入备份")}
                        } }
                        item { Text("备份包含本机排盘与对话；导入相同编号将合并。API Key 不在备份中。",style=MaterialTheme.typography.bodySmall,color=Color(0xFF69776C)) }
                        item { HistoryPanel(state.records,{record->model.openRecord(record);showResult=true;page=0},model::deleteRecord,{record->exportChartId=record.id;exportChatId=null;exporter.launch("玄枢单盘-${record.id.take(8)}.json")}) }
                    }
                    2 -> {
                        item { Text("一盘一问",fontSize=27.sp,fontWeight=FontWeight.Bold,color=Ink) }
                        item { Text("使用你配置的模型接口，已发送的对话保存在本机。",color=Color(0xFF69776C)) }
                        item { FlowRow(horizontalArrangement=Arrangement.spacedBy(8.dp)) {
                            OutlinedButton(onClick={model.newChat()},enabled=!state.sending && !state.chatUnsaved){Text("新对话")}
                            if(state.result!=null) OutlinedButton(onClick={model.newChat(true)},enabled=!state.sending && !state.chatUnsaved){Text("关联当前盘")}
                            TextButton(onClick={page=3}){Text("API 设置")}
                        } }
                        if(state.chat?.chartText?.isNotBlank()==true) item { AssistChip(onClick={},label={Text("已关联盘面；发送提问时一并交给模型")}) }
                        if(state.chatUnsaved) item { Card(colors=CardDefaults.cardColors(containerColor=Color(0xFFFFEAC7))) { Column(Modifier.padding(16.dp)) {
                            Text("回复已收到，尚未保存到本机。请保留此页并重试保存，或导出当前对话。")
                            Button(onClick=model::retrySaveChat,enabled=!state.sending){Text("仅保存回复（不调用 API）")}
                            OutlinedButton(onClick={exportChartId=null;exportChatId=state.chat?.id;exporter.launch("玄枢未保存对话.json")}){Text("导出当前对话")}
                        } } }
                        if(state.chat?.messages.isNullOrEmpty()) item { EmptyCard("从一个问题开始",if(state.config.baseUrl.isBlank()) "先到设置填写 API 地址、模型和密钥，再发送问题。" else "可以先排盘，再点“携盘问 AI”。") }
                        items(state.chat?.messages.orEmpty()) { message -> Card(colors=CardDefaults.cardColors(containerColor=if(message.role=="user") Color(0xFFE6EEE7) else Color.White)) { Column(Modifier.fillMaxWidth().padding(16.dp)) { Text(if(message.role=="user") "你" else "AI",color=Jade,fontWeight=FontWeight.Bold);SelectionContainer { Text(if(message.role=="assistant") AgentActions.visibleText(message.content) else message.content,Modifier.padding(top=8.dp),lineHeight=25.sp) }
                            if(message.role=="assistant") AgentActions.parse(message.content)?.let { action ->
                                action.input?.let { proposed -> Text("${proposed.civil} · ${proposed.timeZone}${if(action.target in listOf("bazi","ziwei")) if(proposed.gender==0) " · 男" else " · 女" else ""}",Modifier.padding(top=8.dp),style=MaterialTheme.typography.bodySmall) }
                                OutlinedButton(onClick={if(action.target=="history") page=1 else {model.applySuggestion(action);showResult=false;page=0}},enabled=!state.busy,modifier=Modifier.padding(top=10.dp)) { Text(action.label) }
                            } } } }
                        item { ChatComposer(state.sending,state.chatUnsaved,state.chatDraft,model::editChatDraft,model::send,model::cancelChat) }
                        if(state.conversations.isNotEmpty()) item { Text("已保存对话",fontWeight=FontWeight.Bold,color=Ink) }
                        items(state.conversations) { chat -> Card { Row(Modifier.fillMaxWidth().padding(12.dp),verticalAlignment=Alignment.CenterVertically) {
                            Column(Modifier.weight(1f).clickable(enabled=!state.sending && !state.chatUnsaved){model.openChat(chat)}) { Text(chat.title,fontWeight=FontWeight.Medium);Text("${chat.messages.size} 条消息",style=MaterialTheme.typography.bodySmall) }
                            TextButton(onClick={exportChartId=null;exportChatId=chat.id;exporter.launch("玄枢对话-${chat.id.take(8)}.json")}){Text("导出")}
                            TextButton(onClick={model.deleteChat(chat.id)},enabled=!state.sending && !state.chatUnsaved){Text("删除")}
                        } } }
                    }
                    3 -> {
                        item { Text("AI 接口设置",fontSize=27.sp,fontWeight=FontWeight.Bold,color=Ink) }
                        item { SettingsPanel(state.configDraft,model::editConfig,model::saveConfig) }
                        item { EmptyCard("数据由你保管","排盘和档案离线可用。只有主动发送 AI 提问时，当前对话及关联盘面会发往所填接口。密钥在本机加密保存，导出备份不含密钥。") }
                        item { Text("玄枢 Android · 0.1.0\n支持公历 1900—2099 年；记录保存原始规则和结果快照。",style=MaterialTheme.typography.bodySmall,color=Color(0xFF69776C)) }
                    }
                }
                item { Spacer(Modifier.height(12.dp)) }
            }
        }
    }
}

@Composable private fun ChartForm(state:AppState,model:ChartViewModel) {
    val options=state.options
    val lunar=options.lunarInput;val leap=options.leap;val casting=options.casting;val numbers=options.numbers;val manual=options.manual
    val input=state.form
    Card { Column(Modifier.fillMaxWidth().padding(18.dp),verticalArrangement=Arrangement.spacedBy(13.dp)) {
        Text("${label(state.chartType)}${if(state.chartType=="qimen") "起局" else "排盘"}",fontWeight=FontWeight.Bold,fontSize=20.sp,color=Ink)
        OutlinedTextField(input.title,{model.editForm(input.copy(title=it))},label={Text(if(state.chartType in listOf("qimen","liuyao")) "问题或备注（可选）" else "姓名或备注（可选）")},modifier=Modifier.fillMaxWidth(),singleLine=true)
        Row(verticalAlignment=Alignment.CenterVertically) { Checkbox(lunar,{model.editOptions(options.copy(lunarInput=it,leap=false))});Text("日期按农历输入");if(lunar){Checkbox(leap,{model.editOptions(options.copy(leap=it))});Text("闰月")} }
        OutlinedTextField(input.civil.substringBefore(' '),{model.editForm(input.copy(civil="$it ${input.civil.substringAfter(' ',"00:00")}"))},label={Text(if(lunar) "农历日期 YYYY-MM-DD" else "公历日期 YYYY-MM-DD")},modifier=Modifier.fillMaxWidth(),singleLine=true)
        OutlinedTextField(input.civil.substringAfter(' ',""),{model.editForm(input.copy(civil="${input.civil.substringBefore(' ')} $it"))},label={Text("时间 HH:mm（可加秒）")},modifier=Modifier.fillMaxWidth(),singleLine=true)
        OutlinedTextField(input.timeZone,{model.editForm(input.copy(timeZone=it))},label={Text("输入时区")},supportingText={Text("例如 Asia/Shanghai、America/New_York 或 +08:00")},modifier=Modifier.fillMaxWidth(),singleLine=true)
        if(state.chartType in listOf("bazi","ziwei")) Row(horizontalArrangement=Arrangement.spacedBy(12.dp)) { FilterChip(input.gender==0,{model.editForm(input.copy(gender=0))},label={Text("男")});FilterChip(input.gender==1,{model.editForm(input.copy(gender=1))},label={Text("女")}) }
        if(state.chartType in listOf("bazi","liuyao")) {
            Text("日柱换日",fontWeight=FontWeight.Medium)
            FlowRow(horizontalArrangement=Arrangement.spacedBy(10.dp)) { FilterChip(input.dayDivide=="midnight",{model.editForm(input.copy(dayDivide="midnight"))},label={Text("00:00")});FilterChip(input.dayDivide=="zi",{model.editForm(input.copy(dayDivide="zi"))},label={Text("23:00 子初")}) }
        } else Text(if(state.chartType=="ziwei") "紫微采用 23:00 全日期推进；闰月十五日后按下月。" else "奇门按固定北京时间 UTC+08:00、精确节气和 23:00 换日。",style=MaterialTheme.typography.bodySmall,color=Color(0xFF69776C))
        if(state.chartType=="liuyao") {
            Text("起卦方式",fontWeight=FontWeight.Medium)
            FlowRow(horizontalArrangement=Arrangement.spacedBy(8.dp)) { listOf("时间","随机","数字","手动").forEach { item -> FilterChip(casting==item,{model.editOptions(options.copy(casting=item))},label={Text(item)}) } }
            if(casting=="数字") OutlinedTextField(numbers,{model.editOptions(options.copy(numbers=it))},label={Text("上卦、下卦、动爻（可选）")},supportingText={Text("用空格分隔两个或三个正整数")},modifier=Modifier.fillMaxWidth())
            if(casting=="手动") {
                Text("自上而下显示；点每爻切换阴阳动静",style=MaterialTheme.typography.bodySmall)
                for(i in 5 downTo 0) OutlinedButton(onClick={val order=listOf(0,1,3,4);model.editOptions(options.copy(manual=manual.toMutableList().also { it[i]=order[(order.indexOf(it[i])+1)%4] }))},modifier=Modifier.fillMaxWidth()) { Text("${i+1} 爻　"+when(manual[i]){0->"━　━  阴静";1->"━━━━ 阳静";3->"━━━━ ○ 阳动";else->"━　━ × 阴动"}) }
            }
            Text("时间起卦规则",fontWeight=FontWeight.Medium)
            FlowRow(horizontalArrangement=Arrangement.spacedBy(8.dp)) { FilterChip(input.yearDivide=="lichun",{model.editForm(input.copy(yearDivide="lichun"))},label={Text("年支按立春")});FilterChip(input.yearDivide=="lunar",{model.editForm(input.copy(yearDivide="lunar"))},label={Text("年支按春节")}) }
            FlowRow(horizontalArrangement=Arrangement.spacedBy(8.dp)) { FilterChip(input.leapMonth=="add-twelve",{model.editForm(input.copy(leapMonth="add-twelve"))},label={Text("闰月数加12")});FilterChip(input.leapMonth=="same-month",{model.editForm(input.copy(leapMonth="same-month"))},label={Text("闰月按原月数")}) }
        }
        Button(onClick={model.calculate()},enabled=!state.busy,modifier=Modifier.fillMaxWidth().height(52.dp)) { if(state.busy){CircularProgressIndicator(Modifier.size(20.dp),color=Color.White,strokeWidth=2.dp);Spacer(Modifier.width(10.dp))};Text(if(state.busy) "正在计算" else "本机排盘",fontSize=16.sp) }
    } }
}

@Composable private fun HistoryPanel(records:List<SavedChart>,open:(SavedChart)->Unit,delete:(String)->Unit,export:(SavedChart)->Unit) {
    var query by rememberSaveable { mutableStateOf("") }
    var pending by remember { mutableStateOf<SavedChart?>(null) }
    Column(verticalArrangement=Arrangement.spacedBy(12.dp)) {
        OutlinedTextField(query,{query=it},label={Text("搜索姓名、备注或日期")},singleLine=true,modifier=Modifier.fillMaxWidth())
        val filtered=records.filter { "${it.result.title} ${it.input.title} ${it.input.civil} ${label(it.result.type)}".contains(query,ignoreCase=true) }
        if(filtered.isEmpty()) EmptyCard("还没有匹配的记录","排盘后点“保存此盘”，即可在这里回放原始结果。")
        filtered.forEach { record -> Card { Column(Modifier.fillMaxWidth().padding(16.dp)) {
            Row(verticalAlignment=Alignment.CenterVertically) { Text(label(record.result.type),color=Jade,fontWeight=FontWeight.Bold);Spacer(Modifier.weight(1f));TextButton(onClick={export(record)}){Text("导出")};TextButton(onClick={pending=record}){Text("删除")} }
            Text(record.result.title,Modifier.clickable{open(record)},fontSize=19.sp,fontWeight=FontWeight.Bold,color=Ink)
            Text("${record.input.civil}\n${record.input.timeZone}",Modifier.padding(top=8.dp),style=MaterialTheme.typography.bodySmall)
            TextButton(onClick={open(record)}){Text("查看原盘 →")}
        } } }
    }
    pending?.let { record -> AlertDialog(onDismissRequest={pending=null},title={Text("删除这条记录？")},text={Text(record.result.title)},confirmButton={TextButton(onClick={delete(record.id);pending=null}){Text("删除")}},dismissButton={TextButton(onClick={pending=null}){Text("取消")}}) }
}

@Composable private fun ChatComposer(sending:Boolean,unsaved:Boolean,draft:String,edit:(String)->Unit,send:(String)->Boolean,cancel:()->Unit) {
    Column(verticalArrangement=Arrangement.spacedBy(8.dp)) {
        OutlinedTextField(draft,edit,label={Text("写下你的问题")},enabled=!sending,modifier=Modifier.fillMaxWidth(),minLines=3,maxLines=7)
        if(sending) { LinearProgressIndicator(Modifier.fillMaxWidth());OutlinedButton(onClick=cancel,modifier=Modifier.fillMaxWidth()){Text("取消请求")} }
        else Button(onClick={send(draft)},enabled=draft.isNotBlank() && !unsaved,modifier=Modifier.fillMaxWidth()){Text("发送到我的 API")}
    }
}
@Composable private fun SettingsPanel(config:AiConfig,edit:(AiConfig)->Unit,save:(AiConfig)->Unit) {
    val provider=config.protocol;val url=config.baseUrl;val model=config.model;val key=config.apiKey
    var reveal by remember { mutableStateOf(false) }
    Card { Column(Modifier.fillMaxWidth().padding(18.dp),verticalArrangement=Arrangement.spacedBy(13.dp)) {
        Text("连接自己的模型",fontSize=20.sp,fontWeight=FontWeight.Bold,color=Ink)
        FlowRow(horizontalArrangement=Arrangement.spacedBy(8.dp)) { listOf("openai" to "OpenAI 兼容","anthropic" to "Anthropic","gemini" to "Gemini").forEach { (id,name) -> FilterChip(provider==id,{edit(config.copy(protocol=id))},label={Text(name)}) } }
        OutlinedTextField(url,{edit(config.copy(baseUrl=it))},label={Text("HTTPS API 地址")},supportingText={Text(when(provider){"gemini"->"填写原生接口根地址（如 /v1beta）或完整 generateContent 地址";"anthropic"->"填写完整 messages 地址";else->"填写完整 chat/completions 地址"})},singleLine=true,modifier=Modifier.fillMaxWidth())
        OutlinedTextField(model,{edit(config.copy(model=it))},label={Text("模型名称")},singleLine=true,modifier=Modifier.fillMaxWidth())
        OutlinedTextField(key,{edit(config.copy(apiKey=it))},label={Text("API Key")},singleLine=true,visualTransformation=if(reveal) VisualTransformation.None else PasswordVisualTransformation(),modifier=Modifier.fillMaxWidth())
        TextButton(onClick={reveal=!reveal}){Text(if(reveal) "隐藏密钥" else "显示密钥")}
        Button(onClick={save(AiConfig(provider,url,key,model))},modifier=Modifier.fillMaxWidth()){Text("保存配置")}
        Text("保存只检查格式，不会发送测试请求。兼容无需密钥的 HTTPS 接口。",style=MaterialTheme.typography.bodySmall,color=Color(0xFF69776C))
    } }
}
@Composable private fun EmptyCard(title:String,body:String) { Card(colors=CardDefaults.cardColors(containerColor=Color(0xFFEAF0E7))) { Column(Modifier.fillMaxWidth().padding(20.dp),verticalArrangement=Arrangement.spacedBy(8.dp)) { Text(title,fontWeight=FontWeight.Bold,color=Ink);Text(body,color=Color(0xFF53685B),lineHeight=24.sp) } } }
