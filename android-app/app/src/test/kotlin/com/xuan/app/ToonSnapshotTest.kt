package com.xuan.app

import com.google.gson.JsonParser
import com.xuan.core.*
import org.junit.Assert.*
import org.junit.Test

class ToonSnapshotTest {
    private fun record():SavedChart {
        val input=ChartInput("1970-06-15 12:30",gender=0,title="导出快照",timeZone="Asia/Shanghai")
        return SavedChart("frozen-record",1,input,ZiweiEngine().calculate(input))
    }
    @Test fun extraZiweiSelectionIsIncludedInToonWithoutLosingRecordIdentity() {
        val r=record();val extra=ZiweiExport.payload(r,ZiweiViewState(r.id,"2023-04-06T08:30","monthly",5))
        val snapshot=ToonCodec.snapshot(r,extra)
        assertNotNull(snapshot.getAsJsonObject("newSchoolChart"))
        assertEquals(r.id,snapshot["id"].asString)
        assertEquals(r.input.title,snapshot.getAsJsonObject("input")["title"].asString)
        val text=ToonCodec.encode(r,extra)
        assertTrue(text.contains("newSchoolChart:"));assertTrue(text.contains("viewMode: \"monthly\""))
    }
    @Test fun capturedPayloadSurvivesLaterUiChangesAndMutableMetadataChanges() {
        val r=record();val metadata=r.result.metadata.toMutableMap()
        val record=r.copy(result=r.result.copy(metadata=metadata))
        val extra=ZiweiExport.payload(record,ZiweiViewState(record.id,"2023-04-06T08:30","monthly",5))
        val frozen=ToonCodec.snapshot(record,extra)
        val before=ToonCodec.encodeElement(frozen)
        extra.getAsJsonObject("newSchoolChart").getAsJsonObject("selection").addProperty("viewMode","yearly")
        metadata["palace.5.name"]="changed after picker opened"
        assertEquals(before,ToonCodec.encodeElement(frozen))
        assertEquals("monthly",frozen.getAsJsonObject("newSchoolChart").getAsJsonObject("selection")["viewMode"].asString)
        val restored=JsonParser.parseString(frozen.toString()).asJsonObject
        assertEquals(before,ToonCodec.encodeElement(restored))
    }
    @Test fun legacyExportsKeepTheirExistingShapeWhenNoExtraIsSupplied() {
        val r=record();val snapshot=ToonCodec.snapshot(r)
        assertEquals(setOf("id","createdAt","input","result"),snapshot.keySet())
        assertEquals(ToonCodec.encodeElement(snapshot),ToonCodec.encode(r))
    }
}
