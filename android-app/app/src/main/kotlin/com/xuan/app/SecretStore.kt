package com.xuan.app

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class SecretStore(context:Context) {
    private val prefs=context.getSharedPreferences("ai-settings",Context.MODE_PRIVATE)
    private val alias="xuan-api-key-v1"
    private fun key():SecretKey {
        val store=KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(alias,null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder(alias,KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        }.generateKey()
    }
    fun load():AiConfig {
        val encrypted=prefs.getString("key","").orEmpty()
        val secret=if(encrypted.isEmpty()) "" else {
            val parts=encrypted.split(':');require(parts.size==2) { "密钥存储损坏，请重新配置" }
            val cipher=Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE,key(),GCMParameterSpec(128,Base64.decode(parts[0],Base64.NO_WRAP)))
            cipher.doFinal(Base64.decode(parts[1],Base64.NO_WRAP)).toString(Charsets.UTF_8)
        }
        return AiConfig(prefs.getString("protocol","openai").orEmpty(),prefs.getString("url","").orEmpty(),secret,prefs.getString("model","").orEmpty())
    }
    fun save(config:AiConfig) {
        val encrypted=if(config.apiKey.isBlank()) "" else {
            val cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key())
            Base64.encodeToString(cipher.iv,Base64.NO_WRAP)+":"+Base64.encodeToString(cipher.doFinal(config.apiKey.toByteArray(Charsets.UTF_8)),Base64.NO_WRAP)
        }
        check(prefs.edit().putString("protocol",config.protocol).putString("url",config.baseUrl.trim()).putString("model",config.model.trim()).putString("key",encrypted).commit()) { "配置保存失败" }
    }
}
