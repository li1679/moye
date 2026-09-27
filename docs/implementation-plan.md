# 墨页（moye）最终实施方案

> **给执行 AI**：这份文件是唯一的施工依据。要做的事、每个决定、每一步怎么改、怎么验收，都写在这里。按顺序做，不要自己增加需求；遇到方案和代码对不上的地方，按第 0.4 节处理。

- 仓库：https://github.com/li1679/moye
- 依据：`墨页-优化报告-v2.md`，以及用户在 2026-09-26 的决定。用户没定的事项，按报告里的推荐来定，全部列在第 2 节。
- 本文件在第 0 批会复制进仓库：`docs/implementation-plan.md`。

## 目录

- 0 执行方式（必读）
- 1 项目速览
- 2 全部决定
- 3 不做的事
- 4 批次总览
- 5 第 0 批：准备
- 6 第 1 批：数据层
- 7 第 2 批：拆分 prototype.js
- 8 第 3 批：Kit 与纸墨风
- 9 第 4 批：交互
- 10 第 5 批：阅读器与安卓原生
- 11 第 6 批：收尾与发布
- 12 测试改动总表
- 13 真机验收清单（给用户）
- 附录 A～U：配置与代码草稿

---

## 0 执行方式（必读）

### 0.1 目标

把墨页按本方案改完：
- 删除恢复记录，重做数据层；
- 把核心文件 `prototype.js` 拆成模块；
- 视觉统一成纸墨风；
- 修掉交互问题；
- 改进阅读器和安卓原生能力。

共 7 批（第 0～6 批）。每一批结束时，应用都要能正常使用，全部测试都要通过。

### 0.2 工作流程

1. 开工前先读完第 0～4 节。第 0 批之后，还要先读仓库根目录的 `CLAUDE.md`。
2. 一次只做一个任务，按编号顺序做。每个任务按下面的步骤：
   1. 先读"改哪里"里列出的文件；
   2. 按"怎么做"修改；
   3. 按"测试"增、删、改用例（完整清单见第 12 节）；
   4. 运行 `npm run typecheck`、相关测试文件，再跑一遍全量 `npm test`；
   5. 全部通过后提交，提交信息写成 `[任务号] 简述`，例如 `[1.3] 分批读取本地数据库`；
   6. 在 `docs/progress.md` 里勾掉这个任务，写下备注（例如性能数字）。
3. 每一批用一个分支，名字是 `batch-<n>-<英文短名>`，从最新的 `main` 切出来。整批做完后：
   1. 推送分支，用 `gh pr create` 开 PR；
   2. CI 通过后用 `gh pr merge --merge --delete-branch` 合并；
   3. 从更新后的 `main` 开下一批。

   没有 gh 或推送权限时，在本地合并到 `main`，并在 progress.md 里注明"未推送"。
4. 每批做完后，把第 13 节里这一批的验收项转告用户，由用户在手机上验收。执行 AI 不用等验收结果，直接做下一批。用户反馈的问题，作为新任务插到当前批次的末尾。

### 0.3 关于行号

文中的行号来自 2026-09-26 的代码，当时 `app/prototype.js` 有 1623 行，`app/styles.css` 有 2353 行。前面的任务改动之后，行号会变。定位时以函数名和文中引用的代码片段为准。

### 0.4 硬性规则

- 不做本方案以外的功能和重构。看到别的问题，记到 progress.md 的"发现的问题"里。
- 不新增依赖，任务里写明的除外。本方案只允许一个例外：生成图标时用 `--no-save` 临时安装 `opentype.js`。
- 保持现有的 `data-action`、`aria-label`，以及测试依赖的 class 名，任务明确要求改的除外。改了就同步改测试。
- 不能靠删除或跳过测试来让测试通过。只有第 12 节列出的用例可以删改。
- 用户能看到的文字，一律用简体中文，语气和现有界面一致。任务里给出的文案要逐字照抄。
- 遇到以下情况要停下来：同一个失败试了两次还没解决，或者方案和代码的实际情况矛盾。这时在 progress.md 的"阻塞"里写清现象、已经试过的办法，以及需要用户决定的问题，然后去问用户。

### 0.5 每个任务的完成标准

- `npm run typecheck` 没有错误（第 2 批完成之前，`prototype.js` 不做类型检查）；
- `npm test` 全部通过；
- 新行为都有测试覆盖（纯视觉改动除外）；
- 已经提交，progress.md 也已更新。

---

## 1 项目速览

### 1.1 技术栈与命令

- 技术栈：Capacitor 8（Android）、Vite 8、TypeScript 7、lucide 图标、SortableJS、Playwright。
- 数据存储：安卓上用 SQLite（@capacitor-community/sqlite），浏览器预览用 IndexedDB。两边都只有一张键值表 `records(id, value)`，value 是 JSON 字符串。
- 环境要求：Node.js 22 以上、JDK 21、Android SDK 36。后两个只在构建安卓包时需要。

| 用途 | 命令（第 0 批之后） |
|---|---|
| 安装依赖 | `npm ci`；第一次还要运行 `npx playwright install chromium` |
| 开发预览 | `npm run dev -- --host 127.0.0.1 --port 5173` |
| 类型检查 | `npm run typecheck` |
| 全部测试 | `npm test`（会自动启动开发服务器） |
| 单个测试文件 | `npx playwright test tests/editor.spec.ts` |
| 构建网页 | `npm run build` |
| 同步到安卓 | `npx cap sync android` |
| 安卓调试包 | `cd android && ./gradlew :app:assembleDebug`（Windows 用 `gradlew.bat`） |

### 1.2 代码地图（改造前）

| 文件 | 作用 |
|---|---|
| `app/main.ts` | 启动：安装下拉选择器和视口处理，动态导入 `prototype.js`；导入失败时显示错误页 |
| `app/prototype.js` | 核心，共 1623 行：状态、所有页面的渲染、`action()` 大分发、全部事件监听、页面切换动画、安卓返回键 |
| `app/data/autosave.ts` | `persistState()`：读库，把 state 包成多层 Proxy；对 state 的任何写入都会标记"待保存"并延迟保存。另有 `saveNow()`、`replaceLibrary()` |
| `app/data/storage.ts` | SQLite 和 IndexedDB 的读写：`read()`、`commit(upserts, deletes)` |
| `app/features/recovery/model.ts` | 恢复记录（要删），以及备份的编解码和校验（要保留） |
| `app/features/recovery/flows.ts` | 恢复记录界面（要删），以及完整备份界面（要保留） |
| `app/features/reader/continuous.ts` | 连续阅读：把整本书渲染进页面，阅读位置按文字锚点保存 |
| `app/features/editor/*` | 撤销历史、输入处理、查找（worker）、字数（worker）、光标位置、视口、下拉选择器、章节左滑 |
| `app/features/txt/*` | TXT 解码、分章，以及导入导出界面 |
| `app/ui/*` | 设置面板、弹层栈、图标 |
| `app/styles.css` | 全部样式，共 2353 行，末尾约 400 行是覆盖补丁 |
| `android/app/src/main/java/com/localediting/app/` | `MainActivity.java`，以及 `TextDocumentsPlugin.kt`（负责保存文件、清理缓存） |
| `tests/*.spec.ts` | 77 个 Playwright 用例；`tests/seed.ts` 会把 3 本示例书按版本 1 格式写进 IndexedDB |

### 1.3 数据怎么流动

启动时的流程：
1. `persistState()` 读出整张表；
2. 拼出 `state.books` 等字段；
3. 返回一个 Proxy。

之后的保存：
- 页面代码直接改 `state`，例如 `chapter.body = …`、`state.books.push(…)`，Proxy 会记下哪些行"待保存"；
- 0.35 秒后自动保存，最迟 2 秒；
- `saveNow()` 立即保存；
- 切到后台、点击页面时，也会触发保存。

数据库里的行：

| 行 id | 内容 |
|---|---|
| `schema` | 版本号 |
| `groups` `view` `prefs` `toolbars` `reading` `readPrefs` `editing` `recovery` `restorePoint` | 各一行，存对应字段 |
| `book-order` | 书的 id 数组 |
| `book:<id>` | 书的元数据和 `chapterIds` |
| `chapter:<id>` | 一章的内容 |

### 1.4 测试怎么写

- **界面测试**：`import { test, expect } from './seed'`。会预置 3 本书：
  - id 1《雨停之后》，3 章：第1章 归途、第2章 旧书店、第3章 一封来信（第 3 章是空的）；
  - id 2《山海拾记》，1 章；
  - id 3《长街来信》，在分组 1"待整理"里。
- **纯函数测试**：也写在 spec 文件里，但用例不接收 `page` 参数，写法参考 `editor.spec.ts` 的前三个用例。
- **需要空书库时**：`import { test, expect } from '@playwright/test'`。
- **在页面里调用应用模块**：`await page.evaluate(async () => { const m = await import('/features/xxx.ts'); … })`，参考 `refinement.spec.ts` 的最后一个用例。
- **模拟写库失败**：临时替换 `IDBDatabase.prototype.transaction`，参考 `persistence.spec.ts`。
- **读 IndexedDB 里的行**：参考 `experience.spec.ts` 第 33-36 行。

---

## 2 全部决定

表中"来源"一列的含义：
- **用户**：用户已经拍板；
- **推荐**：按报告里的推荐来定（用户授权"没定的按推荐来"）。

| 编号 | 决定 | 来源 |
|---|---|---|
| D-01 | 删除"误操作恢复（恢复记录）"功能，连同对应的代码、测试，以及用户手机上的旧数据（迁移时删掉 `recovery` 行） | 用户 |
| D-02 | 撤销只在编辑器里有，只记录**当前打开的这一章**。离开这一章就清空，包括：返回目录、换章、从目录跳转、回书架、进阅读器。进出"页面布局"不算离开。全书替换、全书排版只给当前打开的那一章记撤销 | 用户 |
| D-03 | 全书排版执行时仍然不提示。执行后，书籍菜单最上面出现"撤销全书排版"，离开这本书（回书架或打开别的书）后失效。全书替换同样处理，菜单项叫"撤销全书替换" | 推荐 |
| D-04 | 删除书籍或章节：确认框加"取消"按钮；删除后，提示条上带"撤销"按钮，5 秒内可以撤回；确认框写明"删除后 5 秒内可以撤销" | 推荐 |
| D-05 | 保留"恢复到上次导入备份前"（`restorePoint`），但导出的备份里不再包含它 | 推荐 |
| D-06 | 备份格式升到版本 2，不含 recovery 和 restorePoint；仍然能导入版本 1 的旧备份，导入时自动去掉这两项 | 推荐 |
| D-07 | 保留两个书架。底部导航改名为"写作 / 阅读 / 设置"（原来是"主页 / 阅读 / 我的"），`data-action` 不变，仍是 `tab:edit`、`tab:read`、`tab:me` | 用户 + 推荐 |
| D-08 | "设置"页放四项：导入 TXT、完整备份与恢复、清理缓存、关于。书架 ⋮ 菜单保留"导入 TXT"，去掉"完整备份与恢复"和"全部书籍搜索" | 推荐 |
| D-09 | 书架右上角的放大镜打开一个搜索面板，分"书名 / 全文"两个标签 | 推荐 |
| D-10 | 记住上次所在的标签页、页面、书和章。冷启动时直接回到原处，包括编辑器和阅读器 | 推荐 |
| D-11 | 字数不含空白（空格、换行、全角空格都不算）。导入预览里的"字符（含标题和空白）"保持原来的口径 | 推荐 |
| D-12 | 字数按正文内容缓存在内存里，不写进数据库 | 推荐 |
| D-13 | 封面选图后压缩成不超过 480×640 的 JPEG（质量 0.85），单独存一行。已有的大封面在启动后空闲时自动压缩 | 推荐 |
| D-14 | 纸墨风的设计变量见附录 M：纸 #f6f1e7、墨 #1f1d1a、朱砂 #b33a2e、危险色 #9f2f25……。朱砂只做点缀（当前位置标记、印章、进度），不用在按钮和选中状态上 | 用户 + 推荐 |
| D-15 | 应用外壳（书架、章节列表、设置页、弹层）跟随系统深色模式。编辑器和阅读器的纸色、字色仍由用户设置决定。阅读器里的弹层保持应用配色（用户决定）。编辑器和阅读器各自的夜间开关不合并 | 用户 + 推荐 |
| D-16 | 新安装时，默认纸色改为宣纸 #f6f1e7，字色改为墨 #1f1d1a。已安装的用户保留原来的设置 | 推荐 |
| D-17 | 新书封面按书 id 从 8 种低饱和书封色里取色，配白色竖排题签和一枚小朱砂印；有自定义图片时显示图片 | 推荐 |
| D-18 | 底部导航改成通栏平铺，去掉悬浮圆角和阴影；当前项上方有一条朱砂短线 | 推荐 |
| D-19 | 去掉弹层顶部的把手，不做下拉关闭 | 推荐 |
| D-20 | 顶栏工具放不下时，右侧渐隐，提示可以横向滑动；默认工具不变 | 推荐 |
| D-21 | 长按工具栏图标显示工具名称。图标替换：一键排版改用 wand-sparkles，目录改用 list-ordered，网格线改用 rows-3，写作标签改用 feather，设置标签改用 settings | 推荐 |
| D-22 | 启动图标改成朱砂方印加纸色"墨"字（字形取自 Noto Serif SC Bold），暖白底，单色图层只画"墨"字。启动页改用 Android 12 SplashScreen（纸色底加图标），删除 11 张 splash.png | 推荐 |
| D-23 | 目录打开时当前章居中；超过 50 章时，顶部有"跳到第几章"输入框，输入后直接打开该章。目录、章节列表、编辑器正文都有可拖动的快速滚动条 | 推荐 |
| D-24 | 从编辑器返回章节列表时，恢复原来的滚动位置，刚编辑的那一章短暂高亮 | 推荐 |
| D-25 | 新建章节后直接进入编辑器，并选中标题；编辑器"更多工具"加"新建下一章"（插在当前章之后）；工具栏的"下一章"在最后一章时变成新建一章 | 推荐 |
| D-26 | 在标题里按回车，跳到正文开头，不写入换行；粘贴到标题时，换行变成空格；迁移时把已有标题里的换行换成空格 | 推荐 |
| D-27 | 书籍菜单的"导入章节"改为真正把 TXT 里的章节追加到本书末尾。书架菜单的"导入 TXT"仍然是新建一本书 | 推荐 |
| D-28 | 编辑器里的"本章查找"改成常驻查找条：输入框、"3/17"计数、上一处、下一处、替换、关闭。新增一个可选工具"本章查找"。其他搜索面板记住上次的关键词，打开时自动聚焦 | 推荐 |
| D-29 | 设置分成四类：版面、字体、主题、排版规则。从设置里去掉"本章搜索"和"导出文档"（更多工具里已经有）；删除"正文自动滚动"；面板名"界面设置"改为"显示设置" | 推荐 |
| D-30 | 阅读页脚右侧显示"N/M · 本章%"（N 是当前第几章，M 是总章数；左侧仍是章名）。阅读书架的封面下显示"读到 x%"或"未读"，书架可以切换"手动顺序 / 最近阅读"。阅读器正文上方那个从来没显示过的书名标签删除 | 推荐 |
| D-31 | 阅读时点屏幕上三分之一回一屏，点下三分之一翻一屏，点中间呼出菜单；音量键也能翻页。两者都能在阅读设置里关闭，默认开。不做自动滚屏 | 推荐 |
| D-32 | 亮度改用原生窗口亮度，只在阅读器里生效，默认"跟随系统" | 推荐 |
| D-33 | 阅读时屏幕常亮，默认开，可以关 | 推荐 |
| D-34 | 沉浸阅读作为可选项，默认关；开启后页脚显示时间和电量 | 推荐 |
| D-35 | 支持对 text/plain 文件"用其他应用打开"和"分享"，收到后直接进入导入预览，文件上限 32MB | 推荐 |
| D-36 | 阅读器可以选字体（系统默认 / 宋体 / 黑体）；正文两端对齐；"段落整理"有关、紧凑、宽松三档，只改显示，不改原文。编辑器的"宋体"改用 `--font-serif` 字体栈 | 推荐 |
| D-37 | 配色提供 5 组预设：宣纸、月白、牛皮、竹青、夜读。字色和纸色的对比度低于 4.5:1 时给出提示 | 推荐 |
| D-38 | 章节识别规则：<br>• 认卷标题：紧跟章标题时并入章名，否则单独成一章；<br>• 认"正文 第一章""【第一章】"这类写法；<br>• 认纯数字标题：至少 5 个、八成连号，并且全书没有"第N章"类标题时才启用；<br>• 过滤"第一节课……""第三回合……"这类正文句子；<br>• 短章太多时，在导入预览里提醒 | 推荐 |
| D-39 | 长按书或章节进入管理模式。管理模式下点分组，只给提示，不退出管理。"全选"的文字随状态变化。章节管理加"移动"：移到最前 / 移到最后 / 移到第 N 章之后 | 推荐 |
| D-40 | 在"写作"书架首页按返回键，2 秒内再按一次才退出 | 推荐 |
| D-41 | 其他小修：<br>• 有分组时不显示"暂无书籍"；<br>• 编辑器的字体设置对所有章生效；<br>• 备份文件名用本地日期；<br>• 关于页显示版本号，以及"所有数据只保存在本机，不联网"；<br>• 新建书籍后直接进入这本书；<br>• 面板里的输入框自动聚焦；<br>• 用词统一：复制正文、书名、显示设置 | 推荐 |
| D-42 | 编辑器的字数徽标前加一个小圆点：灰色表示已保存，朱砂色表示有改动还没保存。保存失败时仍用现在的红色提示按钮 | 推荐 |
| D-43 | 保留现有的自动保存 Proxy，不引入 `repo.ts`，另加两条护栏：<br>① 渲染函数里不写 state；<br>② Proxy 赋值时，把数组里的代理对象拆回原始对象。<br>这里收回 v2 报告第四节"四-8"的 repo.ts 方案，原因见第 3 节 | 推荐（修订） |
| D-44 | 数据库仍用键值表，改动如下：<br>• book 行不再内嵌封面，封面单独存成 `cover:<id>` 行；<br>• 新增 `session`、`readSort` 两行；<br>• 不存字数，也不存目录——没有页面要读它们，符合"没人读的不存"。<br>这里收回 v2 报告第四节"四-3"方案 A 里"书行存目录"那一条 | 推荐（修订） |
| D-45 | `prototype.js` 按页面拆成 TypeScript 模块，沿用现有的 `createXxx(ctx)` 工厂写法，不换框架 | 推荐 |
| D-46 | 版本号只以 package.json 为准，Android 的 versionName 和 versionCode 都从它生成；本次发布 1.1.0 | 推荐 |
| D-47 | 调试包的 applicationId 加后缀 `.debug`，应用名叫"墨页测试"，可以和正式版同时安装，方便真机试用 | 推荐 |
| D-48 | 搜索线程常驻，5 分钟不用再释放 | 推荐 |

---

## 3 不做的事

| 不做 | 原因 | 以后什么时候再考虑 |
|---|---|---|
| 正文按需读取（v2 报告四-3 的方案 B） | 分批读库加窗口化阅读，已经解决了报告里的问题；按需读取要把编辑器、阅读器、搜索、导出、备份全部改成异步取正文，风险大 | 第 1 批完成后，用户的真实书库在真机上冷启动仍超过 3 秒 |
| 把自动保存 Proxy 整体改成显式写入 | 要改 60 多处写入点，漏掉一处就会丢数据；现有机制有测试覆盖。改为加两条护栏（D-43），并在 CLAUDE.md 里写清楚 | 以后拆页面时遇到 Proxy 导致的具体 bug |
| 备份流式写入 | 去掉 recovery 和 restorePoint 之后，备份体积大幅下降，只有特别大的书库才会碰到内存问题 | 用户反馈备份失败 |
| 自动滚屏 | 用户没有提；U-06 只是删除无效开关 | 用户提出需要 |
| 导入字体文件 | 系统宋体和黑体已经够用 | 用户提出需要 |
| 自定义目录识别规则 | 属于新功能（v2 附录） | 另开需求 |
| 编辑器和阅读器夜间开关合并 | 两边的纸色是分开设置的，这是有意设计，合并的价值低 | 用户提出需要 |
| 状态栏颜色随夜间变化 | 涉及原生主题，改动面大；沉浸阅读已经能隐藏状态栏 | 用户提出需要 |
| 整本书只有一章时的分段渲染 | 复杂度高；第 4 批改进章节识别后，这种情况会变少 | 用户反馈卡顿 |
| 换机迁移、系统备份 | 用户已决定不考虑 | — |
| 分卷、每日字数、导出 EPUB/DOCX、章节历史版本 | 属于新功能；"章节历史版本"也和"只做短时撤销"的决定冲突 | 另开需求 |
| 换用 Vue 等框架 | 编辑器依赖手工控制的 contenteditable、输入法组词和光标恢复，框架容易和它冲突；真正乱的是数据层和 CSS | 页面数量明显增加 |

---

## 4 批次总览

先把边界立住，再往上加东西：
- 第 1 批：删功能、立数据规矩；
- 第 2 批：拆文件；
- 第 3 批：统一视觉；
- 第 4、5 批：在新结构上修交互、做新能力。

| 批次 | 分支 | 主要内容 | 覆盖的条目 | 规模 |
|---|---|---|---|---|
| 0 | batch-0-prep | 测试环境、CI、调试包、项目文档、大书库基线 | E-03（前半） | 小 |
| 1 | batch-1-data | 删除恢复记录，建 schema.ts，数据迁移，分批读库，按需写入，短时撤销，字数，封面，回到原处 | C-01、C-02、C-04、C-05、C-06、C-11、C-12、E-02（护栏）、E-05、U-06、U-14、C-08（部分） | 大 |
| 2 | batch-2-split | 把 prototype.js 拆成 TypeScript 模块，行为不变 | E-01、E-04（部分） | 大 |
| 3 | batch-3-kit | 设计变量和组件，重写 CSS；图标改为直接输出 svg；封面、导航、弹层、深色、配色；启动图标和启动页 | V-01、V-02、V-03、V-06、V-08、C-07、C-13、U-11、U-15（视觉）、U-16、U-18、I-01～I-04 | 大 |
| 4 | batch-4-ux | 小问题、导航与设置页、设置分类、目录、章节列表、新建章节、标题输入、导入章节、查找条、进度与排序、管理、保存状态点、快速滚动条、章节识别、搜索线程 | U-01～U-05、U-07、U-09、U-10、U-12（书架部分）、U-17、U-19、V-05、V-07、C-09、C-10 | 大 |
| 5 | batch-5-reader | 窗口化阅读、页脚、阅读排版、点击翻页；原生插件（常亮、亮度、沉浸、音量键、分享导入）；删除无用插件 | C-03、U-12（页脚）、U-13、U-20、V-04、A-01、A-02、A-04、A-05、A-06 | 大 |
| 6 | batch-6-release | 版本号、清理死代码、文档、最终回归、交付 | A-07、E-04 | 小 |

