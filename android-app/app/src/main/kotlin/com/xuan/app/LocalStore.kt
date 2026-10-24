package com.xuan.app

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import com.google.gson.Gson

class LocalStore(context:Context):SQLiteOpenHelper(context,"xuan-local.db",null,1) {
    private val gson=Gson()
    override fun onCreate(db:SQLiteDatabase) {
        db.execSQL("CREATE TABLE charts (id TEXT PRIMARY KEY, created INTEGER NOT NULL, title TEXT NOT NULL, payload TEXT NOT NULL)")
        db.execSQL("CREATE TABLE conversations (id TEXT PRIMARY KEY, updated INTEGER NOT NULL, payload TEXT NOT NULL)")
    }
    override fun onUpgrade(db:SQLiteDatabase,oldVersion:Int,newVersion:Int) = error("暂不支持的数据库版本，请先导出备份")
    fun charts():List<SavedChart> = payloads("charts","created").map { gson.fromJson(it,SavedChart::class.java) }
    fun conversations():List<Conversation> = payloads("conversations","updated").map { gson.fromJson(it,Conversation::class.java) }
    /** Never put an entire large JSON row into Android's bounded CursorWindow. */
    private fun payloads(table:String,order:String):List<String> {
        val db=readableDatabase
        db.beginTransactionNonExclusive()
        try {
            val ids=db.rawQuery("SELECT id FROM $table ORDER BY $order DESC",null).use { c -> buildList { while(c.moveToNext()) add(c.getString(0)) } }
            val values=ids.map { id ->
                val length=db.rawQuery("SELECT length(payload) FROM $table WHERE id=?",arrayOf(id)).use { c->check(c.moveToFirst());c.getInt(0) }
                buildString {
                    var offset=1
                    while(offset<=length) {
                        val chunk=db.rawQuery("SELECT substr(payload,?,32768) FROM $table WHERE id=?",arrayOf(offset.toString(),id)).use { c->check(c.moveToFirst());c.getString(0) }
                        append(chunk);offset+=32768
                    }
                }
            }
            db.setTransactionSuccessful()
            return values
        } finally { db.endTransaction() }
    }
    fun save(chart:SavedChart) { putChart(writableDatabase,chart) }
    fun deleteChart(id:String) { writableDatabase.delete("charts","id=?",arrayOf(id)) }
    fun saveConversation(chat:Conversation) { putConversation(writableDatabase,chat) }
    fun deleteConversation(id:String) { writableDatabase.delete("conversations","id=?",arrayOf(id)) }
    private fun putChart(db:SQLiteDatabase,chart:SavedChart) {
        val values=ContentValues().apply { put("id",chart.id);put("created",chart.createdAt);put("title",chart.result.title);put("payload",gson.toJson(chart)) }
        check(db.insertWithOnConflict("charts",null,values,SQLiteDatabase.CONFLICT_REPLACE)!=-1L) { "记录写入失败" }
    }
    private fun putConversation(db:SQLiteDatabase,chat:Conversation) {
        val values=ContentValues().apply { put("id",chat.id);put("updated",System.currentTimeMillis());put("payload",gson.toJson(chat)) }
        check(db.insertWithOnConflict("conversations",null,values,SQLiteDatabase.CONFLICT_REPLACE)!=-1L) { "对话写入失败" }
    }
    fun exportArchive():String=BackupCodec().encode(Archive(charts=charts(),conversations=conversations()))
    fun importArchive(text:String):Int {
        val archive=BackupCodec().decode(text)
        val db=writableDatabase; db.beginTransaction()
        try { archive.charts.forEach { putChart(db,it) };archive.conversations.forEach { putConversation(db,it) };db.setTransactionSuccessful() } finally { db.endTransaction() }
        return archive.charts.size
    }
}
