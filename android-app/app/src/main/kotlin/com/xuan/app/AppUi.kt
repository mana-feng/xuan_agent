@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class, androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
package com.xuan.app

import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.gson.Gson
import com.google.gson.JsonParser

private data class AppTab(val route: String, val label: String, val symbol: String)

private val appTabs = listOf(
    AppTab("home", "首页", ""),
    AppTab("agent", "AI", "✧"),
    AppTab("my", "我的", ""),
)
private val pageLabels = mapOf(
    "bazi" to "八字命理", "liuyao" to "六爻问事", "ziwei" to "紫微斗数", "qimen" to "奇门遁甲",
    "my" to "我的", "history" to "排盘记录", "chatHistory" to "对话记录", "agent" to "AI 对话",
    "settings" to "AI API 设置", "appearance" to "主题外观", "about" to "关于我们",
)
private val mySubpages = setOf("history", "chatHistory", "settings", "appearance", "about")
@Composable fun XuanApp(model:ChartViewModel) {
 val state by model.state.collectAsState()
 val p=WebPalettes.firstOrNull {it.id==state.palette}?:WebPalettes.first()
 val scroll=rememberLazyListState();val snackbar=remember {SnackbarHostState()}
 val clipboard=LocalClipboardManager.current
 var chatLaunchedPage by rememberSaveable {mutableStateOf<String?>(null)}
 var exportChartId by rememberSaveable{mutableStateOf<String?>(null)};var exportChatId by rememberSaveable{mutableStateOf<String?>(null)}
 // Freeze the record and selected Ziwei view before opening the external picker.
 // JSON strings are saveable across Activity recreation while that picker is open.
 var toonRecordJson by rememberSaveable {mutableStateOf<String?>(null)}
 var toonPayloadJson by rememberSaveable {mutableStateOf<String?>(null)}
 var ziweiView by remember {mutableStateOf<ZiweiViewState?>(null)}
 val exporter=rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")){uri->uri?.let{model.exportBackup(it,exportChartId,exportChatId)}}
 val importer=rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()){uri->uri?.let(model::importBackup)}
 val toonExporter=rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("text/plain")){uri->
  try {
   if(uri!=null) toonRecordJson?.let { json->
    val record=Gson().fromJson(json,SavedChart::class.java)
    val payload=toonPayloadJson?.let {JsonParser.parseString(it).asJsonObject}
    model.exportToon(uri,record,payload)
   }
  } catch(e:Exception) {model.reportError(e.message?:"导出失败，请重试")}
  finally {toonRecordJson=null;toonPayloadJson=null}
 }
 fun navigate(page:String) {
  if (state.page != page) {
   chatLaunchedPage = null
   model.navigate(page)
  }
 }
 fun openFromChat(page: String) {
  chatLaunchedPage = page
  model.navigate(page)
 }
 fun openHome() {
  if (state.page == state.chartType) return
  chatLaunchedPage = null
  if (state.showResult && state.result != null) model.viewResult()
  else navigate(state.chartType)
 }
 fun ask(){model.newChat(true);navigate("agent")}
 LaunchedEffect(state.notice){if(state.notice.isNotEmpty()){snackbar.showSnackbar(state.notice);model.clearNotice()}}
 LaunchedEffect(state.page,state.showResult,state.result){if(state.page!="agent") scroll.scrollToItem(0)}
 val viewingChart=state.showResult && state.page==state.chartType
 val mySubpage = state.page in mySubpages
 val chatChild = mySubpage && state.page == chatLaunchedPage
 val chatScreen = state.page == "agent"
 val keyboardVisible = WindowInsets.ime.getBottom(LocalDensity.current) > 0
 val activeTab = when {
  chatScreen || chatChild -> "agent"
  state.page == "my" || mySubpage -> "my"
  else -> "home"
 }
 BackHandler(viewingChart || state.page != START_PAGE) {
  when {
   viewingChart -> model.editResult()
   mySubpage -> navigate(if (chatChild) "agent" else "my")
   activeTab != "home" -> openHome()
   else -> navigate(START_PAGE)
  }
 }
 CompositionLocalProvider(LocalWebPalette provides p) {
  MaterialTheme(colorScheme=lightColorScheme(primary=p.primary,onPrimary=Color.White,secondary=p.secondary,tertiary=p.accent,background=p.background,surface=Color.White,surfaceVariant=p.tint,onSurface=p.ink,onSurfaceVariant=p.muted,outline=p.border),typography=Typography(bodyLarge=androidx.compose.ui.text.TextStyle(fontSize=14.sp,lineHeight=23.sp),bodyMedium=androidx.compose.ui.text.TextStyle(fontSize=13.sp,lineHeight=22.sp),titleLarge=androidx.compose.ui.text.TextStyle(fontFamily=FontFamily.Serif,fontSize=22.sp))) {
   Scaffold(
    containerColor = p.background,
    snackbarHost = { SnackbarHost(snackbar) },
    bottomBar = {
     if (!keyboardVisible) XuanBottomBar(activeTab) { if (it == "home") openHome() else navigate(it) }
    },
    topBar = {
     Surface(color = Color.White) {
      Column {
       Row(
        Modifier.fillMaxWidth().height(58.dp).padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
       ) {
        if (mySubpage) {
         IconButton(
          onClick = { navigate(if (chatChild) "agent" else "my") },
          modifier = Modifier.semantics { contentDescription = if (chatChild) "返回 AI" else "返回我的" },
         ) { Text("‹", fontSize = 27.sp, color = p.ink) }
        }
        Text(pageLabels[state.page].orEmpty(), fontSize = 13.sp, color = p.ink, modifier = Modifier.weight(1f))
        if (chatScreen) {
         TextButton(onClick = { openFromChat("chatHistory") }) { Text("记录", fontSize = 13.sp) }
         TextButton(onClick = { model.newChat() }, enabled = !state.sending && !state.chatUnsaved) {
          Text("新对话", fontSize = 13.sp)
         }
         IconButton(
          onClick = { openFromChat("settings") },
          modifier = Modifier.semantics { contentDescription = "AI API 设置" },
         ) { Text("⚙", fontSize = 21.sp, modifier = Modifier.clearAndSetSemantics {}) }
        }
       }
       HorizontalDivider(color = p.border)
      }
     }
    },
   ) { padding ->
    if (chatScreen) {
     WebAgentPage(
      state, model,
      openSettings = { openFromChat("settings") },
      openHistory = { openFromChat("history") },
      modifier = Modifier.padding(padding).consumeWindowInsets(padding).imePadding(),
     )
    } else LazyColumn(state=scroll,modifier=Modifier.fillMaxSize().padding(padding).consumeWindowInsets(padding).imePadding(),contentPadding=PaddingValues(horizontal=16.dp,vertical=23.dp),verticalArrangement=Arrangement.spacedBy(16.dp)) {
     if(state.error.isNotEmpty()) item {Surface(color=MaterialTheme.colorScheme.errorContainer,shape=RoundedCornerShape(10.dp)){Column(Modifier.padding(14.dp)){Text(state.error,color=MaterialTheme.colorScheme.onErrorContainer,fontSize=12.sp,lineHeight=21.sp);TextButton(onClick=model::clearError){Text("知道了")}}}}
     if (activeTab == "home") item {
      val modules = listOf("liuyao" to "六爻", "bazi" to "八字", "ziwei" to "紫微", "qimen" to "奇门")
      WebSegments(modules.map { it.second }, modules.indexOfFirst { it.first == state.chartType }) { index ->
       navigate(modules[index].first)
      }
     }
     item(key=state.page+state.showResult.toString()) {
      when(state.page) {
       "my" -> MyPage(state, ::navigate)
       "appearance" -> AppearancePage(p.id, model::setPalette)
       "history","chatHistory"->WebHistoryPage(state,model,{model.openRecord(it)},{model.openChat(it);model.navigate("agent")},{exportChartId=null;exportChatId=null;exporter.launch("玄学AI-本机备份.json")},{importer.launch(arrayOf("application/json","text/plain"))},{r->exportChartId=r.id;exportChatId=null;exporter.launch("玄学AI-排盘-${r.id.take(8)}.json")},{c->exportChartId=null;exportChatId=c.id;exporter.launch("玄学AI-对话-${c.id.take(8)}.json")},{if(state.page=="chatHistory") navigate("agent") else openHome()}, chatOnly=state.page=="chatHistory")
       "settings"->WebSettingsPage(state,model,model::clearConfig)
       "about"->WebAboutPage()
       else->if(state.showResult && state.result!=null) {
        val record=state.result!!
        var showExternalAi by rememberSaveable(record.id) { mutableStateOf(false) }
        if (showExternalAi) ExternalAiDialog(record) { showExternalAi = false }
        Column(verticalArrangement=Arrangement.spacedBy(16.dp)) {
         WebHeading(when(record.result.type){"bazi"->"八字命盘";"ziwei"->"紫微命盘";"liuyao"->"六爻卦象";else->"奇门 · 九宫总览"},when(record.result.type){"bazi"->"从四柱结构出发，理解五行、十神与大运节律。";"ziwei"->"在十二宫与星曜之间，寻找人生的不同面向。";"liuyao"->"一次占问，一份当下的记录。";else->"把问题安放在此刻，从九宫之间找到思路。"})
         FlowRow(horizontalArrangement=Arrangement.spacedBy(7.dp),verticalArrangement=Arrangement.spacedBy(4.dp)) {
          OutlinedButton(onClick=model::editResult,contentPadding=PaddingValues(10.dp)){Text(if(record.result.type=="liuyao") "返回起卦" else if(record.result.type=="qimen")"修改起局" else "修改信息",fontSize=11.sp)}
          OutlinedButton(onClick={
           try {
            if(record.result.type=="liuyao") clipboard.setText(AnnotatedString(LiuyaoExport.text(record)))
            else {
            val payload=if(record.result.type=="ziwei") {
             val view=ziweiView?.takeIf {it.recordId==record.id}?:error("命盘视图尚未就绪，请稍后重试")
             ZiweiExport.payload(record,view)
            } else null
            toonRecordJson=Gson().toJson(record);toonPayloadJson=payload?.toString()
            toonExporter.launch("玄学AI-${record.result.type}-${record.id.take(8)}.toon")
            }
           } catch(e:Exception) {model.reportError(e.message?:"导出失败，请重试")}
          },contentPadding=PaddingValues(10.dp)){Text(if(record.result.type=="liuyao")"复制排盘" else "导出 TOON",fontSize=11.sp)}
          OutlinedButton(onClick={ showExternalAi = true },contentPadding=PaddingValues(10.dp)){Text("其他 AI 解读",fontSize=11.sp)}
          Button(onClick=model::saveResult,enabled=!state.busy,contentPadding=PaddingValues(10.dp),shape=RoundedCornerShape(8.dp)){Text(if(state.records.any{it.id==record.id})"更新本地记录" else "保存到本机",fontSize=11.sp)}
          if(record.result.type=="qimen") Button(onClick=::ask,contentPadding=PaddingValues(10.dp),shape=RoundedCornerShape(8.dp)){Text("携盘问 AI ↗",fontSize=11.sp)}
         }
         when(record.result.type){"bazi"->WebBaziResult(record,::ask);"ziwei"->WebZiweiResult(record,::ask,state.ziweiFocus,onViewChange={ziweiView=it});"qimen"->WebQimenResult(record,::ask);"liuyao"->WebLiuyaoResult(record,::ask)}
        }
       } else WebChartForm(state,model,::navigate)
      }
     }
    }
   }
  }
 }
}

