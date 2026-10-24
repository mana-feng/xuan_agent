package com.xuan.core

/** Native structural port of src/libs/utils/bazi-enhanced.ts (repository AGPL-3.0).
 * Matches the frontend pillar shensha and relation rules, without strength or fortune inference.
 */
object BaziDetails {
    data class RelationEdge(val from:Int,val to:Int,val type:String,val label:String) {
        fun signature() = "$from:$to:$type:$label"
    }
    private val names = listOf("年柱","月柱","日柱","时柱")
    private val ganHe = linkedMapOf("甲己" to "土","乙庚" to "金","丙辛" to "水","丁壬" to "木","戊癸" to "火")
    private val ganChong = listOf("甲庚","乙辛","丙壬","丁癸")
    private val zhiHe = listOf("子丑","寅亥","卯戌","辰酉","巳申","午未")
    private val sanHe = linkedMapOf("申子辰" to "水","寅午戌" to "火","巳酉丑" to "金","亥卯未" to "木")
    private val sanHui = linkedMapOf("寅卯辰" to "木","巳午未" to "火","申酉戌" to "金","亥子丑" to "水")
    private val zhiChong = listOf("子午","丑未","寅申","卯酉","辰戌","巳亥")
    private val xingPairs = listOf("子卯","寅巳","寅申","巳申","丑未","丑戌","未戌")
    private val hai = listOf("子未","丑午","寅巳","卯辰","申亥","酉戌")
    private val po = listOf("子酉","寅亥","卯午","辰丑","巳申","未戌")
    private val anHe = linkedMapOf("寅午" to "暗合土","子巳" to "暗合火","巳酉" to "暗合水","卯申" to "暗合金","亥午" to "暗合木")
    private val nayinElements = "金火木土金火水土金木水土火木水金火木土金火水土金木水土火木水"
    private fun containsPair(pattern:String,a:Char,b:Char) = a != b && a in pattern && b in pattern
    private fun hasPair(patterns:List<String>,a:Char,b:Char) = patterns.any { containsPair(it,a,b) }
    private fun isXing(a:Char,b:Char) = (a==b && a in "辰午酉亥") || hasPair(xingPairs,a,b)
    private fun combination(groups:Map<String,String>,branches:List<Char>,word:String):String? =
        groups.entries.firstOrNull { it.key.toSet()==branches.toSet() && branches.size==3 }?.let { "${it.key}$word${it.value}" }
    private fun ganCombination(a:Char,b:Char):String? = ganHe.entries.firstOrNull { containsPair(it.key,a,b) }?.let { "${it.key}合化${it.value}" }
    private fun validated(pillars:Pillars):List<String> = pillars.list().also { list -> list.forEach { GanZhi.index(it) } }
    private fun plainRelation(value:String) = value.replace("合化", "合")

    fun sections(input:ChartInput,pillars:Pillars):List<ChartSection> {
        val values = validated(pillars)
        val stars = shensha(pillars,input.gender)
        val relationNames = linkedMapOf("sanHe" to "地支三合","sanXing" to "地支相刑","sanHui" to "地支三会",
            "ganHe" to "天干五合","ganChong" to "天干相冲","zhiHe" to "地支六合","chong" to "地支六冲","hai" to "地支相害","zhiPo" to "地支相破")
        val relationRows = relations(pillars).map { (key,items) -> relationNames.getValue(key) to items.joinToString("、") { plainRelation(it) }.ifEmpty { "未命中" } }
        val diagram = diagram(pillars)
        val byPair = linkedMapOf<Pair<Int,Int>,MutableList<String>>()
        (diagram.first.map { "天干" to it } + diagram.second.map { "地支" to it }).forEach { (kind,edge) ->
            byPair.getOrPut(edge.from to edge.to) { mutableListOf() }.add(kind + plainRelation(edge.label))
        }
        return listOf(
            ChartSection("四柱神煞",values.mapIndexed { i,gz -> "${names[i]} · $gz" to stars[i].joinToString("、").ifEmpty { "无" } }),
            ChartSection("干支关系",relationRows + ("关系说明" to "五合、三合、三会等仅记录组合，不据此判断成化、日主强弱或吉凶")),
            ChartSection("柱位对应关系",byPair.map { (pair,items) -> "${names[pair.first]}—${names[pair.second]}" to items.distinct().joinToString(" / ") }
                .ifEmpty { listOf("当前四柱" to "未命中所列柱位关系") })
        )
    }

