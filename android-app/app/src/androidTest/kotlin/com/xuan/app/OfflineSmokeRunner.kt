package com.xuan.app

import androidx.activity.compose.setContent
import android.app.Application
import androidx.lifecycle.ViewModelProvider
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import android.app.Activity
import android.app.Instrumentation
import android.content.ContextWrapper
import android.database.DatabaseErrorHandler
import android.database.sqlite.SQLiteDatabase
import android.content.Context
import android.content.Intent
import android.os.Bundle
import com.google.gson.Gson
import com.xuan.core.*
import java.io.File
import java.io.IOException
import kotlinx.coroutines.runBlocking
import java.util.UUID

/** Framework-only device tests. Test context delegates writes only to random-prefixed test storage. */
class OfflineSmokeRunner : Instrumentation() {
    private var launchActivity = false
    private val databaseName = "xuan-local.db"
    private val settingsName = "ai-settings"
    private val completed = mutableListOf<String>()
    private val storagePrefix = "offline-smoke-" + UUID.randomUUID() + "-"
    private val storageContext: Context by lazy {
        object : ContextWrapper(context) {
            override fun getDatabasePath(name: String) = targetContext.getDatabasePath(storagePrefix + name)
            override fun openOrCreateDatabase(name: String, mode: Int, factory: SQLiteDatabase.CursorFactory?): SQLiteDatabase =
                targetContext.openOrCreateDatabase(storagePrefix + name, mode, factory)
            override fun openOrCreateDatabase(name: String, mode: Int, factory: SQLiteDatabase.CursorFactory?, errorHandler: DatabaseErrorHandler?): SQLiteDatabase =
                targetContext.openOrCreateDatabase(storagePrefix + name, mode, factory, errorHandler)
            override fun deleteDatabase(name: String) = targetContext.deleteDatabase(storagePrefix + name)
            override fun getSharedPreferences(name: String, mode: Int) = targetContext.getSharedPreferences(storagePrefix + name, mode)
        }
    }

    override fun onCreate(arguments: Bundle?) {
        super.onCreate(arguments)
        launchActivity = arguments?.getString("launchActivity") == "true"
        start()
    }

    override fun onStart() {
        val cases = mutableListOf<Pair<String, () -> Unit>>(
            "generatedChartsPersistAcrossReopen" to ::generatedChartsPersistAcrossReopen,
            "largeChartAndConversationPayloadsSurviveReopen" to ::largeChartAndConversationPayloadsSurviveReopen,
            "invalidImportLeavesExistingRecordsUntouched" to ::invalidImportLeavesExistingRecordsUntouched,
            "validImportMergeDeleteAndChatSnapshots" to ::validImportMergeDeleteAndChatSnapshots,
            "keystoreRoundTripHasNoPlaintextInPreferencesOrExport" to ::keystoreRoundTripHasNoPlaintextInPreferencesOrExport,
            "paidReplySurvivesWriteFailureAndStorageOnlyRetry" to ::paidReplySurvivesWriteFailureAndStorageOnlyRetry,
        )
        if (launchActivity) {
            cases += "nativeActivityLaunches" to ::nativeActivityLaunches
            cases += "webWorkbenchNavigationAndDateDialog" to ::webWorkbenchNavigationAndDateDialog
            cases += "recordRecalculationUpdatesIdentityAndModuleDrafts" to ::recordRecalculationUpdatesIdentityAndModuleDrafts
            cases += "activityRecreationRetainsAllUnsavedDrafts" to ::activityRecreationRetainsAllUnsavedDrafts
        }
        val results = Bundle()
        var failure: Throwable? = null
        var attempted = 0
        try {
            check(context.packageName == "${targetContext.packageName}.test") { "Tests require the separate instrumentation APK context" }
            val databasePath = storageContext.getDatabasePath(databaseName).name
            check(databasePath == storagePrefix + databaseName) { "Refusing to access a non-test database" }
            cases.forEachIndexed { index, (name, test) ->
                attempted++
                sendStatus(1, status(name, index + 1, cases.size))
                try {
                    resetTestStorage()
                    test()
                    completed += name
                    sendStatus(0, status(name, index + 1, cases.size))
                } catch (error: Throwable) {
                    sendStatus(-2, status(name, index + 1, cases.size).apply { putString("stack", error.stackTraceToString()) })
                    throw error
                }
            }
        } catch (error: Throwable) {
            failure = error
        } finally {
            // Never delete AndroidKeyStore aliases: instrumentation runs in the target process.
            // Only random-prefixed test database/settings are cleaned up; user storage names are never used.
            runCatching { resetTestStorage(); targetContext.deleteSharedPreferences(storagePrefix + settingsName);targetContext.deleteSharedPreferences(storagePrefix+"workbench-ui") }.onFailure { if (failure == null) failure = it }
        }
        results.putInt("tests", attempted)
        results.putInt("planned", cases.size)
        results.putInt("failures", if (failure == null) 0 else 1)
        results.putString("passed", completed.joinToString(","))
        results.putString("stream", if (failure == null) "\nOK (${completed.size} offline Android tests)\n" else "\nFAIL: ${failure!!.stackTraceToString()}\n")
        if (failure != null) results.putString("shortMsg", failure!!.javaClass.simpleName)
        finish(if (failure == null) Activity.RESULT_OK else Activity.RESULT_CANCELED, results)
    }

