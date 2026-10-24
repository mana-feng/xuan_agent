package com.xuan.app

import com.xuan.core.*
import org.junit.Assert.*
import org.junit.Test
import java.time.LocalDateTime

class ZiweiExportTest {
    private fun record(): SavedChart {
        val input = ChartInput("1970-06-15 12:30", gender=0, title="历史流月核对", timeZone="Asia/Shanghai")
        return SavedChart("ziwei-export", 1, input, ZiweiEngine().calculate(input))
    }
    @Test fun historicalSelectionExportsActualSixScopesAndPhysicalFocus() {
        val record=record()
        val view=ZiweiViewState(record.id,"2023-04-06T23:15","monthly",5)
        val payload=ZiweiExport.payload(record,view)
        val chart=payload.getAsJsonObject("newSchoolChart")
        assertNotNull("Visible Ziwei flow must be exported",chart)
        val selection=chart.getAsJsonObject("selection")
        assertEquals("monthly",selection["viewMode"].asString)
        assertEquals("2023-04-07",selection["calculationDate"].asString)
        assertTrue(selection["lateZiRollover"].asBoolean)
        val flow=ZiweiHoroscope().calculate(record.result,LocalDateTime.parse(view.target))!!
        val scopes=chart.getAsJsonObject("scopes")
        assertEquals(setOf("decadal","age","yearly","monthly","daily","hourly"),scopes.keySet())
        flow.scopes.forEach { (key,scope) ->
            val actual=scopes.getAsJsonObject(key)
            assertEquals(scope.index,actual["index"].asInt)
            assertEquals(scope.stemBranch[0].toString(),actual["heavenlyStem"].asString)
            assertEquals(scope.stemBranch[1].toString(),actual["earthlyBranch"].asString)
        }
        val focus=chart.getAsJsonObject("focus")
        assertEquals(5,focus.getAsJsonObject("palace")["index"].asInt)
        assertEquals(record.result.metadata["palace.5.name"],focus.getAsJsonObject("palace")["name"].asString)
        assertEquals(setOf(5,9,11,1),listOf("target","opposite","wealth","career").map { focus.getAsJsonObject("surrounded").getAsJsonObject("natal").getAsJsonObject(it)["index"].asInt }.toSet())
        assertTrue(focus.getAsJsonArray("flyMutagens").size()>0)
        assertEquals(12,chart.getAsJsonArray("allDecadalCharts").size())
        assertTrue(chart.getAsJsonObject("yearlyRangeCharts").getAsJsonArray("charts").size()>0)
    }
    @Test fun matchesMobileWebScopeTimelineHistoricalAndFocusFixture() {
        val record=record()
        val actual=ZiweiExport.payload(record,ZiweiViewState(record.id,"2023-04-06T23:15","monthly",5)).getAsJsonObject("newSchoolChart")
        val fixture=javaClass.getResourceAsStream("/ziwei-export-web-reference.json")!!.bufferedReader().use { com.google.gson.JsonParser.parseReader(it).asJsonObject }
        // Web uses unpadded civil dates; native deliberately keeps ISO dates. The
        // target ISO instant depends on the host zone and is covered separately.
        listOf("timeline","scopes","compactFieldMap","allDecadalCharts","yearlyRangeCharts","focus").forEach { key -> assertEquals(key,fixture[key],actual[key]) }
        assertEquals(fixture.getAsJsonObject("selection")["currentScopeLabel"],actual.getAsJsonObject("selection")["currentScopeLabel"])
    }
    @Test fun immutableSnapshotChangesWithSelectedCivilDateAndDoesNotUseBirthDate() {
        val record=record()
        val first=ZiweiExport.payload(record,ZiweiViewState(record.id,"2023-04-06T08:30","daily",2))
        val before=first.toString()
        val second=ZiweiExport.payload(record,ZiweiViewState(record.id,"2024-02-10T08:30","yearly",8))
        assertEquals(before,first.toString())
        assertNotEquals(first.getAsJsonObject("newSchoolChart"),second.getAsJsonObject("newSchoolChart"))
        assertEquals("2023-04-06",first.getAsJsonObject("newSchoolChart").getAsJsonObject("selection")["calculationDate"].asString)
        assertEquals(2,first.getAsJsonObject("newSchoolChart").getAsJsonObject("focus").getAsJsonObject("palace")["index"].asInt)
    }
    @Test fun childhoodScopeIsLabeledAsChildhoodRatherThanAdultDecadal() {
        val record=record()
        val scopes=ZiweiExport.payload(record,ZiweiViewState(record.id,"1971-06-15T08:30","decadal",-1)).getAsJsonObject("newSchoolChart").getAsJsonObject("scopes")
        assertEquals("童限",scopes.getAsJsonObject("decadal")["name"].asString)
        assertEquals(2,scopes.getAsJsonObject("age")["nominalAge"].asInt)
    }
    @Test fun originHasNoExplicitFocusAndRejectsAnotherRecordsView() {
        val record=record()
        val chart=ZiweiExport.payload(record,ZiweiViewState(record.id,"2023-04-06T00:00","origin",-1)).getAsJsonObject("newSchoolChart")
        assertTrue(chart["focus"].isJsonNull)
        assertTrue(chart.getAsJsonObject("selection")["currentScopeLabel"].isJsonNull)
        assertThrows(IllegalArgumentException::class.java) { ZiweiExport.payload(record,ZiweiViewState("another","2023-04-06T00:00","monthly",0)) }
    }
}