@Composable
private fun XuanBottomBar(selectedRoute: String, navigate: (String) -> Unit) {
    val p = LocalWebPalette.current
    Column {
        HorizontalDivider(color = p.border)
        NavigationBar(containerColor = Color.White, tonalElevation = 0.dp) {
            appTabs.forEach { tab ->
                val selected = selectedRoute == tab.route
                NavigationBarItem(
                    selected = selected,
                    onClick = { navigate(tab.route) },
                    icon = {
                        Box(Modifier.size(28.dp).clearAndSetSemantics {}, contentAlignment = Alignment.Center) {
                            val iconColor = if (selected) p.primary else p.muted
                            when (tab.route) {
                                "home" -> HomeTabIcon(iconColor)
                                "my" -> MyTabIcon(iconColor)
                                else -> Text(tab.symbol, fontSize = 22.sp)
                            }
                        }
                    },
                    label = {
                        Text(tab.label, fontSize = 12.sp, fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal)
                    },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = p.primary, selectedTextColor = p.primary, indicatorColor = p.tint,
                        unselectedIconColor = p.muted, unselectedTextColor = p.muted,
                    ),
                )
            }
        }
    }
}

@Composable
private fun HomeTabIcon(color: Color) {
    Canvas(Modifier.size(23.dp)) {
        val house = Path().apply {
            moveTo(size.width * .16f, size.height * .47f)
            lineTo(size.width * .5f, size.height * .16f)
            lineTo(size.width * .84f, size.height * .47f)
            lineTo(size.width * .84f, size.height * .83f)
            lineTo(size.width * .6f, size.height * .83f)
            lineTo(size.width * .6f, size.height * .59f)
            lineTo(size.width * .4f, size.height * .59f)
            lineTo(size.width * .4f, size.height * .83f)
            lineTo(size.width * .16f, size.height * .83f)
            close()
        }
        drawPath(house, color, style = Stroke(width = 1.6.dp.toPx(), join = StrokeJoin.Round))
    }
}

