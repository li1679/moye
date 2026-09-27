# 墨页（moye）开发约定

墨页是本地小说阅读与编辑的 Android 应用（Capacitor 8 + Vite + TypeScript），没有服务器，不联网。
施工方案见 docs/implementation-plan.md，进度见 docs/progress.md。

## 常用命令
- 安装：`npm ci`；第一次还要 `npx playwright install chromium`
- 开发预览：`npm run dev -- --host 127.0.0.1 --port 5173`
- 类型检查：`npm run typecheck`
- 测试：`npm test`（会自动启动开发服务器）；只跑一个文件：`npx playwright test tests/xxx.spec.ts`
- 构建网页：`npm run build`；同步到安卓：`npx cap sync android`；安卓调试包：`cd android && ./gradlew :app:assembleDebug`

## 改代码的规矩（必须遵守）
（下面提到的 `app/data/schema.ts` 在任务 1.2 建立，`app/kit/` 在第 3 批建立，`MoyeNativePlugin.kt` 在任务 5.5 由 `TextDocumentsPlugin.kt` 改名而来。这些文件出现之前，对应的规则按现有文件执行。）
1. 数据结构只在 `app/data/schema.ts` 里定义一次：类型、默认值、校验、数据库行格式、版本迁移都在这里。新增要保存的字段，先在这里登记，并在注释里写明哪个页面读它。没有页面读的数据不存。
2. `state` 是自动保存的：给 schema 里登记过的字段赋值，0.35～2 秒内就会写进数据库。渲染函数（`render*` 和模板函数）里禁止给 state 赋值。
3. 改数据库结构，必须升 `SCHEMA_VERSION`，并在 `migrateRows` 里写迁移。迁移要能重复执行。
4. 样式：颜色、字号、圆角、间距，只能用 `app/kit/tokens.css` 里的变量；通用控件用 `app/kit/` 里的组件和模板函数。不许在 CSS 文件末尾追加覆盖规则，要改就改原来那一条。
5. 原生能力只加在 `MoyeNativePlugin.kt` 这一个插件里；业务逻辑只写在 TypeScript 里。不新增第三方依赖。
6. 保持现有的 `data-action`、`aria-label` 和测试依赖的 class 名；要改就同步改测试。
7. 改动先写或更新测试；涉及性能的改动，用 `tests/scale.spec.ts` 的大书库验证。
8. 界面文字用简体中文，语气平实；按钮上写动作本身（写"删除"，不写"确定"）。
