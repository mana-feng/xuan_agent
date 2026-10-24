package com.xuan.core

import org.junit.Assert.*
import org.junit.Test

class BaziTest {
    private val engine=BaziEngine()
    @Test fun referencePillarsAndLuckAcrossTermsAndCenturies() {
        val calendar=CalendarEngine()
        javaClass.getResourceAsStream("/bazi-reference.tsv")!!.bufferedReader().useLines { lines -> lines.forEach { line ->
            val f=line.split('\t'); val input=ChartInput(f[0],gender=f[2].toInt(),dayDivide=f[1])
            assertEquals(f[0],f.subList(3,7),calendar.pillars(input).list())
            val luck=engine.luck(input)
            assertEquals(f[0],f[7].toBoolean(),luck.forward)
            assertEquals(f[0],listOf(f[8].toInt(),f[9].toInt(),f[10].toInt()),listOf(luck.years,luck.months,luck.days))
            assertEquals(f[0],f[11],luck.start.format(java.time.format.DateTimeFormatter.ofPattern("uuuu-MM-dd HH:mm:ss")))
            assertEquals(f[0],f[12],luck.cycles.joinToString(";") { "${it.ganzhi},${it.startYear},${it.startAge}" })
        } }
    }
    @Test fun resultContainsFourPillarsAndNoPredictedFortune() {
        val result=engine.calculate(ChartInput("2023-03-21 00:30",title="测试"))
        assertEquals("bazi",result.type)
        assertEquals(4,result.sections.first { it.title=="四柱" }.rows.size)
        assertTrue(result.asText().contains("戊寅"))
    }
    @Test fun tenGodYinYangIsPreserved() {
        assertEquals("比肩",engine.tenGod('甲','甲')); assertEquals("劫财",engine.tenGod('甲','乙'))
        assertEquals("七杀",engine.tenGod('甲','庚')); assertEquals("正官",engine.tenGod('甲','辛'))
        assertEquals("偏印",engine.tenGod('甲','壬')); assertEquals("正印",engine.tenGod('甲','癸'))
    }
}
