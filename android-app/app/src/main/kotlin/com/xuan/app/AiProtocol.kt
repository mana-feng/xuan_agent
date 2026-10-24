package com.xuan.app

import com.google.gson.*
import okhttp3.Request
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody

class AiProtocol {
    private val gson=Gson()
    fun request(config:AiConfig,messages:List<ChatMessage>,stream:Boolean=false):Request {
        require(config.protocol in listOf("openai","anthropic","gemini")) { "请选择受支持的接口协议" }
        var url=config.baseUrl.trim().toHttpUrlOrNull() ?: throw IllegalArgumentException("请填写完整的 HTTP 或 HTTPS API 地址")
        require(url.isHttps) { "API 地址必须使用 HTTPS" }
        require(url.username.isEmpty() && url.password.isEmpty()) { "地址中不能包含用户名或密码" }
        require(config.model.isNotBlank() && !config.apiKey.contains('\n') && !config.apiKey.contains('\r')) { "请填写模型名称并检查 API Key" }
        require(messages.isNotEmpty() && messages.all { it.role in listOf("system","user","assistant") }) { "对话内容无效" }
        val system=messages.filter { it.role=="system" }.joinToString("\n\n") { it.content }
        val ordinary=messages.filter { it.role!="system" }
        val builder=Request.Builder()
        val body:Map<String,Any> = when(config.protocol) {
            "anthropic" -> {
                if(config.apiKey.isNotBlank()) builder.header("x-api-key",config.apiKey)
                builder.header("anthropic-version","2023-06-01")
                mutableMapOf<String,Any>("model" to config.model,"max_tokens" to 4096,"stream" to stream,"messages" to ordinary.map { mapOf("role" to it.role,"content" to it.content) }).also { if(system.isNotBlank()) it["system"]=system }
            }
            "gemini" -> {
                if(config.apiKey.isNotBlank()) builder.header("x-goog-api-key",config.apiKey)
                val path=url.encodedPath.trimEnd('/')
                val model=config.model.removePrefix("models/")
                require(Regex("[a-zA-Z0-9._-]+").matches(model)) { "Gemini 模型名称无效" }
                val endpoint=if(stream) "streamGenerateContent" else "generateContent"
                val resolved=if(Regex(":(streamGenerateContent|generateContent)$").containsMatchIn(path)) url.newBuilder().encodedPath(path.replace(Regex(":(streamGenerateContent|generateContent)$"),":$endpoint"))
                    else url.newBuilder().addPathSegment("models").addPathSegment("$model:$endpoint")
                resolved.removeAllQueryParameters("alt");if(stream) resolved.addQueryParameter("alt","sse");url=resolved.build()
                mutableMapOf<String,Any>("contents" to ordinary.map { mapOf("role" to if(it.role=="assistant") "model" else "user","parts" to listOf(mapOf("text" to it.content))) }).also { if(system.isNotBlank()) it["systemInstruction"]=mapOf("parts" to listOf(mapOf("text" to system))) }
            }
            else -> {
                if(config.apiKey.isNotBlank()) builder.header("Authorization","Bearer ${config.apiKey}")
                mapOf("model" to config.model,"messages" to messages.map { mapOf("role" to it.role,"content" to it.content) },"stream" to stream)
            }
        }
        return builder.url(url).post(gson.toJson(body).toRequestBody("application/json; charset=utf-8".toMediaType())).build()
    }
    fun parse(protocol:String,body:String):AiReply {
        try {
            val obj=JsonParser.parseString(body).asJsonObject
            require(!obj.has("error") && obj["type"]?.asString!="error" && obj["promptFeedback"]?.asJsonObject?.has("blockReason")!=true) { "模型服务返回错误或拦截了内容" }
            var reason=""
            val text=when(protocol) {
                "anthropic" -> { reason=obj["stop_reason"]?.takeUnless { it.isJsonNull }?.asString.orEmpty(); obj["content"].asJsonArray.filter { it.asJsonObject["type"]?.asString=="text" }.joinToString("") { it.asJsonObject["text"].asString } }
                "gemini" -> { val candidate=obj["candidates"].asJsonArray.first().asJsonObject; reason=candidate["finishReason"]?.asString.orEmpty(); candidate["content"].asJsonObject["parts"].asJsonArray.filter { it.asJsonObject["thought"]?.asBoolean!=true && it.asJsonObject.has("text") }.joinToString("") { it.asJsonObject["text"].asString } }
                else -> { val choice=obj["choices"].asJsonArray.first().asJsonObject; reason=choice["finish_reason"]?.takeUnless { it.isJsonNull }?.asString.orEmpty(); val content=choice["message"].asJsonObject["content"]; if(content.isJsonArray) content.asJsonArray.filter { it.asJsonObject.has("text") }.joinToString("") { it.asJsonObject["text"].asString } else content.asString }
            }
            require(text.isNotBlank()) { "模型没有返回正文" }
            val truncated=reason in listOf("length","max_tokens","MAX_TOKENS")
            require(reason.isEmpty() || truncated || reason in listOf("stop","end_turn","stop_sequence","STOP")) { "模型回复未正常完成" }
            return AiReply(text,truncated)
        } catch(e:Exception) { throw IllegalArgumentException("模型返回内容无效、被拦截或未正常结束",e) }
    }
}
