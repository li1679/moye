# 墨页

本地小说阅读与编辑 Android 应用。支持书架分组、整章编辑、连续阅读、TXT 导入导出、误操作恢复和完整备份。

## 开发

需要 Node.js、JDK 21、Android SDK 36。

```powershell
npm ci
npm run dev -- --host 127.0.0.1 --port 5173
```

## Android 构建

在本机配置 JAVA_HOME 和 android/local.properties 中的 sdk.dir。

```powershell
npm run build
npx cap sync android
cd android
.\gradlew.bat :app:assembleDebug --console=plain
# Release 编译（默认未签名，需使用自己的密钥签名后安装）
.\gradlew.bat :app:assembleRelease --console=plain
```

输出位于 android/app/build/outputs/apk/。密钥、密码、本机 SDK 路径、缓存与安装包不提交到仓库。更换签名会影响覆盖安装；请长期妥善保存实际使用的签名密钥。

## 数据与验证

应用包名为 com.localediting.app。备份使用本地 JSON，包含正文、封面、设置和阅读位置，未加密。恢复前请确认覆盖范围。

自动化用例位于 tests/；浏览器测试需先启动开发服务器，使用隔离数据。编译成功不等于功能回归或真机验收通过。
