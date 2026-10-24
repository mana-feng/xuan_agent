package com.xuan.app

import kotlinx.coroutines.suspendCancellableCoroutine
import okhttp3.*
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

class AiClient {
    private val protocol=AiProtocol()
    private val client=OkHttpClient.Builder().retryOnConnectionFailure(false).followRedirects(false).followSslRedirects(false).connectTimeout(30,TimeUnit.SECONDS).readTimeout(300,TimeUnit.SECONDS).callTimeout(300,TimeUnit.SECONDS).build()
    suspend fun send(config:AiConfig,messages:List<ChatMessage>):AiReply = suspendCancellableCoroutine { continuation ->
        val request=try { protocol.request(config,messages) } catch(e:Exception) { continuation.resumeWithException(e);return@suspendCancellableCoroutine }
        val call=client.newCall(request)
        continuation.invokeOnCancellation { call.cancel() }
        call.enqueue(object:Callback {
            override fun onFailure(call:Call,e:IOException) { if(continuation.isActive) continuation.resumeWithException(IOException("连接失败或超时，请检查网络与 API 配置；请求未自动重发")) }
            override fun onResponse(call:Call,response:Response) {
                response.use { value ->
                    try {
                        require(value.isSuccessful) { "AI 请求失败（HTTP ${value.code}），请核对接口、密钥与服务额度" }
                        val body=value.body ?: error("模型回复为空")
                        val source=body.source(); require(!source.request(2L*1024*1024+1)) { "模型回复超过 2 MB，请缩小提问范围" }
                        val reply=protocol.parse(config.protocol,source.readUtf8())
                        if(continuation.isActive) continuation.resume(reply)
                    } catch(e:Exception) { if(continuation.isActive) continuation.resumeWithException(e) }
                }
            }
        })
    }
}
