package com.xuan.app

import android.app.Application
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.xuan.core.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.util.UUID

data class AppState(
    val form:ChartInput=ChartInput(LocalDateTime.now(java.time.ZoneId.of("Asia/Shanghai")).format(DateTimeFormatter.ofPattern("uuuu-MM-dd HH:mm"))),
    val editingId:String?=null,val chartType:String="bazi",val result:SavedChart?=null,val saved:Boolean=false,
    val records:List<SavedChart> = emptyList(),val conversations:List<Conversation> = emptyList(),
    val chat:Conversation?=null,val config:AiConfig=AiConfig(),val busy:Boolean=false,val sending:Boolean=false,
    val contextItems:List<String> = emptyList(),val ziweiFocus:String?=null,val streamingText:String="",val page:String="agent",val showResult:Boolean=false,val palette:String="aurora",
    val notice:String="",val error:String="",val options:FormOptions=FormOptions(),val chatDraft:String="",val configDraft:AiConfig=AiConfig(),val chatUnsaved:Boolean=false,
)
class ChartViewModel @JvmOverloads constructor(application:Application,storageContext:android.content.Context=application):AndroidViewModel(application) {
    private val store=LocalStore(storageContext)
    private val secrets=SecretStore(storageContext)
    private val calendar=CalendarEngine()
    private val client=AiClient()
    private val mutable=MutableStateFlow(AppState())
    val state=mutable.asStateFlow()
    private var chatJob:Job?=null
    private var configEdited=false
    private var calculationEpoch=0L
    private val preferences=storageContext.getSharedPreferences("workbench-ui",0)
    private data class ModuleDraft(val form:ChartInput,val options:FormOptions,val result:SavedChart?,val saved:Boolean)
    private val drafts=mutableMapOf<String,ModuleDraft>()
    init { mutable.update { it.copy(palette=preferences.getString("palette","aurora")?:"aurora") };viewModelScope.launch {
        try { reload() } catch(e:Exception){fail(e)}
        try { val config=withContext(Dispatchers.IO){secrets.load()};mutable.update { it.copy(config=config,configDraft=if(configEdited) it.configDraft else config) } }
        catch(e:Exception){ mutable.update { it.copy(error="AI 密钥无法读取，请重新配置；本机排盘与记录仍可使用") } }
    } }
    fun editForm(input:ChartInput) { if(input!=state.value.form) calculationEpoch++;mutable.update { old ->
        val changedTime=old.form.copy(title=input.title,gender=input.gender)!=input
        old.copy(form=input,options=if(changedTime && old.options.casting in listOf("时间起卦")) old.options.copy(preview=emptyList()) else old.options)
    } }
    fun editOptions(options:FormOptions){ if(options!=state.value.options) calculationEpoch++;mutable.update { it.copy(options=options) } }
    fun editChatDraft(text:String){ mutable.update { it.copy(chatDraft=text) } }
    fun editConfig(config:AiConfig){ configEdited=true;mutable.update { it.copy(configDraft=config) } }
    fun chooseType(type:String) { navigate(type) }
    fun navigate(page:String) {
        calculationEpoch++
        if(page in listOf("bazi","ziwei","liuyao","qimen")) {
            val old=state.value
            if(page!=old.chartType) {
                drafts[old.chartType]=ModuleDraft(old.form,old.options,old.result,old.saved)
                val d=drafts[page]
                mutable.update { it.copy(chartType=page,form=d?.form?:freshInput(),options=d?.options?:freshOptions(page),result=d?.result,saved=d?.saved?:false,page=page,showResult=false,editingId=null,error="") }
            } else mutable.update { it.copy(page=page,showResult=false,editingId=null,error="") }
        } else mutable.update { it.copy(page=page,error="") }
        refreshContexts()
    }
    private fun refreshContexts() {
        val charts=(drafts.filterKeys { it!=state.value.chartType }.values.mapNotNull {it.result}+listOfNotNull(state.value.result)).associateBy {it.result.type}
        val labels=listOf("bazi","liuyao","ziwei","qimen").mapNotNull { type->charts[type]?.let {record->when(type) {
            "bazi"->"八字 "+runCatching {CalendarEngine().pillars(record.input).list().joinToString(" ")}.getOrDefault(record.result.title)
            "liuyao"->"六爻「${record.input.title}」"
            "ziwei"->"紫微当前命盘"
            else->"奇门「${record.input.title.ifBlank {record.input.civil}}」"
        }} }
        mutable.update {it.copy(contextItems=labels)}
    }
    fun viewResult(){ mutable.update { it.copy(page=it.chartType,showResult=it.result!=null) } }
    fun editResult(){ mutable.update { it.copy(showResult=false,editingId=it.result?.id) } }
    fun setPalette(id:String) { if(id !in WebPalettes.map { it.id }) return;preferences.edit().putString("palette",id).apply();mutable.update { it.copy(palette=id) } }
    private fun freshInput()=ChartInput(LocalDateTime.now(java.time.ZoneId.of("Asia/Shanghai")).format(DateTimeFormatter.ofPattern("uuuu-MM-dd HH:mm")))
    private fun freshOptions(type:String)=FormOptions(casting=if(type=="liuyao") "电脑自动" else "时间",manual=List(6){-1},useNow=type=="qimen")
    fun startExploration(){ if(state.value.sending || state.value.chatUnsaved) { navigate("agent");return };newChat();navigate("agent") }
    fun resetForm(){ calculationEpoch++;val type=state.value.chartType;drafts.remove(type);mutable.update { it.copy(form=freshInput(),options=freshOptions(type),result=null,saved=false,showResult=false,editingId=null,error="") };refreshContexts() }
    fun refreshRecords(){ viewModelScope.launch { try{reload();mutable.update { it.copy(notice="记录已刷新") }}catch(e:Exception){fail(e)} } }
    fun clearConfig(){ viewModelScope.launch { try { withContext(Dispatchers.IO){secrets.save(AiConfig())};mutable.update { it.copy(config=AiConfig(),configDraft=AiConfig(),notice="配置已清除") } }catch(e:Exception){fail(e)} } }
    fun reportError(message:String){ mutable.update { it.copy(error=message) } }
    fun generateCasting() {
        try {
            val s=state.value;val o=s.options;val engine=LiuyaoEngine(calendar)
            val lines=when(o.casting) {
                "电脑自动"->engine.randomCast()
                "在线起卦"->{ require(o.preview.size<6){"已生成完整卦象"};o.preview+engine.coinLine(List(3){kotlin.random.Random.nextBoolean()}) }
                "时间起卦"->engine.timeCast(ChartDraft.resolve(s.form,o))
                "单数起卦"->LiuyaoCasting.numbers(o.numbers)
                "双数起卦"->{ val n=o.numbers.split('|');require(n.size==2){"请输入两组有效数字"};LiuyaoCasting.numbers(n[0],n[1]) }
                "汉字起卦"->LiuyaoCasting.characters(o.chars)
                "卦名起卦"->LiuyaoCasting.gua(o.mainGua,o.changedGua)
                else->o.manual
            }
            mutable.update { it.copy(options=o.copy(preview=lines),error="") }
        }catch(e:Exception){fail(e)}
    }
    fun clearNotice(){ mutable.update { it.copy(notice="") } }
    fun clearError(){ mutable.update { it.copy(error="") } }
    private fun fail(e:Exception) { mutable.update { it.copy(error=e.message?:"操作失败，请重试") } }
    fun calculate() {
        if(state.value.busy) return
        val snapshot=state.value;val epoch=calculationEpoch;mutable.update { it.copy(busy=true,error="") }
        viewModelScope.launch {
            try {
                val record=withContext(Dispatchers.Default) {
                    val raw=snapshot.form
                    val input=ChartDraft.resolve(raw,snapshot.options)
                    val result=when(snapshot.chartType) {
                        "ziwei"->ZiweiEngine(calendar).calculate(input)
                        "qimen"->QimenEngine(calendar).calculate(input)
                        "liuyao"->{ require(input.title.isNotBlank()){ "请输入占卜事项（标题）" };val o=snapshot.options;val lines=LiuyaoCasting.resolve(input,o.casting,o.numbers,o.manual,o.preview);LiuyaoEngine(calendar).calculate(input,lines) }
                        else->BaziEngine(calendar).calculate(input)
                    }
                    val tagged=ChartDraft.tag(result,raw,snapshot.options)
                    SavedChart(snapshot.editingId?:UUID.randomUUID().toString(),snapshot.result?.takeIf { it.id==snapshot.editingId }?.createdAt?:System.currentTimeMillis(),input,tagged)
                }
                if(epoch!=calculationEpoch) return@launch
                drafts[snapshot.chartType]=ModuleDraft(snapshot.form,snapshot.options,record,false)
                mutable.update { current ->
                    if(current.chartType!=snapshot.chartType) current.copy(notice="${record.result.type.let { type -> when(type){"bazi"->"八字";"ziwei"->"紫微";"liuyao"->"六爻";else->"奇门"} }}排盘已完成")
                    else current.copy(result=record,saved=false,editingId=record.id,showResult=current.page==snapshot.chartType && current.form==snapshot.form && current.options==snapshot.options,notice="排盘完成")
                }
                refreshContexts()
            } catch(e:Exception) { fail(e) } finally { mutable.update { it.copy(busy=false) } }
        }
    }
    fun saveResult() {
        val record=state.value.result?:return
        viewModelScope.launch { try { withContext(Dispatchers.IO){store.save(record)};reload();mutable.update { it.copy(saved=it.result?.id==record.id,notice="已保存到本机") } } catch(e:Exception){fail(e)} }
    }
    private suspend fun reload() { val data=withContext(Dispatchers.IO){store.charts() to store.conversations()}; mutable.update { it.copy(records=data.first,conversations=data.second) } }
    fun openRecord(record:SavedChart) { calculationEpoch++;val previous=state.value;if(previous.chartType!=record.result.type) drafts[previous.chartType]=ModuleDraft(previous.form,previous.options,previous.result,previous.saved);val draft=ChartDraft.restore(record);mutable.update { it.copy(result=record,form=draft.first,options=draft.second,chartType=record.result.type,page=record.result.type,showResult=true,saved=true,editingId=record.id,error="") };refreshContexts() }
    fun deleteRecord(id:String) { viewModelScope.launch { try { withContext(Dispatchers.IO){store.deleteChart(id)};reload();mutable.update { it.copy(saved=if(it.result?.id==id) false else it.saved,notice="记录已删除") } } catch(e:Exception){fail(e)} } }
    fun saveConfig(config:AiConfig) { viewModelScope.launch { try {
        AiProtocol().request(config,listOf(ChatMessage("user","验证配置格式")))
        withContext(Dispatchers.IO){secrets.save(config)};mutable.update { it.copy(config=config,configDraft=if(it.configDraft==config) config else it.configDraft,notice="AI 配置已在本机保存，未发送联网请求",error="") }
    } catch(e:Exception){fail(e)} } }
    fun newChat(withChart:Boolean=false) {
        if(state.value.sending || state.value.chatUnsaved) return
        val result=if(withChart) state.value.result else null
        val chat=Conversation(UUID.randomUUID().toString(),result?.result?.title?:"新对话",result?.result?.asText()?:state.value.contextItems.joinToString("\n"))
        mutable.update { it.copy(chat=chat,chatDraft="",error="") }
    }
    fun openChat(chat:Conversation) { if(!state.value.sending && !state.value.chatUnsaved) mutable.update { it.copy(chat=chat,chatDraft="",error="") } }
    fun deleteChat(id:String) { if(state.value.sending || state.value.chatUnsaved) return;viewModelScope.launch { try { withContext(Dispatchers.IO){store.deleteConversation(id)};reload();mutable.update { it.copy(chat=if(it.chat?.id==id) null else it.chat,notice="对话已删除") } } catch(e:Exception){fail(e)} } }
    fun applySuggestion(action:AgentSuggestion) {
        if(action.target !in listOf("bazi","liuyao","ziwei","qimen")) return
        if(action.palace!=null && action.input==null) {
            val record=state.value.result?.takeIf { it.result.type=="ziwei" }?:drafts["ziwei"]?.result?:state.value.records.firstOrNull { it.result.type=="ziwei" }
            if(record==null){ navigate("ziwei");reportError("请先填写出生信息生成紫微命盘，再查看${action.palace}宫");return }
            openRecord(record);mutable.update { it.copy(ziweiFocus=action.palace) };return
        }
        navigate(action.target)
        mutable.update { it.copy(form=action.input?:it.form,options=if(action.input!=null) freshOptions(action.target).copy(useNow=false,casting=if(action.target=="liuyao")"时间起卦" else "时间") else it.options,result=if(action.input!=null) null else it.result,ziweiFocus=action.palace,error="") }
        if(action.execute && action.input!=null) {if(action.target=="liuyao") generateCasting();calculate()}
    }
    fun cancelChat() { chatJob?.cancel() }
    fun send(text:String):Boolean {
        if(state.value.sending || state.value.chatUnsaved || text.isBlank()) return false
        val trimmed=text.trim();if(trimmed.length>20000){mutable.update { it.copy(error="单次提问请控制在 20,000 字以内") };return false}
        val snapshot=state.value;val current=snapshot.chat?:Conversation(UUID.randomUUID().toString(),"新对话",snapshot.contextItems.joinToString("\n"))
        val entries=if(current.messages.lastOrNull()==ChatMessage("user",trimmed)) current.messages else current.messages+ChatMessage("user",trimmed)
        val pending=current.copy(title=if(current.messages.isEmpty()) trimmed.take(30) else current.title,messages=entries)
        val system=AgentActions.systemPrompt()+"\n\n你也是排盘解读助手。根据所给原盘的结构事实回答；缺少的信息请明确说明，不编造盘面，不将传统术数描述为科学预测。"+if(pending.chartText.isNotBlank()) "\n用户主动提供的本机排盘：\n${pending.chartText}" else ""
        try { AiProtocol().request(snapshot.config,listOf(ChatMessage("system",system))+entries) } catch(e:Exception){fail(e);return false}
        mutable.update { it.copy(chat=pending,sending=true,chatDraft="",streamingText="",error="") }
        chatJob=viewModelScope.launch {
            try {
                withContext(Dispatchers.IO){store.saveConversation(pending)}
                val reply=client.send(snapshot.config,listOf(ChatMessage("system",system))+entries) { partial -> mutable.update { it.copy(streamingText=partial) } }
                ChatDelivery.receive(pending,reply,{ completed -> mutable.update { it.copy(chat=completed,chatUnsaved=true) } },{ completed -> withContext(Dispatchers.IO){store.saveConversation(completed)} })
                mutable.update { it.copy(chatUnsaved=false,streamingText="") };reload()
            } catch(e:CancellationException){retainPartial(pending);mutable.update { it.copy(notice="请求已取消，已收到的内容保留在本机") };throw e}
            catch(e:Exception){ retainPartial(pending);if(state.value.chatUnsaved) mutable.update { it.copy(error="回复已收到，但本机保存失败；请点“仅保存回复”重试，不会再次调用 API") } else fail(e) }
            finally { mutable.update { it.copy(sending=false) };try { reload() } catch(_:Exception){} }
        }
        return true
    }
    private suspend fun retainPartial(pending:Conversation) { withContext(NonCancellable) {
        val snapshot=state.value;val text=snapshot.streamingText
        if(text.isBlank() || snapshot.chat?.id!=pending.id || snapshot.chat.messages.lastOrNull()?.role!="user" || snapshot.chatUnsaved) return@withContext
        val incomplete=pending.copy(messages=pending.messages+ChatMessage("assistant",text+"\n\n[回复未完成，连接已中断或请求已取消]"))
        mutable.update { it.copy(chat=incomplete,streamingText="",chatUnsaved=true) }
        try { withContext(Dispatchers.IO){store.saveConversation(incomplete)};mutable.update { it.copy(chatUnsaved=false) } }catch(_:Exception) { /* the storage-only retry retains this visible snapshot */ }
    } }
    fun retrySaveChat() {
        val chat=state.value.chat?:return
        viewModelScope.launch { try {
            withContext(Dispatchers.IO){store.saveConversation(chat)}
            mutable.update { if(it.chat==chat) it.copy(chatUnsaved=false,error="",notice="回复已保存，未再次调用 API") else it };reload()
        } catch(e:Exception){fail(e)} }
    }
    fun exportBackup(uri:Uri,chartId:String?=null,chatId:String?=null) { viewModelScope.launch { try { withContext(Dispatchers.IO) {
        val snapshot=state.value
        val charts=if(chatId!=null) emptyList() else store.charts().filter { chartId==null || it.id==chartId }
        val conversations=if(chartId!=null) emptyList() else (store.conversations().filter { it.id!=snapshot.chat?.id }+listOfNotNull(snapshot.chat?.takeIf { it.messages.isNotEmpty() })).filter { chatId==null || it.id==chatId }
        val text=BackupCodec().encode(Archive(charts=charts,conversations=conversations));getApplication<Application>().contentResolver.openOutputStream(uri,"wt")!!.bufferedWriter().use { it.write(text) }
    };mutable.update { it.copy(notice="备份已导出，包含排盘和对话，不含 API Key") } } catch(e:Exception){fail(e)} } }
    fun exportToon(uri:Uri,record:SavedChart) { viewModelScope.launch { try {
        withContext(Dispatchers.IO){getApplication<Application>().contentResolver.openOutputStream(uri,"wt")!!.bufferedWriter().use { it.write(ToonCodec.encode(record)) }}
        mutable.update { it.copy(notice="TOON 已导出") }
    }catch(e:Exception){fail(e)} } }
    fun importBackup(uri:Uri) { viewModelScope.launch { try {
        val count=withContext(Dispatchers.IO) {
            val bytes=getApplication<Application>().contentResolver.openInputStream(uri)!!.use { stream ->
                val output=java.io.ByteArrayOutputStream();val buffer=ByteArray(8192)
                while(true) { val n=stream.read(buffer);if(n<0) break;require(output.size()+n<=8*1024*1024){"备份超过 8 MB"};output.write(buffer,0,n) };output.toByteArray()
            };store.importArchive(bytes.toString(Charsets.UTF_8))
        };reload();mutable.update { it.copy(notice="导入完成：$count 条排盘记录；相同编号合并",error="") }
    } catch(e:Exception){fail(e)} } }
}
