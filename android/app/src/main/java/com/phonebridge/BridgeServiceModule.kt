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
        reactApplicationContext.stopService(
            Intent(reactApplicationContext, BridgeService::class.java)
        )
    }

    /**
     * Acquire a CPU wake lock before starting an upload so Android
     * doesn't throttle the JS thread while the app is in the background.
     */
    @ReactMethod
    fun acquireWakeLock() {
        val context = reactApplicationContext
        val intent = Intent(context, BridgeService::class.java).apply {
            action = BridgeService.ACTION_ACQUIRE_WAKE
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent)
        } else {
            context.startService(intent)
        }
    }

    /**
     * Release the wake lock after upload completes.
     */
    @ReactMethod
    fun releaseWakeLock() {
        val context = reactApplicationContext
        val intent = Intent(context, BridgeService::class.java).apply {
            action = BridgeService.ACTION_RELEASE_WAKE
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent)
        } else {
            context.startService(intent)
        }
    }
}
