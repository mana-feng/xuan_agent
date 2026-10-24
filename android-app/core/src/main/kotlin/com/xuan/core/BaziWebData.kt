package com.xuan.core

import java.util.Locale

/** UI-facing values ported from the preserved mobile web baseline. Traditional structural heuristics only. */
class BaziWebData(val input:ChartInput) {
    data class Finding(val type:String,val description:String)
    data class Column(val title:String,val ganzhi:String,val fields:Map<String,String>)
    private val calendar=CalendarEngine()
    val local=calendar.civil(input)
    val pillars=calendar.pillars(input)
    private val values=pillars.list()
    private val day=values[2][0]
    private val engine=BaziEngine(calendar)
    private val allHidden=values.map { hidden.getValue(it[1]) }
    val structure:Finding by lazy { structure() }
    val strength:Finding by lazy { strength() }
    val elements:Map<Char,String> by lazy {
        val season=when(local.monthValue) { 1,12->3;2,3,4->0;5,6,7->1;8->4;else->2 }
        val status=listOf("旺休死相囚","相旺囚死休","死相休囚旺","囚死旺休相","休囚相旺死")
        "木火土金水".mapIndexed { i,e -> e to "${status[i][season]}(${values.sumOf { (if(element(it[0])==e) 1 else 0)+(if(element(it[1])==e) 1 else 0) }})" }.toMap()
    }
    fun stars(gz:String):List<String> = BaziDetails.shensha(pillars,0,gz).single().filterNot { it.startsWith("勾绞煞") || it.startsWith("元辰") }
    fun diagram(extra:List<String> = emptyList()) = BaziDetails.diagram(values+extra.filter { it.length==2 && it!="童限" },false)
    fun columns(extra:List<Pair<String,String>> = emptyList()):List<Column> {
        val baseStars=BaziDetails.shensha(pillars,input.gender)
        return (listOf("年柱","月柱","日柱","时柱").zip(values)+extra.filter { it.second.length==2 && it.second!="童限" }).mapIndexed { index,(name,gz) ->
            val hide=if(index>=4 && gz[1]=='巳') "丙戊庚" else hidden.getValue(gz[1]);val ganIndex=GanZhi.GAN.indexOf(day)
            val stage=stages[GanZhi.mod((GanZhi.ZHI.indexOf(gz[1])-starts[ganIndex])*(if(ganIndex%2==0) 1 else -1),12)]
            Column(name,gz,linkedMapOf(
                "主星" to if(index==2) (if(input.gender==0) "元男" else "元女") else engine.tenGod(day,gz[0]),
                "天干" to "${gz[0]}${element(gz[0])}","地支" to "${gz[1]}${element(gz[1])}",
                "藏干" to hide.map { "$it${element(it)}" }.joinToString("\n"),"副星" to hide.map { engine.tenGod(day,it) }.joinToString("\n"),
                "星运" to stage,"空亡" to GanZhi.empty(gz).toList().joinToString("、"),
                "神煞" to (if(index<4) baseStars[index] else stars(gz)).joinToString("\n").ifBlank { "—" },"纳音" to nayin.getValue(gz)))
        }
    }
    private fun structure():Finding {
        val allGan=values.map { it[0] };val monthHide=allHidden[1]
        val exposed=monthHide.firstOrNull { it in allGan }
        var type:String;var description:String
        if(exposed!=null) {
            val god=engine.tenGod(day,exposed);type=god+"格";description=structureDescriptions.getValue(god)
            if(exposed!=monthHide[0]) description+="（注：以月令${if(monthHide.length>1) "中气" else "余气"}透干定格局）"
        } else {
            val monthGod=engine.tenGod(day,values[1][0])
            val god=when { "官" in monthGod->"正官";"杀" in monthGod->"七杀";"财" in monthGod->"正财";"印" in monthGod->"正印";else->monthGod }
            if(god !in listOf("比肩","劫财")) {
                type=god+"格（月干）"
                val theme=mapOf("正官" to "贵气","七杀" to "权威","正财" to "财富","偏财" to "横财","正印" to "文贵","偏印" to "智慧","食神" to "才华","伤官" to "才华").getValue(god)
                description="${god}格：以月干${god}定格局，主${theme}。注意：月令藏干未透，格局力量较弱，需结合其他因素判断。"
            } else {
                type="杂格";description="杂格：月令藏干未透干，且月干十神不明显，格局复杂，需要综合分析。建议：查看月令本气、中气、余气，结合日主强弱、五行旺衰、组合关系综合判断。"
            }
        }
        val factors=listOf("甲己","乙庚","丙辛","丁壬","戊癸").filter { pair -> pair.all { it in allGan } && exposed!=null && exposed in pair }
        if(factors.isNotEmpty()) description+=" 破格因素："+factors.joinToString("；") { "${it}合，可能影响格局" }
        return Finding(type,description)
    }
    private fun strength():Finding {
        val own=element(day);val month=element(values[1][1]);val allGan=values.map { it[0] }
        var order=if(month==own) 1 else 0
        if(order==0) { if(allHidden[1].any { element(it)==own }) order=1;if("水木火土金"["木火土金水".indexOf(own)]==month) order=2 }
        var root=0.0
        values.forEachIndexed { i,gz -> if(element(gz[1])==own) root+=1;root+=allHidden[i].count { element(it)==own }*0.5 }
        fun count(gods:List<String>):Double = allGan.count { engine.tenGod(day,it) in gods }+allHidden.sumOf { h -> h.count { engine.tenGod(day,it) in gods }*0.5 }
        val peer=count(listOf("比肩","劫财"));val resource=count(listOf("正印","偏印"));val drain=count(listOf("正官","七杀","正财","偏财","食神","伤官"))
        val score=(if(order==1) 3.0 else if(order==2) 1.5 else 0.0)+minOf(root,2.0)+minOf(peer*0.5,1.5)+minOf(resource*0.3,1.0)-minOf(drain*0.2,2.0)
        fun number(d:Double)=String.format(Locale.ROOT,"%.1f",d)
        val evidence=mutableListOf<String>();val prefix="日主${day}(${own})身"
        return when {
            score>=4 -> { if(order==1)evidence.add("得令");if(root>=1)evidence.add("得地（${number(root)}个根气）");if(peer>=1)evidence.add("得势（${number(peer)}个比劫）");if(resource>=1)evidence.add("得生（${number(resource)}个印星）");Finding("强",prefix+"强。依据：${evidence.joinToString("、")}。") }
            score>=2.5 -> { if(order==1)evidence.add("得令");if(root>=0.5)evidence.add("得地（${number(root)}个根气）");if(peer>=0.5)evidence.add("得势（${number(peer)}个比劫）");Finding("中强",prefix+"中强。依据：${evidence.joinToString("、").ifEmpty { "综合判断" }}。") }
            score>=1 -> Finding("中",prefix+"中和。依据：得令/得地/得势/得生/克泄耗综合平衡。")
            else -> {
                if(order==0)evidence.add("失令");if(root<0.5)evidence.add("失地（根气不足）")
                if(drain>=if(score>=-1) 2 else 3)evidence.add("克泄耗多（${number(drain)}个）")
                if(score< -1 && peer<0.5 && resource<0.5)evidence.add("无助无生")
                Finding(if(score>=-1) "弱" else "极弱",prefix+(if(score>=-1) "弱" else "极弱")+"。依据：${evidence.joinToString("、")}。"+(if(score< -1) "需考虑从格。" else ""))
            }
        }
    }
    companion object {
        private val rows by lazy { BaziWebData::class.java.getResourceAsStream("/bazi-static.tsv")!!.bufferedReader().readLines().map { it.split('\t') } }
        private val hidden by lazy { rows.filter { it[0]=="H" && it[1].length==1 }.associate { it[1][0] to it[2] } }
        private val nayin by lazy { rows.filter { it[0]=="N" }.associate { it[1] to it[2] } }
        private val starts=listOf(11,6,2,9,2,9,5,0,8,3)
        private val stages=listOf("长生","沐浴","冠带","临官","帝旺","衰","病","死","墓","绝","胎","养")
        fun element(c:Char):Char = if(c in GanZhi.GAN) "木火土金水"[GanZhi.GAN.indexOf(c)/2] else "水土木木土火火土金金土水"[GanZhi.ZHI.indexOf(c)]
        private val structureDescriptions=mapOf(
            "正官" to "正官格：月令正官透干，主贵气，性格端正，有责任感。成格条件：正官有力、不被冲克、有印护官。破格因素：伤官见官、七杀混杂、财星坏印。",
            "七杀" to "七杀格：月令七杀透干，主权威，性格刚强，有魄力。成格条件：七杀有力、有制化（食伤制杀或印化杀）。破格因素：官杀混杂、无制化、比劫夺财。",
            "正财" to "正财格：月令正财透干，主财富，性格务实，善于理财。成格条件：财星有力、有食伤生财、有官护财。破格因素：比劫夺财、财多身弱、无食伤生财。",
            "偏财" to "偏财格：月令偏财透干，主横财，性格灵活，善于把握机会。成格条件：偏财有力、有食伤生财、身强能担财。破格因素：比劫夺财、财多身弱、无食伤生财。",
            "正印" to "正印格：月令正印透干，主文贵，性格温和，有学识。成格条件：印星有力、有官杀生印、身弱喜印。破格因素：财星坏印、印多身旺、无官杀生印。",
            "偏印" to "偏印格：月令偏印透干，主智慧，性格内向，有独特见解。成格条件：偏印有力、有食伤配印、身弱喜印。破格因素：财星坏印、印多身旺、食神被夺。",
            "食神" to "食神格：月令食神透干，主才华，性格温和，有艺术天赋。成格条件：食神有力、有财星泄秀、身强能担。破格因素：枭神夺食、食神被克、无财星泄秀。",
            "伤官" to "伤官格：月令伤官透干，主才华，性格张扬，有创造力。成格条件：伤官有力、有财星泄秀或印星制伤、身强能担。破格因素：伤官见官、无财印、伤官被克。",
            "比肩" to "比肩格：月令比肩透干，主自立，性格独立，有主见。成格条件：比肩有力、有食伤泄秀、身强能担。破格因素：比劫夺财、无食伤泄秀、身弱不胜。",
            "劫财" to "劫财格：月令劫财透干，主竞争，性格好胜，有冲劲。成格条件：劫财有力、有食伤泄秀、身强能担。破格因素：比劫夺财、无食伤泄秀、身弱不胜。"
        )
    }
}
