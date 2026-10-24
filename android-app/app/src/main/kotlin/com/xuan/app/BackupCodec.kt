package com.xuan.app

import com.google.gson.Gson
import com.google.gson.JsonParser
import com.xuan.core.CalendarEngine

/** Validate the entire archive in memory before any database transaction starts. */
class BackupCodec {
    private val gson=Gson()
    fun encode(archive:Archive):String { validate(archive); val encoded=gson.toJson(archive); require(encoded.toByteArray(Charsets.UTF_8).size<=8*1024*1024) { "数据超过单份备份 8 MB 上限，请按单盘或单对话导出" }; return encoded }
    fun decode(text:String):Archive {
        require(text.toByteArray(Charsets.UTF_8).size<=8*1024*1024) { "备份超过 8 MB，请分批导出" }
        return try {
            val obj=JsonParser.parseString(text).asJsonObject
            require(obj.has("version") && obj["version"].asInt==1 && obj["charts"].isJsonArray && obj["conversations"].isJsonArray) { "不支持的备份格式或版本" }
            gson.fromJson(obj,Archive::class.java).also(::validate)
        } catch(e:Exception) { throw IllegalArgumentException("备份无效，现有记录未改动",e) }
    }
    private fun validate(archive:Archive) {
        try {
            require(archive.version==1)
            require(archive.charts.size<=10000 && archive.conversations.size<=10000)
            require(archive.charts.map { it.id }.distinct().size==archive.charts.size)
            require(archive.conversations.map { it.id }.distinct().size==archive.conversations.size)
            val calendar=CalendarEngine()
            archive.charts.forEach { record ->
                require(record.id.isNotBlank() && record.id.length<=200 && record.createdAt>=0)
                calendar.civil(record.input)
                require(record.result.type in listOf("bazi","liuyao","ziwei","qimen"))
                require(record.result.title.length<=2000 && record.input.title.length<=2000)
                require(record.result.sections.isNotEmpty() && record.result.sections.size<=100)
                record.result.sections.forEach { s -> require(s.title.length<=2000 && s.rows.size<=500); s.rows.forEach { (k,v) -> require(k.length<=2000 && v.length<=100000) } }
                require(record.result.metadata.size<=3000)
                record.result.metadata.forEach { (k,v) -> require(k.length<=2000 && v.length<=100000) }
            }
            archive.conversations.forEach { chat ->
                require(chat.id.isNotBlank() && chat.id.length<=200 && chat.title.length<=2000 && chat.chartText.length<=100000)
                require(chat.messages.size<=2000)
                chat.messages.forEach { require(it.role in listOf("user","assistant") && it.content.length<=2*1024*1024) }
            }
        } catch(e:Exception) { throw IllegalArgumentException("备份字段无效或超出数量限制",e) }
    }
}