---

## 5 第 0 批：准备（分支 batch-0-prep）

### 任务 0.1 取得代码

1. 克隆并切分支：
   ```
   git clone https://github.com/li1679/moye.git moye
   cd moye
   git checkout -b batch-0-prep
   ```
2. 核对以下三项。不一致时，以 GitHub 上的代码为准，并在 progress.md 里注明"行号可能有偏差"：
   - `app/prototype.js` 有 1623 行；
   - `app/styles.css` 有 2353 行；
   - `tests/` 下有 15 个 spec 文件。
3. 安装依赖：`npm ci`，然后 `npx playwright install chromium`。

### 任务 0.2 测试一条命令就能跑

- **改哪里**：`playwright.config.ts`、`package.json`
- **怎么做**：
  - `playwright.config.ts` 按附录 A 改：去掉 `channel: 'msedge'`，加 `webServer`，CI 环境下失败重试 1 次；
  - `package.json` 的 scripts 加两条：`"test": "playwright test"`、`"typecheck": "tsc --noEmit"`。
- **测试**：运行 `npm test`，预期 77 个用例全部通过。把通过数和耗时写进 progress.md。

  如果有失败：
  1. 先重跑一次；
  2. 仍然失败的，在 progress.md 里记下用例名和报错；
  3. 只修环境原因的失败（浏览器、端口、超时）；业务原因的失败，先问用户。

### 任务 0.3 CI

- **改哪里**：新建 `.github/workflows/ci.yml`，内容见附录 B。
- **两个任务**：
  - web：`npm ci` → 安装 Chromium → `npm run build` → `npm test`，失败时上传测试报告；
  - android：`npm run build` → `npx cap sync android` → `assembleDebug` → 上传 APK。
- **完成标准**：PR 上两个任务都通过；在 Actions 里能下载 `moye-debug-apk`。

### 任务 0.4 调试包能和正式版同时安装（D-47）

- **改哪里**：`android/app/build.gradle`；新建 `android/app/src/debug/res/values/strings.xml`
- **怎么做**：
  1. 在 `buildTypes` 里加 debug：
     ```groovy
     buildTypes {
         debug {
             applicationIdSuffix ".debug"
             versionNameSuffix "-debug"
         }
         release { /* 原样保留 */ }
     }
     ```
  2. `src/debug/res/values/strings.xml`：
     ```xml
     <?xml version="1.0" encoding="utf-8"?>
     <resources>
         <string name="app_name">墨页测试</string>
         <string name="title_activity_main">墨页测试</string>
     </resources>
     ```
  3. `main/res/values/strings.xml` 里的 `package_name`、`custom_url_scheme` 不动。FileProvider 用的是 `${applicationId}`，会自动带上后缀，不用改。
- **完成标准**：CI 的 android 任务通过。

### 任务 0.5 项目文档

新建以下文件后提交：

| 文件 | 内容 |
|---|---|
| `CLAUDE.md` | 附录 C 全文 |
| `docs/implementation-plan.md` | 本文件，原样复制 |
| `docs/progress.md` | 按附录 D 的模板，列出全部任务 |
| `docs/device-checklist.md` | 第 13 节，原样复制 |

### 任务 0.6 大书库测试

- **改哪里**：新建 `tests/fixtures/big-library.ts`、`tests/scale.spec.ts`
- **怎么做**：
  - `big-library.ts` 导出 `seedBigLibrary(page, { chapters = 1500, charsPerChapter = 2000 } = {})`：
    - 在 `page.addInitScript` 里按版本 1 格式写库，写法和 `tests/seed.ts` 相同：schema 为 1，写 `book-order`、`book:1`（含 `chapterIds`）和各 `chapter:*` 行；
    - 书名"大书库测试"，第 i 章标题为 `第${i + 1}章`；
    - 正文由 `第${i + 1}章第${n}段。` 循环拼接到指定长度，每 200 字换一行。
  - `scale.spec.ts`：
    - 开头写 `import { test, expect } from '@playwright/test'` 和 `test.setTimeout(180_000)`；
    - 在同一个用例里依次量下面 5 项，每项用 `Date.now()` 计时，结果写进 `test.info().annotations`（type 为 `timing`），并 `console.log` 输出：
      1. 从打开首页到 `.books` 可见；
      2. 点书，到章节列表出现 1500 行；
      3. 回书架 → 切到"阅读" → 点书，到第一章正文可见；
      4. 点正文中部呼出控制栏 → 打开目录，到目录出现 1500 行；
      5. 点 `jump-chapter:1000`，到页脚第一个 span 显示"第1001章"。
- **测试**：运行 `npx playwright test tests/scale.spec.ts`，把 5 个数字记进 progress.md 的"性能基线"。本批不设上限。

### 任务 0.7 本批收尾

推送，开 PR，CI 通过后合并。

---

## 6 第 1 批：数据层（分支 batch-1-data）

这一批改动最大，也最关键。任务顺序不能乱：先删恢复记录，再建 schema，最后改读写。

### 任务 1.1 删除恢复记录（D-01、D-05、D-06）

- **改哪里**：
  - `app/features/recovery/`（改名为 `app/features/backup/`）
  - `app/prototype.js`
  - `app/data/autosave.ts`
  - `app/ui/icons.ts`
  - `README.md`
  - `tests/recovery.spec.ts`（改名为 `tests/backup.spec.ts`）
  - `tests/storage-performance.spec.ts`
- **怎么做**：
  1. **目录改名**：`git mv app/features/recovery app/features/backup`，并更新所有 import 路径（包括测试里的）。
  2. **`backup/model.ts`**：
     - 删除 `Entry` 类型、`entrySizes`、`RecoveryCapacity`、`recoveryCapacity`、`recoveryCapacityLabel`、`sameValue`、`checkpoint`、`canRestore`、`restoreEntry`；
     - `Library` 类型去掉 `recovery`；
     - `librarySnapshot` 去掉 recovery 分支；
     - `validateLibrary` 去掉恢复记录相关的检查：第 109 行只检查 books 和 groups，第 158-168 行删掉。
  3. **备份格式升到版本 2（D-06）**：
     - `encodeBackup`：payload 只包含 books、groups、view、prefs、toolbars、reading、readPrefs、editing，不含 restorePoint；外层写 `version: 2`；两处超限提示都改为"备份超过 256MiB 上限。"
     - `decodeBackup`：接受 version 1 和 2。遇到 version 1，先删掉 payload 里的 `recovery` 和 `restorePoint`，再做校验。
  4. **`backup/flows.ts`**：
     - 删除 `recovery()`、`detail()`，以及只有它们用到的 import；
     - `createRecoveryFlows` 改名为 `createBackupFlows`，只返回 `{ backup }`；
     - 备份说明改为："备份包括书籍正文、内嵌封面、分组排序、设置和阅读/编辑位置。文件为本地 JSON，未加密，请自行保管。"；
     - 预览文字去掉"、N 条恢复记录"；
     - 元素 id `recovery-error` 统一改名为 `backup-error`；
     - 恢复备份时，仍然把当前书库存进 restorePoint（D-05），这部分不动。
  5. **`prototype.js`**：
     - 删除 `rememberChange`、`rememberChapters`，以及 8 处调用，分别在：`confirm-group` 里的 `checkpoint(...)`、`confirm-books`、`confirm-book`、`confirm-single-chapter`、`confirm-chapters`、`replace`/`replace-one`、`confirm-book-replace`、`apply-format`；
     - `confirm-group`、`confirm-single-chapter`、`confirm-chapters` 里只为恢复记录构造的 `after` 变量也一并删除；
     - 删除书架菜单和书籍菜单里的 `["history", "误操作恢复", "recovery"]`，删除 `if (kind === 'recovery')`，初始状态里删除 `recovery: []`；
     - `createRecoveryFlows` 改成 `createBackupFlows`，`recoveryFlows.backup()` 改成 `backupFlows.backup()`；
     - 全书替换确认的文字改为 ``将修改 ${pendingReplace.length} 章、${total} 处匹配。``（撤销说明在任务 1.6 里补）；
     - 清理缓存的说明改为"只清理临时文件，不删除书籍、设置或备份。"；
     - `import { checkpoint, clone } …` 只保留仍在用的名字。
  6. **`autosave.ts` 第 8 行**：`persistentFields` 去掉 `'recovery'`。
  7. **`ui/icons.ts`**：删掉 `History`。
  8. **README**：第 3 行去掉"误操作恢复"。
- **测试**：按第 12 节"任务 1.1"改。
- **完成标准**：
  - 运行 `grep -rnE "recovery|恢复记录|误操作" app tests README.md`，只剩和"兼容版本 1 旧备份"有关的结果：`decodeBackup` 里删除旧字段的代码，以及 `backup.spec.ts` 里验证旧备份、验证"导出不含 recovery"的用例；
  - 全量测试通过。

### 任务 1.2 数据定义收进 schema.ts

- **改哪里**：
  - 新建 `app/data/schema.ts`，草稿见附录 E；
  - `app/features/backup/model.ts`：校验函数搬走；
  - `app/prototype.js`：初始状态。
- **怎么做**：
  1. 按附录 E 实现以下内容：
     - 类型、默认值、`TOOL_IDS`、`FIELD_ROWS`、`SESSION_KEYS`、`BACKUP_FIELDS`；
     - 行 id 和行内容函数、`metaRows`、`toRows`、`fromRows`；
     - `normalizeLibrary`、`normalizeSession`、`assignLibraryOrder`、`nextLibraryOrder`；
     - `validateLibrary`：从 backup/model.ts 搬过来，工具名单改用 `TOOL_IDS`，restorePoint 可以没有；
     - `snapshotLibrary`：由 `librarySnapshot` 改名搬来；
     - `migrateRows`。
  2. `backup/model.ts` 改为从 schema 导入 `validateLibrary`、`snapshotLibrary`、`BACKUP_FIELDS`。
  3. `prototype.js` 的初始状态改为 `{ ...UI 默认值, ...emptyLibrary(), ...DEFAULT_SESSION }`。UI 默认值包括：`batch: false, selected: new Set(), chapterBatch: false, selectedChapters: new Set(), settingTab: '基础', layout: false, readerControls: false`。
  4. 这一步先**不接入** autosave。
- **测试**：新建 `tests/schema.spec.ts`，全部是纯函数用例：
  1. **往返**：用 `{ ...emptyLibrary(), books, groups }` 构造 library，books 和 groups 与 `tests/seed.ts` 相同（章节要带上 id），再给第 1 本加一个 `data:image/png;base64,aGVsbG8=` 封面。`fromRows(new Map(toRows(lib).map(row => [row.id, row.value])))` 得到的 library，和 `normalizeLibrary(lib)` 深相等。
  2. **迁移**：准备一组版本 1 的行，要包含：
     - `recovery` 行；
     - 书行里内嵌 `image` 和 `tone: 'rose'`；
     - 一章标题为 `"第1章\n归途"`；
     - `reading` 里有一个指向不存在的书的条目；
     - `editing` 里有一个指向不存在的章节的条目；
     - `prefs` 里带 `autoScroll` 和 `punctuation`。

     `migrateRows` 之后应满足：
     - upserts 的最后一项是 `{ id: 'schema', value: '2' }`；
     - deletes 包含 `recovery`；
     - 有 `cover:1`；
     - `book:1` 的内容不含 `image` 和 `tone`；
     - 该章标题变成 `"第1章 归途"`；
     - 两个无主条目没了；
     - prefs 里不再有那两个旧键。
  3. **可重复执行**：把第 2 条的结果应用到行表上，再跑一次 `migrateRows`，只剩 schema 一项 upsert，没有 delete。
  4. **`normalizeSession`**：
     - 书不存在 → page 回到 `home`；
     - tab 为 `read`、page 为 `editor` → `home`；
     - 章号越界 → 夹到最后一章。
  5. **`validateLibrary` 能拒绝**：重复的书 id、引用不存在的分组、工具栏里有未知工具、非法颜色值。
- **完成标准**：新测试和全量测试都通过。

### 任务 1.3 分批读取本地数据库（C-02）

- **改哪里**：`app/data/storage.ts`，草稿见附录 F
- **怎么做**：
  - `Storage.read()` 改为返回 `Map<string, string>`，原来返回的是数组。
  - 新增并导出纯函数 `planReadBatches(index, limits = READ_LIMITS)`：
    - 单行超过 400 000 个字符的，归入"大行"，照旧用 `substr` 分片读取；
    - 其余的行按"每批总字符数不超过 1 000 000、不超过 500 行"分批，每批执行一条 `SELECT id, value FROM records WHERE id IN (?,…)`；
    - 每批返回的行数必须等于请求的 id 数，否则抛错"无法读取本地记录"。
  - 新增并导出 `commitInBatches(storage, upserts, deletes, maxChars = 1_000_000)`：
    - upserts 按总字符数分批提交；
    - 所有 deletes，以及 id 为 `schema` 的那一行，放在最后一批。
  - IndexedDB 分支：把 `getAll()` 的结果转成 Map。
  - `openStorage()` 改为只打开一次，原生端打开前先对齐连接表，写法见附录 F 里的 `openStorage`。原因：恢复备份后会 `location.reload()`，原生端的旧连接还在，直接 `createConnection` 会报"连接已存在"；任务 1.10 的错误页也要再调用一次 `openStorage()`。
  - `autosave.ts` 第 34 行随之改成 `let saved = await storage.read();`（返回值已经是 Map，不用再转）。任务 1.4 会重写这一段。
- **测试**：新建 `tests/storage.spec.ts`，全部是纯函数用例：
  1. `planReadBatches` 的边界情况：
     - 总数正好 1 000 000 时仍为一批；
     - 501 个小行分成两批；
     - 一个 500 000 字符的行进入 large；
     - 空表时 batches 和 large 都为空。
  2. `commitInBatches`：用一个假 storage 记录每次调用，断言 schema 行和所有 deletes 都在最后一次调用里，并且每批都不超限。
- **完成标准**：测试通过。安卓上的实际效果，由用户在真机上验收（见第 13 节）。

### 任务 1.4 自动保存改用 schema，只写有变化的行（C-02、C-05、E-02、E-05）

- **改哪里**：`app/data/autosave.ts`，草稿见附录 G
- **怎么做**：
  1. **读库**：
     - `rows = await storage.read()`；
     - 空库：写入 `toRows(emptyLibrary(), DEFAULT_SESSION)`；
     - `rows.get('schema') === '1'`：先 `migrateRows(rows)`，再 `commitInBatches` 提交，然后把结果应用到 rows 上；
     - `Number(schema) > 2`：抛错"数据库版本比当前应用新，请更新墨页后再打开；本机数据未被修改。"；
     - 其他不是 `'2'` 的情况：抛错"不支持的数据库版本，未覆盖原数据"；
     - 然后 `fromRows(rows)`，得到 library、session、orphanRows；有孤儿行就 `storage.commit([], orphanRows)` 删掉；
     - 把 library 的各字段和 session 的 5 个键写到 initial 上；
     - **之后不再保留 rows**：删掉原来的 `saved`（整库 JSON 副本），全库在内存里不再有两份。
  2. **保存**：删掉 `saved`、`dirtyAllBooks`、`snapshot()`，改用附录 G 的"跟踪表 + 只写有变化的行"：
     - 新加的书：写入它的全部行；
     - 删掉的书：删除它的全部行；
     - 书的章节列表变了：写书行和新增章节的行，删掉被移除章节的行；
     - 章节内容变了：只写这一章；
     - 封面变了：只写封面行。
  3. **session**：`tab`、`page`、`folder`、`book`、`chapter` 这 5 个顶层键被赋值（且值有变化）时，标记 `session` 字段待保存；保存时把 5 个值写成一行 `session`。
  4. **护栏（E-02、D-43）**：在 Proxy 的两个 set 处理里（嵌套对象的和 state 顶层的），如果新值是数组，存入 `value.map(unwrap)`，保证原始数据里不混进代理对象。
  5. **`replaceLibrary(value)`**：写入 `toRows(normalizeLibrary(value), DEFAULT_SESSION)`，删除其他所有行，然后重新初始化跟踪表，见附录 G 末尾。必须先规范化，因为版本 1 的备份里没有 `readSort` 这类新字段。恢复备份后页面会 `location.reload()`，回到写作书架；`backup.spec.ts` 里恢复之后断言 `.books` 可见，依赖的就是这一点。
  6. **`report()`**：除了更新徽标，再派发 `document.dispatchEvent(new CustomEvent('moye:save-state', { detail }))`，detail 的取值为 `'dirty' | 'saving' | 'saved' | 'failed'`（任务 4.12 会用到）。
- **测试**：
  - 新建 `tests/migration.spec.ts`：
    - 用自定义种子写一套版本 1 的行，包含 recovery 行、内嵌封面、带换行的标题、无主的 reading 条目；
    - 打开应用，等到"已保存"；
    - 在页面里读 IndexedDB，断言：没有 recovery 行；有 `cover:1`；`book:1` 不含 image；schema 为 `'2'`；标题已修正；无主的 reading 已删；
    - 刷新（刷新后调用 `toShelf`，见任务 1.5），书和封面都正常显示。
  - 新建 `tests/write-scope.spec.ts`（C-05）：
    - 用默认种子打开应用，等到"已保存"（此时迁移已经完成）；
    - 替换 `IDBObjectStore.prototype.put`，记录写入的 id；
    - 新建一本书，等到"已保存"；
    - 断言写入的 id 只有 `book-order`、`book:<新 id>`，可能还有 `session`，没有任何 `chapter:` 开头的 id，也没有 `book:1`、`book:2`、`book:3`。
  - 从这一步起，刷新后会回到上次的页面（C-11），很多用例需要加 `toShelf`，见任务 1.5。**1.4 和 1.5 放在同一个提交里。**
- **完成标准**：全部测试通过（包括 1.5 的改动）。

### 任务 1.5 刷新后回到原处（C-11、D-10），以及测试辅助函数

- **改哪里**：`app/prototype.js`、`tests/seed.ts`，以及第 12 节"任务 1.5"列出的测试
- **怎么做**：
  1. `prototype.js` 不用加代码：autosave 已经把 session 恢复到 state 上，首次 `render()` 就会进入对应的页面。只需确认两点：
     - `state.page === 'editor'` 时，能恢复光标；
     - `state.page === 'reader'` 时，能恢复阅读位置。

     这两处都是现有逻辑。
  2. 在 `tests/seed.ts` 里增加并导出 `toShelf(page, tab = 'edit')`，代码见附录 H。
  3. 按第 12 节的清单，凡是刷新后要从书架开始操作的地方，都加上 `await toShelf(page)`。
  4. 新建 `tests/session.spec.ts`，4 个用例：
     1. 编辑第 2 章 → 刷新 → 直接回到第 2 章的编辑器，标题正确；
     2. 在阅读器里滚到第 2 章 → 刷新 → 直接回到阅读器第 2 章（页脚第一个 span 为"第2章  旧书店"）；
     3. 在"阅读"书架刷新 → 仍然在"阅读"书架（`.bottom-nav .active` 里含"阅读"）；
     4. 删除当前的书，等到"已保存"后刷新 → 回到书架。
- **完成标准**：全部测试通过。

### 任务 1.6 删除和全书操作的短时撤销（D-02、D-03、D-04、C-12）

- **改哪里**：
  - `app/features/editor/history.ts`
  - 新建 `app/features/editor/book-undo.ts`（附录 I）
  - `app/prototype.js`
  - `app/styles.css`（提示条部分）
- **怎么做**：
  1. **撤销只管当前这一章（D-02）**：
     - `ChapterHistory` 增加 `clear()` 方法：清空 `histories`、`active`，把 `bytes` 归零。
     - `prototype.js` 增加：
       ```js
       let historyChapterId = null;
       function resetHistory(id = null) {
         if (historyChapterId === id) return;
         history.clear();
         historyChapterId = id;
       }
       ```
     - `render()` 里 `disposeReadingEditing()` 之后加一行：`if (state.page !== 'editor') resetHistory();`
     - `renderEditor()` 里，在 `if (!c) {…}` 这段之后、`app.innerHTML = …` 之前加一行：`if (!reader) resetHistory(c.id ??= crypto.randomUUID());`。放在这里，是为了让后面的 `updateHistoryTools()` 按清空后的记录计算按钮状态。布局模式在函数开头就 return 了，走不到这里，所以进出"页面布局"不会清空撤销。
     - `commitBody(value, target)`：只有 `state.page === 'editor' && target === chapter()` 时，才调用 `history.record(...)`。
  2. **全书操作的撤销（D-03）**：
     - 新建 `book-undo.ts`，见附录 I。
     - `apply-format` 动作：`arg === 'book'` 时是全书排版，应用之后调用 `rememberBookChange({ bookId: state.book, label: '全书排版', changes: 由 changes 映射成 { chapterId, before, after } })`。本章排版不记录。
     - `confirm-book-replace` 动作：应用之后调用 `rememberBookChange({ bookId: state.book, label: '全书替换', changes: … })`。确认框文字改为 ``将修改 ${n} 章、${total} 处匹配。离开这本书之前，可以在书籍菜单里撤销。``
     - `book-menu` 动作：如果 `pendingBookUndo(state.book)` 有值，在菜单最前面加一项 `["undo-2", "撤销" + entry.label, "undo-book-change"]`。
     - 新增动作 `undo-book-change`：
       1. `const entry = takeBookUndo(state.book); if (!entry) return;`
       2. 逐章比对：当前正文等于 `after` 的，改回 `before`；否则计入 skipped；
       3. `closeSheet(); render(); await saveNow(state);`
       4. 提示：没有跳过时为 `已撤销${entry.label}`；有跳过时为 `已撤销${entry.label}，${skipped} 章之后改过，没有撤销`。
     - `render()` 开头加：`const pending = currentBookUndo(); if (pending && (state.page === 'home' || pending.bookId !== state.book)) clearBookUndo();`
  3. **提示条支持"撤销"按钮（D-04）**：
     - 实现 `toast(message, action?)`，写法见附录 I：
       - 带按钮时停留 5 秒；
       - 不带按钮时停留 `Math.min(8000, Math.max(2600, message.length * 120))` 毫秒；
       - 按钮的 `data-action="notice-action"`，点击后执行回调并隐藏提示条。
     - CSS：
       ```css
       #notice.with-action { pointer-events: auto; display: flex; align-items: center; gap: 12px; }
       .notice-action { color: inherit; font: inherit; font-weight: 700; text-decoration: underline; min-height: 44px; padding: 0 8px; }
       ```
  4. **删除后 5 秒内可撤销（D-04），并清理位置数据（C-12）**：
     - `confirm-book`、`confirm-books`：
       1. 删除前记下每本书的对象、原下标、`state.reading[id]`，以及它的章节在 `state.editing` 里的条目；
       2. 删除后 `delete state.reading[id]`，并对每个章节 id 执行 `delete state.editing[章节id]`；
       3. 调用 `toast(文案, { label: '撤销', run })`。文案：一本书时为 `已删除《${name}》`，多本时为 `已删除 ${n} 本书`；
       4. `run` 的内容：如果书已经回来了，就什么也不做；否则按原下标把书插回 `state.books`，写回位置数据，然后 `render()`。
     - `confirm-single-chapter`、`confirm-chapters`：
       1. 记下被删章节的对象和原下标，以及它们在 `state.editing` 里的条目；
       2. 删除后清理对应的 `state.editing` 条目；
       3. 提示 `已删除 ${n} 章`；
       4. 撤销时按原下标升序插回；如果这本书已经不存在，就什么也不做。
     - `updateChapters(next)` 改成 `updateChapters(next, b = book())`，这样撤销时可以指定是哪本书。
     - 四处确认文案：

       | 位置 | 文案 |
       |---|---|
       | 删一本书 | `删除《${name}》及其章节？删除后 5 秒内可以撤销。` |
       | 删多本书 | `删除选中的 ${n} 本书？删除后 5 秒内可以撤销。` |
       | 删一章 | `确定删除《${name}》？删除后 5 秒内可以撤销。` |
       | 删多章 | `删除选中的 ${n} 个章节？删除后 5 秒内可以撤销。` |

     - `confirmSheet` 的按钮区改成下面这样。样式在第 3 批统一，这里先保证能用：
       ```html
       <div class="sheet-actions">
         <button class="text-action" data-action="sheet-back">取消</button>
         <button class="primary danger" data-action="${action}">确认删除</button>
       </div>
       ```
