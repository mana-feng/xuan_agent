package com.xuan.app

import com.xuan.core.*

data class SavedChart(val id:String,val createdAt:Long,val input:ChartInput,val result:ChartResult)
data class ChatMessage(val role:String,val content:String)
data class Conversation(val id:String,val title:String,val chartText:String="",val messages:List<ChatMessage> = emptyList())
data class Archive(val version:Int=1,val charts:List<SavedChart>,val conversations:List<Conversation>)
data class AiConfig(val protocol:String="openai",val baseUrl:String="",val apiKey:String="",val model:String="")
data class AiReply(val text:String,val truncated:Boolean=false)
