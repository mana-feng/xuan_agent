package com.xuan.app

import kotlinx.coroutines.suspendCancellableCoroutine
import okhttp3.*
import okio.Buffer
import okio.ForwardingSource
import okio.buffer
import java.io.IOException
import java.io.InputStreamReader
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

class AiClient {
    private val protocol=AiProtocol()
    private val client=OkHttpClient.Builder().retryOnConnectionFailure(false).followRedirects(false).followSslRedirects(false).connectTimeout(30,TimeUnit.SECONDS).readTimeout(300,TimeUnit.SECONDS).callTimeout(300,TimeUnit.SECONDS).build()
    /** Sends once. onPartial receives cumulative visible text, never hidden reasoning. */
    suspend fun send(config:AiConfig,messages:List<ChatMessage>,onPartial:(String)->Unit={}):AiReply = suspendCancellableCoroutine { continuation ->
        val request=try { protocol.request(config,messages,stream=true) } catch(e:Exception) { continuation.resumeWithException(e);return@suspendCancellableCoroutine }
        val call=client.newCall(request)
        continuation.invokeOnCancellation { call.cancel() }
        call.enqueue(object:Callback {
            override fun onFailure(call:Call,e:IOException) { if(continuation.isActive) continuation.resumeWithException(IOException("连接失败或超时，请检查网络与 API 配置；请求未自动重发")) }
            override fun onResponse(call:Call,response:Response) {
                response.use { value ->
                    try {
                        require(value.isSuccessful) { "AI 请求失败（HTTP ${value.code}），请核对接口、密钥与服务额度" }
                        val body=value.body ?: error("模型回复为空")
                        val source=object:ForwardingSource(body.source()) {
                            var count=0L
                            override fun read(sink:Buffer,byteCount:Long):Long {
                                val read=super.read(sink,minOf(byteCount,AiStream.MAX_BYTES-count+1))
                                if(read>0) count+=read
                                require(count<=AiStream.MAX_BYTES) { "模型回复超过 2 MB，请缩小提问范围" }
                                return read
                            }
                        }.buffer()
                        val reply=if(body.contentType()?.subtype?.contains("json",true)==true) {
                            protocol.parse(config.protocol,source.readUtf8()).also { if(continuation.isActive) onPartial(it.text) }
                        } else {
                            val stream=AiStream(config.protocol) { text -> if(continuation.isActive) onPartial(text) }
                            InputStreamReader(source.inputStream(),Charsets.UTF_8).use { reader ->
                                val chunk=CharArray(2048)
                                while(continuation.isActive && !stream.complete) {
                                    val count=reader.read(chunk)
                                    if(count<0) break
                                    stream.feed(String(chunk,0,count))
                                }
                            }
                            stream.finish()
                        }
                        if(continuation.isActive) continuation.resume(reply)
                    } catch(e:Exception) { if(continuation.isActive) continuation.resumeWithException(e) }
                }
            }
        })
    }
}