- **测试**：按第 12 节"任务 1.6"改：改写 3 个；新建 `tests/undo.spec.ts`，新增 5 个。
- **完成标准**：全部测试通过。

### 任务 1.7 字数（U-14、C-06、D-11、D-12）

- **改哪里**：`app/features/editor/text-tools.ts`、`app/features/editor/word-count.worker.ts`、`app/features/editor/word-count.ts`、`app/prototype.js`
- **怎么做**（代码见附录 J）：
  - 新增三个函数：
    - `countWords(text)`：统计除空白以外的字数；
    - `wordsOf(chapter)`：用 WeakMap 缓存，正文字符串没变就直接返回上次的结果；
    - `bookWords(book)`：全书字数。
  - `prototype.js` 里：
    - 所有 `count(c.body)` 换成 `wordsOf(c)`；
    - 所有 `total(b)` 换成 `bookWords(b)`；
    - 编辑器"本章字数"的初始值用 `wordsOf(c)`；
    - 删掉 `const count = countCharacters;` 和 `total`。
  - worker 改用 `countWords`；`word-count.ts` 里没有 Worker 时的兜底（原来调用 `countCharacters`）也改用 `countWords`。
  - `countCharacters` 保留，导入预览里的"字符（含标题和空白）"仍然用它。
- **测试**：
  - 在 `editor-performance.spec.ts` 的 'character count…' 用例里加一条断言：`countWords('　　第一段\n\n第二 段😀')` 等于 7；
  - 在 `undo.spec.ts` 旁新建 `tests/words.spec.ts`，写一个界面用例：把第 1 章的正文整体替换为（`fill`）`甲 乙\n丙`，徽标显示 3；返回目录后，这一章显示"3 字"。
- **完成标准**：测试通过。

### 任务 1.8 封面压缩（C-04、D-13）

- **改哪里**：
  - 新建 `app/features/covers.ts`（附录 K）
  - `app/prototype.js`：`cover-file` 的 change 处理，以及首屏之后的空闲压缩
- **怎么做**：
  - **选图时**：
    1. 禁用 `#book-form` 的提交按钮；
    2. 调用 `compressCover(file)`；
    3. 成功时 `formImage = 结果`，并更新预览；失败时提示"无法读取这张图片，请换一张"；
    4. 无论成功与否，最后恢复提交按钮。
  - **首次 `render()` 之后**：
    - 用 `requestIdleCallback`；没有这个 API 时，用 `setTimeout(…, 1500)`；
    - 逐本处理 `image.length > 300_000` 的书：`compressCover(await (await fetch(image)).blob())`，结果更短才替换 `book.image`；
    - 一次只处理一本，处理完再排下一本。
- **测试**：新建 `tests/covers.spec.ts`：
  1. 在页面里用 canvas 生成一张 2000×3000 的 PNG，转成 Buffer；
  2. 新建书籍时通过 `#cover-file` 上传，等封面预览（`.cover-picker img`）出现后，再填书名、点创建（压缩期间提交按钮是禁用的）；
  3. 保存后读 IndexedDB 的 `cover:<id>`：内容以 `"data:image/jpeg` 开头，长度小于 200 000。
- **完成标准**：测试通过。

### 任务 1.9 渲染不再写数据（E-02 护栏、D-43）

- **改哪里**：`app/prototype.js`、`app/features/txt/flows.ts`
- **怎么做**：
  - `libraryItems()` 里删掉给 `libraryOrder` 赋值的两行，排序改为 `(a.item.libraryOrder ?? Infinity) - (b.item.libraryOrder ?? Infinity)`。现在读库时 `normalizeLibrary` 已经补齐了顺序。
  - 以下 4 处创建或移动书籍、分组的地方，用 `nextLibraryOrder(state, 目标分组)` 设置 `libraryOrder`：
    1. 新建书籍（`submit` 处理，`book-form`）；
    2. 新建分组（`submit` 处理，`simple-form`，kind 为 group）；
    3. 导入 TXT（`txt/flows.ts`）；
    4. 移动到分组（`move-to`，按目标分组逐本设置）。
  - 新建书籍和导入 TXT 时不再写 `tone`。
- **测试**：在 `tests/write-scope.spec.ts` 里新增一个用例：
  1. 打开首页，等到"已保存"；
  2. 开始记录 IndexedDB 的写入（写法同任务 1.4 的用例）；
  3. 点 `[data-action="tab:read"]` 和 `[data-action="tab:edit"]`，来回切换 3 次，然后等 2.5 秒；
  4. 写入的 id 只能是 `session`。
- **完成标准**：测试通过。

### 任务 1.10 读库提示和原始数据导出（C-02 体验、E-05 兜底）

- **改哪里**：`app/main.ts`、`app/styles.css`
- **怎么做**：
  - 在 `start()` 里、导入 prototype.js 之前，设一个 300 毫秒的定时器：到时如果 `#app` 还是空的，写入 `<p class="boot" role="status">正在打开书库…</p>`。导入完成后清掉定时器。
  - CSS：`.boot { padding: 40vh 24px 0; text-align: center; color: var(--muted); }`
  - 错误页加一个按钮"导出原始数据"：
    1. 用 `openStorage()` 打开数据库，调用 `read()` 读出全部行；
    2. 生成 `{ format: 'moye-raw-rows', exported: new Date().toISOString(), rows: [...map] }`；
    3. 用 `saveDocument(文件名, JSON.stringify(内容), 'application/json')` 保存，文件名为 `墨页原始数据-YYYY-MM-DD.json`，日期按本地时区；
    4. 成功或失败都在按钮下方显示一句结果。
- **测试**：不加自动化测试，这两处的触发条件都不好稳定地模拟。
- **完成标准**：手动把数据库的 schema 改成 '9' 后刷新，能看到错误页和导出按钮；导出的文件能打开。

### 任务 1.11 清理设置里的无效项（U-06、E-04 部分）

- **改哪里**：`app/ui/settings.ts`、`app/features/editor/text-tools.ts`、`app/prototype.js`
- **怎么做**：
  - 删除"正文自动滚动"开关和 `autoScroll` 的类型；
  - `FormatOptions` 去掉 `punctuation` 字段和相关注释；
  - `EditorPreferences`、`ReaderPreferences` 改为从 schema 导入 `Prefs`、`ReadPrefs`。
- **测试**：按第 12 节"任务 1.11"改。
- **完成标准**：`grep -rnE "autoScroll|punctuation" app tests` 结果为空。

### 任务 1.12 本批收尾

- 运行全量测试和 `npm run build`；跑一遍 `scale.spec.ts`，把新数字记进 progress.md，并和基线对比。
- 推送，开 PR，CI 通过后合并。
- 把第 13 节"第 1 批"的验收项告诉用户。重点提醒：**安装新版之前，先在旧版里导出一次完整备份**。

---

## 7 第 2 批：拆分 prototype.js（分支 batch-2-split）

**原则**：只搬家，不改行为。每一步做完，全量测试都必须通过。

### 目标结构

```
app/
  main.ts            启动、错误页
  app.ts             组装：创建 state 和 ctx，创建各页面模块，合并动作表，安装监听，首次渲染
  core/
    dom.ts           $、$maybe、$$、esc
    state.ts         AppState 类型（schema 的 Library + session 的 5 个键 + 界面状态），createInitialState()
    context.ts       Ctx 接口、ActionHandler、PageModule 类型
    actions.ts       动作注册与分发（取代 action() 的 if 链），全局 click 代理
    router.ts        render()：按 state.page 分派到页面；页面切换动画；dispose 钩子
    toast.ts         提示条
    library.ts       数据小工具：updateChapters、nextLibraryOrder 的包装、book()/chapter()
  kit/
    ui.ts            模板函数：icon、ib、toolMenu、confirmSheet 的 HTML、cover（第 3 批扩充）
  pages/
    shelf.ts         两个书架、分组、批量管理、书架菜单、新建/移动/删除书籍
    me.ts            "我的"页（第 4 批改成设置页）
    chapters.ts      章节列表、章节管理、书籍菜单、删除章节、全书排版和撤销、键盘排序
    editor.ts        编辑器：工具栏、输入与撤销、查找替换、一键排版、字数、更多工具、各项设置动作
    reader.ts        阅读器：挂载连续阅读、控制栏、夜间、阅读设置、上一章/下一章、阅读区点击
    layout.ts        页面布局编辑
  features/
    appearance.ts    applyAppearance
    directory.ts     目录面板和跳章
    search/search-ui.ts  各种搜索面板和结果处理
    native/android.ts    返回键、切后台保存
    backup/ editor/ reader/ txt/ covers.ts（已有，不变）
  ui/
    forms.ts         书籍表单、简单输入表单、封面选择、表单提交处理
    settings.ts sheets.ts（不变）
```

**写法**：沿用现有的工厂模式（`createSettings`、`createTxtFlows` 就是这样写的）。
- 每个页面模块导出 `createXxxPage(ctx)`，返回 `PageModule`：`{ actions, install?, render? }`；
- app.ts 依次创建这些模块，把 actions 合并进动作表，并调用 `install()` 安装事件监听；
- 跨页面要用的能力（例如编辑器的 `commitBody`、`locateText`，阅读器的 `session()`），由 app.ts 在模块创建完成后挂到 `ctx.editor`、`ctx.reader` 上。

接口草稿见附录 L。

### 任务 2.1 基础模块

- 新建 `core/dom.ts`、`core/state.ts`、`kit/ui.ts`，把 `icon`、`ib`、`toolMenu` 原样搬过去，`prototype.js` 改为从这些文件 import。
- `ib()` 里按动作名改标签的特殊处理（第 35 行）删掉，改为在调用处直接传正确的标签。阅读器顶栏的全文搜索按钮传 `"本书搜索"`。

### 任务 2.2 动作表

- 在 `prototype.js` 内部，把 `action()` 的 if 链改成 `const handlers = { tab(arg) {…}, … }` 映射，再加一个 `dispatch(a)`。
- 函数开头那段"切换页面前先 dispose"的判断，放进 `dispatch`。
- 多个 kind 共用一个分支的（`replace`/`replace-one`、`global-search`/`book-search`/`chapter-search`、`chapter`/`jump-chapter`），用同一个函数注册多次。
- 行为必须和原来完全一致。

### 任务 2.3 核心模块

- 新建 `core/actions.ts`、`core/toast.ts`、`core/router.ts`、`core/context.ts`。
- **router**：
  - `render()` 包含原 `render` 的内容，加上页面切换动画（原来第 1528-1591 行的 IIFE）。
  - 改为在 `render()` 内部前后各取一次快照，不再重新给函数赋值。
- **把所有渲染入口统一起来**：
  - 所有直接调用 `renderEditor()`、`renderLayout()`、`renderChapters()` 的地方，都改成 `ctx.render()`。
  - 原来的 `render` 会自动分派到这些函数，所以行为不变。
  - `finish-layout` 之后再设 `scrollTop` 的写法保留。
- **dispose**：原来的 `disposeReadingEditing()` 拆成各模块自己登记的钩子（`ctx.onDispose(fn)`）：
  - 编辑器：pendingInput、字数计时器和 worker、disposeEditor；
  - 阅读器：`readerSession.destroy()`。

  router 在每次 render 之前调用 `ctx.dispose()`；dispatch 里原来那段判断，也改成调用 `ctx.dispose()`。

### 任务 2.4～2.10 按页面搬家

每搬一个页面，跑一次全量测试并提交一次：

| 任务 | 新文件 | 从 prototype.js 搬过去的内容 |
|---|---|---|
| 2.4 | `pages/shelf.ts`、`pages/me.ts` | `cover`（放进 kit/ui.ts）、`nav`、`folderItem`、`libraryItems`、`enableLibrarySort`、`render` 里的书架和"我的"两部分；以及动作：`tab`、`home`、`view`、`folder`、`book`、`home-menu`、`new-book`、`edit-book`、`choose-cover`、`new-group`、`group-menu`、`rename-group`、`delete-group`、`confirm-group`、`batch`、`select-all`、`move`、`move-to`、`delete-books`、`confirm-books`、`title-search`、`found-book`、`cache`、`clear-cache`、`about`、`import`、`backup` |
| 2.5 | `pages/chapters.ts`、`core/library.ts` | `renderChapters`、`reindexChapterRows`、`updateChapters`（放进 library.ts）、`updateChapterSelection`、`manageChapters`、键盘排序的 keydown 监听；以及动作：`chapters`、`chapter`、`new-chapter`、`book-menu`、`details`、`delete-book`、`confirm-book`、`manage-chapters`、`finish-chapters`、`select-chapter`、`select-all-chapters`、`invert-chapters`、`delete-chapter`、`confirm-single-chapter`、`delete-chapters`、`confirm-chapters`、`format-book`、`undo-book-change`、`export-book` |
| 2.6 | `pages/editor.ts`、`features/appearance.ts`、`features/directory.ts` | `renderEditor` 的编辑分支、`toolbar`、`updateHistoryTools`、`commitBody`、`locateText`、`applyFormat`、字数调度、`resetHistory`；组合输入、快捷键撤销、`beforeinput`、`input`、`change` 里编辑器相关的部分；动作：`tool`、`editor-menu`、`apply-format`、`replace`、`replace-one`、`confirm-book-replace`、`settings`、`grid`、`line`、`pref`、`theme-*`、`export`；`applyAppearance` 放进 appearance.ts；`directory` 和动作 `directory`、`directory-sort`、`jump-chapter` 放进 directory.ts |
| 2.7 | `pages/reader.ts` | `renderEditor` 的阅读分支（改名为 `renderReader`）、`nightLabel`、阅读区点击（`readingPointer`、`isReadingTap` 和 click 里对应的部分）、`input` 里阅读进度条和亮度的部分；动作：`reader-step`、`night`、`reader-settings` |
| 2.8 | `pages/layout.ts` | `layoutSettings`、`layoutToolbar`、`renderLayout`、`slotPicker`；动作：`layout`、`finish-layout`、`reset-layout`、`slot`、`remove-tool`、`add-slot`、`choose-tool` |
| 2.9 | `features/search/search-ui.ts` | `search`、`searchBooks`、`searchResults`，搜索相关的模块变量，弹层 close 监听里的搜索部分；动作：`global-search`、`book-search`、`chapter-search`、`search-page`、`match-hit` |
| 2.10 | `ui/forms.ts`、`features/native/android.ts` | `bookForm`、`inputForm`、`confirmSheet`（HTML 放进 kit/ui.ts）、`change` 里的封面选择、`submit` 监听；安卓的 `backButton`、`appStateChange` 监听 |

### 任务 2.11 组装入口，删除 prototype.js

- 把剩下的组装代码移到 `app.ts`，删除 `app/prototype.js`；`main.ts` 改为 `await import('./app')`。
- 删除 `tsconfig.json` 里的 `allowJs` 和 `checkJs`。
- `npm run typecheck` 必须 0 错误。类型规则：
  - state 的类型来自 `core/state.ts`；
  - DOM 查询写成 `$<HTMLInputElement>('#query')` 这样的形式标注类型；
  - 确实可能为空的查询，用 `$maybe`；
  - 禁止使用 `@ts-ignore`、`@ts-nocheck`、`@ts-expect-error`；
  - 禁止使用 `any`。唯一的例外是 `schema.ts` 里解析外部数据的函数（`fromRows`、`normalizeLibrary`、`normalizeSession`、`validateLibrary`）的入参，它们接收的是未经校验的 JSON。

### 任务 2.12 清理

- 删除 `app/domain/types.ts`，`history.ts` 改用 schema 的 `Chapter`（`Pick<Chapter, 'id' | 'name' | 'body'>`）；
- 删除没用的变量，例如 `returnFocus`；
- 更新 CLAUDE.md 里的目录说明。

### 任务 2.13 本批收尾

- **测试**：本批不改测试（import 路径变化除外）。
- **完成标准**：
  - `app/prototype.js` 已不存在；
  - typecheck 0 错误；
  - 全部用例通过；
  - 在浏览器里手动走一遍：书架 → 章节 → 编辑 → 阅读 → 我的 → 备份，控制台没有报错。
- 推送，开 PR，合并。

---

## 8 第 3 批：Kit 与纸墨风（分支 batch-3-kit）

从这一批起，文件位置一律以第 2 批的新结构为准。

### 任务 3.1 设计变量与样式重写

- **新建三个文件**：
  - `app/kit/tokens.css`（附录 M 全文）
  - `app/kit/base.css`：基础元素，包括 button、input、svg、标题、焦点框、选区、减少动态效果
  - `app/kit/components.css`：组件规格见附录 N

  在 `app/styles.css` 顶部用 `@import` 引入这三个文件。
- **重写 `styles.css`**：
  1. 删掉第 1950 行之后的全部覆盖层，把其中还需要的规则合并回对应的组件或页面区块。
  2. 颜色、字号、圆角、间距一律改用变量。页面 CSS 里不许出现十六进制颜色和 px 字号；边框宽度 1px、1.5px 不受此限。
  3. 删除没用的选择器：`.section-title`、`.sheet-close`、`.sort-row`、`.page-ghost`、`.cover.rose`、`.cover.gray`。
  4. 按页面分节，顺序为：应用外壳、书架、底部导航、章节页、编辑器、阅读器、目录、设置页、页面布局、批量管理、页面切换动画、响应式。
  5. 同一种 `@media` 条件只能出现一次。
- **保持不变**：所有 class 名和 DOM 结构。
- **替换旧变量**：旧变量全部换成附录 M 的新名字，对应关系如下：
  - `--ink`、`--strong-line`、`--accent` → `--c-ink`（按钮、选中状态一律用墨色；朱砂 `--c-seal` 只用在附录 N 标明的地方）；
  - `--muted` → `--c-ink-2`，`--faint` → `--c-ink-3`；
  - `--surface` → `--c-surface`，`--home` → `--c-paper`（任务 3.5 的深色测试依赖 `.home` 用 `--c-paper`）；
  - `--line` → `--c-line`，`--edge` → `--c-edge`，`--press` → `--c-press`；
  - `--danger` → `--c-danger`，`--mark` → `--c-mark`，`--serif` → `--font-serif`。
- **不要改名的运行时变量**：JS 在运行时设置的 `--paper`、`--text`、`--font-size`、`--leading`、`--margin`、`--bottom`、`--body-weight`、`--rule-*`、`--viewport-*`、`--swatch`、`--sample` 保持原名，测试依赖其中的 `--paper`。
- **JS 里对旧变量的引用也要改**：目录里当前章的标题用了内联 `style="color:var(--accent)"`，CSS 还靠 `strong[style]` 选中这一行。改为给当前章那一行加 `class="chapter-row current" aria-current="true"`，去掉内联 style，CSS 选择器相应改为 `.directory-sheet .chapter-row.current`。改完后运行 `grep -rn "var(--" app --include=*.ts`，确认 TS 里没有残留的旧变量名。
- **编辑器里的弹层**：继续跟随纸色，写法见附录 M 末尾。`.app-picker` 不再写死颜色，直接继承 `:root` 的变量。
- **目标**：`styles.css` 加上 kit 的三个 CSS 文件，总行数不超过 1550 行（现在是 2353 行）。
- **测试**：全量测试通过；`chapter-actions.spec.ts` 第 73 行按第 12 节修改。

### 任务 3.2 图标直接输出 svg（C-13、C-07、D-21）

- 新建 `app/kit/icons.ts`（附录 O），`icon(name)` 直接返回 svg 字符串。
- 删除 `app/ui/icons.ts`，以及所有 `icons()`、`renderIcons` 的调用；`ui/sheets.ts` 的 `helpers.icons` 参数一并删掉。
- `updateChapterSelection(index?)`（C-07）：
  - 传了 index 时，只更新这一行和底部计数；
  - 全选、反选时，才遍历所有行（但不再调用 icons）。
- 图标替换（D-21）：
  - 一键排版、全书排版：`pilcrow` → `wand-sparkles`
  - 目录（编辑器工具和阅读器底栏）：`list-tree` → `list-ordered`
  - 网格线：`list-minus` → `rows-3`
  - 底部导航："主页"的 `library` → `feather`，"我的"的 `circle-user-round` → `settings`。导航的文字在第 4 批（4.2）再改。
- 先在 `node_modules/lucide/dist/esm/icons/` 里确认要用的图标都存在，并按附录 O 的说明确认 IconNode 的结构。
- **测试**：新增用例：打开书籍菜单再关闭，章节列表里第一个 svg 仍是同一个 DOM 节点（没有被重建）。

### 任务 3.3 新书封面（V-01、D-17）

- 修改 `kit/ui.ts` 的 `cover(book)`：
  - **没有图片时**，输出：
    ```html
    <div class="cover" style="--cover-bg:var(--cover-N);--cover-ink:var(--cover-N-ink)">
      <span class="cover-label"><strong>书名</strong><i class="cover-seal"></i></span>
      <small>作者 著</small>
    </div>
    ```
    其中 N 由 `coverTone(book.id)` 算出：对 `String(id)` 做 FNV-1a 32 位哈希，再对 8 取余。
  - **有图片时**，和现在一样。
- 题签的样式：
  - 位于封面右上，宽 36%、高 64%；
  - 底色 `var(--c-surface)`，1px 内边框用封面色；
  - 竖排书名，字体 `var(--font-serif)`，颜色 `var(--c-ink)`；
  - 书名下方一个 6×6 的朱砂方块，即 `.cover-seal`。
