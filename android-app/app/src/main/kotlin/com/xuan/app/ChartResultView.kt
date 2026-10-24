package com.xuan.app

import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.xuan.core.ChartResult
import com.xuan.core.ChartSection

private object ChartInk {
    val Jade = Color(0xFF174F42)
    val Text = Color(0xFF263C35)
    val Muted = Color(0xFF626D63)
    val Ivory = Color(0xFFFFFCF5)
    val Wash = Color(0xFFF0F5EE)
    val Line = Color(0xFFD6E0D5)
    val Cinnabar = Color(0xFF923D31)
    val Gold = Color(0xFF755B26)
}

/** A non-scrolling result body. The host supplies the page's single scrolling container. */
@Composable
fun ChartResultView(result: ChartResult) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Surface(color = ChartInk.Jade, shape = RoundedCornerShape(24.dp)) {
            Column(Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
                Text(when (result.type) { "bazi" -> "四柱 · 八字"; "ziwei" -> "十二宫 · 紫微"; "qimen" -> "九宫 · 奇门"; "liuyao" -> "六爻 · 卦象"; else -> "排盘结果" },
                    color = Color(0xFFDBE9DB), style = MaterialTheme.typography.labelLarge)
                Text(result.title, color = Color.White, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
            }
        }
        when (result.type) {
            "bazi" -> BaziResult(result)
            "ziwei" -> ZiweiResult(result)
            "qimen" -> QimenResult(result)
            "liuyao" -> LiuyaoResult(result)
            else -> result.sections.forEach { DetailCard(it) }
        }
        ResultMetadata(result)
    }
}

@Composable
private fun BaziResult(result: ChartResult) {
    val pillars = result.sections.firstOrNull { it.title == "四柱" }
    pillars?.let {
        val extra = result.sections.firstOrNull { s -> s.title == "十神与藏干" }?.rows?.toMap().orEmpty()
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            ResultCaption("四柱", "日柱天干为日主")
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                it.rows.forEach { (name, value) ->
                    Surface(Modifier.weight(1f), color = if (name == "日柱") ChartInk.Wash else ChartInk.Ivory,
                        shape = RoundedCornerShape(18.dp), border = androidx.compose.foundation.BorderStroke(1.dp, ChartInk.Line)) {
                        Column(Modifier.padding(horizontal = 5.dp, vertical = 16.dp), horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(name, color = ChartInk.Muted, style = MaterialTheme.typography.labelMedium)
                            value.forEach { character -> Text(character.toString(), color = stemBranchColor(character), fontSize = 30.sp, fontWeight = FontWeight.SemiBold) }
                            Text(extra[name]?.substringBefore('·')?.trim().orEmpty(), color = ChartInk.Jade,
                                style = MaterialTheme.typography.labelMedium, textAlign = TextAlign.Center)
                        }
                    }
                }
            }
        }
    }
    result.sections.filter { it !== pillars }.forEach { section ->
        DetailCard(section, initiallyExpanded = section.rows.size <= 16)
    }
}

private fun stemBranchColor(character: Char): Color = when (character) {
    in "甲乙寅卯" -> ChartInk.Jade
    in "丙丁巳午" -> ChartInk.Cinnabar
    in "戊己辰戌丑未" -> ChartInk.Gold
    in "庚辛申酉" -> Color(0xFF55576D)
    else -> Color(0xFF315D76)
}

