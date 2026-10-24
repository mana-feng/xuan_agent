package com.xuan.app

import com.google.gson.*
import com.xuan.core.*
import java.time.*
import java.time.format.DateTimeFormatter

/** Immutable export of the same civil-clock selection displayed by WebZiweiResult. */
object ZiweiExport {
    private val gson=GsonBuilder().serializeNulls().disableHtmlEscaping().create()
    private val names=linkedMapOf("decadal" to "大限","age" to "小限","yearly" to "流年","monthly" to "流月","daily" to "流日","hourly" to "流时")
    private val prompt="""你是一名专业紫微斗数解读助手，目标是：根据用户提供的紫微排盘信息，精准回答用户提出的具体问题。

规则：

每次回答问题时称呼我为主人。

必须以盘面事实为依据（十二宫、主星/辅星/杂曜、四化、三方四正、命宫/身宫、大限/流年/流月/流日/流时），神煞只能辅助。

回答要围绕“用户问题”，避免输出与问题无关的大段通用命理科普。

避免武断：对不确定或依赖缺失信息（尤其时辰、历法、目标时间）的部分，要明确说明“影响点”和“可能范围”。

不要编造盘面数据；如果输入里没有提供某项（如某一层运限、某宫位细节），不要假设。

在判断时间趋势时，要明确区分长期与短期：
- 大限：长期阶段主题
- 流年：年度主线变化
- 流月/流日/流时：短期触发与节奏

结论需要给出1-2条依据点（例如：关键宫位、关键星曜、四化落宫、三方四正呼应/冲突）。

默认输出结构（不必用死板标题）：
1. 直接回答结论（先对准问题）
2. 依据点解释（短而可核对）
3. 建议/行动方案（可执行，区分优先级与时间窗口）
4. 若信息不足：补问最多3个关键问题（可选）

如果用户问“能不能做/何时做更合适”，请给出：倾向（偏好/偏弱/中性）+ 时间窗口（优先给条件与区间，避免硬性绝对断言）。

需要你分析的紫微盘信息如下（我将提供在下方）："""
    private val tags=listOf("禄","权","科","忌")
    private val compactFields=mapOf("cs" to "compactScopes","d" to "decadal","a" to "age","y" to "yearly","i" to "index","hs" to "heavenlyStem","eb" to "earthlyBranch","m" to "mutagen","sp" to "starsByPalace","p" to "palaceIndex","v" to "stars","na" to "nominalAge","y12" to "yearlyDecStar","j" to "jiangqian12","u" to "suiqian12","c" to "isCurrentYear","g" to "yearlyGanZhi")
    private fun display(name:String)=if(name=="仆役") "交友" else name
    private fun stars(value:String?)=value.orEmpty().split(',').filter(String::isNotBlank).map { it.split(':') }

