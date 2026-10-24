package com.xuan.core

import org.junit.Assert.*
import org.junit.Test

class ZiweiTest {
    @Test fun matchesFrozenFrontendStructuralFixtures() {
        val engine = ZiweiEngine()
        val rows = javaClass.getResourceAsStream("/ziwei-reference.tsv")!!.bufferedReader().readLines()
        assertEquals(156, rows.size)
        rows.forEach { row ->
            val parts = row.split('\t')
            val result = engine.calculate(ChartInput(parts[0].replace('T', ' ').take(16), gender = parts[1].toInt()))
            assertEquals(12, result.sections.size)
            parts.drop(2).forEach { cell ->
                val key = cell.substringBefore('=')
                assertEquals("${parts[0]} gender=${parts[1]} $key", cell.substringAfter('='), result.metadata[key])
            }
        }
    }
    @Test fun earliestSupportedCivilDateUsesThePreviousLunarYear() {
        val result = ZiweiEngine().calculate(ChartInput("1900-01-01 00:30"))
        assertEquals("丑", result.metadata["soulPalace"])
        assertEquals("水二局", result.metadata["fiveElementsClass"])
        assertEquals("1899-12-1", result.metadata["lunar"])
    }
    @Test fun natalStarCountsAreConserved() {
        val result = ZiweiEngine().calculate(ChartInput("1990-06-15 10:30"))
        fun count(kind: String) = (0..11).sumOf { i -> result.metadata["palace.$i.$kind"]!!.split(',').count { it.isNotEmpty() } }
        assertEquals(14, count("majorStars"))
        assertEquals(14, count("minorStars"))
        assertEquals(38, count("adjectiveStars"))
    }
    @Test fun ziweiRulesDoNotInheritTheBaziDayAndYearOptions() {
        val input = ChartInput("2024-02-09 23:30")
        assertEquals(ZiweiEngine().calculate(input).sections,
            ZiweiEngine().calculate(input.copy(dayDivide = "zi", yearDivide = "lunar")).sections)
    }
    @Test fun lateZiAdvancesTheWholeDateIncludingLunarNewYear() {
        val engine = ZiweiEngine()
        val late = engine.calculate(ChartInput("2024-02-09 23:00"))
        val next = engine.calculate(ChartInput("2024-02-10 00:00"))
        assertEquals("2024-02-10", late.metadata["calculationDate"])
        assertEquals(late.sections, next.sections)
    }
    @Test fun leapMonthMidpointUsesNextMonthAfterDayFifteen() {
        val engine = ZiweiEngine()
        val before = engine.calculate(ChartInput("2023-04-05 22:59"))
        val after = engine.calculate(ChartInput("2023-04-06 00:00"))
        assertEquals("1", before.metadata["monthIndex"])
        assertEquals("2", after.metadata["monthIndex"])
    }
}
