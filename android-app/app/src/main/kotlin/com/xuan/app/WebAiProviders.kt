package com.xuan.app

internal data class WebAiProvider(val id:String,val name:String,val protocol:String,val url:String,val model:String)
internal val webAiProviders=listOf(
    WebAiProvider("openai","OpenAI","openai","https://api.openai.com/v1/chat/completions","gpt-4o"),
    WebAiProvider("anthropic","Claude","anthropic","https://api.anthropic.com/v1/messages","claude-3-5-sonnet-20241022"),
    WebAiProvider("gemini","Google Gemini","openai","https://generativelanguage.googleapis.com/v1beta/openai/chat/completions","gemini-2.0-flash"),
    WebAiProvider("qwen","通义千问","openai","https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions","qwen-plus"),
    WebAiProvider("deepseek","DeepSeek","openai","https://api.deepseek.com/v1/chat/completions","deepseek-chat"),
    WebAiProvider("kimi","Kimi","openai","https://api.moonshot.cn/v1/chat/completions","moonshot-v1-8k"),
    WebAiProvider("zhipu","智谱","openai","https://open.bigmodel.cn/api/paas/v4/chat/completions","glm-4"),
    WebAiProvider("ollama","Ollama (本地)","openai","","llama3"),
    WebAiProvider("custom","自定义","openai","","")
)
internal fun webAiProviderId(config:AiConfig):String {
    if(webAiProviders.any { it.id==config.provider }) return config.provider
    if(config.protocol=="anthropic") return "anthropic"
    if(config.protocol=="gemini") return "gemini"
    val host=runCatching { java.net.URI(config.baseUrl.trim()).host }.getOrNull()
    return webAiProviders.firstOrNull { it.url.isNotEmpty() && host!=null && java.net.URI(it.url).host.equals(host,true) }?.id?:if(config.baseUrl.isBlank()) "openai" else "custom"
}
internal fun webAiPreset(config:AiConfig,provider:WebAiProvider):AiConfig=AiConfig(provider.protocol,provider.url,if(webAiProviderId(config)==provider.id) config.apiKey else "",provider.model,provider.id)
