package com.xuan.app

import com.xuan.core.*
import org.junit.Assert.*
import org.junit.Test

class SharedChartFormTest {
 private val input=ChartInput("2024-02-10 13:15",title="合作推进")
 @Test fun unspecifiedLiuyaoGenderIsStoredExplicitlyInsteadOfBecomingMale() {
  val result=ChartDraft.tag(ChartResult("liuyao","卦",emptyList(),emptyMap()),input,FormOptions())
  assertEquals("false",result.metadata["性别填写"])
 }

 @Test fun genderChoiceAndMissingLegacyMetadataRoundTripIndependently() {
  val options=FormOptions(genderSet=true)
  val result=ChartDraft.tag(ChartResult("liuyao","卦",emptyList(),emptyMap()),input.copy(gender=1),options)
  assertEquals("true",result.metadata["性别填写"])
  assertTrue(ChartDraft.restore(SavedChart("x",1,input,result)).second.genderSet)
  assertTrue(ChartDraft.restore(SavedChart("old",1,input,result.copy(metadata=emptyMap()))).second.genderSet)
  assertFalse(ChartDraft.restore(SavedChart("new",1,input,ChartDraft.tag(result,input,FormOptions()))).second.genderSet)
 }
 @Test fun sixRealLinesAndAQuestionAreRequiredForAllEightCastingMethods() {
  LiuyaoCasting.methods.forEach { method ->
   val options=FormOptions(casting=method,manual=List(6){-1},preview=listOf(0,1,3,4,0))
   assertFalse(method,ChartDraft.canSubmit("liuyao",input,options))
   val ready=options.copy(manual=listOf(0,1,3,4,0,1),preview=listOf(0,1,3,4,0,1))
   assertTrue(method,ChartDraft.canSubmit("liuyao",input,ready))
   assertFalse(method,ChartDraft.canSubmit("liuyao",input.copy(title="  "),ready))
   assertFalse(method,ChartDraft.canSubmit("liuyao",input,ready.copy(manual=listOf(0,1,3,4,0,-1),preview=listOf(0,1,3,4,0,-1))))
  }
 }
 @Test fun invalidGregorianDaysTimesAndNonexistentLunarLeapMonthsCannotBeConfirmed() {
  listOf("2024-02-31 10:30","2023-02-29 10:30","2024-01-01 24:00","2024-01-01 12:60","1899-12-31 10:00","2100-01-01 10:00").forEach { civil ->
   assertTrue(civil,ChartDraft.dateEditorError(input.copy(civil=civil),FormOptions()).isNotEmpty())
   assertFalse(ChartDraft.canSubmit("bazi",input.copy(civil=civil),FormOptions()))
  }
  assertEquals("",ChartDraft.dateEditorError(input.copy(civil="2024-02-29 23:59"),FormOptions()))
  assertTrue(ChartDraft.dateEditorError(input.copy(civil="2024-02-01 10:30"),FormOptions(lunarInput=true,leap=true)).isNotEmpty())
  assertEquals("",ChartDraft.dateEditorError(input.copy(civil="2023-02-16 10:30"),FormOptions(lunarInput=true,leap=true)))
 }
 @Test fun qimenNowKeepsSecondsAndCustomEditDoesNotAdvance() {
  val now=java.time.Instant.parse("2026-10-25T02:30:47Z")
  val options=FormOptions(useNow=true)
  assertEquals("2026-10-25 10:30:47",ChartDraft.calculationTime("qimen",input,options,now).civil)
  assertEquals(input,ChartDraft.calculationTime("qimen",input,options.copy(useNow=false),now))
  assertEquals(input,ChartDraft.calculationTime("bazi",input,options,now))
  val restored=ChartDraft.restoredNow("qimen",input.copy(timeZone="UTC"),FormOptions(overlapChoice="later"),now)
  assertEquals("Asia/Shanghai",restored.first.timeZone)
  assertEquals("2026-10-25 10:30:47",restored.first.civil)
  assertTrue(restored.second.useNow);assertEquals("reject",restored.second.overlapChoice)
 }
}