package com.xuan.core
import org.junit.Assert.*
import org.junit.Test
import java.time.LocalDateTime
class ZiweiHoroscopeTest {
    @Test fun matchesFrontendFlowScopesAcrossLeapAndNewYearBoundaries() {
        val engine = ZiweiHoroscope()
        val rows=javaClass.getResourceAsStream("/ziwei-flow-reference.tsv")!!.bufferedReader().readLines()
        assertTrue(rows.size > 20)
        rows.forEach { row ->
            val p=row.split('\t'); val natal=ZiweiEngine().calculate(ChartInput(p[0],gender=p[1].toInt()))
            val flow=engine.calculate(natal, LocalDateTime.parse(p[2].replace(' ','T')))!!
            assertEquals(row,p[3].toInt(),flow.nominalAge)
            p.drop(4).forEach { field ->
                val fieldKey=field.substringBefore('='); val scope=flow.scopes.getValue(fieldKey.substringBefore('.'))
                val actual=when { fieldKey.endsWith(".deities") -> (0..11).joinToString("|") { engine.yearlyDeities(it,scope.stemBranch[1]).let { pair -> pair.first+","+pair.second } };fieldKey.endsWith(".mutagens") -> scope.transformations.joinToString(",");fieldKey.endsWith(".stars") -> scope.stars.joinToString("|") { it.joinToString(",") };else -> "${scope.index},${scope.stemBranch}" };assertEquals(row+" "+field,field.substringAfter('='),actual)
            }
        }
    }
    @Test fun lunarTimelineIncludesRealLeapMonthAndAgeChangesAtNewYear() {
        val engine=ZiweiHoroscope();val natal=ZiweiEngine().calculate(ChartInput("1990-06-15 10:30"))
        assertEquals(13,engine.months(2023).size)
        assertEquals("2024-02-10",engine.dateForAge(natal,35).toString())
        assertEquals(34,engine.calculate(natal,LocalDateTime.parse("2024-02-09T22:59"))!!.nominalAge)
        assertEquals(35,engine.calculate(natal,LocalDateTime.parse("2024-02-09T23:00"))!!.nominalAge)
        assertEquals(null,engine.calculate(natal,LocalDateTime.parse("1989-01-01T00:00")))
        assertEquals(listOf(11,3,5,7),engine.related(11))
    }
}
