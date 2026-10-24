package com.xuan.core

/** Pure Kotlin Ziwei natal chart, matching the application's iztro 2.5.7 default rules.
 * Palace indices start at 寅; civil 23:00 advances the whole date before all rules.
 * Algorithm adapted from MIT iztro; attribution is bundled in ziwei-LICENSE.txt.
 */
class ZiweiEngine(private val calendar: CalendarEngine = CalendarEngine()) {
    private fun mod(value: Int, base: Int = 12) = Math.floorMod(value, base)
    private fun branch(value: Int) = GanZhi.ZHI[mod(value)]
    private fun palace(branch: Char) = mod(GanZhi.ZHI.indexOf(branch) - 2)
    private fun atBranches(branches: String, index: Int) = palace(branches[index])

    fun calculate(input: ChartInput): ChartResult {
        require(input.gender in 0..1) { "性别必须为男或女" }
        val civil = calendar.civil(input)
        require(civil.year in 1900..2099) { "紫微排盘支持 1900—2099 年" }
        val lateZi = civil.hour == 23
        val date = civil.toLocalDate().plusDays(if (lateZi) 1 else 0)
        val hour = if (lateZi) 0 else (civil.hour + 1) / 2
        val lunar = calendar.lunar(date)
        val month = mod(lunar.month - 1 + if (lunar.isLeap && lunar.day > 15) 1 else 0)
        val day = lunar.day - 1
        // Normal year division is lunar New Year, independent of BaZi's LiChun option.
        val yearStem = mod(lunar.year - 4, 10)
        val yearBranch = mod(lunar.year - 4)
        val soul = mod(month - hour)
        val body = mod(month + hour)
        val tigerStem = mod((yearStem % 5) * 2 + 2, 10)
        val soulStem = mod(tigerStem + soul, 10)
        val soulBranch = mod(soul + 2)
        val elementIndex = mod(soulStem / 2 + 1 + (soulBranch % 6) / 2, 5)
        val classValue = listOf(3, 4, 2, 6, 5)[elementIndex]
        val className = listOf("木三局", "金四局", "水二局", "火六局", "土五局")[elementIndex]
        val forward = input.gender == yearBranch % 2
        val direction = if (forward) 1 else -1
        val metadata = linkedMapOf(
            "soulPalace" to branch(soul + 2).toString(), "bodyPalace" to branch(body + 2).toString(),
            "soul" to ZiweiRules.soulStars[soulBranch], "body" to ZiweiRules.bodyStars[yearBranch],
            "fiveElementsClass" to className, "calculationDate" to date.toString(),
            "timeIndex" to hour.toString(), "lateZiRollover" to lateZi.toString(), "monthIndex" to month.toString(),
            "lunar" to "${lunar.year}-${lunar.month}-${lunar.day}${if (lunar.isLeap) " 闰" else ""}",
            "timeZone" to input.timeZone, "birthCivil" to civil.toString(),
            "rules" to "ziwei-civil-v1 / Kotlin / iztro@2.5.7 parity",
            "yearDivide" to "normal", "dayDivide" to "forward", "algorithm" to "default", "fixLeap" to "true",
            "brightnessTable" to "quan-shu-vol2-you-correction-v1"
        )
        val major = Array(12) { mutableListOf<String>() }
        val minor = Array(12) { mutableListOf<String>() }
        val adjective = Array(12) { mutableListOf<String>() }
        fun add(target: Array<MutableList<String>>, name: String, index: Int, transform: Boolean = false) {
            val idx = mod(index)
            val brightness = if (target === adjective) "" else ZiweiRules.brightness[name]?.get(idx).orEmpty()
            val mutation = if (transform) ZiweiRules.transformations[yearStem].indexOf(name) else -1
            val mutagen = if (mutation >= 0) listOf("禄", "权", "科", "忌")[mutation] else ""
            target[idx].add("$name:$brightness:$mutagen")
        }
        // The smallest nonnegative offset that makes the lunar day divisible by the class.
        val offset = mod(-lunar.day, classValue)
        val ziwei = mod((lunar.day + offset) / classValue - 1 + if (offset % 2 == 0) offset else -offset)
        val tianfu = mod(-ziwei)
        listOf("紫微", "天机", "", "太阳", "武曲", "天同", "", "", "廉贞").forEachIndexed { i, name ->
            if (name.isNotEmpty()) add(major, name, ziwei - i, true)
        }
        listOf("天府", "太阴", "贪狼", "巨门", "天相", "天梁", "七杀", "", "", "", "破军").forEachIndexed { i, name ->
            if (name.isNotEmpty()) add(major, name, tianfu + i, true)
        }
        val zuo = mod(2 + month)
        val you = mod(8 - month)
        val chang = mod(8 - hour)
        val qu = mod(2 + hour)
        val lu = atBranches("寅卯巳午巳午申酉亥子", yearStem)
        val ma = atBranches("寅亥申巳", yearBranch % 4)
        val huo = atBranches("寅卯丑酉", yearBranch % 4) + hour
        val ling = (if (yearBranch % 4 == 2) palace('卯') else palace('戌')) + hour
        listOf("左辅" to zuo, "右弼" to you, "文昌" to chang, "文曲" to qu).forEach { (name, idx) -> add(minor, name, idx, true) }
        add(minor, "天魁", atBranches("丑子亥亥丑子丑午卯卯", yearStem))
        add(minor, "天钺", atBranches("未申酉酉未申未寅巳巳", yearStem))
        add(minor, "禄存", lu)
        add(minor, "天马", ma)
        add(minor, "地空", 9 - hour)
        add(minor, "地劫", 9 + hour)
        add(minor, "火星", huo)
        add(minor, "铃星", ling)
        add(minor, "擎羊", lu + 1)
        add(minor, "陀罗", lu - 1)
        // Adjective stars retain the original insertion order within each palace.
        val huagai = atBranches("辰丑戌未", yearBranch % 4)
        val xianchi = atBranches("酉午卯子", yearBranch % 4)
        val group = mod(yearBranch - 2) / 3
        val guchen = atBranches("巳申亥寅", group)
        val guasu = atBranches("丑辰未戌", group)
        val hongluan = mod(1 - yearBranch)
        var xunkong = mod(yearBranch - 2 + 10 - yearStem)
        if (yearBranch % 2 != xunkong % 2) xunkong = mod(xunkong + 1)
        val adjectives = listOf(
            "红鸾" to hongluan, "天喜" to hongluan + 6,
            "天姚" to palace('丑') + month, "咸池" to xianchi,
            "解神" to atBranches("申戌子寅辰午", month / 2),
            "三台" to zuo + day, "八座" to you - day,
            "恩光" to chang + day - 1, "天贵" to qu + day - 1,
            "龙池" to 2 + yearBranch, "凤阁" to 8 - yearBranch,
            "天才" to soul + yearBranch, "天寿" to body + yearBranch,
            "台辅" to 4 + hour, "封诰" to hour,
            "天巫" to atBranches("巳申寅亥", month % 4), "华盖" to huagai,
            "天官" to atBranches("未辰巳寅卯酉亥酉戌午", yearStem),
            "天福" to atBranches("酉申子亥卯寅午巳午巳", yearStem),
            "天厨" to atBranches("巳午子巳午申寅午酉亥", yearStem),
            "天月" to atBranches("戌巳辰寅未卯亥未寅午戌寅", month),
            "天德" to 7 + yearBranch, "月德" to 3 + yearBranch,
            "天空" to yearBranch - 1, "旬空" to xunkong,
            "截路" to atBranches("申午辰寅子", yearStem % 5),
            "空亡" to atBranches("酉未巳卯丑", yearStem % 5),
            "孤辰" to guchen, "寡宿" to guasu,
            "蜚廉" to atBranches("申酉戌巳午未寅卯辰亥子丑", yearBranch),
            "破碎" to atBranches("巳丑酉", yearBranch % 3),
            "天刑" to 7 + month, "阴煞" to atBranches("寅子戌申午辰", month % 6),
            "天哭" to 4 - yearBranch, "天虚" to 4 + yearBranch,
            "天使" to soul + 7, "天伤" to soul + 5, "年解" to 8 - yearBranch
        )
        adjectives.forEach { (name, index) -> add(adjective, name, index) }
        val changshengNames = listOf("长生", "沐浴", "冠带", "临官", "帝旺", "衰", "病", "死", "墓", "绝", "胎", "养")
        val boshiNames = listOf("博士", "力士", "青龙", "小耗", "将军", "奏书", "飞廉", "喜神", "病符", "大耗", "伏兵", "官府")
        val jiangqianNames = listOf("将星", "攀鞍", "岁驿", "息神", "华盖", "劫煞", "灾煞", "天煞", "指背", "咸池", "月煞", "亡神")
        val suiqianNames = listOf("岁建", "晦气", "丧门", "贯索", "官符", "小耗", "大耗", "龙德", "白虎", "天德", "吊客", "病符")
        val changshengStart = when (classValue) { 2, 5 -> 6; 3 -> 9; 4 -> 3; else -> 0 }
        val jiangqianStart = atBranches("子酉午卯", yearBranch % 4)
        val ageStart = atBranches("戌未辰丑", yearBranch % 4)
        val sections = (0..11).map { idx ->
            val name = ZiweiRules.palaceNames[mod(idx - soul)]
            val stemBranch = "${GanZhi.GAN[mod(tigerStem + idx, 10)]}${branch(idx + 2)}"
            val decadalStart = classValue + mod((idx - soul) * direction) * 10
            val ageOffset = mod((idx - ageStart) * if (input.gender == 0) 1 else -1)
            val ages = (0..9).map { 12 * it + ageOffset + 1 }.joinToString(",")
            val changsheng = changshengNames[mod((idx - changshengStart) * direction)]
            val boshi = boshiNames[mod((idx - lu) * direction)]
            val jiangqian = jiangqianNames[mod(idx - jiangqianStart)]
            val suiqian = suiqianNames[mod(idx - palace(branch(yearBranch)))]
            val key = "palace.$idx."
            metadata.putAll(mapOf(
                key + "name" to name, key + "stemBranch" to stemBranch,
                key + "isBody" to (idx == body).toString(),
                key + "isOriginal" to (idx < 10 && mod(tigerStem + idx, 10) == yearStem).toString(),
                key + "majorStars" to major[idx].joinToString(","), key + "minorStars" to minor[idx].joinToString(","),
                key + "adjectiveStars" to adjective[idx].joinToString(","),
                key + "changsheng" to changsheng, key + "boshi" to boshi, key + "jiangqian" to jiangqian, key + "suiqian" to suiqian,
                key + "decadal" to "$decadalStart,${decadalStart + 9}", key + "ages" to ages
            ))
            fun display(stars: List<String>) = stars.joinToString("、") { star ->
                val parts = star.split(':')
                parts[0] + if (parts[1].isEmpty() && parts[2].isEmpty()) "" else "（${parts[1]}${if (parts[2].isEmpty()) "" else "化${parts[2]}"}）"
            }.ifEmpty { "无" }
            ChartSection("$name $stemBranch${if (idx == body) " · 身宫" else ""}", listOf(
                "主星" to display(major[idx]), "辅星" to display(minor[idx]), "杂曜" to display(adjective[idx]),
                "大限" to "$decadalStart—${decadalStart + 9}岁", "小限" to ages.replace(",", "、"),
                "十二神" to "$changsheng · $boshi · $jiangqian · $suiqian"
            ))
        }
        return ChartResult("ziwei", "紫微斗数 · $className · 命${branch(soul + 2)}身${branch(body + 2)}", sections, metadata)
    }
}
