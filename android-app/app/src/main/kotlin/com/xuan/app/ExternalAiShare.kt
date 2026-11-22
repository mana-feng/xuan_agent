package com.xuan.app

import android.content.ClipData
import android.content.ClipDescription
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.PersistableBundle
import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.graphics.drawable.toBitmap

// Keep these package names in sync with the scoped queries in AndroidManifest.xml.
internal enum class ExternalAiProvider(val label: String, val packageName: String, val website: String? = null) {
    DeepSeek("DeepSeek", "com.deepseek.chat", "https://chat.deepseek.com/"),
    Qwen("千问", "com.aliyun.tongyi", "https://www.qianwen.com/"),
    QwenInternational("Qwen 国际版", "com.tongyi.intl", "https://chat.qwen.ai/"),
    Kimi("Kimi", "com.moonshot.kimichat"),
    Doubao("豆包", "com.larus.nova"),
    ChatGPT("ChatGPT", "com.openai.chatgpt"),
    Gemini("Gemini", "com.google.android.apps.bard"),
    Claude("Claude", "com.anthropic.claude"),
    Perplexity("Perplexity", "ai.perplexity.app.android"),
    Grok("Grok", "ai.x.grok"),
}

internal object ExternalAiShare {
    fun installedProviders(canLaunch: (String) -> Boolean): List<ExternalAiProvider> =
        ExternalAiProvider.entries.filter { canLaunch(it.packageName) }

    fun prompt(record: SavedChart): String = buildString {
        appendLine("请根据下面的排盘信息进行独立解读。")
        appendLine("先概括盘面结构，再回答占问；不确定的地方请明确说明，不要补造盘面数据。")
        if (record.input.title.isNotBlank()) appendLine("占问：${record.input.title}")
        appendLine()
        append(chartText(record))
    }.trim()

    private fun chartText(record: SavedChart): String {
        if (record.result.type == "liuyao") {
            // Old or imported records may only have the stored chart sections.
            return runCatching { LiuyaoExport.text(record) }.getOrElse { record.result.asText() }
        }
        return record.result.asText()
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun ExternalAiDialog(record: SavedChart, onDismiss: () -> Unit) {
    val context = LocalContext.current
    val palette = LocalWebPalette.current
    val prompt = remember(record) { ExternalAiShare.prompt(record) }
    val installed = remember(context) {
        ExternalAiShare.installedProviders { context.packageManager.getLaunchIntentForPackage(it) != null }
    }
    val hasApps = installed.isNotEmpty()
    val providers = if (hasApps) installed else listOf(ExternalAiProvider.DeepSeek, ExternalAiProvider.Qwen)
    fun openProvider(provider: ExternalAiProvider, useApp: Boolean) {
        if (!context.tryCopyAiPrompt(prompt)) return
        onDismiss()
        val launch = if (useApp) context.packageManager.getLaunchIntentForPackage(provider.packageName) else null
        val website = provider.website?.let { Intent(Intent.ACTION_VIEW, Uri.parse(it)).addCategory(Intent.CATEGORY_BROWSABLE) }
        val message = when {
            launch != null && context.tryStart(launch) -> "已复制，请在 ${provider.label} 粘贴"
            website != null && context.tryStart(website) -> "已复制，请在网页版粘贴"
            else -> "无法打开 ${provider.label}，内容已复制"
        }
        Toast.makeText(context, message, Toast.LENGTH_SHORT).show()
    }
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Surface(
            modifier = Modifier.padding(horizontal = 24.dp, vertical = 20.dp).widthIn(max = 408.dp).fillMaxWidth(),
            shape = RoundedCornerShape(24.dp),
            color = Color.White,
        ) {
            Column {
                Column(
                    Modifier.fillMaxWidth()
                        .background(Brush.horizontalGradient(listOf(palette.tint, palette.background)))
                        .padding(start = 20.dp, end = 12.dp, top = 12.dp, bottom = 18.dp),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            "选择 AI 应用",
                            modifier = Modifier.weight(1f),
                            style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.SemiBold),
                            color = palette.ink,
                        )
                        IconButton(onClick = onDismiss, modifier = Modifier.semantics { contentDescription = "关闭" }) {
                            Text("×", color = palette.muted, fontSize = 25.sp, modifier = Modifier.clearAndSetSemantics {})
                        }
                    }
                    Text(
                        if (hasApps) "选择后复制排盘和占问，到对话框粘贴。" else "未找到可打开的 AI 应用，可复制内容到网页版粘贴。",
                        color = palette.ink,
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(end = 8.dp),
                    )
                }
                Column(Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState()).padding(16.dp)) {
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(16.dp),
                        color = Color.White,
                        border = BorderStroke(1.dp, palette.border),
                    ) {
                        Column(Modifier.padding(1.dp)) {
                            providers.forEachIndexed { index, provider ->
                                if (index > 0) HorizontalDivider(Modifier.padding(start = 62.dp, end = 12.dp), color = palette.border)
                                ExternalAiOption(provider, hasApps) { openProvider(provider, useApp = hasApps) }
                            }
                        }
                    }
                }
                HorizontalDivider(color = palette.border)
                FlowRow(
                    modifier = Modifier.fillMaxWidth().background(palette.background).padding(horizontal = 10.dp, vertical = 3.dp),
                    horizontalArrangement = Arrangement.SpaceEvenly,
                ) {
                    TextButton(onClick = {
                        if (!context.tryCopyAiPrompt(prompt)) return@TextButton
                        onDismiss()
                        Toast.makeText(context, "已复制解读内容", Toast.LENGTH_SHORT).show()
                    }) { Text("仅复制解读内容") }
                    TextButton(onClick = {
                        val send = Intent(Intent.ACTION_SEND).apply {
                            type = "text/plain"
                            putExtra(Intent.EXTRA_TEXT, prompt)
                        }
                        onDismiss()
                        if (!context.tryStart(Intent.createChooser(send, "分享解读内容")) && context.tryCopyAiPrompt(prompt)) {
                            Toast.makeText(context, "无法打开系统分享，内容已复制", Toast.LENGTH_SHORT).show()
                        }
                    }) { Text("系统分享") }
                }
            }
        }
    }
}

