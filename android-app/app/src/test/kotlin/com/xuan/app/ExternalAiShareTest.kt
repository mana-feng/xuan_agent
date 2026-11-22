package com.xuan.app

import com.xuan.core.ChartInput
import com.xuan.core.ChartResult
import com.xuan.core.ChartSection
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ExternalAiShareTest {
    @Test
    fun promptIncludesQuestionAndChartDetails() {
        val prompt = ExternalAiShare.prompt(record("qimen"))

        assertTrue(prompt.contains("占问：这次合作能否顺利推进"))
        assertTrue(prompt.contains("坎一宫"))
        assertTrue(prompt.contains("九星：天蓬"))
        assertTrue(prompt.contains("时区：Asia/Shanghai"))
    }

    @Test
    fun legacyLiuyaoRecordWithoutOriginalLinesCanStillBeShared() {
        val prompt = ExternalAiShare.prompt(record("liuyao"))

        assertTrue(prompt.contains("占问：这次合作能否顺利推进"))
        assertTrue(prompt.contains("九星：天蓬"))
    }

    @Test
    fun pickerOnlyIncludesRecognizedAppsWithLaunchEntries() {
        val launchablePackages = setOf(
            "com.deepseek.chat", "com.aliyun.tongyi", "com.moonshot.kimichat",
            "com.openai.chatgpt", "com.google.android.apps.bard", "com.example.browser",
        )

        assertEquals(
            listOf("DeepSeek", "千问", "Kimi", "ChatGPT", "Gemini"),
            ExternalAiShare.installedProviders { it in launchablePackages }.map { it.label },
        )
    }

    @Test
    fun qwenVariantsCanBothAppearAndEmptyDeviceHasNoAppChoices() {
        val qwenPackages = setOf("com.aliyun.tongyi", "com.tongyi.intl")

        assertEquals(
            listOf("千问", "Qwen 国际版"),
            ExternalAiShare.installedProviders { it in qwenPackages }.map { it.label },
        )
        assertTrue(ExternalAiShare.installedProviders { false }.isEmpty())
    }

    private fun record(type: String) = SavedChart(
        id = "chart-1",
        createdAt = 1L,
        input = ChartInput("2026-11-22 16:00", title = "这次合作能否顺利推进"),
        result = ChartResult(
            type = type,
            title = "测试排盘",
            sections = listOf(ChartSection("坎一宫", listOf("九星" to "天蓬"))),
            metadata = mapOf("时区" to "Asia/Shanghai"),
        ),
    )
}
