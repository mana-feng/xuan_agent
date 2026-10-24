package com.xuan.core
import org.junit.Assert.*
import org.junit.Test
class LiuyaoCastingTest {
 @Test fun numericMethodsMatchFrontendSplittingAndModulusRules() {
  val engine=LiuyaoEngine()
  assertEquals(engine.numberCast(4,1,3),LiuyaoCasting.numbers("12345"))
  assertEquals(engine.numberCast(7,7,2),LiuyaoCasting.numbers("7"))
  assertEquals(engine.numberCast(8,8,6),LiuyaoCasting.numbers("00","000"))
  assertEquals(engine.numberCast(3,5,6),LiuyaoCasting.numbers("123","45"))
 }
 @Test fun strokesAndGuaNamesProduceActualSixLines() {
  assertEquals(LiuyaoEngine().numberCast(4,8,6),LiuyaoCasting.characters("中国"))
  assertEquals(listOf(3,3,3,3,3,3),LiuyaoCasting.gua("111111","000000"))
  assertEquals(listOf(1,1,1,1,1,1),LiuyaoCasting.gua("111111"))
  assertEquals(64,LiuyaoCasting.guaNames.size)
  assertTrue(runCatching { LiuyaoCasting.characters("一") }.isFailure)
 }
 @Test fun manualAndPreviewAreDeliberateAndNeverAutofilled() {
  val input=ChartInput("2024-02-10 12:00")
  assertTrue(runCatching { LiuyaoCasting.resolve(input,"手工指定","",List(6){-1},emptyList()) }.isFailure)
  assertTrue(runCatching { LiuyaoCasting.resolve(input,"在线起卦","",emptyList(),listOf(1,0)) }.isFailure)
  assertTrue(runCatching { LiuyaoCasting.resolve(input,"时间起卦","",emptyList(),emptyList()) }.isFailure)
  val lines=listOf(0,1,3,4,0,1)
  assertEquals(lines,LiuyaoCasting.resolve(input,"在线起卦","",emptyList(),lines))
 }
}