- 列表模式下题签按比例缩小；网格模式下作者仍然隐藏。
- 书封色的值见附录 M 的 `--cover-0` 到 `--cover-7`。

### 任务 3.4 通用控件（D-18、D-19、U-15 视觉）

- **底部导航**：
  - 通栏平铺，去掉悬浮圆角和阴影；
  - 当前项上方一条 24×2 的朱砂短线；
  - 保持用 `::before` 实现、保持原来的居中方式，`experience.spec.ts` 里的居中测试要继续通过。
- **弹层**：去掉 `dialog:before` 把手；顶部圆角用 `--r-l`；背景用 `--c-surface`。
- **按钮**：
  - `.primary`：墨色底、纸色字；
  - `.primary.danger`：危险色底、白字；
  - `.text-action`：文字按钮，去掉下划线，颜色 `--c-ink`；
  - `.sheet-actions`：两个按钮并排，"取消"在左。
- **提示条**：墨色底、纸色字，圆角 `--r-s`；带按钮时，按钮文字加粗。

### 任务 3.5 应用外壳的深色（U-11、D-15）

- 深色的变量值放在 `tokens.css` 的 `@media (prefers-color-scheme: dark)` 里，并在 `:root` 里写 `color-scheme: light dark`。
- 逐个检查深色下的效果：书架、章节列表、"我的"页、弹层、下拉选择器、提示条、保存徽标。
- `index.html` 的 `theme-color` 改为两条：
  ```html
  <meta name="theme-color" content="#f6f1e7" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#1b1a18" media="(prefers-color-scheme: dark)">
  ```
- **测试**：新增用例：`page.emulateMedia({ colorScheme: 'dark' })` 之后，`.home` 的背景色等于 `rgb(27, 26, 24)`。

### 任务 3.6 配色与字号（V-03、V-06、D-16、D-37）

- **字号**：
  - 最小字号 12px；
  - 阅读页脚、阅读底栏的按钮文字、字数徽标用 13px；
  - 次要文字一律用 `--c-ink-2`。
- **新装默认色（D-16）**：
  - schema 的 `DEFAULT_PREFS`、`DEFAULT_READ_PREFS`：纸色 `#f6f1e7`，字色 `#1f1d1a`；
  - 阅读器日夜主题的默认值：白天 `{ paper: '#f6f1e7', color: '#1f1d1a' }`，夜间 `{ paper: '#1b1a18', color: '#d9d3c7' }`；
  - `nightLabel` 和 `night` 动作里判断夜间的条件加上 `'#1b1a18'`；
  - 已安装用户的设置不迁移。
- **色板**：`ui/settings.ts` 的字色、纸色色板换成附录 M 的纸墨色板，阅读设置用单独的阅读色板。网格线颜色的 5 个色块（`gridSettings` 里）不变，`refinement.spec.ts` 用到其中的 `#989b9d`。
- **预设（D-37）**：
  - "主题"页顶部加 5 个预设按钮，`data-action="theme-preset:0"` 到 `theme-preset:4`；
  - 阅读设置里加同样 5 个，动作用 `read-preset:0` 到 `read-preset:4`；
  - 预设的值见附录 M；
  - 删除原来的"默认背景"三个按钮，以及 `theme-light`、`theme-dark` 两个动作。
- **对比度提示**：
  - 新建 `kit/contrast.ts`，导出 `contrastRatio(a, b)`，按 WCAG 公式计算；
  - 在主题页和阅读设置里，纸色或字色变化后，如果对比度低于 4.5，在色板下方显示：
    ```html
    <p class="contrast-warning" role="status">字色和纸色的对比度只有 ${ratio.toFixed(1)}:1，可能看不清。</p>
    ```
- **测试**：按第 12 节改 2 个用例的色值；新增预设和对比度提示的用例。

### 任务 3.7 工具栏（U-18、D-20、D-21 的长按）

- **溢出渐隐**：
  - 编辑器渲染后，如果 `.editor-tools` 或 `.editor-bottom` 的 `scrollWidth > clientWidth`，给它加 `overflowing` 类；
  - 滚到最右侧时加 `at-end` 类；
  - CSS：
    ```css
    .overflowing:not(.at-end) {
      mask-image: linear-gradient(to right, #000 calc(100% - 24px), transparent);
    }
    ```
- **长按显示名称**：
  - 新建 `kit/long-press.ts`，导出 `onLongPress(root, selector, handler, ms = 500)`：
    - 按住期间移动超过 8px，或者提前抬起，就取消；
    - 触发之后，吞掉随后的那次 click。
  - 工具栏图标、页面布局里的工具图标，长按时调用 `toast(按钮的 aria-label)`。
- **测试**：
  - 360px 宽下，编辑器顶栏有 `overflowing` 类；
  - 长按"撤销"按钮（`page.mouse.down()`，等 600ms，再 `up()`），提示条显示"撤销"。

### 任务 3.8 启动图标、启动页、品牌图（I-01、I-02、I-04、D-22）

- **生成新图标**：按附录 P 运行脚本，生成：
  - `app/public/brand/moye.svg`
  - `android/app/src/main/res/drawable/ic_launcher_foreground.xml`
  - `android/app/src/main/res/drawable/ic_launcher_monochrome.xml`
- **修改**：
  - `res/values/ic_launcher_background.xml` 的颜色改为 `#F6F1E7`；
  - 两个 `mipmap-anydpi-v26/*.xml` 的 foreground 改为 `@drawable/ic_launcher_foreground`。
- **删除**：
  - `app/brand-mark.svg`（`index.html` 的 favicon 同时改为 `/brand/moye.svg`）
  - `res/drawable/ic_launcher_background.xml`
  - `res/drawable-v24/ic_launcher_foreground.xml`
  - 全部 `res/mipmap-*dpi/*.png`（15 张）
  - 全部 `splash.png`（11 张）
- **启动页**：按附录 Q 修改 styles.xml，新建 colors.xml；`MainActivity` 在 `registerPlugin` 之前加一行 `SplashScreen.installSplashScreen(this);`。
- **完成标准**：CI 的安卓构建通过。

### 任务 3.9 本批收尾

- 运行全量测试；
- 用 `scale.spec.ts` 记录新数字，章节列表应该明显变快；
- 推送，开 PR，合并；
- 把第 13 节"第 3 批"的验收项告诉用户。外观由用户来看。

---

## 9 第 4 批：交互（分支 batch-4-ux）

### 任务 4.1 小问题合集（U-19、D-40、D-41）

1. **"暂无书籍"**：只在当前书架既没有书、也没有分组时才显示。
2. **编辑器字体对所有章生效**：
   - `applyAppearance` 不再给第一个 `.manuscript` 写内联 `fontFamily`，改为在 `document.documentElement` 上设置 `--body-font`；
   - CSS 加：`.editor:not(.reader) .manuscript { font-family: var(--body-font, inherit); }`；
   - 宋体对应 `var(--font-serif)`（D-36），不再用 SimSun；
   - 编辑器的字体选项加上"黑体"，对应 `var(--font-sans-cjk)`；schema 的 `Prefs.fontFamily` 同步加上。
3. **备份文件名用本地日期**：新增 `localDate(date = new Date())`，返回 `YYYY-MM-DD`，按本地时区计算。
4. **"关于"**：
   - `vite.config.ts` 顶部加 `const pkg = JSON.parse(readFileSync(resolve(projectRoot, 'package.json'), 'utf8')) as { version: string };`（`readFileSync` 从 `node:fs` 导入；不用 JSON import，免得改 tsconfig），配置里加 `define: { __APP_VERSION__: JSON.stringify(pkg.version) }`；
   - 新建 `app/env.d.ts`，声明 `declare const __APP_VERSION__: string;`；
   - 关于页显示三行："墨页 ${__APP_VERSION__}"、"本地阅读，随心改文"、"所有数据只保存在本机，不联网。"
5. **新建书籍后直接进入**：在写作书架新建书籍后，直接进入这本书的章节页。
6. **输入框自动聚焦**：`inputForm`、书名搜索、各个搜索面板打开之后，调用输入框的 `focus()`。
7. **用词**：
   - 工具名"拷贝正文" → "复制正文"；
   - "书籍名称" → "书名"，涉及表单标签、占位文字、错误提示、封面占位；
   - 工具名"界面设置" → "显示设置"，设置面板的 label 也同步改；`ui/sheets.ts` 里 aria-label 的兜底值 `'界面设置'` 也改为 `'显示设置'`。
8. **返回键（D-40）**：在"写作"书架根目录按返回键时：
   - 距上次按返回键不到 2 秒，退出；
   - 否则提示"再按一次退出"，并记下这次的时间。

测试：第 1、2、3、4、5、7 条各加一个用例（第 3 条写成 `localDate` 的纯函数测试）；返回键只在原生上生效，不测。同时修改 `fresh-install.spec.ts` 和 `refinement.spec.ts`，见第 12 节。

### 任务 4.2 导航、设置页、合并搜索（U-09、D-07、D-08、D-09）

- **底部导航**：三项改为 `["edit", "feather", "写作"]`、`["read", "book-open-text", "阅读"]`、`["me", "settings", "设置"]`。
- **设置页**（tab 为 `me`）：
  - 标题"设置"；
  - 品牌区显示"墨页 ${版本}"和"本地阅读，随心改文"；
  - "数据"分组：导入 TXT（`import`）、完整备份与恢复（`backup`）、清理缓存（`cache`）；
  - "关于"分组：关于墨页（`about`）。
- **写作书架的 ⋮ 菜单**：
  - 根目录：新建书籍、导入 TXT、新建分组、管理作品、切换视图；
  - 分组内：新建书籍、管理作品、切换视图。
- **阅读书架的 ⋮ 菜单**：切换视图、排序（排序见任务 4.10）。
- **放大镜（D-09）**：
  - 打开"搜索"面板，头部两个标签"书名 / 全文"，`data-action` 为 `search-tab:title` 和 `search-tab:text`；
  - 切换标签时保留输入框的内容；
  - "全文"就是原来的"全部书籍搜索"；
  - 两个标签各自记住上次的关键词，只存在内存里；
  - 按钮的 aria-label 改为"搜索"。
- **测试**：
  - `backup.spec.ts` 里的 `menu(page, 'backup')` 改为：点 `[data-action="tab:me"]`，再点 `[data-action="backup"]`；
  - 新增：导航三项的文字；设置页有四行；书架菜单里没有 `backup` 和 `global-search`；搜索面板的两个标签能切换，在"全文"下搜"林舟"能得到结果。

### 任务 4.3 设置分类（U-10、D-29）

- **标签页**：`ui/settings.ts` 的 tabs 改为 `['版面', '字体', '主题', '排版规则']`，默认是"版面"；state 里 `settingTab` 的默认值同步改为"版面"。
- **各标签页的内容**：
  - **版面**：页面布局（行）、网格线（行，右侧显示"已开启"或"已关闭"）、左右边距、正文底部间距。
  - **字体**：字体加粗、字体（系统默认 / 宋体 / 黑体）、字体大小、行间距。
  - **主题**：预设、字体颜色、纸张颜色、对比度提示。
  - **排版规则**：先显示提示"以下规则只在点“一键排版”时使用，不会改变当前显示。"，然后是段落缩进、去除多余空格、段落间隔行数。
- **删除**：设置里的"本章搜索"和"导出文档"两行，这两项在"更多工具"里已经有。
- **测试**：按第 12 节改；新增用例：四个标签名正确；排版规则页有那句提示。

### 任务 4.4 目录（U-01、D-23）

- 打开目录后，对当前章所在行调用 `scrollIntoView({ block: 'center' })`，替换原来的 `scrollTop = 0`。
- 章节数超过 50 时，在目录内容顶部加：
  ```html
  <form id="directory-jump" class="directory-jump">
    <input type="number" inputmode="numeric" min="1" max="${N}" aria-label="跳到第几章" placeholder="跳到第几章">
    <button class="text-action">跳转</button>
  </form>
  ```
  提交后执行 `jump-chapter:${n - 1}`，n 超出范围时夹到有效范围内。在 submit 监听里处理 `#directory-jump`。
- **测试**：
  1. 导入一个 60 章的 TXT（写法参考 `chapter-actions.spec.ts` 第一个用例）；
  2. 打开第 50 章；
  3. 打开目录，第 50 章所在行在可视区内；
  4. 在跳转框输入 10 并提交，进入第 10 章。

### 任务 4.5 章节列表恢复位置（U-02、D-24）

- **记录位置**：在 router 渲染新页面之前，如果上一页是章节页，按书 id 记下 `window.scrollY`，只存在内存里。
- **恢复位置**：`renderChapters` 之后，在 `requestAnimationFrame` 里恢复滚动位置。
- **高亮刚编辑的章**：如果是从编辑器返回，给 `state.chapter` 对应的那一行加 `just-edited` 类，1.2 秒后移除；这一行不在可视区时，调用 `scrollIntoView({ block: 'center' })`。
- `just-edited` 的样式：背景 `--c-press`，左侧 3px 朱砂竖线。
- **测试**：
  1. 用 60 章的书，滚到第 40 章附近，点开这一章；
  2. 返回；
  3. `scrollY` 和之前相差小于 10，并且这一行有 `just-edited` 类。

### 任务 4.6 新建章节（U-03、D-25）

- **`new-chapter`**：追加新章之后，直接进入编辑器，并选中整个标题：
  ```js
  restoreSelection(title, { start: 0, end: name.length, backward: false, field: 'name' }, true)
  ```
- **新建下一章**：编辑器"更多工具"里加一项 `["file-plus-2", "新建下一章", "insert-chapter-after"]`。点它后，在当前章之后插入一章，名字是 `第${新位置 + 1}章`，然后打开这一章并选中标题。
- **工具 `next`**：在最后一章时，新建一章并打开，不再提示"已经是最后一章"。
- **测试**：
  - 新建章节后在编辑器里，并且 `getSelection().toString()` 等于"第4章"；
  - 在第 1 章点"新建下一章"后，章节数加 1，新章在第 2 位。

### 任务 4.7 标题输入（U-04、D-26）

- 标题也设为 `plaintext-only`，和正文在同一处设置。
- **回车**：在 `beforeinput` 监听里，如果目标是标题，并且 `inputType` 是 `insertParagraph` 或 `insertLineBreak`：
  1. `preventDefault()`；
  2. 用 `restoreSelection(body, { start: 0, end: 0, backward: false, field: 'body' }, true)` 把焦点移到正文开头。
- **粘贴**：标题收到 `insertFromPaste` 时：
  1. `preventDefault()`；
  2. 用 `event.dataTransfer.getData('text/plain')` 取出文字，把 `/\s*[\r\n]+\s*/g` 换成空格；
  3. 用 `document.execCommand('insertText', false, 文字)` 插入。这样会正常触发 input 事件，也会记进撤销。
- **测试**：
  - 在标题里按 Enter：标题没有换行，焦点在正文；
  - 用 `dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertFromPaste', dataTransfer, bubbles: true, cancelable: true }))` 模拟粘贴"甲\n乙"：标题变成"甲 乙"。

### 任务 4.8 导入章节到本书（U-05、D-27）

- **入口**：书籍菜单里"导入章节"的动作改为 `import-chapters`，调用 `txtFlows.openImport({ appendTo: book() })`。
- **面板**：
  - 标题"导入章节到本书"；
  - 隐藏书名、作者、重复导入、导入后去向这四项；
  - 确认按钮的文字是"追加到本书末尾"。
- **提交**：
  1. 把解析出的章节追加到这本书末尾：`book.chapters = [...book.chapters, ...parsed.chapters]`；
  2. `await saveNow(state)`；
  3. 失败时把章节列表恢复原样，并显示错误；
  4. 成功后回到章节页，提示 `已追加 ${n} 章`。
- 书架菜单里的"导入 TXT"不变，仍然是新建书。
- **测试**：
  1. 在《雨停之后》里导入一个 2 章的 TXT；
  2. 章节数变成 5，书的数量不变；
  3. 刷新后（刷新后调用 `toShelf`）仍然是 5 章。

### 任务 4.9 查找（U-07、D-28）

- **编辑器查找条**：
  - 在编辑器页，`chapter-search` 打开查找条；在阅读器里仍然打开面板。
  - 新增可选工具 `search`：图标 `search`，名称"本章查找"，要同时加进 schema 的 `TOOL_IDS` 和工具表。默认工具栏不加它。
  - 结构如下，放在编辑器顶栏下面：
    ```html
    <div class="find-bar" role="search">
      <input aria-label="查找本章" placeholder="查找本章" enterkeyhint="search">
      <span class="find-count">0/0</span>
      <button class="icon" data-action="find-prev" aria-label="上一处">(chevron-up)</button>
      <button class="icon" data-action="find-next" aria-label="下一处">(chevron-down)</button>
      <button class="icon" data-action="find-replace" aria-label="替换">(replace)</button>
      <button class="icon" data-action="find-close" aria-label="关闭查找">(x)</button>
    </div>
    ```
  - **行为**：
    1. 打开时输入框自动聚焦，并填入上次的关键词；
    2. 输入后 150ms，在当前章里找出全部位置，最多 5000 处；
    3. 从光标之后的第一处开始；后面没有就从头开始；
    4. 按 Enter 或"下一处"循环前进，"上一处"循环后退；
    5. 定位用 `locateText(offset, length, { focus: false })`：新增的这个参数表示不聚焦正文、不改动文档选区，只设置 CSS 高亮并滚动到位置；
    6. 正文被修改（input 事件）时重新计算；
    7. "替换"打开现有的查找替换面板，并预填关键词；
    8. 关闭查找条，或者离开这一章时，清除高亮。
- **其他搜索面板**（本书、全书、阅读器本章、合并搜索）：
  - 按范围分别记住上次的关键词，只存在内存里；
  - 打开时预填关键词，并立即给出结果；
  - 输入框自动聚焦。
- **测试**：按第 12 节改写 `editor.spec.ts` 里的 'search navigates to second exact occurrence…'；新增：关掉查找条再打开，关键词还在；阅读器的搜索面板重新打开后，关键词还在。

### 任务 4.10 进度与排序（U-12、D-30）

- **记录阅读进度**：阅读器 `update` 回调写入的阅读位置，增加 `percent`（本章进度）和 `at`（`Date.now()`）两个字段；schema 的 `ReadingPosition` 同步加上，并在注释里写明：`percent` 和 `at` 给阅读书架用。
- **书架显示进度**：阅读书架每本书的封面下显示 `<small class="book-progress">读到 ${p}%</small>`，没读过的显示"未读"。计算方法：
  ```
  p = Math.round((章下标 + percent / 100) / 章数 × 100)
  ```
  其中章下标优先用 `chapterId` 查找。
- **排序**：
  - 阅读书架 ⋮ 菜单加一项，文字在"按最近阅读排序"和"按手动顺序排序"之间切换，动作是 `read-sort:recent` 或 `read-sort:manual`，图标用 `arrow-up-down`，保存在 `readSort` 里；
  - 选"最近阅读"时，分组仍排在前面，书按 `reading[id].at` 从新到旧排，没读过的排在最后。
- 页脚的章序"N/M"在第 5 批（任务 5.2）做。
- **测试**：
  - 读过《山海拾记》后切到"最近阅读"，第一本书是它；
  - 进度文字符合上面的公式。

### 任务 4.11 管理（U-17、D-39）

- **管理模式下点分组**：提示 `先点“完成”退出管理`，不退出管理模式。
- **书籍"全选"**：全部选中时，文字变成"取消全选"，图标变成 `square-minus`。
- **长按进入管理**（用 `kit/long-press.ts`，只在写作书架和章节页生效；阅读书架没有管理模式，长按不做任何事）：
  - 长按书：进入管理模式，并选中这本书；
  - 长按章节行：进入章节管理，并选中这一章。
- **移动章节**：章节管理的底栏加"移动"（`move-chapters`，图标 `arrow-up-down`，没有选中时禁用），点开后的面板有三项：
  - 移到最前（`move-chapters-to:first`）；
  - 移到最后（`move-chapters-to:last`）；
  - 移到第 N 章之后：`<form id="move-chapters-form">`，里面是数字输入框和"移动"按钮。

  选中的章节保持原来的相对顺序，整体移动，用 `updateChapters` 实现。
- **测试**：以上 4 条各一个用例。

### 任务 4.12 保存状态点（V-05、D-42）

- 在编辑器字数徽标前面加 `<span class="save-dot" data-state="saved" aria-hidden="true"></span>`。
- 监听 `moye:save-state` 事件：
  - `dirty`、`saving` 时显示朱砂色；
  - `saved` 时显示 `--c-ink-3`；
  - `failed` 时显示危险色。
- 编辑器 dispose 时移除这个监听。
- **测试**：输入之后，点的 `data-state` 变成 `dirty`；稍后变成 `saved`。

### 任务 4.13 快速滚动条（V-07、D-23）

- 新建 `kit/fast-scroll.ts`，导出 `attachFastScroll(target: HTMLElement | Window): () => void`：
  - 在右侧画一个滑块：宽 6px、高 44px，触控区宽 24px；
  - 滚动时出现，停止后 1.2 秒淡出；
  - 可以拖动，按滑块的位置设置 scrollTop；
  - 返回值是解绑函数。
- 用在三处：目录面板的内容区、章节列表页（传 `window`）、编辑器正文的滚动区。阅读器不用，它已经有章内进度条和目录。
- **测试**：打开目录后，页面上有滑块元素；把滑块拖到底部，目录滚到末尾。

### 任务 4.14 章节识别（C-09、D-38）

- 按附录 R 修改 `txt/text.ts`：
  - 识别卷标题；
  - 支持"正文"前缀和括号；
  - 过滤误切（停用词表加标点规则）；
  - 纯数字标题：至少 5 个、八成连号，并且全书没有"第N章"类标题时才启用；
  - 短章太多时给出提醒：结果写在 `parsed.warning` 里，导入预览在 `#txt-summary` 下方用 `.error` 样式显示。
- 必须保持的不变量：所有章节的 `sourceHeading.raw + body` 拼起来，要和原文完全一致。现有的完整性检查保留。
- **测试**：`txt.spec.ts` 原有用例全部通过；新增附录 R 列出的 9 个单元用例。

### 任务 4.15 搜索线程常驻（C-10、D-48）

- 弹层关闭时只调用 `searchClient.cancel()`，不再 `dispose()`。
- 增加空闲计时：最后一次搜索之后 5 分钟，再调用 `dispose()`。
- **测试**：打开搜索 → 搜索 → 关闭 → 再打开并搜索，Worker 只创建过一次。计数方法参考 `refinement.spec.ts` 的最后一个用例。

### 任务 4.16 本批收尾

- 推送，开 PR，合并；
- 把第 13 节"第 4 批"的验收项告诉用户。

---

## 10 第 5 批：阅读器与安卓原生（分支 batch-5-reader）

