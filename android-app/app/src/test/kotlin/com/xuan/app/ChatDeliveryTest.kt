package com.xuan.app
import org.junit.Assert.*
import org.junit.Test
import kotlinx.coroutines.runBlocking
import java.io.IOException
class ChatDeliveryTest {
    @Test fun paidReplyRemainsVisibleWhenDiskWriteFails()=runBlocking {
        val pending=Conversation("chat","测试",messages=listOf(ChatMessage("user","问题")))
        var shown:Conversation?=null
        try { ChatDelivery.receive(pending,AiReply("已付费回复"),{shown=it},{throw IOException("disk full")});fail("write should fail") } catch(_:IOException){}
        assertEquals("已付费回复",shown!!.messages.last().content)
        assertEquals("assistant",shown!!.messages.last().role)
    }
    @Test fun displayPrecedesStorageAndTruncationIsVisible()=runBlocking {
        val events=mutableListOf<String>()
        val result=ChatDelivery.receive(Conversation("id","title"),AiReply("正文",true),{events+="display"},{events+="save"})
        assertEquals(listOf("display","save"),events);assertTrue(result.messages.last().content.contains("截断"))
    }
}
