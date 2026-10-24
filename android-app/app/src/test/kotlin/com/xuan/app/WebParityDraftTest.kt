package com.xuan.app
import com.xuan.core.*
import com.google.gson.JsonParser
import org.junit.Assert.*
import org.junit.Test
class WebParityDraftTest {
 @Test fun overlapChoiceKeepsOriginalZoneAndOccurrenceAcrossRoundTrip() {
  val raw=ChartInput("2024-11-03 01:30",timeZone="America/New_York")
  val earlier=FormOptions(overlapChoice="earlier");val later=earlier.copy(overlapChoice="later")
  val a=ChartDraft.resolve(raw,earlier);val b=ChartDraft.resolve(raw,later)
  assertEquals("-04:00",a.timeZone);assertEquals("-05:00",b.timeZone)
  val result=ChartDraft.tag(ChartResult("qimen","盘",emptyList(),emptyMap()),raw,later)
  val restored=ChartDraft.restore(SavedChart("x",1,b,result));assertEquals(raw,restored.first);assertEquals(later,restored.second);assertEquals(b,ChartDraft.resolve(restored.first,restored.second))
  assertTrue(runCatching { ChartDraft.resolve(raw,FormOptions()) }.isFailure)
  assertTrue(runCatching { ChartDraft.resolve(raw.copy(civil="2024-03-10 02:30"),earlier) }.isFailure)
 }
 @Test fun allEightCastingDraftsRoundTripWithoutLosingGeneratedLines() {
  val raw=ChartInput("2024-02-10 13:15",title="具体问题")
  LiuyaoCasting.methods.forEach { method->val options=FormOptions(casting=method,numbers="123|45",manual=listOf(4,1,0,3,1,0),preview=listOf(0,1,3,4,0,1),chars="中国",mainGua="111111",changedGua="000000");val result=ChartDraft.tag(ChartResult("liuyao","卦",emptyList(),emptyMap()),raw,options);assertEquals(options,ChartDraft.restore(SavedChart("a",1,raw,result)).second) }
 }
 @Test fun reopenedConversationShowsItsFrozenContextInsteadOfAnotherPersonsChart() {
  val active=listOf("八字 newer active chart")
  val chat=Conversation("x","old conversation","old saved chart\n\n四柱\n年柱：甲子")
  assertEquals(listOf("old saved chart"),chatContextLabels(chat,active))
  assertEquals(active,chatContextLabels(null,active))
  assertEquals(listOf("八字 甲子 乙丑 丙寅 丁卯","紫微当前命盘"),chatContextLabels(chat.copy(chartText="八字 甲子 乙丑 丙寅 丁卯\n紫微当前命盘"),active))
 }
 @Test fun toonEscapesTextAndUsesSortedPrimitiveTables() {
  val element=JsonParser.parseString("""{"name":"一行\n\"引号\"","rows":[{"z":"木","a":1},{"z":"水","a":2}],"empty":[],"nested":{"值":true}}""")
  val text=ToonCodec.encodeElement(element)
  assertTrue(text.contains("name: \"一行\\n\\\"引号\\\"\""));assertTrue(text.contains("rows[2]{a,z}:\n  1,\"木\"\n  2,\"水\""));assertTrue(text.contains("empty: []"));assertTrue(text.contains("nested:\n  \"值\": true"))
 }
}