    internal fun shensha(pillars:Pillars,gender:Int):List<List<String>> {
        require(gender in 0..1) { "性别参数无效" }
        val values=validated(pillars)
        val yearGan=values[0][0]; val yearZhi=values[0][1]; val monthZhi=values[1][1]
        val dayGan=values[2][0]; val dayZhi=values[2][1]; val timeZhi=values[3][1]
        val dayIndex=GanZhi.GAN.indexOf(dayGan); val yearIndex=GanZhi.GAN.indexOf(yearGan)
        val yearBranch=GanZhi.ZHI.indexOf(yearZhi); val monthBranch=GanZhi.ZHI.indexOf(monthZhi); val dayBranch=GanZhi.ZHI.indexOf(dayZhi)
        val tianyi=listOf("丑未","子申","亥酉","亥酉","丑未","子申","寅午","寅午","卯巳","卯巳")
        val taiji=listOf("子午","子午","卯酉","卯酉","辰戌丑未","辰戌丑未","寅亥","寅亥","巳申","巳申")
        val fuxing=listOf("寅子","卯丑","寅子","亥","申","未","午","巳","辰","卯丑")
        val ciguan=listOf("庚寅","辛卯","乙巳","戊午","丁巳","庚午","壬申","癸酉","癸亥","壬戌")
        val dayTags=linkedMapOf(
            "十恶大败" to listOf("壬申","庚辰","辛巳","丁亥","己丑","丙申","戊戌","甲辰","乙巳","癸亥"),
            "十灵日" to listOf("乙亥","癸未","庚寅","丁酉","壬寅","甲辰","庚戌","辛亥","丙辰","戊午"),
            "九丑日" to listOf("己卯","壬午","戊子","辛卯","丁酉","己酉","壬子","戊午","辛酉"),
            "六秀日" to listOf("戊子","己丑","丙午","丁未","戊午","己未"),
            "八专日" to listOf("戊戌","丁未","癸丑","甲寅","乙卯","己未","庚申","辛酉"),
            "孤鸾煞" to listOf("丁巳","乙巳","丙午","戊申","辛亥","壬子","甲寅","戊午")
        )
        val tiande="巳庚丁申壬辛亥甲癸寅丙乙"[monthBranch]
        fun net(source:Char,target:Char) = when (source) { '辰' -> target=='巳';'巳' -> target=='辰';'戌' -> target=='亥';'亥' -> target=='戌';else -> false }
        return values.mapIndexed { index,gz ->
            val gan=gz[0]; val zhi=gz[1]; val branch=GanZhi.ZHI.indexOf(zhi)
            val result=linkedSetOf<String>()
            fun hit(name:String,target:Char=zhi) { result.add("$name($target)") }
            fun stemMap(name:String,map:String,includeYear:Boolean=false) {
                if (map[dayIndex]==zhi) hit(name)
                if (includeYear && map[yearIndex]==zhi) hit(name)
            }
            fun yearDay(name:String,map:String) {
                if (map[yearBranch%map.length]==zhi && index!=0) hit(name)
                if (map[dayBranch%map.length]==zhi && index!=2) hit(name)
            }
            if (zhi in tianyi[dayIndex]) hit("天乙贵人")
            if (zhi in tianyi[yearIndex]) hit("天乙贵人")
            stemMap("文昌","巳午申酉申酉亥子寅卯",true)
            yearDay("桃花","酉午卯子")
            yearDay("驿马","寅亥申巳")
            if (tiande==gan || tiande==zhi) hit("天德贵人",tiande)
            if ("壬庚丙甲壬庚丙甲壬庚丙甲"[monthBranch]==gan) hit("月德贵人",gan)
            if (zhi in taiji[dayIndex]) hit("太极贵人")
            if (zhi in taiji[yearIndex]) hit("太极贵人")
            if (zhi in fuxing[dayIndex]) hit("福星贵人")
            if (zhi in fuxing[yearIndex]) hit("福星贵人")
            stemMap("国印贵人","戌亥丑寅丑寅辰巳未申")
            val yearElement=nayinElements[GanZhi.index(values[0])/2]
            val school=when (yearElement) { '金' -> '巳';'木' -> '亥';'水','土' -> '申';else -> '寅' }
            if (zhi==school) hit("学堂")
            if (gz==ciguan[dayIndex] && "木火土金水"[dayIndex/2]==nayinElements[GanZhi.index(gz)/2]) result.add("词馆($gz)")
            stemMap("金舆","辰巳未申未申戌亥丑寅",true)
            stemMap("禄神","寅卯巳午巳午申酉亥子")
            stemMap("羊刃","卯寅午巳午巳酉申子亥")
            if ("卯寅丑子亥戌酉申未午巳辰"[yearBranch]==zhi) hit("红鸾")
            if ("酉申未午巳辰卯寅丑子亥戌"[yearBranch]==zhi) hit("天喜")
            yearDay("华盖","辰丑戌未")
            yearDay("将星","子酉午卯")
            if (gz in listOf("庚戌","庚辰","戊戌","壬辰")) result.add("魁罡($gz)")
            if (branch==GanZhi.mod(monthBranch-1,12)) hit("天医")
            if (tiande in GanZhi.GAN && "甲乙壬己丁丙甲己戊丁辛庚"[monthBranch]==gan) hit("天德合",gan)
            if ("丁乙辛己丁乙辛己丁乙辛己"[monthBranch]==gan) hit("月德合",gan)
            if ("寅寅巳巳巳申申申亥亥亥寅"[yearBranch]==zhi) hit("孤辰")
            if ("戌戌丑丑丑辰辰辰未未未戌"[yearBranch]==zhi) hit("寡宿")
            if (net(yearZhi,zhi)) hit(if (yearZhi in "辰巳") "地网" else "天罗")
            if (net(dayZhi,zhi)) hit(if (dayZhi in "辰巳") "地网" else "天罗")
            // The frontend combines 勾/绞 into one name, so the two ±3 targets are equivalent for both genders.
            if (branch==GanZhi.mod(yearBranch+3,12) || branch==GanZhi.mod(yearBranch-3,12)) hit("勾绞煞")
            if (branch==GanZhi.mod(yearBranch-3,12)) hit("披麻")
            if (branch==GanZhi.mod(yearBranch-2,12)) hit("吊客")
            if (branch==GanZhi.mod(yearBranch+2,12)) hit("丧门")
            if ("午子丑未寅申卯酉辰戌巳亥"[monthBranch]==zhi) hit("血刃")
            if (index==2) dayTags.forEach { (name,matches) -> if (gz in matches) hit(name) }
            if (values[2] in listOf("乙丑","己巳","癸酉") && timeZhi in "巳午未") hit("金神",timeZhi)
            stemMap("天厨贵人","巳午巳午申酉亥子寅卯",true)
            if (branch==GanZhi.mod(yearBranch+if(gender==0) 7 else 5,12)) hit("元辰")
            if (index!=0 && "午卯子酉"[yearBranch%4]==zhi) hit("灾煞")
            yearDay("劫煞","巳寅亥申")
            if (index!=0 && "亥申巳寅"[yearBranch%4]==zhi) hit("亡神")
            if (net(yearZhi,zhi) || net(dayZhi,zhi)) hit("天罗地网")
            result.sortedByDescending { it.length }
        }
    }