    private fun status(name: String, current: Int, total: Int) = Bundle().apply {
        putString("class", this@OfflineSmokeRunner.javaClass.name)
        putString("test", name)
        putInt("current", current)
        putInt("numtests", total)
        putString("stream", "\n$name")
    }

    private fun resetTestStorage() {
        check(context.packageName.endsWith(".test")) { "Refusing target storage cleanup" }
        check(storageContext.getDatabasePath(databaseName).name == storagePrefix + databaseName) { "Refusing non-test database cleanup" }
        check(storagePrefix.startsWith("offline-smoke-") && storagePrefix.length > 40) { "Refusing non-test preferences cleanup" }
        storageContext.deleteDatabase(databaseName)
        check(storageContext.getSharedPreferences(settingsName, Context.MODE_PRIVATE).edit().clear().commit()) { "Test preferences cleanup failed" }
    }

    private fun fixtures(): List<SavedChart> {
        val input = ChartInput("2024-02-10 10:30:00", gender = 1, title = "离线仪器测试", dayDivide = "zi")
        val generated = listOf(
            BaziEngine().calculate(input),
            LiuyaoEngine().calculate(input, listOf(0, 1, 4, 3, 0, 1)),
            ZiweiEngine().calculate(input),
            QimenEngine().calculate(input),
        )
        return generated.mapIndexed { index, result -> SavedChart("offline-${result.type}", 1_700_000_000_000L + index, input, result) }
    }

    private fun chat(id: String, chart: SavedChart) = Conversation(
        id, "离线对话", chart.result.asText(), listOf(ChatMessage("user", "保存原始盘面"), ChatMessage("assistant", "测试快照")),
    )

    private fun generatedChartsPersistAcrossReopen() {
        val charts = fixtures()
        val conversation = chat("offline-chat", charts.first())
        LocalStore(storageContext).use { store ->
            charts.forEach(store::save)
            store.saveConversation(conversation)
        }
        LocalStore(storageContext).use { reopened ->
            check(reopened.charts() == charts.reversed()) { "Chart inputs, sections, metadata or ordering changed across SQLite reopen" }
            check(reopened.conversations() == listOf(conversation)) { "Conversation messages or chart snapshot changed across reopen" }
            check(reopened.charts().map { it.result.type }.toSet() == setOf("bazi", "liuyao", "ziwei", "qimen")) { "Not all four native chart engines persisted" }
        }
    }

