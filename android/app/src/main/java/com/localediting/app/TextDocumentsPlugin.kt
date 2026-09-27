package com.localediting.app

import android.app.Activity
import android.content.Intent
import androidx.activity.result.ActivityResult
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.IOException

@CapacitorPlugin(name = "TextDocuments")
class TextDocumentsPlugin : Plugin() {
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
}