### 任务 5.1 窗口化阅读（C-03）

- **改写 `reader/continuous.ts`**，算法见附录 S：
  - 章节长度正常时，页面上最多 5 章；
  - 打开时，渲染当前章和前后各 1 章；
  - 离顶部或底部不到 1.5 屏时，一次补够相邻的章（章节很短时会连补几章），前插时按 `scrollHeight` 的变化补偿 `scrollTop`；
  - 超过 5 章时，删掉离可视区 2 屏以外的章，删顶部的章同样要补偿 `scrollTop`；
  - `jump()` 的目标章不在已渲染范围内时，重建一个以它为中心的窗口；
  - 每个 `<article>` 加上 `data-index`；
  - 章内进度的长度统一为"本章高度 − 视口高度"。
- **跳章不再整页重建**：在阅读器页面里：
  - 目录跳章：直接调用 `readerSession.jump(index)`，关闭面板，**不再调用 render()**；
  - 搜索结果：先 `jump(index)`，再 `locateText`，关闭面板，同样不调用 render()；
  - dispatch 里"切换页面前先 dispose"的判断（任务 2.2 从 `action()` 开头搬过去的那段），在阅读器页面遇到 `jump-chapter` 和 `match-hit` 时不再执行。否则阅读器会先被销毁，jump 就落空了。
- **正文只写一次**：`renderEditor` 或 `renderReader` 的模板里，正文位置留空，只用 `textContent` 写一次；阅读器模式下完全不写。
- **测试**：
  - 按第 12 节改 3 个用例，新增 3 个；
  - `scale.spec.ts` 加上限：打开阅读器小于 2000ms，目录跳章小于 1500ms，`.reading-chapter` 不超过 5 个。
  - 如果在 CI 上稳定超出上限，把上限改成实测值的 1.5 倍，并在 progress.md 里说明。

### 任务 5.2 页脚与标签（U-12、U-20、D-30）

- 删除 `.reader-label`，模板和 CSS 都删。
- 页脚右侧改成：
  ```html
  <span><span id="chapter-position">2/3</span> · <span id="progress-value">45%</span></span>
  ```
  `#progress-value` 里只放百分比，测试依赖这一点。换章时更新 `#chapter-position`。
- **测试**：打开时页脚显示"1/3"，跳到第 3 章后显示"3/3"。

### 任务 5.3 阅读排版（V-04、D-36）

- **新增设置**：ReadPrefs 加两项，schema 同步：
  - `fontFamily: '系统默认' | '宋体' | '黑体'`，默认"系统默认"；
  - `tidy: '关' | '紧凑' | '宽松'`，默认"关"。

  阅读设置里加两组分段选择，动作是 `pref:readfontFamily:…` 和 `pref:readtidy:…`。
- **字体和对齐**：
  - 在 `.reader` 上设置 `--reader-font`：系统默认为 `inherit`，宋体为 `var(--font-serif)`，黑体为 `var(--font-sans-cjk)`；
  - CSS：`.reader .manuscript { font-family: var(--reader-font, inherit); text-align: justify; }`。
- **段落整理**：
  - 新增 `displayBody(chapter, tidy)`，按正文字符串缓存结果：
    - 关：原文；
    - 紧凑：`formatText(body, { indent: true, spaces: true, paragraph: 0 })`；
    - 宽松：同上，但 `paragraph: 1`。
  - `mountReader` 增加一个参数 `text: (chapter) => string`，渲染时用它。
  - 阅读器里构造搜索文档、校验搜索结果，也都用 `displayBody`，保证偏移量一致。
  - 修改 tidy 之后重新挂载阅读器，阅读位置由文字锚点恢复。
- **测试**：
  - 选宋体后，正文的 font-family 包含 "Songti SC" 或 "Noto Serif CJK SC"；
  - 选"紧凑"后，显示的文本里没有空行，而编辑器里的原文不变；
  - 正文的 `text-align` 是 `justify`。

### 任务 5.4 点击翻页（U-13、D-31）

- **新增设置**：ReadPrefs 加 `tapPaging: boolean`，默认 true。
- **点击阅读区时**：
  - 控制栏显示中：点哪里都只收起控制栏；
  - 否则按位置处理：上 1/3 回一屏，下 1/3 翻一屏，中间呼出控制栏；
  - `tapPaging` 关闭时，上下两块不响应，中间照旧。
- **翻一屏**：
  ```js
  scroll.scrollBy({ top: ±(clientHeight − 2 × 行高), behavior: 用户开启了减少动态效果 ? 'auto' : 'smooth' })
  ```
  行高取 `parseFloat(getComputedStyle(当前章正文).lineHeight)`。
- **开关**：阅读设置加"点击翻页"开关：
  ```html
  <input class="switch" type="checkbox" data-read-switch="tapPaging">
  ```
  在 change 监听里统一处理所有 `data-read-switch`：`state.readPrefs[key] = el.checked`。
- **测试**：
  - 点下方，scrollTop 增加；
  - 点上方，scrollTop 减少；
  - 点中间，控制栏出现；
  - 关掉开关后点下方，scrollTop 不变。

### 任务 5.5 原生插件（A-02、A-04、A-05、音量键、A-01 的原生部分）

- **改名**：`TextDocumentsPlugin.kt` 改名为 `MoyeNativePlugin.kt`，插件名改为 `MoyeNative`，全文见附录 T。原有的 `saveText`、`clearCache` 原样搬过去。
- **新建 `app/features/native/native.ts`**：这一步先只放附录 U 里的 `MoyeNativePlugin` 类型、`MoyeNative` 和 `isNative`，`syncReader` 在任务 5.6 再加。
- **JS 两处跟着改**：`txt/files.ts` 和清理缓存那里，原来的 `registerPlugin('TextDocuments')` 改为使用 native.ts 里的 `MoyeNative`。
- **新增方法**：
  - `setKeepScreenOn({ on })`
  - `setBrightness({ value })`：value 为 0.01～1，或者 null 表示跟随系统
  - `setImmersive({ on })`
  - `getBattery()`：返回 `{ level, charging }`
  - `setVolumePaging({ on })`
- **新增事件**：
  - `volumeKey`：`{ direction: 'up' | 'down' }`
  - `shareReceived`：`{ name, data }`（data 是 base64），出错时为 `{ error }`
- **`MainActivity.java`**：按附录 T 修改：注册新插件；在 `dispatchKeyEvent` 里拦截音量键。
- **`AndroidManifest.xml`**：按附录 T 加两个 intent-filter。
- 如果编译时提示找不到 `androidx.core` 的类（`WindowCompat`、`IntentCompat` 等），在 `android/app/build.gradle` 的 dependencies 里加一行 `implementation "androidx.core:core:$androidxCoreVersion"`。
- **完成标准**：CI 的安卓构建通过。

### 任务 5.6 阅读器接上原生能力（A-02、A-04、A-05、D-32～D-34）

- 在 `app/features/native/native.ts` 里加上附录 U 的 `syncReader`。不在原生平台时：
  - 常亮、沉浸、音量键都是空操作；
  - 亮度用 CSS `filter` 兜底，只在浏览器预览里用：`applyAppearance` 只在"不是原生平台，并且 `brightnessAuto` 为 false"时才给 `.reader` 加 `filter: brightness(…)`，其余情况去掉 filter；
  - 拖动亮度滑条时，`input` 监听里原来直接给 `.reader` 设 `filter` 的那行（`data-reader-pref` 分支）也按同样的条件处理，再调用一次 `syncReader`。否则手机上会同时调窗口亮度和 CSS 亮度，暗两次。
- **新增设置**：ReadPrefs 加以下四项，schema 同步：
  - `volumePaging`，默认 true；
  - `keepAwake`，默认 true；
  - `immersive`，默认 false；
  - `brightnessAuto`，默认 true。

  亮度滑条的范围改为 5～100；`brightnessAuto` 为 true 时，滑条禁用。
- **同步到原生**：
  - router 的 `render()` 末尾调用 `syncReader(state.page === 'reader' ? state.readPrefs : null)`；
  - 进入阅读器时按设置开启各项；离开时全部恢复：常亮关闭、亮度跟随系统、退出沉浸、不拦截音量键；
  - 阅读设置里的开关或滑条变化后，也调用一次。
- **沉浸时的页脚**：
  - 显示时间，每 30 秒更新一次；
  - 显示电量，每 60 秒调用一次 `getBattery`；网页上不显示电量。
- **音量键**：监听 `volumeKey` 事件，在阅读器里执行和点击翻页相同的翻屏。
- **阅读设置**：加四个开关，分别是"音量键翻页""屏幕常亮""沉浸阅读""亮度跟随系统"。
- **测试**（只测网页上能测的）：
  - 四个开关都存在，切换后会写进 readPrefs，刷新后保持；
  - 打开"亮度跟随系统"后，亮度滑条被禁用。

### 任务 5.7 打开方式与分享导入（A-01、D-35）

- 新建 `app/features/native/share.ts`，导出两个函数：
  - `registerShareHandler(fn)`；
  - `receiveShare(payload)`：把 base64 转成 `File` 交给 fn；`payload.error` 有值时，改为提示这条错误。
- `app.ts` 在首次 `render()` 之后：
  - 无论是否在原生平台，都调用 `registerShareHandler(handler)`（网页上也要注册，测试靠它）；
  - 只有在原生平台上，才调用 `MoyeNative.addListener('shareReceived', receiveShare)`。
- 注册的 handler 做两件事：
  1. 回到写作书架；
  2. 调用 `txtFlows.openImport({ file })`。

  为此 `openImport` 要支持传入 file：用 `DataTransfer` 把它放进 `#txt-file`，然后触发 change。
- **测试**：
  1. 用 `page.evaluate` 导入 `/features/native/share.ts`；
  2. 调用 `receiveShare({ name: '分享.txt', data: btoa(unescape(encodeURIComponent('第一章\n正文'))) })`；
  3. 导入面板出现，并识别出 1 章。

### 任务 5.8 删除无用插件（A-06）

- 运行 `npm uninstall @capacitor/filesystem @capacitor/status-bar`，再运行 `npx cap sync android`。后者会自动更新 `capacitor.settings.gradle` 和 `capacitor.build.gradle`。
- **完成标准**：`grep -rnE "filesystem|status-bar" package.json android/capacitor.settings.gradle android/app/capacitor.build.gradle` 结果为空；CI 通过。

### 任务 5.9 本批收尾

- 推送，开 PR，合并；
- 把第 13 节"第 5 批"的验收项告诉用户。

---

## 11 第 6 批：收尾与发布（分支 batch-6-release）

### 任务 6.1 版本号（A-07、D-46）

- 把 `package.json` 的版本改为 `1.1.0`。
- 在 `android/app/build.gradle` 的 `android {}` 之前加：
  ```groovy
  def appPackage = new groovy.json.JsonSlurper().parse(rootProject.file('../package.json'))
  def appVersion = appPackage.version.tokenize('.').collect { it.toInteger() }
  ```
- 在 `defaultConfig` 里改成：
  ```groovy
  versionCode appVersion[0] * 10000 + appVersion[1] * 100 + appVersion[2]
  versionName appPackage.version
  ```
- **完成标准**：CI 的安卓构建通过；关于页显示 1.1.0（任务 4.1 已经实现）。

### 任务 6.2 清理死代码（E-04 剩余部分）

- 删除 `InputSession` 类，保留 `extractInputEdit`；
- 用 `npx tsc --noEmit --noUnusedLocals --noUnusedParameters` 找出没用的变量并删掉（不要修改 tsconfig）；
- 在全仓查找没被用到的导出、CSS 选择器和图标，一并删掉。

### 任务 6.3 文档

- **README**：
  - 功能列表去掉误操作恢复，加上本次的新功能；
  - 开发命令加上 `npm test`；
  - 数据一节说明：备份格式是版本 2，兼容版本 1；
  - Android 一节说明调试包"墨页测试"可以和正式版同时安装。
- **新建 `CHANGELOG.md`**：写 1.1.0 里用户能看到的变化，按"新增 / 改进 / 移除"分组。
- **CLAUDE.md**：更新目录说明。

### 任务 6.4 最终回归

- 依次运行：`npm run typecheck`、`npm test`（包括 scale）、`npm run build`，并确认 CI 的安卓构建通过；
- 在 progress.md 里汇总性能的前后对比。

### 任务 6.5 交付

告诉用户三件事：
- 第 13 节"发布前"的全部验收项；
- 正式版的构建步骤：按 README 的 Release 步骤，用用户自己的签名；
- **覆盖安装之前，先导出一次完整备份。**

---

## 12 测试改动总表

表中"toShelf"的意思是：在该处 `await page.reload();` 的下一行，加上 `await toShelf(page);`。

### 第 1 批

| 文件 | 用例 | 任务 | 改法 |
|---|---|---|---|
| recovery.spec.ts → 改名 backup.spec.ts | deleted book restores after reload including chapters | 1.1 | 删除 |
| 同上 | format recovery survives reload and later changes force a copy | 1.1 | 删除 |
| 同上 | deleted chapters restore without losing order and record removal needs confirmation | 1.1 | 删除 |
| 同上 | deleted group restores membership after reload | 1.1 | 删除 |
| 同上 | backup restore is complete and can roll back to previous library | 1.1 | 删掉最后两行恢复记录的断言（原第 82-83 行） |
| 同上 | corrupt backup and failed restore never overwrite existing library | 1.1、1.5 | 删掉最后两行恢复记录的断言（原第 114-115 行）；`#recovery-error` 改成 `#backup-error`；第 112 行 reload 后加 toShelf |
| 同上 | backup includes cover, settings, positions and recovery without recursive restore points | 1.1 | 改名为 "backup includes cover, settings and positions without recovery or restore point"。删掉 checkpoint、canRestore、restoreEntry 的部分，改为断言 decode 出来的 data 里没有 `recovery` 和 `restorePoint`，并且 `(await decodeBackup(await encodeBackup(data))).data` 和 data 深相等 |
| 同上 | backup restores embedded covers, preferences and reading position through database | 1.1 | 删掉 `restored.restorePoint...` 那一行，改为：导出里没有 `restorePoint`；打开备份面板时有 `#restore-previous` |
| 同上 | invalid references and future versions rejected, recovery limit never discards older entries | 1.1 | 改名为 "invalid references and future versions rejected"，删掉 checkpoint 循环和上限断言 |
| 同上 | 新增 version 1 backups with recovery records still import | 1.1 | 把一份导出的 payload 包成 version 1、加上 `recovery: [{...}]`，用 `node:crypto` 的 `createHash('sha256').update(payload).digest('hex')` 重新计算 sha256；`decodeBackup` 能成功，结果里没有 recovery |
| editor.spec.ts | undo survives chapter switching and new input invalidates redo | 1.5 | 先只加 toShelf（第 88 行），任务 1.6 再整体改写 |
| storage-performance.spec.ts | checkpoint freezes before and after snapshots | 1.1 | 删除 |
| 同上 | recovery capacity rejection leaves the library unchanged | 1.1 | 删除，同时删掉 import 和 `library()` 函数 |
| 同上 | nested preference changes use the normal persistence path | 1.5 | toShelf |
| schema.spec.ts | 5 个（见任务 1.2） | 1.2 | 新增 |
| storage.spec.ts | 2 个（见任务 1.3） | 1.3 | 新增 |
| migration.spec.ts | 1 个 | 1.4 | 新增 |
| write-scope.spec.ts | 1 个 | 1.4 | 新增 |
| session.spec.ts | 4 个 | 1.5 | 新增 |
| chapter-actions.spec.ts | dragging a scrolled chapter list retains viewport and persists order | 1.5 | toShelf（第 28 行） |
| 同上 | chapter swipe reveals deletion, cancel preserves and confirm deletes | 1.5 | toShelf（第 55 行） |
| 同上 | whole book formatting applies immediately without a batch undo entry | 1.6 | 改名为 "whole book formatting applies immediately and can be undone from the book menu"。先打开第 1 章记下正文，回目录后执行全书排版：`#sheet` 不可见；再打开书籍菜单，`[data-action="undo-book-change"]` 可见、文字是"撤销全书排版"；点它之后，打开第 1 章，正文和记下的一致。然后回目录再执行一次全书排版，回书架、再进这本书，打开书籍菜单，这一项已经没有了（验证"离开这本书就失效"） |
| editor.spec.ts | undo survives chapter switching and new input invalidates redo | 1.6 | 改名为 "undo history is cleared after leaving the chapter"。流程：第 1 章改两次 → 返回目录 → 进第 2 章改 → 返回 → 回第 1 章。断言：撤销按钮禁用；输入新内容后，撤销可用、重做禁用；刷新后直接回到第 1 章编辑器（不用再点书），内容是最后一次输入的 |
| 同上 | whole-book replacement previews and per-chapter undo restores text | 1.6 | 在第 2 章编辑器里做全书替换后：本章撤销能恢复"共同词 第二章"；返回目录，书籍菜单里有"撤销全书替换"；点它之后，第 1 章恢复为"共同词 第一章"。删掉 `undo-book-format` 那一行 |
| 同上 | format is idempotent and preserves internal spaces and punctuation when disabled | 1.11 | options 里去掉 `punctuation`，删掉第 19 行 |
| 新建 undo.spec.ts | deleting a book can be undone within five seconds | 1.6 | 删除《雨停之后》，点提示条上的"撤销"，书回到原位；刷新（toShelf）后仍在 |
| 同上 | deleting chapters can be undone | 1.6 | 批量删掉 2 章 → 撤销 → 3 章都在，顺序不变 |
| 同上 | deleted book positions are removed | 1.6 | 先阅读第 1 本，再删除它，等到"已保存"；IndexedDB 的 `reading` 行里没有 `"1"` |
| 同上 | delete confirmation offers cancel | 1.6 | 确认框有"取消"；点"取消"后书还在 |
| 同上 | whole-book undo skips chapters edited afterwards | 1.6 | 全书排版后改第 1 章，再撤销：提示里含"1 章之后改过" |
| （不单独写） | leaving the book clears the whole-book undo | 1.6 | 已包含在 chapter-actions 里改写后的那个用例中 |
| experience.spec.ts | continuous scroll changes active chapter, restores by text and keeps position after typography changes | 1.5 | 第 38 行刷新后，不再调用 `reading(page)`，改为 `await expect(page.locator('.reader')).toBeVisible()` |
| 同上 | editor selection and scroll restore after chapter switch and reload | 1.5 | toShelf（第 66 行） |
| fresh-install.spec.ts | new install is empty, saved status fades and cache leaves book intact | 1.5 | toShelf（第 19 行） |
| persistence.spec.ts | chapter text, title and added chapter survive reload | 1.5 | toShelf（第 18、25 行） |
| 同上 | failed save leaves text intact and retry persists it | 1.5 | toShelf（第 50 行） |
| 同上 | chapter selection survives reorder and deletion stays deleted | 1.5 | toShelf（第 78 行） |
| 同上 | continuous typing persists during input and latest edit survives navigation | 1.5 | toShelf（第 92 行） |
| 同上 | new folder and shared library display preference survive reload | 1.5 | toShelf（第 106 行） |
| refinement.spec.ts | legacy punctuation preference no longer transforms source punctuation | 1.11 | 删除 |
| 同上 | grid line and color updates retain live panel nodes, scroll and persisted value | 1.5、1.11 | toShelf（第 49 行）；删掉第 46 行 punctuation 的断言 |
| txt.spec.ts | 第 28、81、113、127、149、156 行的 reload | 1.5 | 每处都 toShelf |
| editor-performance.spec.ts | character count uses Unicode code points without copying text | 1.7 | 加一条 `countWords` 断言 |
| （新增） | 字数不含空白 | 1.7 | 见任务 1.7 |
| （新增） | 封面压缩 | 1.8 | 见任务 1.8 |
| （新增） | 渲染不写库 | 1.9 | 见任务 1.9 |

### 第 3 批

| 文件 | 用例 | 任务 | 改法 |
|---|---|---|---|
| chapter-actions.spec.ts | management selects entire rows without replacing footer and leaves last chapter visible | 3.1 | 第 73 行改为：未选中行的背景色，等于 `.chapter-batch-footer` 的背景色 |
| experience.spec.ts | settings keep panel and reading positions, isolate colors and center the heading | 3.6 | `pref:readpaper:#eff7f7` 改为 `pref:readpaper:#e4ede4`；`pref:readcolor:#85a8c1` 改为 `pref:readcolor:#27313d` |
| 同上 | day and night retain separate custom colors and long press does not open controls | 3.6 | 两处 `#eff7f7` 改为 `#e4ede4` |
| （新增） | 图标节点不重建 | 3.2 | 见任务 3.2 |
| （新增） | 深色外壳 | 3.5 | 见任务 3.5 |
| （新增） | 预设改变纸色和字色；低对比度时出现提示 | 3.6 | 选"夜读"预设后，`--paper` 是 #1b1a18；把纸色选成 #efe2c8、字色选成 #d9d3c7 后出现 `.contrast-warning` |
| （新增） | 溢出渐隐、长按显示名称 | 3.7 | 见任务 3.7 |

### 第 4 批

| 文件 | 用例 | 任务 | 改法 |
|---|---|---|---|
| fresh-install.spec.ts | 唯一用例 | 4.1 | 新建书籍后应在章节页（`.chapter-page` 可见，标题为"个人作品"）；接着 `toShelf(page)`，再点 `tab:me` |
| refinement.spec.ts | grid line and color updates… | 4.1、4.3 | 第 44 行的 `'界面设置'` 改为 `'显示设置'`；第 45 行的 `settings:排版` 改为 `settings:排版规则` |
| sheet-navigation.spec.ts | settings tabs and directory reversal replace their view without adding back levels | 4.3 | `settings:基础` 改为 `settings:版面` |
| editor.spec.ts | search navigates to second exact occurrence without changing text | 4.9 | 改名为 "find bar steps through matches without changing text"。流程：填入正文 → 点 `editor-menu` → 点 `chapter-search` → 断言 `.find-bar input` 已聚焦 → 输入"目标" → `.find-count` 为"1/2" → 点 `find-next` → `.find-count` 为"2/2" → `page.evaluate(() => [...CSS.highlights.get('search-match')][0].toString())` 等于"目标" → 正文没变 → `.editor-scroll` 的 scrollTop 大于 0 |
| backup.spec.ts | 所有调用 `menu(page, 'backup')` 的用例 | 4.2 | 这个 helper 改为：点 `tab:me`，再点 `backup` |
| （新增） | 4.1～4.15 每个任务列出的用例 | 4.x | 见各任务 |

### 第 5 批

