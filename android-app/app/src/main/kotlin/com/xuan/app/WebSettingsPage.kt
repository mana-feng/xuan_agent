package com.xuan.app

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable fun WebSettingsPage(state:AppState,model:ChartViewModel,clearConfig:()->Unit) {
    val p=LocalWebPalette.current
    val config=state.configDraft
    val selected=webAiProviderId(config)
    var expanded by remember { mutableStateOf(false) }
    var reveal by remember { mutableStateOf(false) }
    var validation by remember { mutableStateOf("") }
    val provider=webAiProviders.first { it.id==selected }
    Column(verticalArrangement=Arrangement.spacedBy(20.dp)) {
        WebHeading("AI API 设置","配置将保存在本机中")
        WebCard {
            Text("* AI 提供商",fontSize=13.sp,color=p.muted)
            Box {
                OutlinedButton(onClick={expanded=true},modifier=Modifier.fillMaxWidth(),contentPadding=PaddingValues(horizontal=12.dp,vertical=12.dp)) { Text(provider.name,modifier=Modifier.weight(1f));Text("⌄") }
                DropdownMenu(expanded,onDismissRequest={expanded=false}) { webAiProviders.forEach { option -> DropdownMenuItem(text={Text(option.name)},onClick={model.editConfig(webAiPreset(config,option));expanded=false;validation="";reveal=false}) } }
            }
            OutlinedTextField(config.baseUrl,{model.editConfig(config.copy(baseUrl=it));validation=""},label={Text("* API 地址")},placeholder={Text(if(selected=="ollama") "填写 Ollama 的 HTTPS 代理地址" else "选择提供商后自动填充",fontSize=12.sp)},singleLine=true,modifier=Modifier.fillMaxWidth(),supportingText={if(selected=="ollama") Text("Ollama 需通过 HTTPS 代理连接，请填写完整的 /v1/chat/completions 地址。",fontSize=11.sp) else Text("请填写完整 HTTPS API 地址",fontSize=11.sp)})
            val host=runCatching { java.net.URI(config.baseUrl.trim()).host }.getOrNull()
            val optional=selected=="ollama" || selected=="custom" || host in listOf("localhost","127.0.0.1","[::1]","::1")
            OutlinedTextField(config.apiKey,{model.editConfig(config.copy(apiKey=it));validation=""},label={Text(if(optional) "API Key（可选）" else "* API Key")},placeholder={Text("请输入 API Key",fontSize=12.sp)},singleLine=true,visualTransformation=if(reveal) VisualTransformation.None else PasswordVisualTransformation(),modifier=Modifier.fillMaxWidth())
            TextButton(onClick={reveal=!reveal},contentPadding=PaddingValues(0.dp)) { Text(if(reveal) "隐藏" else "显示",fontSize=12.sp) }
            OutlinedTextField(config.model,{model.editConfig(config.copy(model=it));validation=""},label={Text("* 模型名称")},placeholder={Text("选择提供商后自动填充",fontSize=12.sp)},singleLine=true,modifier=Modifier.fillMaxWidth())
            if(selected=="custom") {
                Text("接口格式",fontSize=12.sp,color=p.muted)
                Row(horizontalArrangement=Arrangement.spacedBy(6.dp)) { listOf("openai" to "OpenAI","anthropic" to "Claude","gemini" to "Gemini").forEach { (protocol,label) -> WebPill(label,config.protocol==protocol,{model.editConfig(config.copy(protocol=protocol,provider="custom"))}) } }
            }
            Row(horizontalArrangement=Arrangement.spacedBy(10.dp)) {
                Box(Modifier.weight(1f)) { WebPrimaryButton("保存配置",{
                    val normalized=config.copy(baseUrl=config.baseUrl.trim(),model=config.model.trim(),apiKey=config.apiKey.trim(),provider=selected)
                    validation=when { !optional && normalized.apiKey.isBlank()->"请输入 API Key";else->"" }
                    if(validation.isBlank()) model.saveConfig(normalized)
                }) }
                OutlinedButton(onClick={clearConfig();reveal=false;validation=""},modifier=Modifier.weight(1f)) { Text("清除配置") }
            }
            if(validation.isNotBlank()) Text(validation,color=MaterialTheme.colorScheme.error,fontSize=12.sp)
            Text("只有主动发送 AI 提问时，当前对话和关联盘面才会发送到所填接口。密钥在本机加密保存。保存配置不会发送测试请求。",fontSize=11.sp,color=p.muted,lineHeight=20.sp)
        }
    }
}
