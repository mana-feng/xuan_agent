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
    val chartType:String="bazi",val result:SavedChart?=null,val saved:Boolean=false,
    val records:List<SavedChart> = emptyList(),val conversations:List<Conversation> = emptyList(),
    val chat:Conversation?=null,val config:AiConfig=AiConfig(),val busy:Boolean=false,val sending:Boolean=false,
    val notice:String="",val error:String="",val options:FormOptions=FormOptions(),val chatDraft:String="",val configDraft:AiConfig=AiConfig(),val chatUnsaved:Boolean=false,
)
class ChartViewModel(application:Application):AndroidViewModel(application) {
    private val store=LocalStore(application)
    private val secrets=SecretStore(application)
    private val calendar=CalendarEngine()
    private val client=AiClient()
    private val mutable=MutableStateFlow(AppState())
    val state=mutable.asStateFlow()
    private var chatJob:Job?=null
    private var configEdited=false
    init { viewModelScope.launch {
        try { reload() } catch(e:Exception){fail(e)}
        try { val config=withContext(Dispatchers.IO){secrets.load()};mutable.update { it.copy(config=config,configDraft=if(configEdited) it.configDraft else config) } }
        catch(e:Exception){ mutable.update { it.copy(error="AI 密钥无法读取，请重新配置；本机排盘与记录仍可使用") } }
    } }
    fun editForm(input:ChartInput) { mutable.update { it.copy(form=input) } }
    fun editOptions(options:FormOptions){ mutable.update { it.copy(options=options) } }
    fun editChatDraft(text:String){ mutable.update { it.copy(chatDraft=text) } }
    fun editConfig(config:AiConfig){ configEdited=true;mutable.update { it.copy(configDraft=config) } }
    fun chooseType(type:String) { mutable.update { it.copy(chartType=type) } }
    fun clearNotice(){ mutable.update { it.copy(notice="") } }
    fun clearError(){ mutable.update { it.copy(error="") } }
    private fun fail(e:Exception) { mutable.update { it.copy(error=e.message?:"操作失败，请重试") } }
    fun calculate() {
        if(state.value.busy) return
        val snapshot=state.value;mutable.update { it.copy(busy=true,error="") }
        viewModelScope.launch {
            try {
                val record=withContext(Dispatchers.Default) {
                    val raw=snapshot.form
                    val input=ChartDraft.resolve(raw,snapshot.options)
                    val result=when(snapshot.chartType) {
                        "ziwei"->ZiweiEngine(calendar).calculate(input)
                        "qimen"->QimenEngine(calendar).calculate(input)
                        "liuyao"->{ val engine=LiuyaoEngine(calendar);val lines=when(snapshot.options.casting) {
                            "时间"->engine.timeCast(input)
                            "数字"->{ val values=snapshot.options.numbers.trim().split(Regex("[,，\\s]+")).map { it.toInt() };require(values.size in 2..3){"请输入两个或三个正整数"};engine.numberCast(values[0],values[1],values.getOrNull(2)) }
                            "手动"->snapshot.options.manual
                            else->engine.randomCast()
                        };engine.calculate(input,lines) }
                        else->BaziEngine(calendar).calculate(input)
                    }
                    val tagged=ChartDraft.tag(result,raw,snapshot.options)
                    SavedChart(UUID.randomUUID().toString(),System.currentTimeMillis(),input,tagged)
                }
                mutable.update { it.copy(result=record,saved=false,notice="排盘完成，结果仅在本机计算") }
            } catch(e:Exception) { fail(e) } finally { mutable.update { it.copy(busy=false) } }
        }
    }
    fun saveResult() {
        val record=state.value.result?:return
        viewModelScope.launch { try { withContext(Dispatchers.IO){store.save(record)};reload();mutable.update { it.copy(saved=it.result?.id==record.id,notice="已保存到本机") } } catch(e:Exception){fail(e)} }
    }
    private suspend fun reload() { val data=withContext(Dispatchers.IO){store.charts() to store.conversations()}; mutable.update { it.copy(records=data.first,conversations=data.second) } }
    fun openRecord(record:SavedChart) { val draft=ChartDraft.restore(record);mutable.update { it.copy(result=record,form=draft.first,options=draft.second,chartType=record.result.type,saved=true,error="") } }
    fun deleteRecord(id:String) { viewModelScope.launch { try { withContext(Dispatchers.IO){store.deleteChart(id)};reload();mutable.update { it.copy(saved=if(it.result?.id==id) false else it.saved,notice="记录已删除") } } catch(e:Exception){fail(e)} } }
    fun saveConfig(config:AiConfig) { viewModelScope.launch { try {
        AiProtocol().request(config,listOf(ChatMessage("user","验证配置格式")))
        withContext(Dispatchers.IO){secrets.save(config)};mutable.update { it.copy(config=config,configDraft=if(it.configDraft==config) config else it.configDraft,notice="AI 配置已在本机保存，未发送联网请求",error="") }
    } catch(e:Exception){fail(e)} } }
    fun newChat(withChart:Boolean=false) {
        if(state.value.sending || state.value.chatUnsaved) return
        val result=if(withChart) state.value.result else null
        val chat=Conversation(UUID.randomUUID().toString(),result?.result?.title?:"新对话",result?.result?.asText().orEmpty())
        mutable.update { it.copy(chat=chat,chatDraft="",error="") }
    }
    fun openChat(chat:Conversation) { if(!state.value.sending && !state.value.chatUnsaved) mutable.update { it.copy(chat=chat,chatDraft="",error="") } }
    fun deleteChat(id:String) { if(state.value.sending || state.value.chatUnsaved) return;viewModelScope.launch { try { withContext(Dispatchers.IO){store.deleteConversation(id)};reload();mutable.update { it.copy(chat=if(it.chat?.id==id) null else it.chat,notice="对话已删除") } } catch(e:Exception){fail(e)} } }
    fun applySuggestion(action:AgentSuggestion) {
        if(action.target !in listOf("bazi","liuyao","ziwei","qimen")) return
        mutable.update { it.copy(chartType=action.target,form=action.input?:it.form,options=if(action.input!=null) FormOptions() else it.options,error="") }
        if(action.execute && action.input!=null) calculate()
    }
    fun cancelChat() { chatJob?.cancel() }
    fun send(text:String):Boolean {
        if(state.value.sending || state.value.chatUnsaved || text.isBlank()) return false
        val trimmed=text.trim();if(trimmed.length>20000){mutable.update { it.copy(error="单次提问请控制在 20,000 字以内") };return false}
        val snapshot=state.value;val current=snapshot.chat?:Conversation(UUID.randomUUID().toString(),"新对话")
        val entries=if(current.messages.lastOrNull()==ChatMessage("user",trimmed)) current.messages else current.messages+ChatMessage("user",trimmed)
        val pending=current.copy(title=if(current.messages.isEmpty()) trimmed.take(30) else current.title,messages=entries)
        val system=AgentActions.systemPrompt()+"\n\n你也是排盘解读助手。根据所给原盘的结构事实回答；缺少的信息请明确说明，不编造盘面，不将传统术数描述为科学预测。"+if(pending.chartText.isNotBlank()) "\n用户主动提供的本机排盘：\n${pending.chartText}" else ""
        try { AiProtocol().request(snapshot.config,listOf(ChatMessage("system",system))+entries) } catch(e:Exception){fail(e);return false}
        mutable.update { it.copy(chat=pending,sending=true,chatDraft="",error="") }
        chatJob=viewModelScope.launch {
            try {
                withContext(Dispatchers.IO){store.saveConversation(pending)}
                val reply=client.send(snapshot.config,listOf(ChatMessage("system",system))+entries)
                ChatDelivery.receive(pending,reply,{ completed -> mutable.update { it.copy(chat=completed,chatUnsaved=true) } },{ completed -> withContext(Dispatchers.IO){store.saveConversation(completed)} })
                mutable.update { it.copy(chatUnsaved=false) };reload()
            } catch(e:CancellationException){mutable.update { it.copy(notice="请求已取消；已发送的提问保留在本机") };throw e}
            catch(e:Exception){ if(state.value.chatUnsaved) mutable.update { it.copy(error="回复已收到，但本机保存失败；请点“仅保存回复”重试，不会再次调用 API") } else fail(e) }
            finally { mutable.update { it.copy(sending=false) };try { reload() } catch(_:Exception){} }
        }
        return true
    }
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
    fun importBackup(uri:Uri) { viewModelScope.launch { try {
        val count=withContext(Dispatchers.IO) {
            val bytes=getApplication<Application>().contentResolver.openInputStream(uri)!!.use { stream ->
                val output=java.io.ByteArrayOutputStream();val buffer=ByteArray(8192)
                while(true) { val n=stream.read(buffer);if(n<0) break;require(output.size()+n<=8*1024*1024){"备份超过 8 MB"};output.write(buffer,0,n) };output.toByteArray()
            };store.importArchive(bytes.toString(Charsets.UTF_8))
        };reload();mutable.update { it.copy(notice="导入完成：$count 条排盘记录；相同编号合并",error="") }
    } catch(e:Exception){fail(e)} } }
}