@Composable
private fun ExternalAiOption(provider: ExternalAiProvider, isInstalled: Boolean, onClick: () -> Unit) {
    val context = LocalContext.current
    val palette = LocalWebPalette.current
    val iconSize = with(LocalDensity.current) { 36.dp.roundToPx() }
    val icon = remember(context, provider, isInstalled, iconSize) {
        if (isInstalled) context.packageManager.findAppIcon(provider.packageName, iconSize) else null
    }
    val shape = RoundedCornerShape(10.dp)
    Row(
        modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp).clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (icon != null) {
            Image(icon, contentDescription = null, modifier = Modifier.size(36.dp).clip(shape))
        } else {
            Box(Modifier.size(36.dp).background(palette.tint, shape), contentAlignment = Alignment.Center) {
                Text(if (isInstalled) provider.label.take(1) else "↗", color = palette.primary, modifier = Modifier.clearAndSetSemantics {})
            }
        }
        Text(
            if (isInstalled) provider.label else "打开 ${provider.label} 网页版",
            modifier = Modifier.weight(1f),
            fontSize = 15.sp,
            fontWeight = FontWeight.Medium,
            color = palette.ink,
        )
        Text("›", color = palette.muted, fontSize = 23.sp, modifier = Modifier.clearAndSetSemantics {})
    }
}

private fun PackageManager.findAppIcon(packageName: String, size: Int): ImageBitmap? = try {
    getApplicationIcon(packageName).toBitmap(size, size).asImageBitmap()
} catch (_: PackageManager.NameNotFoundException) {
    null
}

private fun Context.tryCopyAiPrompt(prompt: String): Boolean {
    val clip = ClipData.newPlainText("排盘解读", prompt)
    clip.description.extras = PersistableBundle().apply {
        putBoolean(ClipDescription.EXTRA_IS_SENSITIVE, true)
    }
    return try {
        getSystemService(ClipboardManager::class.java).setPrimaryClip(clip)
        true
    } catch (_: RuntimeException) {
        // Binder can reject large imported charts.
        Toast.makeText(this, "无法复制解读内容，排盘可能过长", Toast.LENGTH_SHORT).show()
        false
    }
}

private fun Context.tryStart(intent: Intent): Boolean = try {
    startActivity(intent)
    true
} catch (_: RuntimeException) {
    false
}
