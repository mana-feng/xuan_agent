package com.xuan.core

import org.junit.Assert.*
import org.junit.Test
import kotlin.random.Random

class LiuyaoTest {
    // Detects inverted line order, palace/relative errors and the 3/4 moving-line inversion.
    @Test fun allHexagramsAndAllMovingLinesMatchFrozenFrontend() {
        resource("liuyao-reference.tsv").forEach { row ->
            val (lines, expected) = row.split('\t')
            val chart = LiuyaoEngine().structure(lines.split(',').map(String::toInt), "甲辰")
            assertEquals(lines, expected, chart.signature())
        }
    }
    @Test fun timeCastingHonorsLeapMonthYearAndZiRules() {
        resource("liuyao-casting.tsv").forEach { row ->
            val v = row.split('\t')
            val input = ChartInput(v[0].replace('T',' '), dayDivide=v[1], yearDivide=v[2], leapMonth=v[3])
            assertEquals(row, v[4], LiuyaoEngine().timeCast(input).joinToString(","))
        }
    }
    @Test fun numberAndCoinCastingKeepNativeLineEncoding() {
        val engine = LiuyaoEngine()
        assertEquals(listOf(0,0,0,3,1,1), engine.numberCast(1,8,4))
        assertEquals(listOf(1,1,1,0,0,4), engine.numberCast(8,1,6))
        assertEquals(4, engine.coinLine(listOf(false,false,false)))
        assertEquals(1, engine.coinLine(listOf(true,false,false)))
        assertEquals(0, engine.coinLine(listOf(true,true,false)))
        assertEquals(3, engine.coinLine(listOf(true,true,true)))
        assertTrue(engine.randomCast(Random(12)).all { it in listOf(0,1,3,4) })
    }
    @Test fun invalidLinesAreRejectedAndResultContainsChangedAndHiddenRows() {
        val engine = LiuyaoEngine()
        for (bad in listOf(listOf(0,1), listOf(0,1,2,0,1,1))) {
            try { engine.structure(bad,"甲辰"); fail("invalid lines accepted") } catch (_: IllegalArgumentException) {}
        }
        val result = engine.calculate(ChartInput("2024-02-10 12:30:00"),listOf(3,0,1,0,1,0))
        assertEquals("liuyao",result.type)
        assertTrue(result.sections.any { it.title == "六爻（自上而下）" && it.rows.size == 6 })
        assertTrue(result.metadata.containsKey("爻编码"))
    }
    private fun resource(name:String) = javaClass.classLoader!!.getResourceAsStream(name)!!.bufferedReader().readLines()
}



private fun LiuyaoChart.signature():String = listOf(mark,name,palace,kind,shiYing.joinToString(","),relatives.joinToString(","),ganZhiElements.joinToString(","),
        spirits.joinToString(","),moving.joinToString(","),hidden?.seats?.joinToString(",")?:"",hidden?.relatives?.joinToString(",")?:"",
        hidden?.ganZhiElements?.joinToString(",")?:"",changed?.mark?:"",changed?.name?:"",changed?.palace?:"",changed?.relatives?.joinToString(",")?:"",
        changed?.ganZhiElements?.joinToString(",")?:"").joinToString("|")