| 文件 | 用例 | 任务 | 改法 |
|---|---|---|---|
| experience.spec.ts | continuous scroll changes active chapter… | 5.1 | 第 26 行 `toHaveCount(3)` 改为数量不超过 5，并且 `[data-index="1"]` 存在；第 27 行 `.nth(1)` 改为 `.reading-chapter[data-index="1"]` |
| reader-performance.spec.ts | reader retains complete chapter text without estimated offscreen geometry | 5.1 | chapterCount 改为不超过 5；只检查 `[data-index="0"]` 的正文包含 longBody；realGeometry 的检查保留 |
| 同上 | directory jump to the last chapter preserves progress endpoints | 5.1 | 第 44 行 `.nth(2)` 改为 `.reading-chapter[data-index="2"]` |
| 同上 | font changes retain the active chapter and complete text | 5.1 | 所有 `querySelectorAll('.reading-chapter')[1]` 和 `.nth(1)` 改为按 `[data-index="1"]` 选取 |
| scale.spec.ts | 唯一用例 | 5.1 | 加上限（见任务 5.1） |
| （新增） | 窗口内不超过 5 章；目录跳章不重建滚动容器（跳章前后 `.editor-scroll` 是同一个节点）；导入 60 个短章的 TXT（写法同任务 4.4，每章只有一行正文，`#txt-destination` 选 `reader`）直接进入阅读器，内容高度超过一屏，反复滚到底部后能渲染出第 60 章 | 5.1 | 新增 |
| （新增） | 5.2～5.7 每个任务列出的用例 | 5.x | 见各任务 |

---

## 13 真机验收清单（给用户）

执行 AI 做完每一批后，把对应的这几项转告用户。

### 第 1 批之后

- [ ] 在**旧版**里先导出一次完整备份。如果"误操作恢复"里有想留的内容，先在旧版里把它恢复出来。
- [ ] 用自己的签名构建新版 release，**覆盖安装**。不要卸载，卸载会清空数据。
- [ ] 打开后：书都在，封面都在，章节内容正确；书架菜单里已经没有"误操作恢复"。
- [ ] 书多的时候，记下从点图标到书架出现用了几秒。
- [ ] 删除一章 → 点提示条上的"撤销" → 这一章回来了。
- [ ] 做一次全书排版 → 书籍菜单里有"撤销全书排版" → 点它 → 全书恢复原样。
- [ ] 编辑时切到后台，在最近任务里把墨页划掉 → 重新打开 → 回到刚才编辑的那一章。

### 第 3 批之后

- [ ] 桌面图标是暖白底上的朱砂方印，中间是"墨"字；打开安卓 13 的"主题图标"后显示正常。
- [ ] 启动页只出现一次：纸色底加图标。
- [ ] 书架、封面、导航、弹层的整体观感符合纸墨风；系统切到深色后，书架等页面变成深色。
- [ ] 在 360 宽的小屏手机上，编辑器顶栏的右侧有渐隐。
- [ ] 如果想调颜色，只需要改 `app/kit/tokens.css`，告诉执行 AI 要改成什么色值即可。

### 第 4 批之后

这一批不动数据，可以先装调试包"墨页测试"试用（它的数据和正式版分开，需要的话在里面导入一份备份）。

- [ ] 底部导航是"写作 / 阅读 / 设置"；"设置"页里有导入 TXT、完整备份与恢复、清理缓存、关于。
- [ ] 书架右上角的放大镜，能在"书名 / 全文"两个标签之间切换搜索。
- [ ] 超过 50 章的书：打开目录时当前章在中间；顶部能输入章号直接跳过去。
- [ ] 从编辑器返回章节列表，回到原来的位置，刚编辑的那一章短暂高亮。
- [ ] 新建章节后直接进入编辑，标题已选中；在标题里按回车，光标跳到正文。
- [ ] 书籍菜单的"导入章节"，把 TXT 里的章节追加到这本书末尾，不会新建一本书。
- [ ] 编辑器"更多工具"里点"本章搜索"，出现常驻查找条，能显示"第几处/共几处"并上下跳转。
- [ ] 长按书或章节进入管理；章节管理里能把选中的章"移动"到指定位置。
- [ ] 在"写作"书架首页按返回键，要连按两次才退出。
- [ ] 导入一本带"第一卷""第一章"的 TXT：卷名合并进紧跟的章名里。

### 第 5 批之后

- [ ] 1500 章的书：打开阅读器快，目录跳章快。
- [ ] 每章只有几行的书，在阅读器里也能一直往下滚到最后一章。
- [ ] 点屏幕下方翻页，点上方回翻，点中间出菜单；音量键能翻页；阅读时屏幕不熄灭。
- [ ] 在阅读设置里关掉"亮度跟随系统"（默认开着，这时亮度条是灰的），亮度条真的在调屏幕亮度；离开阅读器后，恢复系统亮度。
- [ ] 在阅读设置里打开"沉浸阅读"（默认关）：状态栏和导航栏隐藏，页脚有时间和电量。
- [ ] 在文件管理器或微信里，对 TXT 选"用其他应用打开"或"分享"，能选到墨页，并直接进入导入预览。

### 发布前

- [ ] 以上各项全部复查一遍；关于页显示版本号 1.1.0。
- [ ] （可选）调试包"墨页测试"可以和正式版同时安装。

---

## 附录 A：playwright.config.ts

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    reducedMotion: 'reduce',
    baseURL: 'http://127.0.0.1:5173',
    viewport: { width: 482, height: 790 },
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5173 --strictPort',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

## 附录 B：.github/workflows/ci.yml

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:

jobs:
  web:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run build
      - run: npm test
      - if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report

  android:
    runs-on: ubuntu-latest
    needs: web
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: 21
      - run: npm ci
      - run: npm run build
      - run: npx cap sync android
      - run: chmod +x gradlew && ./gradlew :app:assembleDebug --console=plain
        working-directory: android
      - uses: actions/upload-artifact@v4
        with:
          name: moye-debug-apk
          path: android/app/build/outputs/apk/debug/*.apk
```

## 附录 C：CLAUDE.md 全文

```markdown
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
```

## 附录 D：docs/progress.md 模板

```markdown
# 施工进度

## 性能基线（第 0 批）
- 书架可见：__ ms
- 章节列表（1500 行）：__ ms
- 打开阅读器：__ ms
- 打开目录：__ ms
- 目录跳到第 1001 章：__ ms

## 第 0 批
- [ ] 0.1 取得代码
- [ ] 0.2 测试一条命令就能跑
- [ ] 0.3 CI
- [ ] 0.4 调试包能和正式版同时安装
- [ ] 0.5 项目文档
- [ ] 0.6 大书库测试
- [ ] 0.7 本批收尾

## 第 1 批
- [ ] 1.1 删除恢复记录
- [ ] 1.2 数据定义收进 schema.ts
- [ ] 1.3 分批读取本地数据库
- [ ] 1.4 自动保存改用 schema，只写有变化的行
- [ ] 1.5 刷新后回到原处，以及测试辅助函数
- [ ] 1.6 删除和全书操作的短时撤销
- [ ] 1.7 字数
- [ ] 1.8 封面压缩
- [ ] 1.9 渲染不再写数据
- [ ] 1.10 读库提示和原始数据导出
- [ ] 1.11 清理设置里的无效项
- [ ] 1.12 本批收尾

## 第 2 批
- [ ] 2.1 基础模块　- [ ] 2.2 动作表　- [ ] 2.3 核心模块
- [ ] 2.4 书架与"我的"　- [ ] 2.5 章节页　- [ ] 2.6 编辑器　- [ ] 2.7 阅读器
- [ ] 2.8 页面布局　- [ ] 2.9 搜索　- [ ] 2.10 表单与原生监听
- [ ] 2.11 组装入口，删除 prototype.js　- [ ] 2.12 清理　- [ ] 2.13 本批收尾

## 第 3 批
- [ ] 3.1 设计变量与样式重写　- [ ] 3.2 图标　- [ ] 3.3 封面　- [ ] 3.4 通用控件
- [ ] 3.5 深色外壳　- [ ] 3.6 配色与字号　- [ ] 3.7 工具栏　- [ ] 3.8 品牌与启动页　- [ ] 3.9 本批收尾

## 第 4 批
- [ ] 4.1 小问题合集　- [ ] 4.2 导航、设置页、合并搜索　- [ ] 4.3 设置分类　- [ ] 4.4 目录
- [ ] 4.5 章节列表恢复位置　- [ ] 4.6 新建章节　- [ ] 4.7 标题输入　- [ ] 4.8 导入章节到本书
- [ ] 4.9 查找　- [ ] 4.10 进度与排序　- [ ] 4.11 管理　- [ ] 4.12 保存状态点
- [ ] 4.13 快速滚动条　- [ ] 4.14 章节识别　- [ ] 4.15 搜索线程常驻　- [ ] 4.16 本批收尾

## 第 5 批
- [ ] 5.1 窗口化阅读　- [ ] 5.2 页脚与标签　- [ ] 5.3 阅读排版　- [ ] 5.4 点击翻页
- [ ] 5.5 原生插件　- [ ] 5.6 阅读器接上原生能力　- [ ] 5.7 打开方式与分享导入
- [ ] 5.8 删除无用插件　- [ ] 5.9 本批收尾

## 第 6 批
- [ ] 6.1 版本号　- [ ] 6.2 清理死代码　- [ ] 6.3 文档　- [ ] 6.4 最终回归　- [ ] 6.5 交付

## 发现的问题
（不在本方案范围内、但值得以后处理的问题）

## 阻塞
（现象 / 已尝试的办法 / 需要用户决定的问题）
```

## 附录 E：app/data/schema.ts 草稿

草稿里的类型细节，以实际代码为准做微调。注释里标出了哪些字段是第 4、5 批才加的。

```ts
// 书库数据的唯一定义：类型、默认值、规范化、校验、数据库行格式、版本迁移。
// 规则：新增要保存的字段，先在这里登记，并写明哪个页面读它。

export const SCHEMA_VERSION = 2;

// 第 4 批（4.9）加 'search'
export const TOOL_IDS = ['copy', 'format', 'undo', 'redo', 'directory', 'settings', 'keyboard', 'find', 'top', 'bottom', 'previous', 'next'] as const;
export type ToolId = (typeof TOOL_IDS)[number];

export type Anchor = { offset: number; context: string; y: number };
export type SelectionPosition = { start: number; end: number; backward: boolean; field: 'body' | 'name' };
export type SourceHeading = { name: string; raw: string };
export type Chapter = { id: string; name: string; body: string; sourceHeading?: SourceHeading | null };

export type Book = {
  id: number;
  name: string;
  author: string;
  description?: string;
  group: number | null;
  chapters: Chapter[];
  image?: string;          // 封面 dataURL。数据库里存成 cover:<id> 行。书架和书籍表单读。
  libraryOrder?: number;   // 书架上的显示顺序。书架读。
  sourceHash?: string;     // 导入文件的 SHA-256。重复导入检测读。
};

export type Group = { id: number; name: string; libraryOrder?: number };

export type Prefs = {
  font: number; line: number; bold: boolean;
  indent: boolean; spaces: boolean; paragraph: '不限' | 0 | 1 | 2 | 3;   // 一键排版规则
  margin: number; bottom: number;
  grid: boolean; near: boolean; thick: boolean; lineType: '实线' | '长虚线' | '短虚线' | '点线'; lineColor: string;
  color: string; paper: string;
  fontFamily: '系统默认' | '宋体';   // 第 4 批（4.1）加 '黑体'
};

export type ReadPrefs = {
  font: number; line: number; margin: number; bottom: number; paper: string; color: string; brightness: number;
  night?: boolean;
  themes?: { day: { paper: string; color: string }; night: { paper: string; color: string } };
  // 第 5 批加：fontFamily、tidy、tapPaging、volumePaging、keepAwake、immersive、brightnessAuto
};

export type Toolbars = { top: (ToolId | null)[]; bottom: (ToolId | null)[] };
export type ReadingPosition = { chapter: number; chapterId?: string; scroll: number; anchor?: Anchor };   // 第 4 批（4.10）加 percent、at
export type EditingPosition = { scroll: number; selection?: SelectionPosition; anchor?: Anchor };
export type Session = { tab: 'edit' | 'read' | 'me'; page: 'home' | 'chapters' | 'editor' | 'reader'; folder: number | null; book: number | null; chapter: number };

export type Library = {
  books: Book[]; groups: Group[]; view: 'grid' | 'list'; readSort: 'manual' | 'recent';
  prefs: Prefs; toolbars: Toolbars; reading: Record<string, ReadingPosition>; readPrefs: ReadPrefs;
  editing: Record<string, EditingPosition>; restorePoint: Library | null;
};

export const DEFAULT_PREFS: Prefs = {
  font: 20, line: 1.8, bold: false, indent: true, spaces: false, paragraph: '不限', margin: 24, bottom: 80,
  grid: false, near: true, thick: false, lineType: '短虚线', lineColor: '#dadde0',
  color: '#292d30', paper: '#ffffff', fontFamily: '系统默认',   // 第 3 批（3.6）改为 #1f1d1a / #f6f1e7
};
export const DEFAULT_READ_PREFS: ReadPrefs = { font: 20, line: 1.8, margin: 24, bottom: 80, paper: '#ffffff', color: '#292d30', brightness: 100 };
export const DEFAULT_TOOLBARS: Toolbars = { top: ['copy', 'format', 'undo', 'redo', 'directory', 'settings'], bottom: ['keyboard', 'find', 'top', 'bottom', null, null] };
export const DEFAULT_SESSION: Session = { tab: 'edit', page: 'home', folder: null, book: null, chapter: 0 };

export function emptyLibrary(): Library {
  return {
    books: [], groups: [], view: 'grid', readSort: 'manual',
    prefs: { ...DEFAULT_PREFS }, toolbars: structuredClone(DEFAULT_TOOLBARS),
    reading: {}, readPrefs: { ...DEFAULT_READ_PREFS }, editing: {}, restorePoint: null,
  };
}

/** 各自存成一行的字段（books 按书、章分行存）。 */
export const FIELD_ROWS = ['groups', 'view', 'readSort', 'prefs', 'toolbars', 'reading', 'readPrefs', 'editing', 'restorePoint'] as const;
/** state 顶层的这 5 个键合起来存成一行 session。 */
export const SESSION_KEYS = ['tab', 'page', 'folder', 'book', 'chapter'] as const;
/** 完整备份包含的字段（不含 restorePoint 和 session）。 */
export const BACKUP_FIELDS = ['books', 'groups', 'view', 'readSort', 'prefs', 'toolbars', 'reading', 'readPrefs', 'editing'] as const;

export type Row = { id: string; value: string };
export const rowId = {
  book: (id: number) => `book:${id}`,
  chapter: (id: string) => `chapter:${id}`,
  cover: (id: number) => `cover:${id}`,
};

export function bookRowValue(book: Book): string {
  const { chapters, image: _image, ...meta } = book;
  return JSON.stringify({ ...meta, chapterIds: chapters.map(chapter => chapter.id) });
}
export const chapterRowValue = (chapter: Chapter): string => JSON.stringify(chapter);
export const coverRowValue = (image: string): string => JSON.stringify(image);

/** 除章节正文之外的全部行；schema 行放在最后。 */
export function metaRows(library: Library, session: Session): Row[] {
  const rows: Row[] = FIELD_ROWS.map(field => ({ id: field, value: JSON.stringify(library[field]) }));
  rows.push({ id: 'session', value: JSON.stringify(session) });
  rows.push({ id: 'book-order', value: JSON.stringify(library.books.map(book => book.id)) });
  for (const book of library.books) {
    // 封面行放在书行前面：迁移是分批提交的，这样即使中途断电，也不会出现"书行已经去掉 image、封面行还没写进去"的情况
    if (book.image) rows.push({ id: rowId.cover(book.id), value: coverRowValue(book.image) });
    rows.push({ id: rowId.book(book.id), value: bookRowValue(book) });
  }
  rows.push({ id: 'schema', value: String(SCHEMA_VERSION) });
  return rows;
}

export function toRows(library: Library, session: Session = DEFAULT_SESSION): Row[] {
  const chapters = library.books.flatMap(book => book.chapters.map(chapter => ({ id: rowId.chapter(chapter.id), value: chapterRowValue(chapter) })));
  return [...chapters, ...metaRows(library, session)];
}

/** 读任意版本（1 或 2）的行。renamedChapters 记下规范化时改过标题的章节，供迁移用。 */
export function fromRows(rows: Map<string, string>) {
  const used = new Set<string>(['schema', 'session', 'book-order', ...FIELD_ROWS]);
  const read = (id: string) => {
    const value = rows.get(id);
    if (value === undefined) throw new Error('数据库缺少记录：' + id);
    used.add(id);
    return JSON.parse(value);
  };
  const optional = (id: string) => (rows.has(id) ? read(id) : undefined);
  const raw: Record<string, unknown> = {};
  for (const field of FIELD_ROWS) raw[field] = optional(field);
  raw.books = ((optional('book-order') ?? []) as number[]).map(id => {
    const { chapterIds, image, ...meta } = read(rowId.book(id));
    const cover = optional(rowId.cover(id)) ?? image;   // 版本 2 存在 cover 行；版本 1 内嵌在书行里
    return { ...meta, ...(cover ? { image: cover } : {}), chapters: (chapterIds as string[]).map(chapterId => read(rowId.chapter(chapterId))) };
  });
  const renamedChapters = new Set<string>();
  const library = normalizeLibrary(raw, renamedChapters);
  const session = normalizeSession(optional('session'), library);
  const orphanRows = [...rows.keys()].filter(id => !used.has(id));   // 包括版本 1 的 recovery 行
  return { library, session, orphanRows, renamedChapters };
}

/** 补默认值，去掉停用的字段和无主数据。可以重复执行。 */
export function normalizeLibrary(raw: any, renamedChapters?: Set<string>): Library {
  const base = emptyLibrary();
  const groups: Group[] = Array.isArray(raw.groups) ? raw.groups.map((group: Group) => ({ ...group })) : [];   // 复制一份：下面补顺序时不改传入的对象
  const groupIds = new Set(groups.map(group => group.id));
  const books: Book[] = (raw.books ?? []).map((book: any) => {
    const { tone: _tone, ...rest } = book;   // tone 已停用：封面按书 id 取色
    return {
      ...rest,
      group: rest.group !== null && groupIds.has(rest.group) ? rest.group : null,
      chapters: rest.chapters.map((chapter: Chapter) => {
        if (!/[\r\n]/.test(chapter.name)) return chapter;
        renamedChapters?.add(chapter.id);
        return { ...chapter, name: chapter.name.replace(/\s*[\r\n]+\s*/g, ' ').trim() };
      }),
    };
  });
  const prefs = { ...base.prefs, ...raw.prefs };
  delete (prefs as Record<string, unknown>).autoScroll;
  delete (prefs as Record<string, unknown>).punctuation;
  const bookIds = new Set(books.map(book => String(book.id)));
  const chapterIds = new Set(books.flatMap(book => book.chapters.map(chapter => chapter.id)));
  const keep = <T>(record: Record<string, T> | undefined, ok: (key: string) => boolean) =>
    Object.fromEntries(Object.entries(record ?? {}).filter(([key]) => ok(key)));
  assignLibraryOrder(books, groups);
  return {
    books, groups,
    view: raw.view === 'list' ? 'list' : 'grid',
    readSort: raw.readSort === 'recent' ? 'recent' : 'manual',
    prefs,
    toolbars: normalizeToolbars(raw.toolbars ?? base.toolbars),   // 未知工具换成 null
    reading: keep(raw.reading, key => bookIds.has(key)),
    readPrefs: { ...base.readPrefs, ...raw.readPrefs },
    editing: keep(raw.editing, key => chapterIds.has(key)),
    restorePoint: raw.restorePoint ? { ...normalizeLibrary(raw.restorePoint), restorePoint: null } : null,
  };
}

export function normalizeSession(raw: any, library: Library): Session {
  const session = { ...DEFAULT_SESSION, ...raw };
  const tab: Session['tab'] = ['edit', 'read', 'me'].includes(session.tab) ? session.tab : 'edit';
  const folder = library.groups.some(group => group.id === session.folder) ? session.folder : null;
  const book = library.books.find(item => item.id === session.book);
  let page: Session['page'] = ['home', 'chapters', 'editor', 'reader'].includes(session.page) ? session.page : 'home';
  if (!book || tab === 'me' || (tab === 'read' && page !== 'reader') || (tab === 'edit' && page === 'reader')) page = 'home';
  if (page === 'editor' && !book!.chapters.length) page = 'chapters';
  const last = Math.max(0, (book?.chapters.length ?? 1) - 1);
  const chapter = Math.min(Math.max(0, Number(session.chapter) || 0), last);
  return { tab, page, folder, book: book ? book.id : null, chapter };
}

type Ordered = { libraryOrder?: number };

/** 未知的工具换成 null；整组缺失时用默认值。 */
function normalizeToolbars(raw: any): Toolbars {
  const list = (value: unknown) => Array.isArray(value)
    ? value.map(id => ((TOOL_IDS as readonly string[]).includes(id) ? (id as ToolId) : null))
    : null;
  return { top: list(raw?.top) ?? [...DEFAULT_TOOLBARS.top], bottom: list(raw?.bottom) ?? [...DEFAULT_TOOLBARS.bottom] };
}
function fillOrder(items: Ordered[]) {
  let next = Math.max(-1, ...items.map(item => item.libraryOrder ?? -1)) + 1;
  for (const item of items) if (item.libraryOrder === undefined) item.libraryOrder = next++;
}
/** 和原来书架渲染时的补齐顺序一致：根目录是"分组在前、书在后"，每个分组里只有书。 */
export function assignLibraryOrder(books: Book[], groups: Group[]) {
  fillOrder([...groups, ...books.filter(book => book.group === null)]);
  for (const group of groups) fillOrder(books.filter(book => book.group === group.id));
}
export function nextLibraryOrder(library: Pick<Library, 'books' | 'groups'>, group: number | null): number {
  const items: Ordered[] = [...(group === null ? library.groups : []), ...library.books.filter(book => book.group === group)];
  return Math.max(-1, ...items.map(item => item.libraryOrder ?? -1)) + 1;
}

/** 把旧版本的行升级到当前版本。只返回需要写入和删除的行，schema 行在 upserts 最后。可以重复执行。 */
export function migrateRows(rows: Map<string, string>): { upserts: Row[]; deletes: string[] } {
  const { library, session, orphanRows, renamedChapters } = fromRows(rows);
  const upserts: Row[] = [];
  for (const book of library.books) for (const chapter of book.chapters) {
    if (renamedChapters.has(chapter.id)) upserts.push({ id: rowId.chapter(chapter.id), value: chapterRowValue(chapter) });
  }
  for (const row of metaRows(library, session)) if (row.id !== 'schema' && rows.get(row.id) !== row.value) upserts.push(row);
  upserts.push({ id: 'schema', value: String(SCHEMA_VERSION) });
  return { upserts, deletes: orphanRows };
}