@Composable
private fun ZiweiResult(result: ChartResult) {
    val soulIndex = (0..11).firstOrNull { result.metadata["palace.$it.name"] == "命宫" } ?: 0
    var selected by remember(result) { mutableStateOf<Int?>(soulIndex) }
    ResultCaption("十二宫总览", "点选宫位查看星曜与运限")
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val gap = 6.dp
        val cellWidth = (maxWidth - gap * 3) / 4
        val scaled = LocalDensity.current.fontScale
        val cellHeight = if (scaled > 1.15f) 126.dp else 110.dp
        val layout = listOf(listOf(3, 4, 5, 6), listOf(2, -1, -1, 7), listOf(1, -1, -1, 8), listOf(0, 11, 10, 9))
        Box {
            Column(verticalArrangement = Arrangement.spacedBy(gap)) {
                layout.forEach { row ->
                    Row(horizontalArrangement = Arrangement.spacedBy(gap)) {
                        row.forEach { index ->
                            if (index < 0) Spacer(Modifier.width(cellWidth).height(cellHeight))
                            else {
                                val prefix = "palace.$index."
                                val section = result.sections.getOrNull(index)
                                val name = result.metadata[prefix + "name"] ?: section?.title.orEmpty()
                                val stem = result.metadata[prefix + "stemBranch"].orEmpty()
                                val major = starNames(result.metadata[prefix + "majorStars"])
                                val mark = listOfNotNull(if (result.metadata[prefix + "isBody"] == "true") "身" else null,
                                    if (result.metadata[prefix + "isOriginal"] == "true") "来因" else null).joinToString("·")
                                Surface(Modifier.width(cellWidth).height(cellHeight).clickable(role = Role.Button) { selected = if (selected == index) null else index }
                                    .semantics { contentDescription = "$name，$stem，主星${major.ifBlank { "空宫" }}，$mark，点按查看详情" },
                                    color = if (selected == index) ChartInk.Jade else ChartInk.Ivory, shape = RoundedCornerShape(13.dp),
                                    border = androidx.compose.foundation.BorderStroke(1.dp, if (selected == index) ChartInk.Jade else ChartInk.Line)) {
                                    val ink = if (selected == index) Color.White else ChartInk.Text
                                    Column(Modifier.padding(horizontal = 5.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                        Text(name, color = ink, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                                        Text(stem, color = ink, fontSize = 15.sp, fontWeight = FontWeight.Medium)
                                        if (scaled <= 1.05f && cellWidth >= 72.dp) Text(major.ifBlank { "空宫" }, color = ink, fontSize = 11.sp, lineHeight = 15.sp)
                                        if (mark.isNotBlank()) Text(mark, color = if (selected == index) Color(0xFFE8DDBA) else ChartInk.Gold, fontSize = 10.sp)
                                    }
                                }
                            }
                        }
                    }
                }
            }
            Column(Modifier.width(cellWidth * 2 + gap).height(cellHeight * 2 + gap).align(Alignment.Center)
                .background(ChartInk.Wash, RoundedCornerShape(20.dp)).padding(12.dp),
                verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
                Text(result.metadata["fiveElementsClass"].orEmpty(), color = ChartInk.Jade, fontWeight = FontWeight.Bold,
                    fontSize = 19.sp, textAlign = TextAlign.Center)
                Spacer(Modifier.height(12.dp))
                Text("命${result.metadata["soulPalace"].orEmpty()} · 身${result.metadata["bodyPalace"].orEmpty()}", color = ChartInk.Text, fontSize = 14.sp)
                Spacer(Modifier.height(7.dp))
                Text("命主 ${result.metadata["soul"].orEmpty()}\n身主 ${result.metadata["body"].orEmpty()}", color = ChartInk.Muted,
                    fontSize = 12.sp, lineHeight = 20.sp, textAlign = TextAlign.Center)
            }
        }
    }
    ResultCaption("宫位详解", "完整星曜、亮度、四化与年龄")
    result.sections.forEachIndexed { index, section ->
        val marker = listOfNotNull(if (result.metadata["palace.$index.isBody"] == "true") "身宫" else null,
            if (result.metadata["palace.$index.isOriginal"] == "true") "来因宫" else null).joinToString(" · ")
        ExpandableCard(section.title, marker.ifBlank { section.rows.firstOrNull()?.second.orEmpty() }, selected == index,
            onToggle = { selected = if (selected == index) null else index }) { DetailRows(section.rows) }
    }
}

private fun starNames(value: String?): String = value.orEmpty().split(',').filter { it.isNotBlank() }.joinToString(" ") { it.substringBefore(':') }

@Composable
private fun QimenResult(result: ChartResult) {
    val board = result.sections.drop(1).associateBy { section -> Regex("([1-9])宫").find(section.title)?.groupValues?.get(1)?.toIntOrNull() }
    var selected by remember(result) { mutableStateOf<Int?>(null) }
    result.sections.firstOrNull()?.let { DetailCard(it) }
    ResultCaption("九宫盘", "上南下北 · 点选宫位查看全盘信息")
    Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
        listOf(listOf(4, 9, 2), listOf(3, 5, 7), listOf(8, 1, 6)).forEach { row ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                row.forEach { index ->
                    val section = board[index]
                    val values = section?.rows?.toMap().orEmpty()
                    val active = selected == index
                    val ink = if (active) Color.White else ChartInk.Text
                    Surface(Modifier.weight(1f).heightIn(min = 160.dp).clickable(role = Role.Button) { selected = if (active) null else index }
                        .semantics { contentDescription = "${section?.title.orEmpty()}，${values.entries.joinToString { "${it.key}${it.value}" }}，点按查看详情" },
                        color = if (active) ChartInk.Jade else ChartInk.Ivory, shape = RoundedCornerShape(16.dp),
                        border = androidx.compose.foundation.BorderStroke(1.dp, if (active) ChartInk.Jade else ChartInk.Line)) {
                        Column(Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text(section?.title ?: "中五宫", color = ink, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                            Text(values["八神"].orEmpty().ifBlank { "中宫" }, color = ink, fontSize = 12.sp)
                            Text(values["九星"].orEmpty().ifBlank { "—" }, color = ink, fontSize = 16.sp, fontWeight = FontWeight.Medium)
                            Text(values["八门"].orEmpty().ifBlank { "—" }, color = ink, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                            Text("天 ${values["天盘"].orEmpty()}  地 ${values["地盘"].orEmpty()}", color = ink, fontSize = 12.sp)
                            val flags = listOfNotNull(if (values["空亡"] == "是") "空亡" else null, if (values["驿马"] == "是") "驿马" else null)
                            if (flags.isNotEmpty()) Text(flags.joinToString(" · "), color = if (active) Color(0xFFE8DDBA) else ChartInk.Cinnabar,
                                fontSize = 11.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }
    }
    ResultCaption("逐宫详解", "天盘、地盘、九星、八门、八神与暗干")
    result.sections.drop(1).forEach { section ->
        val index = Regex("([1-9])宫").find(section.title)?.groupValues?.get(1)?.toIntOrNull()
        ExpandableCard(section.title, section.rows.firstOrNull { it.first == "八门" }?.second.orEmpty(), selected == index,
            onToggle = { selected = if (selected == index) null else index }) { DetailRows(section.rows) }
    }
}

@Composable
private fun LiuyaoResult(result: ChartResult) {
    result.sections.firstOrNull()?.let { DetailCard(it) }
    val lines = result.metadata["原始爻"]?.split(',')?.mapNotNull { it.toIntOrNull() }.orEmpty()
    result.sections.drop(1).forEach { section ->
        if (section.title.startsWith("六爻") && lines.size == 6 && section.rows.size == 6) {
            Surface(color = ChartInk.Ivory, shape = RoundedCornerShape(22.dp), border = androidx.compose.foundation.BorderStroke(1.dp, ChartInk.Line)) {
                Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(15.dp)) {
                    Text("六爻 · 自上而下", color = ChartInk.Jade, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    section.rows.forEachIndexed { index, (label, value) ->
                        val line = lines[5 - index]
                        Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
                            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                Text(label, modifier = Modifier.widthIn(min = 50.dp), color = ChartInk.Jade, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                                HexagramLine(line, Modifier.weight(1f).height(15.dp))
                                Text(if (line == 3 || line == 4) "动" else "静", color = if (line == 3 || line == 4) ChartInk.Cinnabar else ChartInk.Muted, fontSize = 12.sp)
                            }
                            Text(value.replace("━━━━", "").replace("━　━", "").replace("○", "").replace("×", "").trim(),
                                color = ChartInk.Text, style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                }
            }
        } else DetailCard(section)
    }
}

@Composable
private fun HexagramLine(value: Int, modifier: Modifier) {
    val color = if (value == 3 || value == 4) ChartInk.Cinnabar else ChartInk.Jade
    Canvas(modifier.semantics { contentDescription = when (value) { 3 -> "阳爻，动爻"; 4 -> "阴爻，动爻"; 1 -> "阳爻"; else -> "阴爻" } }) {
        val middle = size.height / 2
        val stroke = 6.dp.toPx()
        if (value % 2 == 1) drawLine(color, Offset(0f, middle), Offset(size.width, middle), stroke)
        else {
            drawLine(color, Offset(0f, middle), Offset(size.width * .43f, middle), stroke)
            drawLine(color, Offset(size.width * .57f, middle), Offset(size.width, middle), stroke)
        }
    }
}

@Composable
private fun ResultCaption(title: String, subtitle: String) {
    Column(Modifier.padding(horizontal = 2.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
        Text(title, color = ChartInk.Jade, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        Text(subtitle, color = ChartInk.Muted, style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
private fun DetailCard(section: ChartSection, initiallyExpanded: Boolean = true) {
    var expanded by remember(section) { mutableStateOf(initiallyExpanded) }
    ExpandableCard(section.title, if (!expanded) "${section.rows.size} 项" else "", expanded,
        onToggle = { expanded = !expanded }) { DetailRows(section.rows) }
}

@Composable
private fun ExpandableCard(title: String, summary: String, expanded: Boolean, onToggle: () -> Unit, content: @Composable ColumnScope.() -> Unit) {
    Surface(color = ChartInk.Ivory, shape = RoundedCornerShape(20.dp), border = androidx.compose.foundation.BorderStroke(1.dp, ChartInk.Line)) {
        Column(Modifier.fillMaxWidth().animateContentSize()) {
            Row(Modifier.fillMaxWidth().clickable(role = Role.Button, onClickLabel = if (expanded) "收起详情" else "展开详情", onClick = onToggle)
                .padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(title, color = ChartInk.Jade, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    if (summary.isNotBlank()) Text(summary, color = ChartInk.Muted, style = MaterialTheme.typography.bodySmall)
                }
                Text(if (expanded) "收起 −" else "展开 ＋", color = ChartInk.Jade, style = MaterialTheme.typography.labelMedium)
            }
            if (expanded) Column(Modifier.padding(start = 16.dp, end = 16.dp, bottom = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp), content = content)
        }
    }
}

@Composable
private fun DetailRows(rows: List<Pair<String, String>>) {
    rows.forEachIndexed { index, (key, value) ->
        if (index > 0) HorizontalDivider(color = ChartInk.Line.copy(alpha = .65f))
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(key, color = ChartInk.Muted, style = MaterialTheme.typography.labelMedium)
            Text(value.ifBlank { "—" }, color = ChartInk.Text, style = MaterialTheme.typography.bodyMedium, lineHeight = 23.sp)
        }
    }
}

@Composable
private fun ResultMetadata(result: ChartResult) {
    var expanded by remember(result) { mutableStateOf(false) }
    val names = mapOf("soulPalace" to "命宫", "bodyPalace" to "身宫", "soul" to "命主", "body" to "身主", "fiveElementsClass" to "五行局",
        "calculationDate" to "排盘日期", "timeIndex" to "排盘时辰", "lateZiRollover" to "晚子时换日", "lunar" to "农历", "timeZone" to "输入时区",
        "birthCivil" to "输入时间", "rules" to "排盘规则", "yearDivide" to "年界", "dayDivide" to "换日", "algorithm" to "流派",
        "fixLeap" to "闰月调整", "brightnessTable" to "星曜亮度", "monthIndex" to "排盘月份")
    val rows = result.metadata.filterKeys { !it.startsWith("palace.") && it !in setOf("monthIndex", "来源", "规则版本", "爻编码") }.map { (key, raw) ->
        val value = when (key) {
            "算法" -> raw.substringBefore(" / Kotlin").replace("原生 Kotlin ", "")
            "历法" -> "公农历转换与精确节气"
            "八字规则" -> "民用时间；按所选换日规则排四柱"
            "原始爻" -> raw.split(',').joinToString("、") { when (it) { "0" -> "阴静"; "1" -> "阳静"; "3" -> "阳动"; "4" -> "阴动"; else -> it } } + "（自下而上）"
            "rules" -> "通行本命盘；按民用时间排盘"
            "yearDivide" -> if (raw == "normal") "农历春节" else raw
            "dayDivide" -> if (raw == "forward") "23:00 完整推进至次日" else raw
            "algorithm" -> if (raw == "default") "通行法" else raw
            "fixLeap" -> if (raw == "true") "闰月十六日起按下月" else raw
            "lateZiRollover" -> if (raw == "true") "已按次日排盘" else "未触发"
            "brightnessTable" -> "全书卷二；酉宫日月七杀已校正"
            "timeIndex" -> raw.toIntOrNull()?.let { "${"子丑寅卯辰巳午未申酉戌亥"[Math.floorMod(it, 12)]}时" } ?: raw
            else -> raw
        }
        (names[key] ?: key) to value
    }
    ExpandableCard("排盘信息", "输入时间、历法与采用规则", expanded, onToggle = { expanded = !expanded }) { DetailRows(rows) }
}
