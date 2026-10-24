package com.xuan.app
import com.xuan.core.*
import org.junit.Assert.*
import org.junit.Test
class BackupCodecTest {
    private val codec=BackupCodec()
    private val chart=SavedChart("chart-1",123L,ChartInput("2023-03-21 00:30"),ChartResult("bazi","测试",listOf(ChartSection("四柱",listOf("日" to "戊寅"))),mapOf("换日" to "00:00")))
    @Test fun roundTripPreservesInputRulesResultAndConversation() {
        val archive=Archive(charts=listOf(chart),conversations=listOf(Conversation("talk-1","问题","原盘",listOf(ChatMessage("user","你好")))))
        val text=codec.encode(archive)
        assertEquals(archive,codec.decode(text));assertFalse(text.contains("apiKey"))
    }
    @Test fun refusesInvalidPartialArchivesBeforeStorage() {
        for(text in listOf("{}","{\"version\":99,\"charts\":[],\"conversations\":[]}","{\"version\":1,\"charts\":[{}],\"conversations\":[]}")) assertThrows(IllegalArgumentException::class.java){codec.decode(text)}
        assertThrows(IllegalArgumentException::class.java){codec.encode(Archive(charts=listOf(chart,chart),conversations=emptyList()))}
        assertThrows(IllegalArgumentException::class.java){codec.encode(Archive(charts=listOf(chart.copy(input=chart.input.copy(civil="2023-02-30 12:00"))),conversations=emptyList()))}
    }
    @Test fun exportNeverCreatesAnArchiveItsImporterRejectsForSize() {
        val longChat=Conversation("long","long",messages=List(90){ChatMessage("user","x".repeat(100000))})
        assertThrows(IllegalArgumentException::class.java){codec.encode(Archive(charts=emptyList(),conversations=listOf(longChat)))}
    }
    @Test fun aNormallyAcceptedLongModelReplyCanBeBackedUpAndRestored() {
        val chat=Conversation("reply","reply",messages=listOf(ChatMessage("assistant","字".repeat(150000))))
        val archive=Archive(charts=emptyList(),conversations=listOf(chat))
        assertEquals(archive,codec.decode(codec.encode(archive)))
    }
}