@Composable
private fun MyTabIcon(color: Color) {
    Canvas(Modifier.size(23.dp)) {
        val line = 1.6.dp.toPx()
        drawCircle(color, radius = size.width * .135f, center = Offset(size.width * .5f, size.height * .28f), style = Stroke(line))
        drawArc(
            color = color, startAngle = 180f, sweepAngle = 180f, useCenter = false,
            topLeft = Offset(size.width * .16f, size.height * .54f),
            size = Size(size.width * .68f, size.height * .55f),
            style = Stroke(width = line, cap = StrokeCap.Round),
        )
    }
}

@Composable
private fun MyPage(state: AppState, navigate: (String) -> Unit) {
    val p = LocalWebPalette.current
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        WebCard("记录") {
            MyEntry("◷", "排盘记录", "本机已保存 "+state.records.size+" 张盘") { navigate("history") }
            HorizontalDivider(color = p.border)
            MyEntry("◌", "对话记录", "本机已保存 "+state.conversations.size+" 个对话") { navigate("chatHistory") }
        }
        WebCard("设置") {
            MyEntry("⚙", "AI API 设置", state.config.model.ifBlank { "配置模型和接口" }) { navigate("settings") }
            HorizontalDivider(color = p.border)
            MyEntry("◉", "主题外观", p.name) { navigate("appearance") }
            HorizontalDivider(color = p.border)
            MyEntry("ⓘ", "关于我们", "查看应用与开源项目信息") { navigate("about") }
        }
    }
}

