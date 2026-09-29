# 墨页

本地小说阅读与编辑 Android 应用。支持书架分组、整章编辑、连续阅读、TXT 导入导出、完整备份、阅读排版、点击或音量键翻页，以及 Android 分享导入。

## 开发

需要 Node.js、JDK 21、Android SDK 36。

```powershell
npm ci
npx playwright install chromium
npm run dev -- --host 127.0.0.1 --port 5173
npm test
```

类型检查和网页构建：

```powershell
npm run typecheck
npm run build
```

## 数据

应用包名为 `com.localediting.app`。数据只保存在本机，不联网。备份使用未加密的本地 JSON，包含正文、封面、设置和阅读位置。当前备份格式为版本 2，并兼容导入版本 1 备份；恢复会覆盖当前书库，操作前请确认范围。

## Android 构建

在本机配置 `JAVA_HOME` 和 Android SDK。Release 签名从 `android/keystore.properties` 读取，密钥路径相对于 `android/`；密钥、密码、本机 SDK 路径、缓存与安装包不提交到仓库。

调试包名称为“墨页测试”，使用独立的 application id 后缀，可以和正式版同时安装：

```powershell
npm run build
npx cap sync android
Set-Location android
.\gradlew.bat :app:assembleDebug --console=plain
```

Release 包的构建步骤如下。存在 `android/keystore.properties` 时会直接生成已签名的 `app-release.apk`；没有签名配置时只会生成不可直接安装的未签名 APK：

```powershell
Set-Location android
.\gradlew.bat :app:assembleRelease --console=plain
```

输出位于 `android/app/build/outputs/apk/`。更换或丢失签名密钥会导致以后无法覆盖升级；覆盖安装之前，先从应用内导出一次完整备份，并把 `android/signing/moye-release.jks` 和 `android/keystore.properties` 一起离线备份。

## 验证

自动化用例位于 `tests/`，`npm test` 会自动启动开发服务器并使用隔离数据。编译成功不等于功能回归或真机验收通过。
