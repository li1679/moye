package com.localediting.app

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Color
import android.net.Uri
import android.os.BatteryManager
import android.os.Build
import android.provider.OpenableColumns
import android.util.Base64
import android.view.WindowManager
import android.webkit.WebView
import androidx.activity.result.ActivityResult
import androidx.core.content.IntentCompat
import androidx.core.graphics.Insets
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.WebViewListener
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream
import java.util.Locale

@CapacitorPlugin(name = "MoyeNative")
class MoyeNativePlugin : Plugin() {
    companion object {
        private const val SHARE_LIMIT = 32 * 1024 * 1024
    }

    private var themeColor = Color.parseColor("#f6f1e7")
    private var darkTheme = false

    private fun applyNativeTheme() {
        activity.window.decorView.setBackgroundColor(themeColor)
        bridge.webView.setBackgroundColor(themeColor)
        val controller = WindowCompat.getInsetsController(activity.window, activity.window.decorView)
        controller.isAppearanceLightStatusBars = !darkTheme
        controller.isAppearanceLightNavigationBars = !darkTheme
    }

    override fun handleOnConfigurationChanged(newConfig: Configuration) {
        super.handleOnConfigurationChanged(newConfig)
        activity.window.decorView.post { applyNativeTheme() }
    }

    override fun handleOnResume() {
        super.handleOnResume()
        activity.window.decorView.post { applyNativeTheme() }
    }

    override fun load() {
        activity.runOnUiThread { installEdgeToEdge() }
        handleShareIntent(activity.intent)
    }

