@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class, androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
package com.xuan.app

import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import com.google.gson.Gson
import com.google.gson.JsonParser

private val navigation=listOf("agent" to "AI 探索","bazi" to "八字命理","ziwei" to "紫微斗数","liuyao" to "六爻问事","qimen" to "奇门遁甲","history" to "历史记录")
private val navSymbols=mapOf("agent" to "✧","bazi" to "☷","ziwei" to "✳","liuyao" to "☰","qimen" to "▦","history" to "◷")
@Composable fun XuanApp(model:ChartViewModel) {
 val state by model.state.collectAsState()
 val p=WebPalettes.firstOrNull {it.id==state.palette}?:WebPalettes.first()
 val drawer=rememberDrawerState(DrawerValue.Closed);val scope=rememberCoroutineScope()
 val scroll=rememberLazyListState();val snackbar=remember {SnackbarHostState()}
 val clipboard=LocalClipboardManager.current
 var themeMenu by remember {mutableStateOf(false)};var userMenu by remember{mutableStateOf(false)}
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
 fun navigate(page:String){model.navigate(page);scope.launch{drawer.close()}}
 fun ask(){model.newChat(true);model.navigate("agent")}
 LaunchedEffect(state.notice){if(state.notice.isNotEmpty()){snackbar.showSnackbar(state.notice);model.clearNotice()}}
 LaunchedEffect(state.page,state.showResult,state.result){scroll.scrollToItem(0)}
 BackHandler(drawer.isOpen || state.showResult || state.page!="agent") {when{drawer.isOpen->scope.launch{drawer.close()};state.showResult->model.editResult();else->model.navigate("agent")}}
 CompositionLocalProvider(LocalWebPalette provides p) {
  MaterialTheme(colorScheme=lightColorScheme(primary=p.primary,onPrimary=Color.White,secondary=p.secondary,tertiary=p.accent,background=p.background,surface=Color.White,surfaceVariant=p.tint,onSurface=p.ink,onSurfaceVariant=p.muted,outline=p.border),typography=Typography(bodyLarge=androidx.compose.ui.text.TextStyle(fontSize=14.sp,lineHeight=23.sp),bodyMedium=androidx.compose.ui.text.TextStyle(fontSize=13.sp,lineHeight=22.sp),titleLarge=androidx.compose.ui.text.TextStyle(fontFamily=FontFamily.Serif,fontSize=22.sp))) {
   ModalNavigationDrawer(drawerState=drawer,drawerContent={ModalDrawerSheet(modifier=Modifier.width(280.dp),drawerContainerColor=Color.White){
    Column(Modifier.fillMaxHeight().padding(20.dp),verticalArrangement=Arrangement.spacedBy(9.dp)) {
     Text("☯  玄学 · AI",fontSize=24.sp,fontFamily=FontFamily.Serif,color=p.ink,modifier=Modifier.padding(top=12.dp))
     Text("PATTERNS & POSSIBILITIES",fontSize=8.sp,letterSpacing=2.sp,color=p.muted)
     Spacer(Modifier.height(15.dp))
     WebPrimaryButton("＋  开始探索",{model.startExploration();scope.launch{drawer.close()}})
     Spacer(Modifier.height(10.dp))
     navigation.forEach { (key,name)->NavigationDrawerItem(label={Text(name,fontSize=14.sp)},selected=state.page==key,onClick={navigate(key)},icon={Text(navSymbols[key].orEmpty(),fontSize=20.sp)},shape=RoundedCornerShape(9.dp),colors=NavigationDrawerItemDefaults.colors(selectedContainerColor=p.tint,selectedTextColor=p.primary,unselectedContainerColor=Color.White)) }
     Spacer(Modifier.weight(1f))
     Text("传统智慧，现代视角。\n让每一次探索，都多一种可能。",fontSize=11.sp,color=p.muted,lineHeight=20.sp)
     HorizontalDivider(Modifier.padding(vertical=12.dp),color=p.border)
     TextButton(onClick={navigate("about")}){Text("公告 / 关于我们",fontSize=12.sp)}
    }
   }}) {
    Scaffold(containerColor=p.background,snackbarHost={SnackbarHost(snackbar)},topBar={Surface(color=Color.White,shadowElevation=0.dp){Column {
     Row(Modifier.fillMaxWidth().height(58.dp).padding(horizontal=8.dp),verticalAlignment=Alignment.CenterVertically) {
      IconButton(onClick={scope.launch{drawer.open()}},modifier=Modifier.semantics{contentDescription="展开导航"}){Text("☰",fontSize=20.sp,color=p.muted)}
      Text(navigation.firstOrNull{it.first==state.page}?.second?:if(state.page=="settings")"AI API 设置" else "关于我们",fontSize=13.sp,color=p.ink,modifier=Modifier.weight(1f))
      Box {OutlinedButton(onClick={themeMenu=true},shape=RoundedCornerShape(8.dp),contentPadding=PaddingValues(horizontal=10.dp,vertical=6.dp),modifier=Modifier.height(34.dp).semantics{contentDescription="选择渐变配色"}){Text("●  ${p.name}⌄",fontSize=9.sp,color=p.secondary)}
       DropdownMenu(themeMenu,{themeMenu=false}){WebPalettes.forEach { palette->DropdownMenuItem(text={Text(palette.name)},onClick={model.setPalette(palette.id);themeMenu=false})}}
      }
      Box {TextButton(onClick={userMenu=true},modifier=Modifier.size(48.dp).semantics{contentDescription="用户菜单"},contentPadding=PaddingValues(0.dp)){Surface(color=p.tint,shape=RoundedCornerShape(20.dp)){Text("U⌄",Modifier.padding(8.dp),color=p.primary,fontSize=13.sp)}}
       DropdownMenu(userMenu,{userMenu=false}){DropdownMenuItem(text={Text("AI API 设置")},onClick={userMenu=false;navigate("settings")});DropdownMenuItem(text={Text("关于我们")},onClick={userMenu=false;navigate("about")})}
      }
     };HorizontalDivider(color=p.border)
    }}}) { padding->
     LazyColumn(state=scroll,modifier=Modifier.fillMaxSize().padding(padding).imePadding(),contentPadding=PaddingValues(horizontal=16.dp,vertical=23.dp),verticalArrangement=Arrangement.spacedBy(16.dp)) {
      if(state.error.isNotEmpty()) item {Surface(color=MaterialTheme.colorScheme.errorContainer,shape=RoundedCornerShape(10.dp)){Column(Modifier.padding(14.dp)){Text(state.error,color=MaterialTheme.colorScheme.onErrorContainer,fontSize=12.sp,lineHeight=21.sp);TextButton(onClick=model::clearError){Text("知道了")}}}}
      item(key=state.page+state.showResult.toString()) {
       when(state.page) {
        "agent"->WebAgentPage(state,model,::navigate)
        "history"->WebHistoryPage(state,model,{model.openRecord(it)},{model.openChat(it);model.navigate("agent")},{exportChartId=null;exportChatId=null;exporter.launch("玄学AI-本机备份.json")},{importer.launch(arrayOf("application/json","text/plain"))},{r->exportChartId=r.id;exportChatId=null;exporter.launch("玄学AI-排盘-${r.id.take(8)}.json")},{c->exportChartId=null;exportChatId=c.id;exporter.launch("玄学AI-对话-${c.id.take(8)}.json")},{navigate("agent")})
        "settings"->WebSettingsPage(state,model,model::clearConfig)
        "about"->WebAboutPage()
        else->if(state.showResult && state.result!=null) {
         val record=state.result!!
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
           Button(onClick=model::saveResult,enabled=!state.busy,contentPadding=PaddingValues(10.dp),shape=RoundedCornerShape(8.dp)){Text(if(state.records.any{it.id==record.id})"更新本地记录" else "保存到本机",fontSize=11.sp)}
           if(record.result.type=="qimen") Button(onClick=::ask,contentPadding=PaddingValues(10.dp),shape=RoundedCornerShape(8.dp)){Text("携盘问 AI ↗",fontSize=11.sp)}
          }
          when(record.result.type){"bazi"->WebBaziResult(record,::ask);"ziwei"->WebZiweiResult(record,::ask,state.ziweiFocus,onViewChange={ziweiView=it});"qimen"->WebQimenResult(record,::ask);"liuyao"->WebLiuyaoResult(record,::ask)}
         }
        } else WebChartForm(state,model,::navigate)
       }
      }
      item {Text("传统文化提供思考的视角，每一次选择，都由你自己决定。",fontSize=10.sp,color=p.muted,lineHeight=19.sp,modifier=Modifier.padding(vertical=12.dp))}
     }
    }
   }
  }
 }
}
@Composable private fun WebAboutPage(){Column(verticalArrangement=Arrangement.spacedBy(16.dp)){WebHeading("关于玄学 · AI","传统智慧 · 当代视角");WebCard("让探索更自在"){Text("八字、六爻、紫微与奇门，为理解自己和当下的问题提供不同视角。\n\n排盘与记录保存在本机。你可以配置自己的 AI API，在主动提问时携带当前盘面继续探索。",lineHeight=24.sp);Text("Android 0.2.1",fontSize=11.sp,color=LocalWebPalette.current.muted)}}}