// 以下两个函数从 backup/model.ts 搬来：
// - validateLibrary(value)：
//   原来的检查全部保留，删掉恢复记录相关的检查；工具名单改用 TOOL_IDS；readSort 可以没有，有的话只能是 manual 或 recent；
//   restorePoint 可以没有，有的话照原来的方式递归校验。
// - snapshotLibrary(state)：原来的 librarySnapshot 改名，按 FIELD_ROWS 加 books 深拷贝。
```

## 附录 F：storage.ts 分批读取

```ts
export type Row = { id: string; value: string };
export interface Storage {
  read(): Promise<Map<string, string>>;
  commit(upserts: Row[], deletes: string[]): Promise<void>;
}

export const READ_LIMITS = { maxChars: 1_000_000, maxIds: 500, largeRow: 400_000 };

/** 把行分成若干批：大行单独分片读，其余按总字符数和行数分批。纯函数，便于测试。 */
export function planReadBatches(index: { id: string; size: number }[], limits = READ_LIMITS) {
  const batches: string[][] = [];
  const large: { id: string; size: number }[] = [];
  let current: string[] = [];
  let chars = 0;
  for (const record of index) {
    if (record.size > limits.largeRow) { large.push(record); continue; }
    if (current.length && (chars + record.size > limits.maxChars || current.length >= limits.maxIds)) {
      batches.push(current); current = []; chars = 0;
    }
    current.push(record.id); chars += record.size;
  }
  if (current.length) batches.push(current);
  return { batches, large };
}

// openStorage() 只打开一次：同一个页面里再调用（例如错误页的"导出原始数据"），拿到的是同一个 Storage。
let opening: Promise<Storage> | undefined;
export function openStorage(): Promise<Storage> {
  opening ??= open().catch(error => { opening = undefined; throw error; });
  return opening;
}
// open() 就是原来 openStorage 的内容，原生分支打开连接的部分改成：
//   location.reload()（恢复备份之后、错误页的"重新读取"）不会关闭原生端的连接，
//   直接 createConnection 会报"连接已存在"，所以先对齐两边的连接表，已有连接就直接取用。
//   方法名以 node_modules/@capacitor-community/sqlite 的类型定义为准。
const connection = new SQLiteConnection(CapacitorSQLite);
await connection.checkConnectionsConsistency().catch(() => undefined);
const db = (await connection.isConnection('local_editing', false)).result
  ? await connection.retrieveConnection('local_editing', false)
  : await connection.createConnection('local_editing', false, 'no-encryption', 1, false);
if (!(await db.isDBOpen()).result) await db.open();

// 原生端的 read()：
async read() {
  const index = (await db.query('SELECT id, length(value) AS size FROM records')).values as { id: string; size: number }[];
  const { batches, large } = planReadBatches(index);
  const rows = new Map<string, string>();
  for (const ids of batches) {
    const result = await db.query(`SELECT id, value FROM records WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
    const values = (result.values ?? []) as Row[];
    if (values.length !== ids.length) throw new Error('无法读取本地记录');
    for (const row of values) rows.set(row.id, row.value);
  }
  for (const record of large) {
    // 和原来一样，按 131072 个字符分片
    const parts: string[] = [];
    for (let offset = 1; offset <= record.size; offset += 131072) {
      const result = await db.query('SELECT substr(value, ?, ?) AS part FROM records WHERE id=?', [offset, 131072, record.id]);
      const part = result.values?.[0]?.part;
      if (typeof part !== 'string') throw new Error('无法读取本地记录：' + record.id);
      parts.push(part);
    }
    rows.set(record.id, parts.join(''));
  }
  return rows;
}

/** 按总字符数分批提交；所有 deletes 和 schema 行放在最后一批。只在数据迁移时使用。 */
export async function commitInBatches(storage: Storage, upserts: Row[], deletes: string[], maxChars = 1_000_000) {
  const schema = upserts.filter(row => row.id === 'schema');
  let batch: Row[] = [];
  let chars = 0;
  for (const row of upserts) {
    if (row.id === 'schema') continue;
    if (batch.length && chars + row.value.length > maxChars) { await storage.commit(batch, []); batch = []; chars = 0; }
    batch.push(row); chars += row.value.length;
  }
  await storage.commit([...batch, ...schema], deletes);
}
```

## 附录 G：autosave 只写有变化的行

Proxy 的 get、set、deleteProperty 结构保持不变。需要改的地方：
- `mark()` 不再设置 `dirtyAllBooks`；
- `order` 类（`state.books` 数组本身）的变化，只调用 `mark('order')`。

保存时用下面的算法：

```ts
// 跟踪表：只记 id 和对象引用，不存整库的 JSON 副本
type Tracking = {
  ids: Set<string>;                               // 数据库里现有的全部行 id
  order: number[];                                // 上次写入的 book-order
  chapters: Map<number, Map<string, Chapter>>;    // 每本书上次写入的章节：id → 章节对象（只存引用，不复制内容）
  covers: Map<number, string | null>;             // 每本书上次写入的封面（引用同一个字符串，不额外占内存）
};
// 读库后初始化：ids = 行 id（去掉孤儿行）；order = 书 id；chapters、covers 取自 library（都是原始对象，不是代理）

function collectChanges(dirty: { fields: Set<string>; books: Set<number>; chapters: Set<string>; order: boolean }) {
  const upserts = new Map<string, string>();
  const deletes = new Set<string>();
  const next: Tracking = { ids: new Set(tracking.ids), order: tracking.order, chapters: new Map(tracking.chapters), covers: new Map(tracking.covers) };
  const put = (id: string, value: string) => { upserts.set(id, value); deletes.delete(id); next.ids.add(id); };
  const drop = (id: string) => { upserts.delete(id); if (next.ids.has(id)) { deletes.add(id); next.ids.delete(id); } };

  for (const field of dirty.fields) {
    const value = field === 'session' ? Object.fromEntries(SESSION_KEYS.map(key => [key, initial[key]])) : initial[field];
    value === undefined ? drop(field) : put(field, JSON.stringify(value));
  }

  const ids = initial.books.map(book => book.id);
  const current = new Set(ids);
  if (dirty.order || ids.join() !== tracking.order.join()) { put('book-order', JSON.stringify(ids)); next.order = ids; }
  for (const id of tracking.order) if (!current.has(id)) {   // 删掉的书
    drop(rowId.book(id)); drop(rowId.cover(id));
    for (const chapterId of tracking.chapters.get(id)?.keys() ?? []) drop(rowId.chapter(chapterId));
    next.chapters.delete(id); next.covers.delete(id);
  }

  for (const book of initial.books) {
    const known = tracking.chapters.get(book.id);
    const isNew = known === undefined;
    if (!isNew && !dirty.books.has(book.id)) continue;
    for (const chapter of book.chapters) chapter.id ??= crypto.randomUUID();
    put(rowId.book(book.id), bookRowValue(book));
    const before = known ?? new Map<string, Chapter>();
    const now = new Map(book.chapters.map(chapter => [chapter.id, chapter]));
    for (const chapterId of before.keys()) if (!now.has(chapterId)) drop(rowId.chapter(chapterId));
    // 新增的章节，以及"同一个 id 换了一个新对象"的章节，都要写
    for (const chapter of book.chapters) if (before.get(chapter.id) !== chapter) put(rowId.chapter(chapter.id), chapterRowValue(chapter));
    next.chapters.set(book.id, now);
    const image = book.image || null;
    if (isNew || tracking.covers.get(book.id) !== image) {
      image ? put(rowId.cover(book.id), coverRowValue(image)) : drop(rowId.cover(book.id));
      next.covers.set(book.id, image);
    }
  }

  for (const chapterId of dirty.chapters) {
    for (const book of initial.books) {
      const chapter = book.chapters.find(item => item.id === chapterId);
      if (chapter) { put(rowId.chapter(chapterId), chapterRowValue(chapter)); break; }
    }
  }
  return { upserts: [...upserts].map(([id, value]) => ({ id, value })), deletes: [...deletes], next };
}
// flush()：
// 1. 复制当前的脏集合并清空（沿用原来 while (dirty) 的结构）；
// 2. collectChanges；
// 3. storage.commit(upserts, deletes)；
// 4. 成功：tracking = next；失败：把复制出来的脏集合放回去，然后抛错（和原来一样）。
//
// replaceLibrary(value)（恢复备份）：
// 1. 先 flush；再一次提交写入 toRows(normalizeLibrary(value), DEFAULT_SESSION)，删除其余全部行；
// 2. 把规范化后的书库各字段赋给 initial；
// 3. 用新书库重新初始化 tracking（和读库后初始化一样），清空全部脏集合。
// 恢复备份的流程随后会 location.reload()，重新读库，session 是默认值，所以回到写作书架。
```

## 附录 H：tests/seed.ts 里的 toShelf

```ts
import type { Page } from '@playwright/test';

/** 刷新后应用会回到上次的页面（C-11）。这个函数用应用自己的返回动作走回书架，再切到指定的标签页。 */
export async function toShelf(page: Page, tab: 'edit' | 'read' | 'me' = 'edit') {
  await page.locator('main.app-shell').first().waitFor();
  for (let step = 0; step < 4 && !(await page.locator('.bottom-nav').count()); step++) {
    const back = page.locator('main [data-action="chapters"], main [data-action="home"], main [data-action="folder:root"]').first();
    await back.dispatchEvent('click');   // 阅读器的返回按钮在隐藏的控制栏里，所以用 dispatchEvent
  }
  await expect(page.locator('.bottom-nav')).toBeVisible();
  await page.locator(`[data-action="tab:${tab}"]`).click();
}
```

注意：这个文件原来就从 `@playwright/test` 导入了 `expect`，不需要再导入。

## 附录 I：book-undo.ts 与提示条

```ts
// app/features/editor/book-undo.ts
// 全书排版、全书替换的短时撤销：只存在内存里，离开这本书就失效（D-03）。
export type BookChange = { chapterId: string; before: string; after: string };
export type BookUndoEntry = { bookId: number; label: '全书排版' | '全书替换'; changes: BookChange[] };

let entry: BookUndoEntry | null = null;
export function rememberBookChange(next: BookUndoEntry) { entry = next; }
export function currentBookUndo() { return entry; }
export function pendingBookUndo(bookId: number) { return entry?.bookId === bookId ? entry : null; }
export function takeBookUndo(bookId: number) { const found = pendingBookUndo(bookId); entry = null; return found; }
export function clearBookUndo() { entry = null; }
```

```js
// 提示条（prototype.js；第 2 批搬到 core/toast.ts）
let toastTimer, toastAction = null;
function toast(message, action) {
  clearTimeout(toastTimer);
  const notice = $('#notice');
  toastAction = action?.run ?? null;
  notice.replaceChildren(document.createTextNode(message));
  if (action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'notice-action';
    button.dataset.action = 'notice-action';
    button.textContent = action.label;
    notice.append(button);
  }
  notice.classList.toggle('with-action', !!action);
  notice.classList.add('visible');
  const duration = action ? 5000 : Math.min(8000, Math.max(2600, message.length * 120));
  toastTimer = setTimeout(() => { notice.classList.remove('visible', 'with-action'); toastAction = null; }, duration);
}
// 动作 notice-action：
//   const run = toastAction;
//   clearTimeout(toastTimer); 隐藏提示条; toastAction = null;
//   run?.();
```

## 附录 J：字数

```ts
// text-tools.ts
// 字数：除空白以外的字符数（按 Unicode 码点）。空白是指 JS 正则 \s 能匹配的全部字符，包括全角空格和换行。
export function countWords(text: string): number {
  let count = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) { count++; i++; continue; }
    }
    if (isSpace(code)) continue;
    count++;
  }
  return count;
}
function isSpace(code: number) {
  return code === 0x20 || (code >= 0x09 && code <= 0x0d) || code === 0xa0 || code === 0x1680 || (code >= 0x2000 && code <= 0x200a)
    || code === 0x2028 || code === 0x2029 || code === 0x202f || code === 0x205f || code === 0x3000 || code === 0xfeff;
}

// 按正文字符串缓存：正文没变时，直接返回上次的结果（同一个字符串对象，比较很快）。
const wordCache = new WeakMap<object, { body: string; words: number }>();
export function wordsOf(chapter: { body: string }): number {
  const hit = wordCache.get(chapter);
  if (hit && hit.body === chapter.body) return hit.words;
  const words = countWords(chapter.body);
  wordCache.set(chapter, { body: chapter.body, words });
  return words;
}
export const bookWords = (book: { chapters: { body: string }[] }) => book.chapters.reduce((sum, chapter) => sum + wordsOf(chapter), 0);
```

## 附录 K：封面压缩

```ts
// app/features/covers.ts
// 把封面缩到 480×640 以内，转成 JPEG（D-13）。透明区域铺白底。
export async function compressCover(file: Blob, maxWidth = 480, maxHeight = 640, quality = 0.85): Promise<string> {
  const bitmap = await createImageBitmap(file);   // 会按 EXIF 方向转正
  try {
    const scale = Math.min(1, maxWidth / bitmap.width, maxHeight / bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    bitmap.close();
  }
}
```

## 附录 L：第 2 批的核心接口

```ts
// core/dom.ts
export const $ = <T extends Element = HTMLElement>(query: string, root: ParentNode = document) => root.querySelector(query) as T;
export const $maybe = <T extends Element = HTMLElement>(query: string, root: ParentNode = document) => root.querySelector<T>(query);
export const $$ = <T extends Element = HTMLElement>(query: string, root: ParentNode = document) => Array.from(root.querySelectorAll<T>(query));
export const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

// core/context.ts
export type ToastAction = { label: string; run: () => void };
export type ActionHandler = (arg?: string, arg2?: string, arg3?: string, raw?: string) => void | Promise<void>;
export type PageModule = { actions: Record<string, ActionHandler>; install?(): void; render?(): void };
export interface Ctx {
  state: AppState;
  app: HTMLElement;
  sheet: HTMLDialogElement;
  render(): void;
  dispose(): void;                  // 离开编辑或阅读之前调用（原来的 disposeReadingEditing）
  onDispose(fn: () => void): void;  // 各模块登记自己的清理函数
  action(name: string): Promise<void>;
  openSheet(title: string, body: string, options?: SheetOptions): void;
  closeSheet(): void;
  backSheet(): void;
  toast(message: string, action?: ToastAction): void;
  book(): Book | undefined;
  chapter(): Chapter | undefined;
  // 跨模块的能力，由 app.ts 在各模块创建之后填入：
  // locateText 第 2 批保持原来的第三个参数 selector；第 4 批（4.9）改为 options: { focus?: boolean; selector?: string }
  editor: { commitBody(value: string, target?: Chapter): void; locateText(offset: number, length?: number, selector?: string): void };
  reader: { session(): ReaderSession | null };   // ReaderSession = ReturnType<typeof mountReader>
  txt: ReturnType<typeof createTxtFlows>;
  backup: ReturnType<typeof createBackupFlows>;
  settings: ReturnType<typeof createSettings>;
}
```

## 附录 M：设计变量（app/kit/tokens.css）

```css
/* 纸墨风设计变量。颜色、字号、圆角、间距只能从这里取。 */
:root {
  color-scheme: light dark;

  --c-paper: #f6f1e7;       /* 应用底色：暖白纸 */
  --c-surface: #fbf8f2;     /* 栏、卡片、弹层 */
  --c-ink: #1f1d1a;         /* 主要文字：墨 */
  --c-ink-2: #5f5a52;       /* 次要文字（在纸色上的对比度约 6:1） */
  --c-ink-3: #8a8378;       /* 占位、禁用、装饰线；不要用在需要读的信息上 */
  --c-line: #e3dccf;        /* 分隔线 */
  --c-edge: #cfc6b6;        /* 控件描边 */
  --c-press: rgb(31 29 26 / 0.06);
  --c-seal: #b33a2e;        /* 朱砂：只做点缀（当前位置标记、印章、进度） */
  --c-danger: #9f2f25;      /* 危险操作（实心按钮） */
  --c-on-strong: #fbf8f2;   /* 墨色底上的文字 */
  --c-on-danger: #ffffff;
  --c-mark: #f3e0b8;        /* 搜索命中的底色 */
  --c-backdrop: rgb(20 18 15 / 0.38);

  --fs-xs: 12px; --fs-s: 13px; --fs-m: 15px; --fs-l: 17px; --fs-xl: 20px; --fs-xxl: 26px;
  --sp-1: 4px; --sp-2: 8px; --sp-3: 12px; --sp-4: 16px; --sp-5: 24px; --sp-6: 32px;
  --r-s: 4px; --r-l: 12px;
  --tap: 44px;
  --ease: cubic-bezier(0.2, 0.7, 0.2, 1);

  --font-ui: system-ui, -apple-system, "Segoe UI", "PingFang SC", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif;
  --font-serif: "Songti SC", "Noto Serif CJK SC", "Source Han Serif SC", STSong, SimSun, serif;
  --font-sans-cjk: system-ui, "PingFang SC", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif;

  /* 书封色：按书 id 取第 N 种（D-17）。深色模式下不变，封面是"实物"。 */
  --cover-0: #3d5a73; --cover-0-ink: #f3efe6;   /* 靛青 */
  --cover-1: #9a6a45; --cover-1-ink: #fbf6ec;   /* 赭石 */
  --cover-2: #3f5f4f; --cover-2-ink: #f1efe6;   /* 墨绿 */
  --cover-3: #8e7a8f; --cover-3-ink: #fbf7f4;   /* 藕荷 */
  --cover-4: #2f3a4f; --cover-4-ink: #efe9df;   /* 黛蓝 */
  --cover-5: #6b5444; --cover-5-ink: #f6efe4;   /* 茶褐 */
  --cover-6: #efe7d6; --cover-6-ink: #2b2621;   /* 米白 */
  --cover-7: #5b7f86; --cover-7-ink: #f5f1ea;   /* 石青 */
}

@media (prefers-color-scheme: dark) {
  :root {
    --c-paper: #1b1a18;
    --c-surface: #232220;
    --c-ink: #e9e4da;
    --c-ink-2: #b3ab9f;
    --c-ink-3: #7d766c;
    --c-line: #34322e;
    --c-edge: #45423c;
    --c-press: rgb(233 228 218 / 0.08);
    --c-seal: #d0584a;
    --c-danger: #c9483c;
    --c-on-strong: #1b1a18;
    --c-mark: #5a4a2a;
    --c-backdrop: rgb(0 0 0 / 0.5);
  }
}
```

**编辑器弹层跟随纸色**（写在 components.css 里，用来替换原 styles.css 第 1219-1232 行）：

```css
:root:has(.editor:not(.layout-editor):not(.reader)) dialog:not(.app-picker) {
  --c-surface: var(--paper);
  --c-ink: var(--text);
  --c-ink-2: color-mix(in srgb, var(--text) 62%, var(--paper));
  --c-ink-3: color-mix(in srgb, var(--text) 38%, var(--paper));
  --c-line: color-mix(in srgb, var(--text) 12%, var(--paper));
  --c-edge: color-mix(in srgb, var(--text) 20%, var(--paper));
  --c-press: color-mix(in srgb, var(--text) 7%, transparent);
  --c-on-strong: var(--paper);
  background: var(--paper);
  color: var(--text);
}
```

**色板**（`ui/settings.ts`）：

```ts
// 编辑器
const paperColors = ['#f6f1e7', '#fbf8f2', '#ffffff', '#efe2c8', '#e4ede4', '#e7ecef', '#f1e9e4', '#dcd3c3', '#e9e4f0', '#1b1a18', '#232527', '#2b2a27'];
const inkColors = ['#1f1d1a', '#3b3630', '#5f5a52', '#2f3b36', '#27313d', '#4a3a2c', '#6b5444', '#3d5a73', '#b33a2e', '#e9e4da', '#d9d3c7', '#b3ab9f'];
// 阅读器
const readPaperColors = ['#f6f1e7', '#fbf8f2', '#ffffff', '#efe2c8', '#e4ede4', '#e7ecef'];
const readInkColors = ['#1f1d1a', '#3b3630', '#2f3b36', '#27313d', '#4a3a2c', '#5f5a52', '#b33a2e'];
// 预设（D-37），序号就是 theme-preset / read-preset 后面的数字
const presets = [
  { name: '宣纸', paper: '#f6f1e7', color: '#1f1d1a' },
  { name: '月白', paper: '#fbf8f2', color: '#27313d' },
  { name: '牛皮', paper: '#efe2c8', color: '#3b2f22' },
  { name: '竹青', paper: '#e4ede4', color: '#2f3b36' },
  { name: '夜读', paper: '#1b1a18', color: '#d9d3c7' },
];
```

## 附录 N：组件规格

| 组件 | class | 规格 |
|---|---|---|
| 图标按钮 | `.icon` | 44×44；按下时背景 `--c-press`；图标 22px，线宽 1.5 |
| 主按钮 | `.primary` | 宽 100%，高度不小于 48；圆角 `--r-s`；底 `--c-ink`，字 `--c-on-strong`；字号 `--fs-m`，字重 600 |
| 危险按钮 | `.primary.danger` | 底 `--c-danger`，字 `--c-on-danger` |
| 文字按钮 | `.text-action` | 字 `--c-ink`，字重 600，无下划线，高度不小于 44 |
| 按钮组 | `.sheet-actions` | flex，间距 `--sp-3`；左边是"取消"（文字按钮），右边是主操作（占满剩余宽度） |
| 行 | `.row` | 高度不小于 56；下边线 `--c-line`；左侧文字 `--fs-m`；右侧的值用 `--c-ink-2`、`--fs-s` |
| 开关 | `.switch` | 44×24；开：底 `--c-ink`；关：描边 `--c-ink-3` |
| 分段选择 | `.steps` | 外框 `--c-line`；选中项底 `--c-ink`、字 `--c-on-strong` |
| 色块 | `.swatch` | 30×30 的圆；选中时外圈 1.5px `--c-ink` |
| 工具格 | `.tool-grid` / `.tool-item` | 4 列；图标气泡 52×52，圆角 `--r-l`，描边 `--c-line` |
| 表单项 | `.form-field` | 标签 `--fs-xs`、`--c-ink-2`；输入框字号 16px（防止手机自动缩放） |
| 搜索框 | `.search-input` | 描边 `--c-edge`，圆角 `--r-s`；聚焦时描边 `--c-ink` |
| 弹层 | `dialog` | 底 `--c-surface`；顶部两角圆角 `--r-l`；没有把手；最大高度 86dvh |
| 标签页 | `.sheet-tabs` | 选中项字 `--c-ink`、字重 700，下方一条 20×2 的朱砂短线 |
| 提示条 | `#notice` | 底 `--c-ink`，字 `--c-on-strong`，圆角 `--r-s`，字号 `--fs-s`；带按钮时可以点击 |
| 空状态 | `.empty` | 字 `--c-ink-2`；上方一条 28×1 的 `--c-ink-3` 细线 |
| 搜索结果 | `.result` | 下边线；命中文字 `mark` 的底色用 `--c-mark` |
| 封面 | `.cover` | 3:4；圆角 `--r-s`；书脊线；题签见任务 3.3 |
| 底部导航 | `.bottom-nav` | 通栏，高 60 加底部安全区；上边线 `--c-line`，底 `--c-surface`；未选中 `--c-ink-2`，选中 `--c-ink`、字重 700，上方一条 24×2 的朱砂线 |
| 目录当前章 | `.directory-sheet .chapter-row` 当前行 | 左侧 3px 朱砂竖线，背景 `--c-press` |
| 刚编辑的章 | `.chapter-row.just-edited` | 同上，1.2 秒后移除 |
| 保存状态点 | `.save-dot` | 6×6 的圆；saved 用 `--c-ink-3`，dirty 和 saving 用 `--c-seal`，failed 用 `--c-danger` |
| 查找条 | `.find-bar` | 高 48；下边线；输入框占满剩余宽度；按钮 44×44 |
| 快速滚动条 | `.fast-scroll` | 滑块 6×44，`--c-ink-3`，70% 不透明；触控宽度 24 |
| 对比度提示 | `.contrast-warning` | 字号 `--fs-s`，颜色 `--c-danger` |

## 附录 O：图标（app/kit/icons.ts）

开工前先确认两件事：
- 打开 `node_modules/lucide/dist/esm/icons/chevron-left.js`，确认 IconNode 的结构。0.468.0 应该是 `[tag, attrs][]`，形如 `[['path', { d: 'm15 18-6-6 6-6' }]]`。如果是 `['svg', attrs, children]` 的旧结构，就改成取 children。
- 本方案用到的每个图标，在 `dist/esm/icons/` 下都要有对应文件。

```ts
import {
  ArrowDownToLine, ArrowLeftToLine, ArrowRightToLine, ArrowUpDown, ArrowUpToLine, Archive, BookOpenText, BookPlus, Check,
  ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CircleCheck, CircleMinus, CirclePlus, Copy, EllipsisVertical, Eraser,
  Feather, FileInput, FileOutput, FilePlus2, FolderInput, FolderPlus, Folders, GripVertical, Info, Keyboard, LayoutGrid,
  List, ListOrdered, Moon, Pencil, PencilLine, Plus, Redo2, Repeat2, Replace, Rows3, Search, Settings, Settings2,
  SlidersHorizontal, Square, SquareCheck, SquareCheckBig, SquareMinus, Sun, TextSearch, Trash2, Undo2, WandSparkles, X,
} from 'lucide';

type IconNode = [tag: string, attrs: Record<string, string | number>][];
const ICONS = {
  'arrow-down-to-line': ArrowDownToLine, 'arrow-left-to-line': ArrowLeftToLine, 'arrow-right-to-line': ArrowRightToLine,
  'arrow-up-down': ArrowUpDown, 'arrow-up-to-line': ArrowUpToLine, archive: Archive, 'book-open-text': BookOpenText,
  'book-plus': BookPlus, check: Check, 'chevron-down': ChevronDown, 'chevron-left': ChevronLeft, 'chevron-right': ChevronRight,
  'chevron-up': ChevronUp, 'circle-check': CircleCheck, 'circle-minus': CircleMinus, 'circle-plus': CirclePlus, copy: Copy,
  'ellipsis-vertical': EllipsisVertical, eraser: Eraser, feather: Feather, 'file-input': FileInput, 'file-output': FileOutput,
  'file-plus-2': FilePlus2, 'folder-input': FolderInput, 'folder-plus': FolderPlus, folders: Folders, 'grip-vertical': GripVertical,
  info: Info, keyboard: Keyboard, 'layout-grid': LayoutGrid, list: List, 'list-ordered': ListOrdered, moon: Moon, pencil: Pencil,
  'pencil-line': PencilLine, plus: Plus, 'redo-2': Redo2, 'repeat-2': Repeat2, replace: Replace, 'rows-3': Rows3, search: Search,
  settings: Settings, 'settings-2': Settings2, 'sliders-horizontal': SlidersHorizontal, square: Square, 'square-check': SquareCheck,
  'square-check-big': SquareCheckBig, 'square-minus': SquareMinus, sun: Sun, 'text-search': TextSearch, 'trash-2': Trash2,
  'undo-2': Undo2, 'wand-sparkles': WandSparkles, x: X,
} satisfies Record<string, IconNode>;
export type IconName = keyof typeof ICONS;

const attributes = (record: Record<string, string | number>) =>
  Object.entries(record).map(([key, value]) => `${key}="${String(value).replace(/"/g, '&quot;')}"`).join(' ');
const cache = new Map<IconName, string>();

export function icon(name: IconName): string {
  let svg = cache.get(name);
  if (!svg) {
    const children = ICONS[name].map(([tag, attrs]) => `<${tag} ${attributes(attrs)}/>`).join('');
    svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" class="lucide lucide-${name}">${children}</svg>`;
    cache.set(name, svg);
  }
  return svg;
}
```

## 附录 P：生成图标的脚本（scripts/make-icon.mjs）

用法：`npm i --no-save opentype.js@1.3.4 && node scripts/make-icon.mjs`。

- 字形来自 Noto Serif SC Bold，许可证是 SIL Open Font License 1.1。
- 脚本会把字体下载到 `scripts/.cache/`，这个目录要加进 `.gitignore`。
- 下载地址在写方案时没能联网核实。如果下载失败，到 https://github.com/notofonts/noto-cjk/releases 下载简体中文 Serif 的 OTF 包，取出 `NotoSerifSC-Bold.otf` 放进 `scripts/.cache/`，再运行脚本（脚本发现文件已存在就不再下载）。
- 生成的文件要提交，脚本也保留在仓库里。

```js
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import opentype from 'opentype.js';

const FONT_URL = 'https://github.com/notofonts/noto-cjk/raw/main/Serif/SubsetOTF/SC/NotoSerifSC-Bold.otf';
const cacheDir = new URL('./.cache/', import.meta.url);
const fontFile = new URL('NotoSerifSC-Bold.otf', cacheDir);
const SEAL = '#B33A2E';
const PAPER = '#F6F1E7';

if (!existsSync(fontFile)) {
  await mkdir(cacheDir, { recursive: true });
  const response = await fetch(FONT_URL);
  if (!response.ok) throw new Error('字体下载失败：' + response.status);
  await writeFile(fontFile, Buffer.from(await response.arrayBuffer()));
}
const data = await readFile(fontFile);
const font = opentype.parse(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));