    private fun largeChartAndConversationPayloadsSurviveReopen() {
        val original = fixtures().first()
        val text = "x".repeat(90_000)
        val largeChart = original.copy(result = original.result.copy(sections = original.result.sections +
            ChartSection("Large persisted snapshot", (0 until 30).map { "row-$it" to text } + ("unicode-tail" to "文🙂".repeat(10_000)))))
        val largeChat = chat("large-conversation", original).copy(messages = (0 until 30).map {
            ChatMessage(if (it % 2 == 0) "user" else "assistant", "$it:$text")
        })
        val gson = Gson()
        check(gson.toJson(largeChart).toByteArray().size > 2 * 1024 * 1024) { "Chart regression fixture is too small" }
        check(gson.toJson(largeChat).toByteArray().size > 2 * 1024 * 1024) { "Conversation regression fixture is too small" }
        BackupCodec().decode(BackupCodec().encode(Archive(charts = listOf(largeChart), conversations = listOf(largeChat))))
        LocalStore(storageContext).use { store -> store.save(largeChart); store.saveConversation(largeChat) }
        LocalStore(storageContext).use { reopened ->
            val charts = runCatching { reopened.charts() }
            val chats = runCatching { reopened.conversations() }
            check(charts.isSuccess && chats.isSuccess) {
                "Large SQLite payload retrieval failed: chart=${charts.exceptionOrNull()?.javaClass?.simpleName}, conversation=${chats.exceptionOrNull()?.javaClass?.simpleName}"
            }
            check(charts.getOrThrow() == listOf(largeChart)) { "Large chart snapshot changed across reopen" }
            check(chats.getOrThrow() == listOf(largeChat)) { "Large conversation snapshot changed across reopen" }
        }
    }
    private fun invalidImportLeavesExistingRecordsUntouched() {
        val charts = fixtures()
        val old = charts.first()
        val conversation = chat("existing-chat", old)
        val invalid = charts[2].copy(input = charts[2].input.copy(civil = "2024-02-30 10:30:00"))
        val incoming = Gson().toJson(Archive(charts = listOf(charts[1], invalid), conversations = listOf(chat("new-chat", charts[1]))))
        LocalStore(storageContext).use { store ->
            store.save(old)
            store.saveConversation(conversation)
            var rejected = false
            try { store.importArchive(incoming) } catch (_: IllegalArgumentException) { rejected = true }
            check(rejected) { "Invalid archive was accepted" }
        }
        LocalStore(storageContext).use { reopened ->
            check(reopened.charts() == listOf(old)) { "Invalid import partially added or changed charts" }
            check(reopened.conversations() == listOf(conversation)) { "Invalid import partially added or changed conversations" }
        }
    }

    private fun validImportMergeDeleteAndChatSnapshots() {
        val charts = fixtures()
        val oldChat = chat("old-chat", charts.first())
        val importedChat = chat("imported-chat", charts.last())
        val text = BackupCodec().encode(Archive(charts = charts.drop(1), conversations = listOf(importedChat)))
        LocalStore(storageContext).use { store ->
            store.save(charts.first())
            store.saveConversation(oldChat)
            check(store.importArchive(text) == 3) { "Imported chart count is incorrect" }
        }
        LocalStore(storageContext).use { reopened ->
            check(reopened.charts().associateBy { it.id } == charts.associateBy { it.id }) { "Valid import lost chart snapshots or existing records" }
            val chats = reopened.conversations().associateBy { it.id }
            check(chats == listOf(oldChat, importedChat).associateBy { it.id }) { "Valid import lost conversation snapshots" }
            val exported = BackupCodec().decode(reopened.exportArchive())
            check(exported.charts.associateBy { it.id } == charts.associateBy { it.id }) { "Archive export changed chart data" }
            check(exported.conversations.associateBy { it.id } == chats) { "Archive export changed conversation data" }
            reopened.deleteChart(charts.first().id)
            check(reopened.charts().size == 3) { "Chart delete failed" }
            check(reopened.conversations().associateBy { it.id } == chats) { "Deleting a chart changed preserved conversations" }
            reopened.deleteConversation(importedChat.id)
            check(reopened.conversations() == listOf(oldChat)) { "Conversation delete failed or affected another chat" }
            check(reopened.charts().size == 3) { "Deleting a conversation changed charts" }
        }
    }

    private fun keystoreRoundTripHasNoPlaintextInPreferencesOrExport() {
        val credential = "offline-smoke-" + UUID.randomUUID() + "-credential"
        val config = AiConfig("anthropic", "https://example.invalid/v1/messages", credential, "offline-test-model")
        val secrets = SecretStore(storageContext)
        secrets.save(config)
        check(SecretStore(storageContext).load() == config) { "Keystore-backed settings did not survive a new SecretStore instance" }
        val prefs = storageContext.getSharedPreferences(settingsName, Context.MODE_PRIVATE)
        val firstCiphertext = prefs.getString("key", "").orEmpty()
        check(firstCiphertext.isNotBlank() && ':' in firstCiphertext && firstCiphertext != credential) { "Stored credential is not encrypted" }
        check(prefs.all.values.none { it.toString().contains(credential) }) { "Plaintext credential was found in preferences" }
        val rawPreferences = File(targetContext.applicationInfo.dataDir, "shared_prefs/$storagePrefix$settingsName.xml")
        check(rawPreferences.isFile && !rawPreferences.readText().contains(credential)) { "Plaintext credential was found in the raw preference file" }
        LocalStore(storageContext).use { store ->
            store.save(fixtures().first())
            val archive = store.exportArchive()
            check(!archive.contains(credential) && !archive.contains("apiKey")) { "API credentials leaked into the backup archive" }
        }
        secrets.save(config)
        check(prefs.getString("key", "") != firstCiphertext) { "Repeated encryption reused its GCM IV/ciphertext" }
        check(SecretStore(storageContext).load() == config) { "Re-encrypted settings cannot be read" }
        secrets.save(config.copy(apiKey = ""))
        check(SecretStore(storageContext).load().apiKey.isEmpty()) { "Clearing the configured key left the credential accessible" }
        check(prefs.getString("key", "").isNullOrEmpty()) { "Cleared credential ciphertext remained in preferences" }
    }