    // 背景延伸到透明系统栏；安全区注入 CSS，不依赖手机 WebView 的 env() 实现。
    @Suppress("DEPRECATION")
    private fun installEdgeToEdge() {
        val window = activity.window
        val decor = window.decorView
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.TRANSPARENT
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.isStatusBarContrastEnforced = false
            window.isNavigationBarContrastEnforced = false
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            val attributes = window.attributes
            attributes.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            window.attributes = attributes
        }
        ViewCompat.setOnApplyWindowInsetsListener(decor) { view, insets ->
            val safe = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            val keyboard = insets.isVisible(WindowInsetsCompat.Type.ime())
            val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
            // 键盘仍由原生收缩视口，系统栏不再产生异色留白。
            view.setPadding(0, 0, 0, if (keyboard) ime.bottom else 0)
            val density = context.resources.displayMetrics.density
            val script = String.format(Locale.US,
                "document.documentElement.style.setProperty('--safe-area-inset-top', '%fpx');" +
                "document.documentElement.style.setProperty('--safe-area-inset-right', '%fpx');" +
                "document.documentElement.style.setProperty('--safe-area-inset-bottom', '%fpx');" +
                "document.documentElement.style.setProperty('--safe-area-inset-left', '%fpx');",
                safe.top / density, safe.right / density, (if (keyboard) 0 else safe.bottom) / density, safe.left / density)
            bridge.webView.evaluateJavascript(script, null)
            WindowInsetsCompat.Builder(insets)
                .setInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout(), Insets.NONE)
                .build()
        }
        bridge.addWebViewListener(object : WebViewListener() {
            override fun onPageCommitVisible(view: WebView, url: String) {
                ViewCompat.requestApplyInsets(decor)
            }
        })
        ViewCompat.requestApplyInsets(decor)
        decor.post { applyNativeTheme() }
    }

    override fun handleOnNewIntent(intent: Intent) {
        super.handleOnNewIntent(intent)
        handleShareIntent(intent)
    }

    @PluginMethod
    fun clearCache(call: PluginCall) {
        bridge.execute {
            try {
                val root = context.cacheDir.canonicalFile
                var count = 0
                root.listFiles()?.forEach { file ->
                    if (file.canonicalPath.startsWith(root.path + java.io.File.separator)) {
                        if (!file.deleteRecursively()) throw IOException("部分缓存无法删除")
                        count++
                    }
                }
                call.resolve(JSObject().put("count", count))
            } catch (error: Exception) { call.reject("缓存清理未完成", error) }
        }
    }

    @PluginMethod
    fun saveText(call: PluginCall) {
        val name = call.getString("name")
        val text = call.getString("text")
        if (name.isNullOrBlank() || text == null || name.any { it in "/\\:*?\"<>|" || it.code < 32 }) {
            call.reject("文件名称或正文无效")
            return
        }
        val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = if (call.getString("mime") == "application/json") "application/json" else "text/plain"
            putExtra(Intent.EXTRA_TITLE, name)
        }
        try {
            startActivityForResult(call, intent, "documentCreated")
        } catch (error: Exception) {
            call.reject("无法打开系统保存窗口", error)
        }
    }

    @ActivityCallback
    private fun documentCreated(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        if (result.resultCode != Activity.RESULT_OK) {
            call.resolve(JSObject().put("cancelled", true))
            return
        }
        val uri = result.data?.data
        if (uri == null) {
            call.reject("系统未返回保存位置")
            return
        }
        bridge.execute {
            try {
                val text = call.getString("text") ?: throw IOException("导出正文已失效")
                val stream = context.contentResolver.openOutputStream(uri, "wt")
                    ?: throw IOException("所选位置无法写入")
                stream.bufferedWriter(Charsets.UTF_8).use { writer ->
                    writer.write(text)
                    writer.flush()
                }
                call.resolve(JSObject().put("cancelled", false))
            } catch (error: Exception) {
                call.reject("文件未写入完成：" + error.message, error)
            }
        }
    }

    @PluginMethod
    fun setKeepScreenOn(call: PluginCall) {
        val on = call.getBoolean("on", false) ?: false
        activity.runOnUiThread {
            if (on) activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            else activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            call.resolve()
        }
    }

    @PluginMethod
    fun setBrightness(call: PluginCall) {
        val value = if (call.data.isNull("value")) null else call.getDouble("value")
        activity.runOnUiThread {
            val attributes = activity.window.attributes
            attributes.screenBrightness = value?.toFloat()?.coerceIn(0.01f, 1f)
                ?: WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE
            activity.window.attributes = attributes
            call.resolve()
        }
    }

    @PluginMethod
    fun setImmersive(call: PluginCall) {
        val on = call.getBoolean("on", false) ?: false
        activity.runOnUiThread {
            val controller = WindowCompat.getInsetsController(activity.window, activity.window.decorView)
            if (on) {
                controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                controller.hide(WindowInsetsCompat.Type.systemBars())
            } else {
                controller.show(WindowInsetsCompat.Type.systemBars())
            }
            call.resolve()
        }
    }

    @PluginMethod
    fun getBattery(call: PluginCall) {
        val manager = context.getSystemService(Context.BATTERY_SERVICE) as BatteryManager
        call.resolve(
            JSObject()
                .put("level", manager.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY))
                .put("charging", manager.isCharging)
        )
    }

    @PluginMethod
    fun setTheme(call: PluginCall) {
        val paper = call.getString("paper")
        if (paper == null || !Regex("^#[0-9a-fA-F]{6}$").matches(paper)) {
            call.reject("主题颜色无效")
            return
        }
        val color = Color.parseColor(paper)
        val dark = call.getBoolean("dark", false) ?: false
        activity.runOnUiThread {
            themeColor = color
            darkTheme = dark
            applyNativeTheme()
            call.resolve()
        }
    }

    private fun handleShareIntent(intent: Intent?) {
        if (intent == null) return
        val uri: Uri? = when (intent.action) {
            Intent.ACTION_VIEW -> intent.data
            Intent.ACTION_SEND -> IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, Uri::class.java)
            else -> null
        }
        val text = if (intent.action == Intent.ACTION_SEND && uri == null) intent.getStringExtra(Intent.EXTRA_TEXT) else null
        if (uri == null && text == null) return
        intent.action = null
        bridge.execute {
            val result = try {
                val (name, bytes) = if (uri != null) readShared(uri) else Pair("分享的文本.txt", text!!.toByteArray(Charsets.UTF_8))
                JSObject().put("name", name).put("data", Base64.encodeToString(bytes, Base64.NO_WRAP))
            } catch (error: Exception) {
                JSObject().put("error", error.message ?: "无法读取分享的文件")
            }
            notifyListeners("shareReceived", result, true)
        }
    }

    private fun readShared(uri: Uri): Pair<String, ByteArray> {
        val resolver = context.contentResolver
        var name = "导入的文本.txt"
        resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) {
                if (!cursor.isNull(0)) name = cursor.getString(0)
                if (!cursor.isNull(1) && cursor.getLong(1) > SHARE_LIMIT) throw IOException("文件超过 32MB，暂不支持导入")
            }
        }
        val bytes = resolver.openInputStream(uri)?.use { readLimited(it) } ?: throw IOException("无法打开这个文件")
        if (!name.endsWith(".txt", ignoreCase = true)) name += ".txt"
        return Pair(name, bytes)
    }

    private fun readLimited(input: InputStream): ByteArray {
        val output = ByteArrayOutputStream()
        val buffer = ByteArray(64 * 1024)
        while (true) {
            val count = input.read(buffer)
            if (count < 0) break
            output.write(buffer, 0, count)
            if (output.size() > SHARE_LIMIT) throw IOException("文件超过 32MB，暂不支持导入")
        }
        return output.toByteArray()
    }
}
