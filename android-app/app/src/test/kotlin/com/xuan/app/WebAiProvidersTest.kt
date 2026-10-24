package com.xuan.app

import org.junit.Assert.*
import org.junit.Test

class WebAiProvidersTest {
    @Test fun providerChangeClearsPreviousProviderSecretAndFillsOriginalWebDefaults() {
        val config=AiConfig("openai","https://api.openai.com/v1/chat/completions","synthetic-key","old-model","openai")
        val changed=webAiPreset(config,webAiProviders.first { it.id=="deepseek" })
        assertEquals("",changed.apiKey)
        assertEquals("deepseek",changed.provider)
        assertEquals("https://api.deepseek.com/v1/chat/completions",changed.baseUrl)
        assertEquals("deepseek-chat",changed.model)
        assertEquals("synthetic-key",webAiPreset(config,webAiProviders.first()).apiKey)
    }
    @Test fun providerIdentitySurvivesEditedEndpointAndCustomProtocol() {
        assertEquals("qwen",webAiProviderId(AiConfig("openai","https://example.test/ai","","model","qwen")))
        assertEquals("custom",webAiProviderId(AiConfig("anthropic","https://example.test/messages","","model","custom")))
    }
    @Test fun legacyEndpointsMatchHostsExactlyAndPreserveNativeGemini() {
        assertEquals("custom",webAiProviderId(AiConfig(baseUrl="https://api.openai.com.attacker.test/v1/chat/completions")))
        assertEquals("deepseek",webAiProviderId(AiConfig(baseUrl="https://api.deepseek.com/v1/chat/completions")))
        assertEquals("gemini",webAiProviderId(AiConfig("gemini","https://example.test/v1beta","","model")))
    }
    @Test fun webGeminiUsesCompatibleProtocolAndOllamaRequiresUserHttpsEndpoint() {
        assertEquals(9,webAiProviders.size)
        val gemini=webAiPreset(AiConfig(),webAiProviders.first { it.id=="gemini" })
        assertEquals("openai",gemini.protocol)
        assertTrue(gemini.baseUrl.endsWith("/v1beta/openai/chat/completions"))
        val ollama=webAiPreset(AiConfig(),webAiProviders.first { it.id=="ollama" })
        assertEquals("",ollama.baseUrl)
        assertEquals("llama3",ollama.model)
        assertTrue(webAiProviders.all { it.url.isEmpty() || it.url.startsWith("https://") })
    }
}
