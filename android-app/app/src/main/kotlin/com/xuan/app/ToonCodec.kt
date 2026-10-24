package com.xuan.app
import com.google.gson.*

/** TOON serializer mirrors src/utils/toon.ts; export is a full immutable chart snapshot. */
object ToonCodec {
 private val gson=GsonBuilder().disableHtmlEscaping().create()
 fun encode(record:SavedChart)=encodeElement(gson.toJsonTree(record))
 fun encodeElement(element:JsonElement):String=when {element.isJsonObject->objectLines(element.asJsonObject,0).joinToString("\n");element.isJsonArray->arrayLines(element.asJsonArray,"",0).joinToString("\n");else->primitive(element)}
 private fun key(s:String)=if(Regex("[A-Za-z_][A-Za-z0-9_.]*").matches(s)) s else gson.toJson(s)
 private fun primitive(e:JsonElement)=gson.toJson(e)
 private fun objectLines(o:JsonObject,depth:Int):List<String> = o.entrySet().flatMap { (k,v)->val token=key(k);val spaces="  ".repeat(depth);when {v.isJsonArray->arrayLines(v.asJsonArray,token,depth);v.isJsonObject->listOf("$spaces$token:")+objectLines(v.asJsonObject,depth+1);else->listOf("$spaces$token: ${primitive(v)}")} }
 private fun arrayLines(a:JsonArray,key:String,depth:Int,listItem:Boolean=false):List<String> {
  val spaces="  ".repeat(depth)
  if(a.size()==0) return listOf(spaces+if(key.isNotEmpty()) "$key: []" else if(listItem) "[0]:" else "[]")
  val header="$spaces$key[${a.size()}]"
  if(a.all { it.isJsonPrimitive || it.isJsonNull }) return listOf("$header: "+a.joinToString(","){primitive(it)})
  val keys=a.first().takeIf { it.isJsonObject }?.asJsonObject?.keySet()?.sorted()
  if(!listItem && !keys.isNullOrEmpty() && a.all { e->e.isJsonObject && e.asJsonObject.keySet()==keys.toSet() && keys.all { e.asJsonObject[it].let { v->v.isJsonPrimitive || v.isJsonNull } } }) return listOf("$header{${keys.joinToString(","){key(it)}}}:")+a.map { e->"$spaces  "+keys.joinToString(","){primitive(e.asJsonObject[it])} }
  val itemSpaces="$spaces  "
  return listOf("$header:")+a.flatMap { e->when {e.isJsonObject->{val lines=objectLines(e.asJsonObject,depth+2);if(lines.isEmpty()) listOf("$itemSpaces-") else listOf("$itemSpaces- "+lines.first().drop(itemSpaces.length+2))+lines.drop(1)};e.isJsonArray->{val lines=arrayLines(e.asJsonArray,"",depth+1,true);listOf("$itemSpaces- "+lines.first().drop(itemSpaces.length))+lines.drop(1)};else->listOf("$itemSpaces- ${primitive(e)}")} }
 }
}
