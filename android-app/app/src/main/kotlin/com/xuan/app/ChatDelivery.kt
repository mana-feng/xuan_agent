package com.xuan.app
object ChatDelivery {
    suspend fun receive(pending:Conversation,reply:AiReply,display:(Conversation)->Unit,persist:suspend(Conversation)->Unit):Conversation {
        val completed=pending.copy(messages=pending.messages+ChatMessage("assistant",reply.text+if(reply.truncated) "\n\n[回复达到长度上限，内容已截断]" else ""))
        // A successful paid response must survive a disk failure or cancellation during the write.
        display(completed)
        persist(completed)
        return completed
    }
}