@Composable
private fun AppearancePage(selected: String, select: (String) -> Unit) {
    WebCard("配色") {
        WebPalettes.forEach { palette ->
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                RadioButton(selected = palette.id == selected, onClick = { select(palette.id) })
                Text(palette.name, Modifier.weight(1f).clickable { select(palette.id) }, fontSize = 14.sp)
                Surface(color = palette.primary, shape = RoundedCornerShape(12.dp)) {
                    Spacer(Modifier.size(18.dp))
                }
            }
        }
    }
}

@Composable
private fun MyEntry(symbol: String, title: String, description: String, onClick: () -> Unit) {
    val p = LocalWebPalette.current
    Row(
        modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp).clickable(onClick = onClick).padding(vertical = 5.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Surface(color = p.tint, shape = RoundedCornerShape(8.dp)) {
            Box(Modifier.size(34.dp), contentAlignment = Alignment.Center) {
                Text(symbol, Modifier.clearAndSetSemantics {}, fontSize = 17.sp, color = p.primary)
            }
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(title, color = p.ink, fontSize = 14.sp, fontWeight = FontWeight.Medium)
            Text(description, color = p.muted, fontSize = 12.sp)
        }
        Text("›", Modifier.clearAndSetSemantics {}, fontSize = 22.sp, color = p.muted)
    }
}