/** 把"墨"字缩放进 (x, y) 起、边长 size 的正方形里，居中，返回 SVG 路径数据。 */
function glyphPath(x, y, size) {
  const path = font.getPath('墨', 0, 0, 1000);
  const box = path.getBoundingBox();
  const scale = size / Math.max(box.x2 - box.x1, box.y2 - box.y1);
  const dx = x + (size - (box.x2 - box.x1) * scale) / 2 - box.x1 * scale;
  const dy = y + (size - (box.y2 - box.y1) * scale) / 2 - box.y1 * scale;
  const n = value => Number(value.toFixed(2));
  const p = (px, py) => `${n(px * scale + dx)} ${n(py * scale + dy)}`;
  return path.commands.map(c =>
    c.type === 'M' ? `M${p(c.x, c.y)}` :
    c.type === 'L' ? `L${p(c.x, c.y)}` :
    c.type === 'Q' ? `Q${p(c.x1, c.y1)} ${p(c.x, c.y)}` :
    c.type === 'C' ? `C${p(c.x1, c.y1)} ${p(c.x2, c.y2)} ${p(c.x, c.y)}` : 'Z').join('');
}

// 108×108 画布。方印 46×46 放在正中，这样在圆形遮罩下也能完整显示；印里的字占 32×32。
const seal = 'M36 31H72A5 5 0 0 1 77 36V72A5 5 0 0 1 72 77H36A5 5 0 0 1 31 72V36A5 5 0 0 1 36 31Z';
const glyph = glyphPath(38, 38, 32);
const bigGlyph = glyphPath(34, 34, 40);   // 单色图层只画字，稍大一点

const vector = paths => `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp" android:height="108dp"
    android:viewportWidth="108" android:viewportHeight="108">
${paths.map(([color, d]) => `    <path android:fillColor="${color}" android:pathData="${d}" />`).join('\n')}
</vector>
`;

const res = new URL('../android/app/src/main/res/drawable/', import.meta.url);
await mkdir(res, { recursive: true });
await writeFile(new URL('ic_launcher_foreground.xml', res), vector([[SEAL, seal], [PAPER, glyph]]));
await writeFile(new URL('ic_launcher_monochrome.xml', res), vector([['#FFFFFFFF', bigGlyph]]));
await writeFile(new URL('../app/public/brand/moye.svg', import.meta.url),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108"><rect width="108" height="108" rx="24" fill="${PAPER}"/><path fill="${SEAL}" d="${seal}"/><path fill="${PAPER}" d="${glyph}"/></svg>\n`);
console.log('已生成图标');
```

## 附录 Q：启动页（第 3 批）

`android/app/src/main/res/values/colors.xml`（新建）：

```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="moye_paper">#F6F1E7</color>
</resources>
```

`styles.xml` 里的启动主题改成：

```xml
<style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
    <item name="windowSplashScreenBackground">@color/moye_paper</item>
    <item name="windowSplashScreenAnimatedIcon">@drawable/ic_launcher_foreground</item>
    <item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>
</style>
```

`MainActivity.java` 的 `onCreate` 第一行加 `SplashScreen.installSplashScreen(this);`，并 `import androidx.core.splashscreen.SplashScreen;`。依赖 `core-splashscreen` 已经在 build.gradle 里了。

## 附录 R：章节识别规则（txt/text.ts，第 4 批）

### 判断一行是不是标题

1. 先把这一行 `trim()`，再做 `normalize('NFKC')`，只用于判断，保留原文。空行或长度超过 50 的，不是标题。
2. "第N章"类：
   ```
   ^(?:正文\s*)?[【\[〔(]?\s*第\s*([〇零一二三四五六七八九十百千万两\d]+)\s*([章回节篇卷部集])\s*[】\]〕)]?(.*)$
   ```
   - 第 2 组是 `卷`、`部`、`集` 时，这是**卷标题**，否则是章标题；
   - 第 3 组（rest）按下面的规则判断。
3. rest 的规则：
   - rest 为空：是标题。
   - rest 以空白或 `：:、.．·—-` 开头：取分隔符后面的部分作为标题，长度不超过 30 的是标题。这里不按标点过滤：现有规则在分隔符之后不做限制，"第十章 夜，深了"这类带逗号的章名也要认出来；误切只出现在没有分隔符的写法里。
   - rest 直接接在单位后面（没有分隔符）：需要同时满足以下三点才是标题：
     - "单位 + rest 的第一个字"不在停用词表里；
     - rest 长度不超过 12；
     - rest 里没有 `，,。！？!?；;`。
   - 停用词表：回合 回来 回去 回到 回家 回头 回答 回复 回忆 回应 回事 节课 节目 节日 节奏 节约 节省 节点 章程 篇幅 篇章 卷子 卷入 卷起 部分 部门 部队 部长 部署 集合 集团 集体 集中 集市
4. `序章|序言|前言|楔子|尾声|后记|终章|番外` 和 `chapter N`：保持现有规则。

### 卷标题的处理

- 如果卷标题后面（中间只隔着空行）紧跟一个章标题，就把两者合并：
  - 章名为 `卷名 章名`，中间一个空格；
  - `sourceHeading.raw` 为"卷那一行 + 中间的空行 + 章那一行"；
  - `sourceHeading.name` 为合并后的章名。
- 否则，卷标题单独成为一章，正文是卷首的文字。

### 纯数字标题

只有在全书没有找到任何"第N章"类标题时才启用：
1. 候选行：`^(\d{1,4})(?:[.、．]\s*|\s+)?(\S.{0,24})?$`，并且整行不以 `。！？!?` 结尾。
2. 候选行至少 5 个，并且相邻候选的数字里，至少 80% 是依次加 1，才把它们当作标题；否则一个也不认。

### 短章提醒

自动识别出 10 章以上，并且超过 30% 的章正文 `trim()` 之后不足 50 字时，设置：

```
parsed.warning = `识别出较多很短的章节（${k} 章不足 50 字），可能把正文当成了标题。可以改选“整篇作为一章”。`
```

### 不变量

所有章节的 `(sourceHeading?.raw ?? '') + body` 拼起来，要和原文完全相等。现有的完整性检查保留。

### 新增的 9 个单元用例

1. `第一节课下课后，他走出教室。` 不是标题；
2. `第三回合他赢了` 不是标题；
3. `第三回 宴桃园豪杰三结义` 是标题；
4. `第一卷 风起\n\n第一章 开端\n正文` 只有 1 章，章名为"第一卷 风起 第一章 开端"，并且导出后和原文完全一致；
5. `第一卷 风起\n卷首语\n第一章 开端\n正文` 有 2 章，第一章是卷，正文为"卷首语\n"；
6. `【第一章】开端` 和 `正文 第一章 开端` 都是标题；
7. 6 段以 `1\n` 到 `6\n` 开头、每段有正文的文本，识别出 6 章；
8. `1. 买菜\n2. 做饭\n正文` 只有 1 章，数字行不算标题；
9. `第十章 夜，深了` 是标题（分隔符后面带逗号也认）。

## 附录 S：窗口化阅读算法（reader/continuous.ts，第 5 批）

### 签名

接口 `{ jump, body, capture, restore, save, destroy }` 保持不变，只多一个参数 `text`：

```
mountReader(scroll, chapters, initial, saved, update, notice, text = chapter => chapter.body)
```

### 常量

- `RADIUS = 1`：初始窗口是当前章加前后各 1 章；
- `MAX = 5`：已渲染超过 5 章时开始裁剪；
- `EDGE = 1.5`：离两端不到 1.5 屏时加载相邻的章；
- `KEEP = 2`：只裁剪离可视区 2 屏以外的章。

### 状态

- `first`、`last`：已经渲染的章节下标范围；
- `nodes: Map<index, { section, body }>`；
- `end`：末尾的"已到全书末尾"元素。只有 `last === chapters.length - 1` 时才挂在页面上。

### 各个操作

- **`make(i)`**：生成 `<article class="reading-chapter" data-index="i" data-chapter-id="…">`，包含标题 h1 和 `.manuscript`。正文用 `textContent = text(chapters[i])`。
- **`renderRange(from, to)`**：清空滚动容器，依次挂上 from 到 to 的章节；如果 to 是最后一章，再挂上 end。
- **`shift(delta)`**：`scroll.scrollTop += delta`；如果 `seekTop` 有值，`seekTop += delta`。在顶部插入或删除章节都要调用它，否则拖动进度条（seek）时的判断会失效。
- **`append()`**：
  1. 如果 `last` 已经是最后一章，直接返回；
  2. 把 `make(last + 1)` 插在 end 之前，或者追加到末尾；
  3. `last++`；如果已经是最后一章，挂上 end。

  往下追加不影响当前的可视位置，所以不需要补偿。
- **`prepend()`**：
  1. 如果 `first` 已经是 0，直接返回；
  2. `const before = scroll.scrollHeight`；
  3. 在最前面插入 `make(first - 1)`；
  4. `first--`；
  5. `shift(scroll.scrollHeight - before)`。
- **`fill()`**：
  1. `while (last < n - 1 && scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < scroll.clientHeight * EDGE) append();`
  2. `while (first > 0 && scroll.scrollTop < scroll.clientHeight * EDGE) prepend();`
  3. `trim()`。

  章节很短、几章加起来不满一屏时，页面滚不动，也就收不到 scroll 事件。所以不能只在滚动时加一章，而要一次补到离两端各 1.5 屏。
- **`trim()`**：已渲染的章数超过 MAX 时，重复下面两步，直到不超过 MAX，或者两步都删不了：
  - 顶部：`first < active`，并且 first 那一章整章都在可视区上方 KEEP 屏以外（`top(first + 1 那一章) <= scrollTop - KEEP × clientHeight`）时，删掉它：先记下 `before = scrollHeight`，删除，`first++`，再 `shift(scroll.scrollHeight - before)`（差值是负数）；
  - 底部：`last > active`，并且 last 那一章的顶边在可视区下方 KEEP 屏以外（`top(last 那一章) >= scrollTop + (KEEP + 1) × clientHeight`）时，删掉它，`last--`；如果 end 挂着，一并移除。

  按距离删，删完之后两端仍然各有超过 EDGE 屏的内容，fill 不会马上又加回来。章节长度正常时，页面上不会超过 5 章；章节很短时可以暂时多几章，但都很短，不影响性能。
- **onScroll**（放在 `requestAnimationFrame` 里）：
  1. `fill()`；
  2. 保留原来 seek 期间的判断（`seekTop` 有值并且滚动位置没变，就只 `save()`）；
  3. 在 first 到 last 范围内二分查找当前章 `active`（写法和原来一样，改为按 `nodes.get(i).section` 取元素）；
  4. 和原来一样调用 `update(...)`，120ms 后 `save()`。
- **`limits(i)`**：
  ```
  start = top(section)
  length = max(0, section.getBoundingClientRect().height - clientHeight)
  ```
- **`jump(index, pct = 0)`**：
  1. 如果 index 不在 first 到 last 范围内，调用 `renderRange(max(0, index - RADIUS), min(n - 1, index + RADIUS))`；
  2. `active = index`；
  3. 按 `limits(active)` 设置 `scrollTop = start + length * pct / 100`；
  4. `fill()`；fill 可能在前面插入章节，所以再按 `limits(active)` 重新算一次，重新设置 scrollTop；
  5. 记下 seekTop 和 seekProgress；
  6. `save()`。
- **初始化**：
  1. `renderRange(max(0, initial - RADIUS), min(n - 1, initial + RADIUS))`；
  2. 之后按原逻辑恢复位置：先 `jump(initial)`，再用锚点或 scroll 恢复。恢复会改变滚动位置，随后的 scroll 事件会再 fill 一次。
- **`restore(position)`**：如果 `position.chapter` 不在已渲染的范围内，先 `jump(position.chapter)`，再 `restoreAnchor`。

### 注意

`.editor-scroll` 设置了 `overflow-anchor: none`，浏览器不会自动补偿滚动位置，所以上面的补偿都要手动做。

## 附录 T：原生插件、MainActivity、Manifest（第 5 批）

`android/app/src/main/java/com/localediting/app/MoyeNativePlugin.kt`：

```kotlin
package com.localediting.app

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.BatteryManager
import android.provider.OpenableColumns
import android.util.Base64
import android.view.WindowManager
import androidx.activity.result.ActivityResult
import androidx.core.content.IntentCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream

@CapacitorPlugin(name = "MoyeNative")
class MoyeNativePlugin : Plugin() {
    companion object {
        private const val SHARE_LIMIT = 32 * 1024 * 1024
        @JvmField @Volatile var volumePaging = false
        @Volatile private var instance: MoyeNativePlugin? = null
        @JvmStatic fun emitVolume(direction: String) { instance?.sendVolume(direction) }
    }

    // notifyListeners 是 protected 方法，所以通过实例方法转一道
    fun sendVolume(direction: String) {
        notifyListeners("volumeKey", JSObject().put("direction", direction))
    }

    override fun load() {
        instance = this
        handleShareIntent(activity.intent)
    }

    override fun handleOnNewIntent(intent: Intent) {
        super.handleOnNewIntent(intent)
        handleShareIntent(intent)
    }

    // clearCache、saveText、documentCreated：从 TextDocumentsPlugin.kt 原样搬过来

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
    fun setVolumePaging(call: PluginCall) {
        volumePaging = call.getBoolean("on", false) ?: false
        call.resolve()
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
        intent.action = null   // Activity 重建时，不重复导入同一个 Intent
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
```

`MainActivity.java`：

```java
package com.localediting.app;

import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        SplashScreen.installSplashScreen(this);
        registerPlugin(MoyeNativePlugin.class);
        super.onCreate(savedInstanceState);
        getBridge().getWebView().setOverScrollMode(View.OVER_SCROLL_NEVER);
        getBridge().getWebView().setVerticalScrollBarEnabled(false);
        getBridge().getWebView().setHorizontalScrollBarEnabled(false);
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        int code = event.getKeyCode();
        if (MoyeNativePlugin.volumePaging && (code == KeyEvent.KEYCODE_VOLUME_DOWN || code == KeyEvent.KEYCODE_VOLUME_UP)) {
            if (event.getAction() == KeyEvent.ACTION_DOWN) {
                MoyeNativePlugin.emitVolume(code == KeyEvent.KEYCODE_VOLUME_DOWN ? "down" : "up");
            }
            return true;
        }
        return super.dispatchKeyEvent(event);
    }
}
```

`AndroidManifest.xml`：在 `<activity>` 里，现有的 MAIN/LAUNCHER intent-filter 之后加上：

```xml
<intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <data android:scheme="content" android:mimeType="text/plain" />
</intent-filter>
<intent-filter>
    <action android:name="android.intent.action.SEND" />
    <category android:name="android.intent.category.DEFAULT" />
    <data android:mimeType="text/plain" />
</intent-filter>
```

## 附录 U：app/features/native/native.ts

```ts
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { ReadPrefs } from '../../data/schema';

type MoyeNativePlugin = {
  saveText(options: { name: string; text: string; mime?: string }): Promise<{ cancelled: boolean }>;
  clearCache(): Promise<{ count: number }>;
  setKeepScreenOn(options: { on: boolean }): Promise<void>;
  setBrightness(options: { value: number | null }): Promise<void>;
  setImmersive(options: { on: boolean }): Promise<void>;
  getBattery(): Promise<{ level: number; charging: boolean }>;
  setVolumePaging(options: { on: boolean }): Promise<void>;
  addListener(event: 'volumeKey', listener: (data: { direction: 'up' | 'down' }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'shareReceived', listener: (data: { name?: string; data?: string; error?: string }) => void): Promise<PluginListenerHandle>;
};

export const MoyeNative = registerPlugin<MoyeNativePlugin>('MoyeNative');
export const isNative = Capacitor.isNativePlatform();

let applied = '';
/** 进入阅读器时按设置开启各项，离开时（prefs 为 null）全部恢复。设置没变就不重复过桥。 */
export function syncReader(prefs: ReadPrefs | null) {
  const next = prefs
    ? JSON.stringify([prefs.keepAwake, prefs.brightnessAuto ? null : prefs.brightness, prefs.immersive, prefs.volumePaging])
    : 'off';
  if (next === applied) return;
  applied = next;
  if (!isNative) return;   // 网页预览：亮度由 applyAppearance 用 CSS filter 兜底，其余几项不处理
  void MoyeNative.setKeepScreenOn({ on: !!prefs?.keepAwake });
  void MoyeNative.setBrightness({ value: prefs && !prefs.brightnessAuto ? prefs.brightness / 100 : null });
  void MoyeNative.setImmersive({ on: !!prefs?.immersive });
  void MoyeNative.setVolumePaging({ on: !!prefs?.volumePaging });
}
```
