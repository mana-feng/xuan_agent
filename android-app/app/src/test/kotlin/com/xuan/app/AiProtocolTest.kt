package com.xuan.app
import org.junit.Assert.*
import org.junit.Test
import com.google.gson.JsonParser
import okio.Buffer
class AiProtocolTest {
    private val protocol=AiProtocol()
    private val messages=listOf(ChatMessage("system","规则"),ChatMessage("user","问题"))
    @Test fun openAiSendsSingleNonStreamingRequestToExactCustomEndpoint() {
        val request=protocol.request(AiConfig("openai","https://example.org/v1/chat/completions","unit-secret","custom-model"),messages)
        assertEquals("https://example.org/v1/chat/completions",request.url.toString())
        assertEquals("Bearer unit-secret",request.header("Authorization"))
        val buffer=Buffer(); request.body!!.writeTo(buffer); val body=JsonParser.parseString(buffer.readUtf8()).asJsonObject
        assertFalse(body["stream"].asBoolean); assertEquals("custom-model",body["model"].asString)
        assertEquals("system",body["messages"].asJsonArray[0].asJsonObject["role"].asString)
    }
    @Test fun anthropicSeparatesSystemAndUserRoles() {
        val request=protocol.request(AiConfig("anthropic","https://example.org/v1/messages","unit-secret","model"),messages)
        assertEquals("unit-secret",request.header("x-api-key"))
        val buffer=Buffer();request.body!!.writeTo(buffer);val body=JsonParser.parseString(buffer.readUtf8()).asJsonObject
        assertEquals("规则",body["system"].asString);assertEquals(1,body["messages"].asJsonArray.size())
    }
    @Test fun geminiUsesHeaderAndCanonicalNativeEndpoint() {
        val request=protocol.request(AiConfig("gemini","https://example.org/v1beta","unit-secret","my-model"),messages)
        assertEquals("/v1beta/models/my-model:generateContent",request.url.encodedPath)
        assertEquals("unit-secret",request.header("x-goog-api-key"));assertFalse(request.url.toString().contains("unit-secret"))
    }
    @Test fun malformedAndBlockedRepliesDoNotBecomeSuccess() {
        for(body in listOf("{}","not-json","{\"error\":{\"message\":\"secret\"}}")) assertThrows(IllegalArgumentException::class.java){protocol.parse("openai",body)}
        assertThrows(IllegalArgumentException::class.java){protocol.parse("gemini","{\"promptFeedback\":{\"blockReason\":\"SAFETY\"}}")}
        assertEquals(AiReply("hello",true),protocol.parse("openai","{\"choices\":[{\"message\":{\"content\":\"hello\"},\"finish_reason\":\"length\"}]}"))
        assertEquals("hi",protocol.parse("anthropic","{\"content\":[{\"type\":\"text\",\"text\":\"hi\"}],\"stop_reason\":\"end_turn\"}").text)
    }
    @Test fun rejectsInvalidUrlAndBlankModelBeforeNetwork() {
        listOf(AiConfig(baseUrl="file:///tmp",model="x"),AiConfig(baseUrl="http://example.org/v1/chat/completions",model="x"),AiConfig(baseUrl="https://example.org"),AiConfig(baseUrl="https://user:pass@example.org",model="x")).forEach { c -> assertThrows(IllegalArgumentException::class.java){protocol.request(c,messages)} }
    }
}