    private fun paidReplySurvivesWriteFailureAndStorageOnlyRetry() = runBlocking {
        val pending = chat("paid-reply-storage-retry", fixtures().first()).copy(messages = listOf(ChatMessage("user", "offline request")))
        var displayed: Conversation? = null
        var persistAttempts = 0
        var failed = false
        try {
            ChatDelivery.receive(pending, AiReply("offline synthetic reply", true), { displayed = it }, {
                persistAttempts++
                throw IOException("synthetic test disk failure")
            })
        } catch (_: IOException) { failed = true }
        check(failed && persistAttempts == 1) { "Expected one failed storage attempt" }
        val retained = checkNotNull(displayed) { "Successful reply was lost before storage" }
        check(retained.messages.size == 2 && retained.messages.last().role == "assistant") { "Retained paid reply is missing" }
        check(retained.messages.last().content.contains("offline synthetic reply") && retained.messages.last().content.contains("截断")) { "Reply or truncation marker changed" }
        // Retry only the already-retained conversation; no AiClient or model request exists in this test.
        LocalStore(storageContext).use { it.saveConversation(retained) }
        LocalStore(storageContext).use { reopened ->
            check(reopened.conversations() == listOf(retained)) { "Storage-only retry did not persist the retained reply exactly" }
        }
        check(persistAttempts == 1) { "Retry unexpectedly replayed reply delivery" }
    }
    private fun activityRecreationRetainsAllUnsavedDrafts() {
        val intent = Intent(Intent.ACTION_MAIN).setClassName(targetContext.packageName, "com.xuan.app.MainActivity").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        val original = startActivitySync(intent) as MainActivity
        waitForIdleSync()
        val raw = ChartInput("2023-02-16 09:30", gender = 1, dayDivide = "zi", title = "unsaved lunar input")
        val options = FormOptions(lunarInput = true, leap = true, casting = "数字", numbers = "3 8 6", manual = listOf(4, 1, 0, 3, 0, 1))
        val draft = "unfinished question survives recreation"
        val configDraft = AiConfig("gemini", "https://example.invalid/v1beta", "synthetic-in-memory-only", "draft-model")
        lateinit var previousModel: ChartViewModel
        runOnMainSync {
            previousModel = ViewModelProvider(original)[ChartViewModel::class.java]
            previousModel.chooseType("liuyao")
            previousModel.editForm(raw)
            previousModel.editOptions(options)
            previousModel.editChatDraft(draft)
            previousModel.editConfig(configDraft)
        }
        val created = CountDownLatch(1)
        val recreated = AtomicReference<MainActivity?>()
        val callbacks = object : Application.ActivityLifecycleCallbacks {
            override fun onActivityCreated(activity: Activity, state: Bundle?) {
                if (activity is MainActivity && activity !== original) { recreated.set(activity); created.countDown() }
            }
            override fun onActivityStarted(activity: Activity) {}
            override fun onActivityResumed(activity: Activity) {}
            override fun onActivityPaused(activity: Activity) {}
            override fun onActivityStopped(activity: Activity) {}
            override fun onActivitySaveInstanceState(activity: Activity, state: Bundle) {}
            override fun onActivityDestroyed(activity: Activity) {}
        }
        try {
            runOnMainSync { original.application.registerActivityLifecycleCallbacks(callbacks); original.recreate() }
            check(created.await(10, TimeUnit.SECONDS)) { "MainActivity recreation timed out" }
            waitForIdleSync()
            val current = checkNotNull(recreated.get()) { "Recreated MainActivity is missing" }
            lateinit var retainedModel: ChartViewModel
            runOnMainSync { retainedModel = ViewModelProvider(current)[ChartViewModel::class.java] }
            check(retainedModel === previousModel) { "Activity recreation did not retain its ViewModel" }
            val state = retainedModel.state.value
            check(state.form == raw && state.options == options && state.chartType == "liuyao") { "Raw lunar form, casting mode or manual flags changed during recreation" }
            check(state.chatDraft == draft) { "Unsent chat draft was lost during recreation" }
            check(state.configDraft == configDraft) { "Unsaved config draft was lost during recreation" }
        } finally {
            runOnMainSync {
                original.application.unregisterActivityLifecycleCallbacks(callbacks)
                (recreated.get() ?: original).finish()
            }
        }
    }

