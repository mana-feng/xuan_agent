package com.xuan.app

import com.xuan.core.*

data class SavedChart(val id:String,val createdAt:Long,val input:ChartInput,val result:ChartResult)
data class ChatMessage(val role:String,val content:String)
data class Conversation(val id:String,val title:String,val chartText:String="",val messages:List<ChatMessage> = emptyList())
data class Archive(val version:Int=1,val charts:List<SavedChart>,val conversations:List<Conversation>)
data class AiConfig(val protocol:String="openai",val baseUrl:String="",val apiKey:String="",val model:String="",val provider:String="")
data class AiReply(val text:String,val truncated:Boolean=false)

/** A reopened conversation labels its frozen chart, never a newer unsent active chart. */
fun chatContextLabels(chat:Conversation?,active:List<String>):List<String> {
    val text=chat?.chartText?.takeIf {it.isNotBlank()}?:return active
    val lines=text.lineSequence().map {it.trim()}.filter {it.isNotEmpty()}.toList()
    val prefixes=listOf("八字 ","六爻「","紫微当前命盘","奇门「")
    return if(lines.all {line->prefixes.any(line::startsWith)}) lines.take(4) else listOf(lines.first().take(80))
}
