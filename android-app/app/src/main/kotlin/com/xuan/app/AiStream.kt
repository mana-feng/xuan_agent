package com.xuan.app

import com.google.gson.JsonElement
import com.google.gson.JsonObject
import com.google.gson.JsonParser

/** Incremental SSE decoder. Only visible text is published; a terminal event is required. */
class AiStream(private val protocol:String,private val onPartial:(String)->Unit={}) {
    private val buffer=StringBuilder()
    private val dataLines=mutableListOf<String>()
    private val text=StringBuilder()
    private var truncated=false
    private var received=0L
    var complete:Boolean=false
        private set
    init { require(protocol in listOf("openai","anthropic","gemini")) }
    fun feed(chunk:String) {
        if(complete) return
        received+=chunk.length
        require(received<=MAX_BYTES) { "模型回复超过 2 MB，请缩小提问范围" }
        buffer.append(chunk)
        require(buffer.length<=MAX_BYTES) { "模型回复超过 2 MB，请缩小提问范围" }
        drain(false)
    }
    fun finish():AiReply {
        drain(true)
        require(complete) { "AI 连接中断，未收到完整回复，请手动重试" }
        require(text.isNotBlank()) { "模型没有返回正文" }
        return AiReply(text.toString(),truncated)
    }
    private fun drain(final:Boolean) {
        while(!complete) {
            val index=buffer.indexOfFirst { it=='\r' || it=='\n' }
            if(index<0) break
            if(!final && buffer[index]=='\r' && index==buffer.lastIndex) break
            val line=buffer.substring(0,index)
            val count=if(buffer[index]=='\r' && index+1<buffer.length && buffer[index+1]=='\n') 2 else 1
            buffer.delete(0,index+count)
            line(line)
        }
        if(final && !complete) {
            if(buffer.isNotEmpty()) { val remaining=buffer.toString();buffer.clear();line(remaining) }
            dispatch()
        }
        if(complete) { buffer.clear();dataLines.clear() }
    }
    private fun line(value:String) {
        if(value.isEmpty()) dispatch()
        else if(value.startsWith("data:")) dataLines.add(value.substring(5).removePrefix(" "))
    }
    private fun dispatch() {
        if(dataLines.isEmpty() || complete) return
        val raw=dataLines.joinToString("\n").trim();dataLines.clear()
        if(raw.isEmpty()) return
        if(raw=="[DONE]") { require(protocol=="openai") { "模型回复结束状态无效" };complete=true;return }
        val data=try { JsonParser.parseString(raw).asJsonObject } catch(_:Exception) { throw IllegalArgumentException("AI 流式响应解析失败") }
        require(!data.has("error") && data.string("type")!="error" && data.obj("promptFeedback")?.has("blockReason")!=true) { "模型服务返回错误或拦截了内容" }
        val reason:String
        val content:String
        when(protocol) {
            "anthropic" -> {
                val delta=data.obj("delta")
                reason=delta?.string("stop_reason")?:data.string("stop_reason").orEmpty()
                content=when(data.string("type")) {
                    "content_block_delta" -> if(delta?.string("type")=="text_delta") delta.string("text").orEmpty() else ""
                    "content_block_start" -> data.obj("content_block")?.let { if(it.string("type")=="text") it.string("text").orEmpty() else "" }.orEmpty()
                    else -> ""
                }
                complete=data.string("type")=="message_stop"
            }
            "gemini" -> {
                val candidate=data.getAsJsonArray("candidates")?.firstOrNull()?.asJsonObject
                reason=candidate?.string("finishReason").orEmpty()
                content=candidate?.obj("content")?.getAsJsonArray("parts")?.joinToString("") { part ->
                    val item=part.asJsonObject
                    if(item.get("thought")?.asBoolean==true) "" else item.string("text").orEmpty()
                }.orEmpty()
                complete=reason.isNotEmpty()
            }
            else -> {
                val choice=data.getAsJsonArray("choices")?.firstOrNull()?.asJsonObject
                reason=choice?.string("finish_reason").orEmpty()
                content=choice?.obj("delta")?.string("content").orEmpty()
                complete=reason.isNotEmpty()
            }
        }
        require(reason.isEmpty() || reason in listOf("stop","end_turn","stop_sequence","STOP","length","max_tokens","MAX_TOKENS")) { "模型回复未正常完成" }
        if(reason in listOf("length","max_tokens","MAX_TOKENS")) truncated=true
        if(content.isNotEmpty()) {
            text.append(content)
            require(text.length<=MAX_BYTES) { "模型回复超过 2 MB，请缩小提问范围" }
            onPartial(text.toString())
        }
    }
    private fun JsonObject.string(name:String):String? {
        val value=get(name)?:return null
        if(value.isJsonNull) return null
        require(value.isJsonPrimitive && value.asJsonPrimitive.isString) { "AI 流式内容格式无效" }
        return value.asString
    }
    private fun JsonObject.obj(name:String):JsonObject?=get(name)?.takeUnless(JsonElement::isJsonNull)?.asJsonObject
    companion object { const val MAX_BYTES=2*1024*1024 }
}
