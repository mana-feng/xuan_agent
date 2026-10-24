package com.xuan.core

/** Same eight casting methods and stroke dictionary as the mobile frontend. */
object LiuyaoCasting {
 val methods=listOf("电脑自动","在线起卦","手工指定","时间起卦","单数起卦","双数起卦","汉字起卦","卦名起卦")
 val guaNames:Map<String,String> by lazy { LiuyaoCasting::class.java.getResourceAsStream("/liuyao-names.tsv")!!.bufferedReader().useLines { rows->rows.filter { it.isNotBlank() }.associate { val p=it.trimStart('\uFEFF').split('\t');p[0] to p[1] } } }
 private val strokes:Map<Char,Int> by lazy { buildMap { LiuyaoCasting::class.java.getResourceAsStream("/cnchar-strokes.tsv")!!.bufferedReader().useLines { rows-> rows.filter { it.contains('\t') }.forEach { row->val count=row.substringBefore('\t').toInt();row.substringAfter('\t').forEach { put(it,count) } } } } }
 fun numbers(first:String,second:String?=null):List<Int> {
  val raw=first.filter { it in '0'..'9' }.take(20)
  require(raw.isNotEmpty()) { "请输入有效数字" }
  val halves=if(second==null) { val mid=raw.length/2; (raw.take(mid).ifEmpty { raw }) to raw.drop(mid).ifEmpty { raw } } else raw to second.filter { it in '0'..'9' }.take(20)
  require(halves.second.isNotEmpty()) { "请输入两组有效数字" }
  // The source form uses Number/parseInt; retain its IEEE-754 behavior for long inputs.
  val a=halves.first.toDouble();val b=halves.second.toDouble()
  return fromSums(a,b)
 }
 private fun fromSums(a:Double,b:Double):List<Int> {
  fun reduce(n:Double,m:Int):Int { val r=(n%m).toInt();return if(r==0) m else r }
  return LiuyaoEngine().numberCast(reduce(a,8),reduce(b,8),reduce(a+b,6))
 }
 fun characters(text:String):List<Int> {
  val chars=text.filter { it in '\u4e00'..'\u9fff' }.take(20)
  require(chars.length>=2) { "请至少输入 2 个汉字" }
  val mid=chars.length/2
  fun sum(s:String)=s.sumOf { strokes[it]?.takeIf { count->count>0 }?:((it.code%30)+1) }.toDouble()
  return fromSums(sum(chars.take(mid)),sum(chars.drop(mid)))
 }
 fun gua(main:String,changed:String=""):List<Int> {
  require(main in guaNames && (changed.isEmpty() || changed in guaNames)) { "请选择有效的卦名" }
  return main.mapIndexed { i,c->if(changed.isEmpty() || c==changed[i]) c.digitToInt() else if(c=='1') 3 else 4 }
 }
 fun resolve(input:ChartInput,method:String,numbers:String,manual:List<Int>,preview:List<Int>):List<Int> = when(method) {
  "时间"->LiuyaoEngine().timeCast(input)
  "数字"->{ val values=numbers.trim().split(Regex("[,，\\s]+")).map { it.toInt() };require(values.size in 2..3) { "请输入两个或三个正整数" };LiuyaoEngine().numberCast(values[0],values[1],values.getOrNull(2)) }
  "手动","手工指定"->manual.also { require(it.size==6 && it.all { n->n in listOf(0,1,3,4) }) { "请手工指定全部 6 爻" } }
  "随机"->LiuyaoEngine().randomCast()
  else->preview.also { require(method in methods && it.size==6 && it.all { n->n in listOf(0,1,3,4) }) { "请先生成完整卦象" } }
 }
}
