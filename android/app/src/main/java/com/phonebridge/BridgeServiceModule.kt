package com.phonebridge

import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class BridgeServiceModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "BridgeService"

    @ReactMethod
    fun start() {
        val context = reactApplicationContext
        val intent = Intent(context, BridgeService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent)
        } else {
            context.startService(intent)
        }
    }

    @ReactMethod
    fun stop() {
        val context = reactApplicationContext
        context.stopService(Intent(context, BridgeService::class.java))
    }
}