    fun payload(record:SavedChart,view:ZiweiViewState):JsonObject {
        require(record.result.type=="ziwei" && record.id==view.recordId) { "紫微导出视图与命盘不一致" }
        require(view.mode=="origin" || view.mode in names) { "紫微运限视图无效" }
        require(view.selectedPalace in -1..11) { "紫微宫位无效" }
        val target=LocalDateTime.parse(view.target)
        val natal=record.result;val m=natal.metadata;val engine=ZiweiHoroscope();val calendar=CalendarEngine()
        fun flowAt(date:LocalDateTime)=runCatching { engine.calculate(natal,date) }.getOrNull()
        val flow=flowAt(target)
        fun deities(f:ZiweiFlow)= (0..11).map { engine.yearlyDeities(it,f.scopes.getValue("yearly").stemBranch[1]) }
        fun scopeValue(scope:ZiweiScope,f:ZiweiFlow,compact:Boolean=false):Map<String,Any?> {
            val starsByPalace=scope.stars.mapIndexedNotNull { i,ss -> if(ss.isEmpty()) null else if(compact) mapOf("p" to i,"v" to ss) else mapOf("palaceIndex" to i,"stars" to ss) }
            val result=if(compact) linkedMapOf<String,Any?>("i" to scope.index,"hs" to scope.stemBranch[0].toString(),"eb" to scope.stemBranch[1].toString(),"m" to scope.transformations) else linkedMapOf<String,Any?>(
                "index" to scope.index,"name" to if(scope.key=="decadal" && f.childhood) "童限" else names.getValue(scope.key),"heavenlyStem" to scope.stemBranch[0].toString(),"earthlyBranch" to scope.stemBranch[1].toString(),
                "palaceNames" to scope.palaceNames.map(::display),"mutagen" to scope.transformations,"starsByPalace" to starsByPalace)
            if(compact && starsByPalace.isNotEmpty()) result["sp"]=starsByPalace
            if(scope.key=="age") result[if(compact) "na" else "nominalAge"]=f.nominalAge
            if(scope.key=="yearly") {
                val ds=deities(f)
                result[if(compact) "y12" else "yearlyDecStar"]=if(compact) mapOf("j" to ds.map {it.first},"u" to ds.map {it.second}) else mapOf("jiangqian12" to ds.map {it.first},"suiqian12" to ds.map {it.second})
            }
            return result
        }
        fun compactScopes(f:ZiweiFlow?):Map<String,Any?>?=f?.let { mapOf("d" to scopeValue(it.scopes.getValue("decadal"),it,true),"a" to scopeValue(it.scopes.getValue("age"),it,true),"y" to scopeValue(it.scopes.getValue("yearly"),it,true)) }
        fun palaceInfo(i:Int)=mapOf("index" to i,"name" to m["palace.$i.name"],"displayName" to display(m["palace.$i.name"].orEmpty()))
        fun natalStars(i:Int)=stars(m["palace.$i.majorStars"])+stars(m["palace.$i.minorStars"])
        fun surrounded(i:Int):Map<String,Any?> {
            val indices=mapOf("target" to i,"opposite" to (i+6)%12,"wealth" to (i+8)%12,"career" to (i+4)%12)
            return indices.mapValues { palaceInfo(it.value) }+mapOf("mutagenFlags" to tags.map { tag -> mapOf("mutagen" to tag,"active" to indices.values.any { p -> natalStars(p).any { it.getOrNull(2)==tag } }) })
        }
        val palaces=(0..11).map { i ->
            val key="palace.$i.";val gz=m.getValue(key+"stemBranch")
            fun exportStars(kind:String)=stars(m[key+kind]).map { mapOf("name" to it[0],"brightness" to it.getOrNull(1)?.ifBlank {null},"mutagen" to it.getOrNull(2)?.ifBlank {null}) }
            linkedMapOf<String,Any?>("index" to i,"name" to m[key+"name"],"displayName" to display(m[key+"name"].orEmpty()),"isBodyPalace" to (m[key+"isBody"]=="true"),"isOriginalPalace" to (m[key+"isOriginal"]=="true"),
                "heavenlyStem" to gz[0].toString(),"earthlyBranch" to gz[1].toString(),"changsheng12" to m[key+"changsheng"],"boshi12" to m[key+"boshi"],"jiangqian12" to m[key+"jiangqian"],"suiqian12" to m[key+"suiqian"],
                "decadal" to mapOf("range" to m.getValue(key+"decadal").split(',').map(String::toInt),"heavenlyStem" to gz[0].toString(),"earthlyBranch" to gz[1].toString()),"ages" to m.getValue(key+"ages").split(',').map(String::toInt),
                "majorStars" to exportStars("majorStars"),"minorStars" to exportStars("minorStars"),"adjectiveStars" to exportStars("adjectiveStars"))
        }
        val decades=(0..11).sortedBy {m.getValue("palace.$it.decadal").substringBefore(',').toInt()}.map { i ->
            val gz=m.getValue("palace.$i.stemBranch")
            linkedMapOf<String,Any?>("palaceIndex" to i,"palaceName" to m["palace.$i.name"],"displayName" to display(m["palace.$i.name"].orEmpty()),"heavenlyStem" to gz[0].toString(),"earthlyBranch" to gz[1].toString(),"ganZhi" to gz,"range" to m.getValue("palace.$i.decadal").split(',').map(String::toInt))
        }
        val allDecades=decades.map { decade ->
            val age=(decade.getValue("range") as List<*>)[0] as Int
            val date=runCatching {engine.dateForAge(natal,age)}.getOrNull()
            decade+mapOf("referenceYear" to date?.year,"cs" to compactScopes(date?.let { flowAt(it.atStartOfDay()) }))
        }
        val birthLunarYear=calendar.lunar(LocalDate.parse(m.getValue("calculationDate"))).year
        val currentYear=flow?.let {birthLunarYear+it.nominalAge-1}?:target.year
        val minYear=allDecades.mapNotNull {it["referenceYear"] as? Int}.minOrNull()
        val startYear=maxOf(currentYear-20,minYear?:Int.MIN_VALUE);val endYear=currentYear+30
        val years=(startYear..endYear).map { year ->
            val f=runCatching {calendar.solar(year,1,1)}.getOrNull()?.let {flowAt(it.atStartOfDay())}
            mapOf("y" to year,"c" to (year==currentYear),"g" to f?.scopes?.get("yearly")?.stemBranch,"cs" to compactScopes(f))
        }
        val focus=view.selectedPalace.takeIf {it>=0}?.let { selected ->
            val fly=engine.transformations(m.getValue("palace.$selected.stemBranch")[0])
            mapOf("palace" to palaceInfo(selected),"surrounded" to mapOf("natal" to surrounded(selected),"scope" to if(view.mode!="origin" && flow!=null) surrounded(selected) else null),
                "flyMutagens" to (0..11).mapNotNull { i ->
                    val starNames=natalStars(i).map {it[0]};val hits=tags.filterIndexed { n,_ -> fly[n] in starNames }
                    if(hits.isEmpty()) null else mapOf("palaceIndex" to i,"palaceName" to m["palace.$i.name"],"displayName" to display(m["palace.$i.name"].orEmpty()),"mutagens" to hits)
                })
        }
        val originalZone=m["原始时区"]?:record.input.timeZone
        val birthLocal=LocalDateTime.parse(record.input.civil.replace(' ','T'))
        val birthInstant=birthLocal.atZone(ZoneId.of(record.input.timeZone)).toInstant()
        val selection=mapOf("viewMode" to view.mode,"targetDateISO" to target.atZone(ZoneId.systemDefault()).toInstant().let {DateTimeFormatter.ISO_INSTANT.format(it)},"calculationDate" to flow?.date?.toString(),"lateZiRollover" to (target.hour==23),"currentScopeLabel" to if(view.mode=="origin") null else flow?.scopes?.get(view.mode)?.let {it.stemBranch+names.getValue(view.mode)})
        return gson.toJsonTree(linkedMapOf(
            "meta" to mapOf("exportTime" to Instant.now().toString(),"version" to "1.0.0","module" to "ziwei"),
            "prompt" to prompt,
            "profile" to mapOf("name" to record.input.title.trim().ifBlank {"佚名"},"gender" to if(record.input.gender==0) "男" else "女","birthTimestamp" to birthInstant.toEpochMilli(),"birthSolarISO" to birthInstant.toString(),"timeZone" to originalZone,"timeZoneSource" to "explicit"),
            "calculation" to m,
            "basicChart" to mapOf("gender" to if(record.input.gender==0) "男" else "女","solarDate" to m["calculationDate"],"lunarDate" to m["lunar"],"earthlyBranchOfSoulPalace" to m["soulPalace"],"earthlyBranchOfBodyPalace" to m["bodyPalace"],"soul" to m["soul"],"body" to m["body"],"fiveElementsClass" to m["fiveElementsClass"],"palaceLayout" to mapOf("top" to listOf("巳","午","未","申"),"left" to listOf("辰","卯"),"right" to listOf("酉","戌"),"bottom" to listOf("寅","丑","子","亥")),"palaces" to palaces),
            "newSchoolChart" to mapOf("selection" to selection,"timeline" to mapOf("decadal" to decades,"selectedIndices" to names.mapValues {flow?.scopes?.get(it.key)?.index}),"scopes" to flow?.let {f -> f.scopes.mapValues {scopeValue(it.value,f)}},"compactFieldMap" to compactFields,"allDecadalCharts" to allDecades,"yearlyRangeCharts" to mapOf("beforeYears" to 20,"afterYears" to 30,"requestedStartYear" to currentYear-20,"minStartYearByDecadal" to minYear,"startYear" to startYear,"endYear" to endYear,"totalYears" to years.size,"charts" to years),"focus" to focus)
        )).asJsonObject
    }
}
