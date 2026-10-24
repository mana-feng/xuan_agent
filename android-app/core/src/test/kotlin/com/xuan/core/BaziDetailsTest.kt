package com.xuan.core

import org.junit.Assert.*
import org.junit.Test

class BaziDetailsTest {
    private data class Fixture(val gender:Int,val pillars:Pillars,val label:String,val expected:Map<String,String>)
    private fun fixtures():List<Fixture> = javaClass.getResourceAsStream("/bazi-details-reference.tsv")!!.bufferedReader().readLines().map { row ->
        val cells=row.split('\t')
        Fixture(cells[0].toInt(),Pillars(cells[1],cells[2],cells[3],cells[4]),cells[5],cells.drop(6).associate { it.substringBefore('=') to it.substringAfter('=') })
    }
    @Test fun everySupportedPillarShenshaMatchesTheFrozenSource() {
        val fixtures=fixtures();assertEquals(1496,fixtures.size)
        fixtures.forEach { fixture ->
            val actual=BaziDetails.shensha(fixture.pillars,fixture.gender)
            assertEquals(4,actual.size)
            actual.forEachIndexed { index, values -> assertEquals("${fixture.pillars} gender${fixture.gender} ${fixture.label} pillar$index",fixture.expected["shensha.$index"],values.joinToString("|")) }
        }
    }
    @Test fun allNineRelationCategoriesMatchTheFrozenSource() {
        fixtures().forEach { fixture ->
            val actual=BaziDetails.relations(fixture.pillars)
            assertEquals(9,actual.size)
            actual.forEach { (key,values) -> assertEquals("${fixture.pillars} $key",fixture.expected["relations.$key"],values.joinToString("|")) }
        }
    }
    @Test fun pairLocationsAndHalfHiddenCombinationsMatchSourceDiagram() {
        fixtures().forEach { fixture ->
            val actual=BaziDetails.diagram(fixture.pillars)
            assertEquals("${fixture.pillars} ganEdges",fixture.expected["ganEdges"],actual.first.joinToString("|") { it.signature() })
            assertEquals("${fixture.pillars} zhiEdges",fixture.expected["zhiEdges"],actual.second.joinToString("|") { it.signature() })
        }
    }
    @Test fun outputHasFourPillarTagsAndClearlyStructuralRelationships() {
        val sections=BaziDetails.sections(ChartInput("2024-01-01 12:00"),Pillars("甲子","己丑","庚午","丁卯"))
        assertEquals(4,sections.first { it.title=="四柱神煞" }.rows.size)
        assertTrue(sections.any { it.title=="干支关系" })
        assertTrue(sections.any { it.title=="柱位对应关系" })
        assertTrue(sections.flatMap { it.rows }.none { it.second.contains("合化土") })
    }
}
