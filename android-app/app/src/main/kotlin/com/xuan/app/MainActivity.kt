package com.xuan.app
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.lifecycle.ViewModelProvider
class MainActivity:ComponentActivity() {
    override fun onCreate(savedInstanceState:Bundle?) {
        super.onCreate(savedInstanceState)
        val model=ViewModelProvider(this)[ChartViewModel::class.java]
        setContent { XuanApp(model) }
    }
}