    internal fun relations(pillars:Pillars):Map<String,List<String>> {
        val values=validated(pillars); val gans=values.map { it[0] }; val branches=values.map { it[1] }
        val result=linkedMapOf<String,LinkedHashSet<String>>()
        listOf("sanHe","sanXing","sanHui","ganHe","ganChong","zhiHe","chong","hai","zhiPo").forEach { result[it]=linkedSetOf() }
        fun push(key:String,value:String?) { if(value!=null) result.getValue(key).add(value) }
        for (i in 0..1) for (j in i+1..2) for (k in j+1..3) {
            push("sanHe",combination(sanHe,listOf(branches[i],branches[j],branches[k]),"合"))
            push("sanHui",combination(sanHui,listOf(branches[i],branches[j],branches[k]),"会"))
        }
        val fullXing=listOf("寅巳申","丑未戌").filter { group -> group.all { it in branches } }
        fullXing.forEach { push("sanXing","${it}刑") }
        for (i in 0..3) for (j in i+1..3) {
            val a=branches[i]; val b=branches[j]
            if (fullXing.none { a in it && b in it } && isXing(a,b)) push("sanXing","$a${b}刑")
            push("ganHe",ganCombination(gans[i],gans[j]))
            if (hasPair(ganChong,gans[i],gans[j])) push("ganChong","${gans[i]}${gans[j]}冲")
            if (hasPair(zhiHe,a,b)) push("zhiHe","$a${b}合")
            if (hasPair(zhiChong,a,b)) push("chong","$a${b}冲")
            if (hasPair(hai,a,b)) push("hai","$a${b}害")
            if (hasPair(po,a,b)) push("zhiPo","$a${b}破")
        }
        "辰午酉亥".forEach { branch -> if (branches.count { it==branch }>=2) push("sanXing","${branch}自刑") }
        return result.mapValues { it.value.toList() }
    }

