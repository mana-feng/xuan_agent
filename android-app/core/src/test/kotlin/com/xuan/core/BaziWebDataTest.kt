package com.xuan.core
import org.junit.Assert.*
import org.junit.Test
class BaziWebDataTest {
 @Test fun enhancedFieldsAndMovingDiagramMatchIndependentWebReference() {
  val lines=javaClass.getResourceAsStream("/bazi-web-reference.tsv")!!.bufferedReader().readLines()
  assertEquals(144,lines.size)
  lines.forEach { line ->
   val r=line.split('\t');val input=ChartInput(r[0]);val data=BaziWebData(input)
   assertEquals(r[0],r[1],data.structure.type)
   assertEquals(r[0],r[2],data.structure.description)
   assertEquals(r[0],r[3],data.strength.type)
   assertEquals(r[0],r[4],data.strength.description)
   assertEquals(r[0],r[5],data.elements.entries.joinToString("|") { "${it.key}:${it.value}" })
   listOf("甲子","乙丑","丙寅").forEachIndexed { i,gz -> assertEquals(r[0],r[6+i],data.stars(gz).joinToString("|")) }
   val diagram=data.diagram(listOf("甲子","乙丑","丙寅"))
   assertEquals(r[0],r[9],diagram.first.joinToString("|") { it.signature() })
   assertEquals(r[0],r[10],diagram.second.joinToString("|") { it.signature() })
  }
 }
 @Test fun matrixUsesAllNineWebFieldsAndSelectedTimeColumns() {
  val data=BaziWebData(ChartInput("1990-06-15 10:30"))
  val columns=data.columns(listOf("大运" to "甲子","流年" to "甲辰"))
  assertEquals(listOf("年柱","月柱","日柱","时柱","大运","流年"),columns.map { it.title })
  assertEquals(listOf("主星","天干","地支","藏干","副星","星运","空亡","神煞","纳音"),columns.first().fields.keys.toList())
  assertEquals("元男",columns[2].fields["主星"])
  assertEquals("甲木",columns[4].fields["天干"])
  assertEquals("癸水",columns[4].fields["藏干"])
  assertEquals("海中金",columns[4].fields["纳音"])
 }
}
