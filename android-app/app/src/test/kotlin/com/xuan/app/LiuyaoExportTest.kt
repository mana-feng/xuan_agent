package com.xuan.app

import com.xuan.core.*
import org.junit.Assert.*
import org.junit.Test

class LiuyaoExportTest {
 private fun record(metadata:Map<String,String> = emptyMap()):SavedChart {
  val input=ChartInput("2026-10-25 10:30",title="合作推进",gender=1)
  val result=LiuyaoEngine().calculate(input,listOf(3,0,4,1,0,1))
  return SavedChart("liu-copy",1,input,result.copy(metadata=result.metadata+mapOf("起卦方式" to "手工指定")+metadata))
 }
 private fun copyText(record:SavedChart)=LiuyaoExport.text(record)
 @Test fun copyRetainsBothDiagramsAndRolesWithSixRawStates() {
  val text=copyText(record())
  assertTrue("copy needs changed-line glyph and role columns",text.contains("变卦爻象 | 变卦世应"))
  assertTrue(text.contains("原始参数（初爻→上爻）：3,0,4,1,0,1"))
  val rows=text.lineSequence().filter { it.startsWith("上爻 |") || it.startsWith("初爻 |") }.toList()
  assertEquals(2,rows.size)
  assertTrue(rows.all { it.split(" | ").size==10 })
  val allRows=text.lineSequence().filter { it.contains(" | ") && !it.startsWith("爻位") }.map {it.split(" | ")}.toList()
  assertEquals(6,allRows.size)
  assertEquals(setOf("世","应"),allRows.map {it[6]}.filter {it!="—"}.toSet())
  assertEquals(setOf("世","应"),allRows.map {it[9]}.filter {it!="—"}.toSet())
  val first=allRows.single {it[0]=="初爻"}
  assertEquals("━━━━",first[4]);assertEquals("○",first[5]);assertEquals("━　━",first[8])
  assertTrue(text.contains("五行："))
 }
 @Test fun copyDistinguishesOptionalGenderAndKeepsLegacyMeaning() {
  assertTrue(copyText(record(mapOf("性别填写" to "false"))).contains("性别：未填写"))
  assertTrue(copyText(record(mapOf("性别填写" to "true"))).contains("性别：女"))
  assertTrue(copyText(record()).contains("性别：女"))
 }
 @Test fun copyUsesOriginalZoneAndRulesForAmbiguousTimes() {
  val text=copyText(record(mapOf("原始时区" to "America/New_York","原始输入" to "2026-11-01 01:30","重复时刻选择" to "later")))
  assertTrue(text.contains("2026-11-01 01:30 · America/New_York"))
  assertTrue(text.contains("较晚的一次"));assertTrue(text.contains("00:00 换日"))
 }
}
