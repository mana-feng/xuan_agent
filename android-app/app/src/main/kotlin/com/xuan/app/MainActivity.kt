package com.xuan.app
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.lifecycle.ViewModelProvider
class MainActivity:ComponentActivity() {
    override fun onCreate(savedInstanceState:Bundle?) {
        super.onCreate(savedInstanceState)
        androidx.core.view.WindowCompat.getInsetsController(window,window.decorView).isAppearanceLightStatusBars=true
        androidx.core.view.WindowCompat.getInsetsController(window,window.decorView).isAppearanceLightNavigationBars=true
        if(android.os.Build.VERSION.SDK_INT<27) window.navigationBarColor=android.graphics.Color.rgb(35,62,73)
        val model=ViewModelProvider(this)[ChartViewModel::class.java]
        setContent { XuanApp(model) }
    }
}
