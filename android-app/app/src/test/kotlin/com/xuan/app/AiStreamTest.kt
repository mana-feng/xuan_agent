package com.xuan.app

import org.junit.Assert.*
import org.junit.Test

class AiStreamTest {
    @Test fun openAiChunksAccumulateAcrossCrLfAndMultilineEvents() {
        val previews=mutableListOf<String>()
        val stream=AiStream("openai",previews::add)
        stream.feed(": keepalive\r\ndata: {\"choices\":[{\"delta\":{\"content\":\"你\"}}]}\r")
        stream.feed("\n\r\ndata: {\"choices\":[{\"delta\":\n")
        stream.feed("data: {\"content\":\"好\"}}]}\n\ndata: [DONE]\n\n")
        assertEquals(AiReply("你好"),stream.finish())
        assertEquals(listOf("你","你好"),previews)
    }
    @Test fun anthropicIgnoresThinkingAndRequiresMessageStop() {
        val stream=AiStream("anthropic")
        stream.feed("event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"thinking_delta\",\"thinking\":\"private\"}}\n\n")
        stream.feed("data: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"答案\"}}\n\n")
        stream.feed("data: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\"}}\n\n")
        assertFalse(stream.complete)
        stream.feed("data: {\"type\":\"message_stop\"}\n\n")
        assertEquals("答案",stream.finish().text)
    }
    @Test fun nativeGeminiFiltersThoughtPartsAndRecognizesTerminalEvent() {
        val stream=AiStream("gemini")
        stream.feed("data: {\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"hidden\",\"thought\":true},{\"text\":\"one\"}]}}]}\n\n")
        stream.feed("data: {\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"two\"}]},\"finishReason\":\"STOP\"}]}")
        assertEquals(AiReply("onetwo"),stream.finish())
    }
    @Test fun incompleteMalformedBlockedAndEmptyStreamsNeverBecomeSuccess() {
        val incomplete=AiStream("openai")
        incomplete.feed("data: {\"choices\":[{\"delta\":{\"content\":\"partial\"}}]}\n\n")
        assertThrows(IllegalArgumentException::class.java) { incomplete.finish() }
        listOf("data: not-json\n\n","data: {\"error\":{\"message\":\"private\"}}\n\n","data: {\"choices\":[{\"delta\":{\"content\":45}}]}\n\n").forEach { text ->
            assertThrows(IllegalArgumentException::class.java) { AiStream("openai").feed(text) }
        }
        assertThrows(IllegalArgumentException::class.java) { AiStream("gemini").feed("data: {\"promptFeedback\":{\"blockReason\":\"SAFETY\"}}\n\n") }
        val empty=AiStream("openai");empty.feed("data: [DONE]\n\n")
        assertThrows(IllegalArgumentException::class.java) { empty.finish() }
    }
    @Test fun truncationIsExplicitAndPostCompletionDataIsIgnored() {
        val stream=AiStream("openai")
        stream.feed("data: {\"choices\":[{\"delta\":{\"content\":\"short\"},\"finish_reason\":\"length\"}]}\n\ndata: invalid\n\n")
        assertEquals(AiReply("short",true),stream.finish())
    }
}