    internal fun diagram(pillars:Pillars):Pair<List<RelationEdge>,List<RelationEdge>> {
        val values=validated(pillars); val ganEdges=mutableListOf<RelationEdge>(); val zhiEdges=mutableListOf<RelationEdge>();val seen=mutableSetOf<String>()
        fun add(list:MutableList<RelationEdge>,from:Int,to:Int,type:String,label:String) {
            val edge=RelationEdge(from,to,type,label)
            if(seen.add(edge.signature())) list.add(edge)
        }
        fun ke(a:Int,b:Int)= (a+2)%5==b || (b+2)%5==a
        for (i in 0..3) for (j in i+1..3) {
            val a=values[i][0];val b=values[j][0]
            ganCombination(a,b)?.let { add(ganEdges,i,j,"ganHe",it.substring(2)) }
            if (hasPair(ganChong,a,b)) add(ganEdges,i,j,"ganChong","冲")
            if (ke(GanZhi.GAN.indexOf(a)/2,GanZhi.GAN.indexOf(b)/2)) add(ganEdges,i,j,"ganKe","克")
        }
        for (i in 0..1) for (j in i+1..2) for (k in j+1..3) {
            listOf("sanHe" to combination(sanHe,listOf(values[i][1],values[j][1],values[k][1]),"合"),
                "sanHui" to combination(sanHui,listOf(values[i][1],values[j][1],values[k][1]),"会")).forEach { (type,label) ->
                if (label!=null) { add(zhiEdges,i,j,type,label.substring(3));add(zhiEdges,i,k,type,label.substring(3));add(zhiEdges,j,k,type,label.substring(3)) }
            }
        }
        val zhiElement=listOf(4,2,0,0,2,1,1,2,3,3,2,4)
        val halfHe=linkedMapOf("申子辰" to "水","亥卯未" to "木","寅午戌" to "火","巳酉丑" to "金")
        for (i in 0..3) for (j in i+1..3) {
            val a=values[i][1];val b=values[j][1]
            if (hasPair(zhiHe,a,b)) add(zhiEdges,i,j,"zhiHe","合")
            halfHe.entries.firstOrNull { containsPair(it.key,a,b) }?.let { add(zhiEdges,i,j,"banHe","半合${it.value}") }
            anHe.entries.firstOrNull { containsPair(it.key,a,b) }?.let { add(zhiEdges,i,j,"anHe",it.value) }
            if (hasPair(zhiChong,a,b)) add(zhiEdges,i,j,"chong","冲")
            if (isXing(a,b)) add(zhiEdges,i,j,"xing","刑")
            if (hasPair(hai,a,b)) add(zhiEdges,i,j,"hai","害")
            if (hasPair(po,a,b)) add(zhiEdges,i,j,"po","破")
            if (ke(zhiElement[GanZhi.ZHI.indexOf(a)],zhiElement[GanZhi.ZHI.indexOf(b)])) add(zhiEdges,i,j,"zhiKe","克")
        }
        return ganEdges to zhiEdges
    }
}