    private fun awaitCondition(message:String,condition:()->Boolean) {
        val deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(15)
        while(System.nanoTime()<deadline) { if(condition()) return;Thread.sleep(50) }
        check(condition()) { message }
    }
    private fun isolatedModel(activity:MainActivity):ChartViewModel {
        lateinit var model:ChartViewModel
        runOnMainSync {
            val factory=object:androidx.lifecycle.ViewModelProvider.Factory {
                override fun <T:androidx.lifecycle.ViewModel> create(modelClass:Class<T>):T {
                    @Suppress("UNCHECKED_CAST")
                    return ChartViewModel(activity.application,storageContext) as T
                }
            }
            model=ViewModelProvider(activity,factory).get("isolated-ui-smoke",ChartViewModel::class.java)
            activity.setContent { XuanApp(model) }
        }
        waitForIdleSync()
        return model
    }
    private fun node(label:String):android.view.accessibility.AccessibilityNodeInfo? {
        fun find(root:android.view.accessibility.AccessibilityNodeInfo?):android.view.accessibility.AccessibilityNodeInfo? {
            root?:return null
            if(root.text?.toString()==label || root.contentDescription?.toString()==label) return root
            for(i in 0 until root.childCount) { find(root.getChild(i))?.let { return it } }
            return null
        }
        // Android's service cache can retain stale virtual Compose nodes across scrolls.
        if(android.os.Build.VERSION.SDK_INT>=33) uiAutomation.clearCache()
        val root=uiAutomation.rootInActiveWindow
        root?.refresh()
        return find(root)
    }
    private fun clickLabel(label:String) {
        awaitCondition("UI element missing: $label"){node(label)!=null}
        var target=node(label)!!
        while(!target.isClickable && target.parent!=null) target=target.parent
        check(target.performAction(android.view.accessibility.AccessibilityNodeInfo.ACTION_CLICK)) { "Could not click $label" }
        waitForIdleSync()
    }
    private fun capture(name:String) {
        uiAutomation.waitForIdle(400,5000)
        val dir=File(targetContext.getExternalFilesDir(null),"web-parity-captures").apply {mkdirs()}
        val bitmap=uiAutomation.takeScreenshot()?:error("Screenshot unavailable")
        File(dir,"$name.png").outputStream().use { bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG,100,it) };bitmap.recycle()
    }
    private fun scrollUntil(label:String,backward:Boolean=false) {
        uiAutomation.waitForIdle(150,3000)
        val screen=android.graphics.Rect();uiAutomation.rootInActiveWindow.getBoundsInScreen(screen)
        repeat(2) { pass -> repeat(16) {
            if(node(label)?.isVisibleToUser==true) return
            val reverse=if(pass==0) backward else !backward
            val x=screen.width()*.85f
            val from=screen.height()*(if(reverse) .45f else .70f)
            val to=screen.height()*(if(reverse) .70f else .45f)
            val down=android.os.SystemClock.uptimeMillis()
            fun event(action:Int,y:Float) {val e=android.view.MotionEvent.obtain(down,android.os.SystemClock.uptimeMillis(),action,x,y,0);try{check(uiAutomation.injectInputEvent(e,true))}finally{e.recycle()}}
            event(android.view.MotionEvent.ACTION_DOWN,from)
            for(step in 1..12) {Thread.sleep(30);event(android.view.MotionEvent.ACTION_MOVE,from+(to-from)*step/12)}
            Thread.sleep(160) // Hold the end position to suppress fling and keep overlapping views.
            event(android.view.MotionEvent.ACTION_UP,to)
            waitForIdleSync();uiAutomation.waitForIdle(150,3000)
        } }
        if(node(label)?.isVisibleToUser!=true) {capture("failed-scroll");error("Could not swipe to $label")}
    }
    private fun webWorkbenchNavigationAndDateDialog() {
        val intent=Intent(Intent.ACTION_MAIN).setClassName(targetContext.packageName,"com.xuan.app.MainActivity").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        val activity=startActivitySync(intent) as MainActivity
        val model=isolatedModel(activity)
        try {
            awaitCondition("Web AI home missing"){node("观象，知己。")!=null}
            capture("01-agent-home")
            clickLabel("展开导航");capture("02-navigation");clickLabel("八字命理")
            awaitCondition("Bazi page heading missing"){node("八字排盘")!=null}
            capture("03-bazi-input")
            clickLabel("修改时间")
            awaitCondition("Native date dialog missing"){node("公历出生时间")!=null && node("确认时间  →")!=null}
            capture("04-date-dialog");clickLabel("取消")
            check(!model.state.value.showResult) { "Dismissing date picker incorrectly opened a chart" }
            clickLabel("展开导航");clickLabel("六爻问事")
            awaitCondition("Liuyao route missing"){model.state.value.chartType=="liuyao"}
            check(model.state.value.options.casting=="电脑自动" && model.state.value.options.preview.isEmpty()) { "New Liuyao route pre-generated an unrequested chart" }
            runOnMainSync { model.editOptions(model.state.value.options.copy(casting="手工指定",manual=List(6){-1})) }
            scrollUntil("上爻　请选择");clickLabel("上爻　请选择")
            awaitCondition("Manual line choice dialog missing"){node("选择上爻")!=null}
            clickLabel("━━━━ ○ 老阳")
            check(model.state.value.options.manual[5]==3 && model.state.value.options.manual.take(5).all {it==-1}) { "Manual selection auto-filled other lines" }
            runOnMainSync { model.editOptions(model.state.value.options.copy(casting="在线起卦",preview=emptyList())) }
            repeat(5){runOnMainSync{model.generateCasting()}}
            check(model.state.value.options.preview.size==5) { "Five shakes did not leave one unfinished line" }
            runOnMainSync { model.editForm(model.state.value.form.copy(title="isolated ui question"));model.calculate() }
            awaitCondition("Incomplete casting validation did not finish"){!model.state.value.busy}
            check(model.state.value.result==null && model.state.value.error.isNotBlank()) { "Incomplete shake silently made a chart" }
            runOnMainSync {model.generateCasting();model.calculate()}
            awaitCondition("Complete casting did not produce chart"){model.state.value.result!=null && !model.state.value.busy}
            awaitCondition("Liuyao result UI missing"){node("六爻卦象")!=null};capture("05-liuyao-result")
            runOnMainSync {model.navigate("qimen");model.editOptions(model.state.value.options.copy(useNow=false));model.editForm(ChartInput("2024-02-10 13:15",title="isolated qimen"));model.calculate()}
            awaitCondition("Qimen native result missing"){model.state.value.result?.result?.type=="qimen" && !model.state.value.busy}
            scrollUntil("巽4宫，查看详情");capture("06-qimen-board");clickLabel("巽4宫，查看详情")
            awaitCondition("Qimen palace dialog missing"){node("关闭 ×")!=null};capture("07-qimen-palace");clickLabel("关闭 ×")
            scrollUntil("列表",true);clickLabel("列表");capture("08-qimen-list")
            runOnMainSync {model.navigate("ziwei");model.editForm(ChartInput("1990-06-15 09:30",gender=1,title="isolated ziwei"));model.calculate()}
            awaitCondition("Ziwei result missing"){!model.state.value.busy && model.state.value.result?.result?.type=="ziwei"}
            scrollUntil("命盘总览");capture("09-ziwei-board")
            runOnMainSync {model.applySuggestion(AgentSuggestion("查看事业宫","ziwei",null,false,"官禄"))}
            awaitCondition("Agent palace focus did not open Ziwei result"){model.state.value.showResult && model.state.value.ziweiFocus=="官禄"}
            runOnMainSync {model.navigate("bazi");model.editForm(ChartInput("1990-06-15 09:30",gender=1,title="isolated bazi"));model.calculate()}
            awaitCondition("Bazi result missing"){!model.state.value.busy && model.state.value.result?.result?.type=="bazi"}
            scrollUntil("四柱总览");capture("10-bazi-matrix")
            scrollUntil("大运流年");capture("11-bazi-timeline")
            runOnMainSync {model.applySuggestion(AgentSuggestion("按时间起卦","liuyao",ChartInput("2024-02-10 13:15",title="isolated agent time question"),true))}
            awaitCondition("Agent time casting failed"){!model.state.value.busy && model.state.value.result?.input?.title=="isolated agent time question"}
            check(model.state.value.result?.result?.type=="liuyao" && model.state.value.options.casting=="时间起卦") { "Agent action did not use the requested time casting method" }
            check(model.state.value.contextItems.any {it.startsWith("八字 ")} && model.state.value.contextItems.any {it.startsWith("六爻")}) { "Agent lost active chart summaries" }
            runOnMainSync {model.navigate("history")};awaitCondition("History page missing"){node("每一次探索，都有迹可循")!=null};capture("12-history")
            runOnMainSync {model.navigate("settings")};awaitCondition("Settings page missing"){node("AI API 设置")!=null};capture("13-ai-settings")
            runOnMainSync {model.setPalette("sunset")}
            check(storageContext.getSharedPreferences("workbench-ui",0).getString("palette","")=="sunset") { "Palette was not persisted in isolated preferences" }
        } finally { runOnMainSync {activity.finish()} }
    }
    private fun recordRecalculationUpdatesIdentityAndModuleDrafts() {
        val activity=startActivitySync(Intent(Intent.ACTION_MAIN).setClassName(targetContext.packageName,"com.xuan.app.MainActivity").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) as MainActivity
        val model=isolatedModel(activity)
        try {
            val original=ChartInput("1990-06-15 09:30",gender=1,title="isolated record")
            runOnMainSync {model.navigate("bazi");model.editForm(original);model.calculate()}
            awaitCondition("Initial chart not ready"){model.state.value.result!=null && !model.state.value.busy}
            val id=model.state.value.result!!.id
            runOnMainSync {model.saveResult()}
            awaitCondition("Chart not stored"){model.state.value.records.size==1}
            runOnMainSync {model.openRecord(model.state.value.records.single());model.editResult();model.editForm(original.copy(title="updated title"));model.calculate()}
            awaitCondition("Recalculated chart not ready"){!model.state.value.busy && model.state.value.result?.input?.title=="updated title"}
            check(model.state.value.result!!.id==id) { "Editing a saved chart created a new identity" }
            runOnMainSync {model.saveResult()}
            awaitCondition("Edited record was not updated"){model.state.value.records.singleOrNull()?.input?.title=="updated title"}
            LocalStore(storageContext).use { check(it.charts().size==1 && it.charts().single().id==id) { "Editing duplicated the stored record" } }
            val draft=model.state.value.form
            runOnMainSync {model.navigate("bazi");model.editForm(original.copy(title="new person"));model.calculate()}
            awaitCondition("New record not calculated"){!model.state.value.busy && model.state.value.result?.input?.title=="new person"}
            check(model.state.value.result!!.id!=id) { "Starting another chart reused the previous person's saved identity" }
            runOnMainSync {model.saveResult()}
            awaitCondition("New record did not preserve original"){model.state.value.records.size==2}
            runOnMainSync {model.editForm(draft);model.navigate("liuyao");model.editForm(model.state.value.form.copy(title="other module draft"));model.navigate("bazi")}
            check(model.state.value.form==draft) { "Module navigation lost the Bazi draft" }
            runOnMainSync {model.navigate("liuyao")}
            check(model.state.value.form.title=="other module draft") { "Returning to Liuyao lost its independent draft" }
            runOnMainSync {model.navigate("bazi");model.editForm(original);model.calculate();model.navigate("qimen");model.editOptions(model.state.value.options.copy(useNow=false));model.editForm(original.copy(title="new qimen draft"))}
            awaitCondition("Background calculation did not finish"){!model.state.value.busy}
            check(model.state.value.page=="qimen" && model.state.value.chartType=="qimen" && model.state.value.form.title=="new qimen draft" && model.state.value.result?.result?.type!="bazi") { "Stale calculation replaced current module" }
        } finally {runOnMainSync {activity.finish()}}
    }

    private fun nativeActivityLaunches() {
        val intent = Intent(Intent.ACTION_MAIN).setClassName(targetContext.packageName, "com.xuan.app.MainActivity").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        val activity = startActivitySync(intent)
        waitForIdleSync()
        check(activity.javaClass.name == "com.xuan.app.MainActivity") { "Native entry activity did not launch" }
        runOnMainSync { activity.finish() }
    }
}
