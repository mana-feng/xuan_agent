package com.xuan.app

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch

@Composable
fun WebAgentPage(
    state: AppState,
    model: ChartViewModel,
    openSettings: () -> Unit,
    openHistory: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val p = LocalWebPalette.current
    val chat = state.chat
    val messages = chat?.messages.orEmpty()
    val receiving = state.sending && messages.lastOrNull()?.role == "user"
    val configured = state.config.baseUrl.isNotBlank() && state.config.model.isNotBlank()
    val list = rememberLazyListState()
    val focus = LocalFocusManager.current
    val scope = rememberCoroutineScope()
    val showLatest by remember { derivedStateOf { list.canScrollBackward } }
    val exportChat = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        if (uri != null && chat != null) model.exportBackup(uri, chatId = chat.id)
    }
    val context = chatContextLabels(chat, if (chat == null) state.contextItems else emptyList())
    val retryMessage = messages.lastOrNull()?.takeIf { it.role == "user" && state.chatDraft.isBlank() && configured }

    LaunchedEffect(chat?.id) { if (messages.isNotEmpty()) list.scrollToItem(0) }
    LaunchedEffect(receiving) { if (receiving) list.scrollToItem(0) }
    Column(modifier.fillMaxSize()) {
        if (context.isNotEmpty()) {
            Text(
                "已关联盘面 · " + context.joinToString("、"),
                Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                color = p.muted, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
        }

        if (messages.isEmpty()) {
            Box(Modifier.weight(1f).fillMaxWidth().padding(28.dp), contentAlignment = Alignment.Center) {
                Text("输入消息，开始对话", color = p.muted, fontSize = 15.sp)
            }
        } else {
            Box(Modifier.weight(1f).fillMaxWidth()) {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    state = list,
                    reverseLayout = true,
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 14.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.Top),
                ) {
                    if (receiving) {
                        item(key = messages.size) {
                            ChatBubble(
                                AgentActions.visibleStreamingText(state.streamingText).ifBlank { "等待回复…" },
                                fromUser = false,
                            )
                        }
                    }
                    items(messages.size, key = { messages.lastIndex - it }) { reverseIndex ->
                        val message = messages[messages.lastIndex - reverseIndex]
                        val user = message.role == "user"
                        val action = remember(message) { if (user) null else AgentActions.parse(message.content) }
                        val visible = remember(message) { if (user) message.content else AgentActions.visibleText(message.content) }
                        if (visible.isNotEmpty() || action != null) {
                            ChatBubble(visible, user, action, !state.sending && !state.chatUnsaved && !state.busy) {
                                if (it.target == "history") openHistory() else model.applySuggestion(it)
                            }
                        }
                    }
                }
                if (showLatest) {
                    Surface(
                        modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 8.dp),
                        shape = RoundedCornerShape(24.dp),
                        color = p.tint,
                        shadowElevation = 2.dp,
                    ) {
                        TextButton(onClick = { scope.launch { list.scrollToItem(0) } }) { Text("回到最新") }
                    }
                }
            }
        }

        Surface(color = Color.White) {
            Column {
                HorizontalDivider(color = p.border)
                if (state.chatUnsaved) {
                    Text(state.error.ifBlank { "回复尚未保存到本机" }, Modifier.padding(start = 16.dp, top = 8.dp), color = MaterialTheme.colorScheme.error, fontSize = 12.sp)
                    Row(Modifier.padding(horizontal = 8.dp)) {
                        TextButton(onClick = model::retrySaveChat, enabled = !state.sending) { Text("重试保存") }
                        TextButton(onClick = { exportChat.launch("玄学AI-未保存对话.json") }, enabled = !state.sending) { Text("导出对话") }
                    }
                } else if (state.error.isNotBlank()) {
                    Column(Modifier.padding(start = 16.dp, end = 16.dp, top = 8.dp)) {
                        Text(state.error, color = MaterialTheme.colorScheme.error, fontSize = 12.sp)
                        if (!state.sending && retryMessage != null) {
                            TextButton(onClick = { model.send(retryMessage.content) }) { Text("重试发送") }
                        }
                    }
                }

                if (!configured) {
                    Row(Modifier.fillMaxWidth().padding(start = 16.dp, end = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("配置 AI API 后即可发送", Modifier.weight(1f), color = p.muted, fontSize = 12.sp)
                        TextButton(onClick = openSettings) { Text("去配置") }
                    }
                }

                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 9.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.Bottom,
                ) {
                    OutlinedTextField(
                        value = state.chatDraft,
                        onValueChange = model::editChatDraft,
                        modifier = Modifier.weight(1f).semantics { contentDescription = "消息输入框" },
                        placeholder = { Text("输入消息", fontSize = 14.sp) },
                        minLines = 1,
                        maxLines = 5,
                        shape = RoundedCornerShape(15.dp),
                        colors = OutlinedTextFieldDefaults.colors(unfocusedBorderColor = p.border, focusedBorderColor = p.primary),
                    )
                    if (state.sending) {
                        OutlinedButton(onClick = model::cancelChat, modifier = Modifier.height(52.dp), shape = RoundedCornerShape(12.dp)) {
                            Text("停止")
                        }
                    } else {
                        Button(
                            onClick = {
                                if (configured) {
                                    if (model.send(state.chatDraft)) focus.clearFocus()
                                } else {
                                    focus.clearFocus()
                                    openSettings()
                                }
                            },
                            enabled = !state.sending && !state.chatUnsaved && state.chatDraft.isNotBlank(),
                            modifier = Modifier.height(52.dp),
                            shape = RoundedCornerShape(12.dp),
                        ) { Text("发送") }
                    }
                }
            }
        }
    }
}

@Composable
private fun ChatBubble(
    text: String,
    fromUser: Boolean,
    action: AgentSuggestion? = null,
    actionsEnabled: Boolean = false,
    onAction: (AgentSuggestion) -> Unit = {},
) {
    val p = LocalWebPalette.current
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = if (fromUser) Arrangement.End else Arrangement.Start,
    ) {
        Surface(
            Modifier.fillMaxWidth(if (fromUser) .84f else .93f),
            color = if (fromUser) p.tint else Color.White,
            shape = RoundedCornerShape(15.dp),
        ) {
            Column(Modifier.padding(horizontal = 14.dp, vertical = 11.dp)) {
                if (text.isNotEmpty()) {
                    SelectionContainer {
                        Text(text, color = p.ink, fontSize = 15.sp, lineHeight = 24.sp)
                    }
                }
                if (action != null) {
                    TextButton(onClick = { onAction(action) }, enabled = actionsEnabled) { Text(action.label) }
                }
            }
        }
    }
}

internal fun chartTypeName(type: String) = when (type) {
    "bazi" -> "八字"
    "ziwei" -> "紫微"
    "liuyao" -> "六爻"
    "qimen" -> "奇门"
    else -> type
}
