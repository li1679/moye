# 施工进度

## 性能基线（第 0 批）
- 书架可见：367 ms
- 章节列表（1500 行）：208 ms
- 打开阅读器：548 ms
- 打开目录：431 ms
- 目录跳到第 1001 章：944 ms

## 第 0 批
- [x] 0.1 取得代码（核对通过：prototype.js 1623 行、styles.css 2353 行、tests/ 15 个 spec 文件，与方案一致；npm ci 与 chromium 安装完成）
- [x] 0.2 测试一条命令就能跑（78 个用例全部通过，耗时约 19 秒；比方案预期的 77 个多 1 个，属基线差异。pickers.spec.ts 的"custom color"用例在 chromium 下失败：新版 Chromium 的 dialog close 事件异步派发，close() 返回后 aria-label 短暂残留，getByLabel 命中两个元素。属浏览器差异类环境问题，已按方案 0.2 修复：pickers.ts 关闭弹层前同步移除 aria-label，msedge 与 chromium 均通过）
- [x] 0.3 CI（.github/workflows/ci.yml 已按附录 B 建立；本地无 GitHub Actions 环境，PR 通过情况需推送后由用户确认）
- [x] 0.4 调试包能和正式版同时安装（build.gradle 加 debug 后缀 .debug/-debug，src/debug/res/values/strings.xml 名为"墨页测试"；第 3 批已使用本机 Tools 目录中的 JDK 21 完成调试包构建验证）
- [x] 0.5 项目文档
- [x] 0.6 大书库测试（tests/fixtures/big-library.ts + tests/scale.spec.ts；基线已记入上表，本批不设上限）
- [x] 0.7 本批收尾（未推送：无 gh 与远端权限，按方案 0.2.3 在本地合并到 main）

## 第 1 批（已完成：95 个用例全部通过，typecheck 0 错误，npm run build 通过）
- [x] 1.1 删除恢复记录（backup 目录与 backup.spec.ts 已就位；grep 残留仅为"兼容版本 1 旧备份"的 decodeBackup 代码与对应测试）
- [x] 1.2 数据定义收进 schema.ts（tests/schema.spec.ts 5 个纯函数用例；validateLibrary/snapshotLibrary 从 backup/model.ts 搬入）
- [x] 1.3 分批读取本地数据库（tests/storage.spec.ts 3 个用例；openStorage 只打开一次并对齐原生连接表）
- [x] 1.4 自动保存改用 schema，只写有变化的行（跟踪表替代整库 JSON 副本；moye:save-state 事件已派发）
- [x] 1.5 刷新后回到原处（tests/seed.ts 的 toShelf；tests/session.spec.ts 4 个用例；第 12 节列出的 toShelf 改动全部完成）
- [x] 1.6 删除和全书操作的短时撤销（history.clear()、book-undo.ts、toast(message, action)、tests/undo.spec.ts 5 个用例）
- [x] 1.7 字数（countWords/wordsOf/bookWords；worker 与兜底同步；tests/words.spec.ts）
- [x] 1.8 封面压缩（features/covers.ts；选图压缩 + 空闲压缩大封面；tests/covers.spec.ts）
- [x] 1.9 渲染不再写数据（libraryItems 只读；新建书/分组/导入/移动 4 处用 nextLibraryOrder；不再写 tone）
- [x] 1.10 读库提示和原始数据导出（.boot 提示 + 错误页"导出原始数据"按钮；已用 schema='9' 手动验证错误页与导出文件）
- [x] 1.11 清理设置里的无效项（settings.ts 类型改用 schema 的 Prefs/ReadPrefs；FormatOptions 去掉 punctuation。grep 残留：schema.ts 迁移代码中删除旧键的两行（附录 E 要求保留）、迁移测试数据、editor 测试名与 persistence 正文中的英文单词，均非设置项本身）
- [x] 1.12 本批收尾（性能对比见下；未推送，本地合并到 main）

### 第 1 批性能（大书库 1500 章，含版本 1→2 迁移）
- 书架可见：367 → 541 ms（含一次性迁移写入）
- 章节列表（1500 行）：208 → 246 ms
- 打开阅读器：548 → 633 ms
- 打开目录：431 → 510 ms
- 目录跳到第 1001 章：944 → 1152 ms
（scale 用例每次都以版本 1 数据冷启动，包含迁移写库开销；窗口化阅读在第 5 批解决大目录跳章）

## 第 2 批（已完成：95 个用例全部通过，typecheck 0 错误，npm run build 通过；分支 batch-2-split 已本地合并 main）
- [x] 2.1 基础模块（app/core/dom.ts、app/core/state.ts、app/kit/ui.ts 已建立；prototype.js 的 $/esc/icon/ib/toolMenu 与初始状态改为从这些模块导入；ib 的动作名特殊处理已删，阅读器顶栏直接传"本书搜索"。95 个用例通过）
- [x] 2.2 动作表（action() 的 if 链改为 handlers 映射 + dispatch()：共 80 个 kind 与原分支一一对应，多 kind 共用分支按方案用同一函数注册多次；"切换页面前先 dispose"的判断移入 dispatch；match-hit 中原对完整动作字符串的比较改写为 'match-hit:' + arg（生成格式不变，等价）；prototype.js 1598→1602 行。typecheck 0 错、95 用例通过、build 通过）
- [x] 2.3 核心模块（新建 core/toast.ts、core/context.ts、core/actions.ts、core/router.ts：toast 与 notice-action 搬进 toast.ts；ctx 提供 state/dispose/onDispose/action/render 等附录 L 接口；动作表经 registerActions 注册、createDispatcher 分派，共用动作函数第 4 参数按附录 L 从 kind 改为 raw（内部 split 取 kind，行为不变）；router.render() 在前后各取一次快照做动画（删掉原 wrap IIFE），并保留原 render 的调度（bookUndo 清理、dispose、prepare、按页分派）；renderEditor/renderLayout/renderChapters 的 5 处外部调用与 layoutSettings 改为 ctx.render()；disposeReadingEditing 拆为编辑/阅读分支各自 ctx.onDispose 登记的钩子。typecheck 0 错、95 用例通过、build 通过）
- [x] 2.4 书架与"我的"（新建 pages/shelf.ts、pages/me.ts：cover 模板搬进 kit/ui.ts；nav/folderItem/libraryItems/enableLibrarySort 与书架、"我的"渲染及 27 个动作搬进两个页面模块，经 registerActions 注册；librarySort 的销毁改为 ctx.onDispose 登记；表单/搜索函数经 ShelfHelpers 注入（2.9/2.10 搬走后由组装层提供）；tab/view 的赋值按 schema 字面量类型收窄（行为等价）；新建 app/types/sortablejs.d.ts 本地声明（不新增 @types 依赖）。动作总数与 2.3 提交一致（80 个），typecheck 0 错、95 用例通过、build 通过）
- [x] 2.5 章节页（新建 pages/chapters.ts、core/library.ts：renderChapters/reindexChapterRows/updateChapterSelection/manageChapters、键盘排序 keydown（install()）和 19 个动作搬进 chapters.ts；updateChapters 与 book()/chapter() 进 library.ts，prototype.js 的 book/chapter 改为薄包装；chapterSort 销毁改 ctx.onDispose 登记、prepareRender 只剩 resetHistory；chapter 与 jump-chapter 共用的 openChapter 从 chapters.ts 导出（2.6 目录跳章沿用）；顺手清理：returnFocus 变量删除（仅 delete-chapter 赋值过，取值改用局部变量）、book-undo 只留 rememberBookChange 导入、schema 导入去掉已不用的 emptyLibrary/DEFAULT_SESSION。一处必要偏差：new-chapter 新建的章节现在直接带 crypto.randomUUID()（schema 的 Chapter.id 必填，原 JS 是打开编辑器时才补 id；唯一影响是"新建后未打开就删除"从报错变为正常删除，无测试覆盖该路径）。动作总数 80 不变，typecheck 0 错、95 用例通过、build 通过）
- [x] 2.6 编辑器（新建 pages/editor.ts（500 行，renderEditor 整体暂含阅读分支，2.7 拆出）、features/appearance.ts（applyAppearance 改签名 applyAppearance(ctx)，经 ctx.reader.session() 取阅读会话）、features/directory.ts（openDirectory + directory/directory-sort/jump-chapter 三动作）；tools 图标表进 kit/ui.ts（Record<ToolId, …>）；commitBody/locateText/resetHistory/applyFormat 经返回对象挂到 ctx.editor/ctx.reader/组装层，prepareRender 改用 editorPage.resetHistory，match-hit 改用 ctx.editor.locateText，reader-step/进度条/后台保存改用 ctx.reader.session()；组合输入、快捷键撤销、beforeinput、input/change 的编辑器部分、两个编辑器 pointerdown 监听全部进 install()，input/change 与 prototype.js 剩余部分按目标元素拆成两个互不重叠的监听。必要偏差与类型化代价（行为等价或不可达路径）：pref/theme/line/fontFamily 的动态键改经 setPanelValue(Object.assign) 或字面量守卫写入；字数与进度数字写 DOM 时显式 String()；getSelection 判空；lineType 四值之外忽略；组装层把 ctx.settings 修正为 createSettings 的完整模块（原先只传了 settings 函数，与附录 L 的 Ctx 类型不符，属既有类型谎言，编辑器模块化后暴露）；2.9 前搜索经 EditorHelpers 注入（search/searchHit/afterReplace）。typecheck 0 错、95 用例通过、build 通过）
- [x] 2.7 阅读器（新建 pages/reader.ts：renderEditor 的阅读分支改名 renderReader（含空章节占位）、nightLabel、阅读区点击（readingPointer、isReadingTap 与对应 pointerdown/click 部分——click 拆成独立监听后补上 [data-action]/.drag-handle 判断，保持与全局分发互斥，行为不变）、input 里阅读进度条与亮度（data-reader-pref）部分；动作 night/reader-settings/reader-step 移入；router 增加 reader 页面入口（布局模式暂仍由编辑页渲染，2.8 移入 layout.ts），ctx.reader 改由 readerPage 提供，editor.ts 的 locateText 改经 ctx.reader.session() 取阅读正文，EditorHelpers 撤下 nightLabel；prototype.js 相应删除 applyAppearance 导入、settingsModule 解构只剩 syncPreferenceControls。类型化代价（行为等价）：亮度的动态键经 setPanelValue(Object.assign) 写入（与 editor.ts 同款）；阅读监听的事件目标加 instanceof HTMLInputElement/Element 守卫（两个分支本就只匹配 range 输入）。动作总数 80 不变（node 脚本对比 HEAD 与工作区的动作 key 并集一致，三个动作从 handlers 精确移到 reader.ts）。typecheck 0 错、95 用例通过、build 通过；另用临时冒烟探针走了一遍控制栏呼出/亮度/夜间/上下章/目录跳章/本书搜索命中（locateText 经 ctx.reader）/返回书架，无 console 错误，探针已删）
- [x] 2.8 页面布局（新建 pages/layout.ts：layoutSettings/layoutToolbar/renderLayout/slotPicker 与 layout/finish-layout/reset-layout/slot/remove-tool/add-slot/choose-tool 七个动作搬入；router 增加 layout 页面入口，布局模式不再借道编辑页渲染（editor.ts 删除 render 里的 layout 分支与 EditorHelpers.renderLayout 注入，并顺手修复 2.7 编辑时在 EditorHelpers 中重复出现的 renderLayout 行）；prototype.js 删除对应函数与七个动作，kit/ui 导入去掉 tools。类型化代价（不可达路径守卫，行为等价）：slot/remove-tool/add-slot 的 where 参数加 top/bottom 谓词守卫；choose-tool 经 TOOL_IDS.find 收窄 ToolId 并判 activeSlot 存在（原 JS 直接解构）；finish-layout 的 layoutScroll 赋值补 ?? 0（原 JS 赋 undefined 亦归零）。动作总数 80 不变（node 脚本核对，七个动作从 handlers 精确移到 layout.ts）。typecheck 0 错、95 用例通过、build 通过；布局流程无 e2e 覆盖，用临时冒烟探针走了一遍进入布局/更换槽位/加槽选工具/移除工具/完成恢复（工具栏与滚动位置）/重置回默认/自动保存，无 console 错误，探针已删。另发现 prototype.js 残留死代码 updateHistoryTools（引用 2.6 已搬走的 history 变量，无调用方），留待 2.12 清理）
- [x] 2.9 搜索（新建 features/search/search-ui.ts：search/searchBooks/searchResults/openSearch 与搜索模块变量（searchPage/searchRevision/searchTimer/searchClient/currentHits/selectedMatch）、弹层 close 监听里的搜索清理、input 里 #query 的重新搜索部分；动作 global-search/book-search/chapter-search（共用 openSearch）/search-page/match-hit 移入并注册；match-hit 改用 ctx.editor.locateText/ctx.toast/ctx.closeSheet/ctx.render；组装层把 searchUi.search/searchHit/afterReplace 注入 editorPage（EditorHelpers 保留为编辑器声明的能力）、searchUi.searchBooks 注入 shelfPage，prototype.js 删除对应函数与 SearchClient/bookWords 导入。类型化代价（行为等价或不可达路径）：本书搜索经 needBook 取书（原 JS 直接 book()，搜索只在有书页面打开）；match-hit 判断补 !targetBook（原靠 index===undefined 短路）；替换范围 select 的 onchange 与事件目标加 instanceof HTMLSelectElement 守卫；openSearch 的 raw 补 ?? ''（恒经 dispatch 传入）；catch 里 error.name/message 经 Error/DOMException 判别（AbortError 的 DOMException 不再显示失败文案，与原一致）；#query 的 input 守卫 instanceof HTMLInputElement；querySelectorAll('.result') 补 HTMLElement 泛型以访问 dataset。动作总数 80 不变（node 脚本核对，五个动作从 handlers 精确移到 search-ui.ts）。typecheck 0 错、95 用例通过、build 通过）
- [x] 2.10 表单与原生监听（新建 ui/forms.ts（createForms：bookForm/inputForm/confirmSheet + 封面选择 change + book-form/simple-form 两个 submit 监听进 install()；confirmSheet 的 HTML 模板 confirmSheetHtml 放进 kit/ui.ts）、features/native/android.ts（installNativeHandlers：安卓 backButton 与 appStateChange 监听，非原生平台直接返回）；组装层把 forms.bookForm/inputForm/confirmSheet 注入 shelfPage、forms.confirmSheet 注入 chaptersPage，原生块改为 await installNativeHandlers(ctx)；prototype.js 删除对应函数与监听及 closePicker/Capacitor/Keyboard/App/nextLibraryOrder/saveNow/cover 导入。类型化代价（行为等价或不可达路径）：formImage 由 null 改 undefined（写入 Book.image?: string，所有读取处都是 truthy/可选链判断，null 与 undefined 等价）；编辑表单经 needBook 取书；修改书籍的 Object.assign 目标同为 needBook；rename-group 的 groups.find 结果判存在（原 JS 直接 .name=，重命名恒有选中分组）；change/submit 监听加 instanceof HTMLInputElement/HTMLFormElement 守卫（分支只匹配文件输入与两个表单）；backButton 的 activeElement 判 instanceof HTMLElement 再 blur（原 matches 通过则必是 HTMLElement）；文件对象的取值 el.files?.[0]（cover-file 恒有 files）。动作总数 80 不变。typecheck 0 错、95 用例通过、build 通过；原生返回键路径浏览器不可达，待第 5 批安卓流程验证）
- [x] 2.8 页面布局　- [x] 2.9 搜索　- [x] 2.10 表单与原生监听
- [x] 2.11 组装入口，删除 prototype.js（新建 app/app.ts：state/panels/ctx 组装、各页面模块创建与 registerActions、组装层自己的三个动作 close/notice-action/sheet-back、全局 click 分发监听、原生监听安装、首次渲染与空闲封面压缩；main.ts 改为 await import('./app')；tsconfig 删除 allowJs/checkJs；git rm app/prototype.js，1623 行原型文件归零，build 产物由 prototype-*.js 变为 app-*.js。顺手清理：prototype.js 残留死代码 updateHistoryTools（引用 2.6 已搬走的 history 变量、无调用方，2.8 发现）未随迁 app.ts，2.12 对应清理项提前完成。必要偏差（组装层 TS 化暴露的既有类型谎言）：txt/flows.ts 的 Context.state 原为手写窄类型（book: number、page: string 等，与实际传入的 AppState 不符），改为 state: AppState；TXT 导入的章节在 push 时直接生成 crypto.randomUUID（原由 autosave 保存时补，同为随机 UUID，最终对象一致，与 2.5 new-chapter 同理）；导入后的 page 赋值按 select 的两个值收窄为 'reader' | 'chapters'。类型化代价：click 分发的 target 加 HTMLElement 泛型、dataset.action 经局部常量窄化；空闲压缩把 b.image 固定到局部常量再进闭包（属性窄化不跨闭包）。typecheck 0 错、95 用例通过、build 通过）
- [x] 2.12 清理（删除 app/domain/types.ts，history.ts 改用 schema 的 Chapter：EditableChapter = Pick<Chapter, 'id' | 'name' | 'body'>，id 从可选变必填与运行时事实一致——编辑器渲染时已补 id；CLAUDE.md 原本没有目录说明，按拆分后的实际结构新增"目录结构（第 2 批拆分后）"一节：main/app、core、kit/ui、pages、features、ui、data；未用变量的清理项在 2.5（returnFocus）与 2.11（prototype.js 死代码 updateHistoryTools 未随迁）已顺带完成，domain 目录随 types.ts 删除而消失。typecheck 0 错、95 用例通过、build 通过）
- [x] 2.13 本批收尾（完成标准逐项核验：app/prototype.js 已不存在；typecheck 0 错误；95 用例全部通过；npm run build 通过。方案要求的"浏览器手动走一遍"以临时冒烟探针执行：书架编辑/阅读双标签 → 书架菜单打开完整备份弹层 → 章节 → 编辑正文并等待自动保存（.save-status 已保存）→ 阅读页点按呼出控制栏 → 返回 → 我的页关于弹层 → 回书架，全程 console/pageerror 无任何报错，探针已删。本批未改任何测试文件（import 路径无变化）。无远端仓库，按约定改在本机执行合并：batch-2-split → main。第 2 批共 13 个任务、14 个提交（含 2.1 的单独进度记录提交），prototype.js 1623 行全部拆入 TypeScript 模块，动作总数 80 个经脚本核验自始至终不变。合并后追加复查提交：修复 editor.ts 未用导入 icon/ReadPrefs、backup/model.ts 未用导入 snapshotLibrary（第 1 批遗留）、shelf.ts/chapters.ts 两处过时注释，并以 ef2852e 的 80 键为基准做动作集合端到端终检（PASS，无重复注册），临时 noUnusedLocals/noUnusedParameters 检查清零）
- [x] 2.11 组装入口，删除 prototype.js　- [x] 2.12 清理　- [x] 2.13 本批收尾

## 第 3 批
- [x] 3.1 设计变量与样式重写（新建 kit/tokens.css、base.css、components.css；styles.css 按页面分节重写并删除旧覆盖层、旧变量和指定死选择器；目录当前章改用 .chapter-row.current + aria-current；附录 N 的通用控件最终视觉规格随重写提前落地，3.4 留待专项核验；四个 CSS 共 558 行，低于 1550 行上限；typecheck 0 错，95 用例全部通过）　- [x] 3.2 图标（新建 kit/icons.ts，适配 lucide 0.468 旧 IconNode 结构并缓存直接输出 SVG；删除 ui/icons.ts 与全部二次渲染调用；替换排版/目录/网格线/底部导航图标；章节单选仅更新目标行，新增菜单开关不重建章节 SVG 的回归用例；typecheck 0 错，96 用例全部通过）　- [x] 3.3 封面（coverTone 对书籍 id 做 FNV-1a 32 位哈希并映射 8 组封面色；无图封面改为右上题签、竖排书名、朱砂印章和作者，有图封面行为不变；新建表单无 id 可正常预览；新增确定性映射与结构测试；typecheck 0 错，97 用例全部通过）　- [x] 3.4 通用控件（核验 3.1 已落地的通栏底部导航、24×2 朱砂指示线、无把手纸色弹层、墨底纸字主按钮、危险按钮、文字按钮、并排 sheet-actions 和墨色提示条；新增计算样式测试，typecheck 0 错，98 用例全部通过）
- [x] 3.5 深色外壳（tokens.css 提供完整 light/dark 纸墨变量并启用 color-scheme；index.html 增加 light/dark 两条 theme-color；新增 dark media 下 .home 为 rgb(27, 26, 24) 的回归用例；typecheck 0 错，99 用例全部通过）　- [x] 3.6 配色与字号（新装默认纸/字色改为 #f6f1e7/#1f1d1a，阅读日夜默认同步更新且不迁移已有设置；编辑器与阅读器使用独立纸墨色板及 5 组预设，删除旧默认背景与 theme-light/theme-dark；新增 WCAG contrastRatio 和低于 4.5:1 的原地提示；最小字号扫描通过；typecheck 0 错，100 个用例全部通过）　- [x] 3.7 工具栏（编辑器上下工具栏按实际宽度维护 overflowing/at-end 并显示渐隐；新增通用 onLongPress，移动超过 8px 或提前抬起取消，触发后吞掉 click；编辑器和布局工具图标长按显示 aria-label；新增 360px 溢出与长按撤销测试；typecheck 0 错，102 个用例全部通过；四个 CSS 共 560 行）　- [x] 3.8 品牌与启动页（按附录 P 生成 Web/Android 墨字方印并保留脚本；adaptive icon、Android 12 启动主题与 SplashScreen API 已接入；删除旧品牌图、15 张 launcher PNG、11 张 splash 和两个旧 drawable；新增 favicon 资源测试；typecheck、Web build、103 个用例及 Android XML 检查通过；cap sync 与 JDK 21 下 assembleDebug 均通过）　- [x] 3.9 本批收尾（typecheck 0 错，103 个用例全部通过，Web build 与 Android debug build 通过；CSS/旧图标/旧品牌资源/引用/工作区扫描通过；四个 CSS 共 560 行；性能见下；无远端权限，已按约定本地合并 main，未推送）

### 第 3 批性能（大书库 1500 章）
- 书架可见：367 → 343 ms
- 章节列表（1500 行）：208 → 162 ms
- 打开阅读器：548 → 419 ms
- 打开目录：431 → 335 ms
- 目录跳到第 1001 章：944 → 833 ms

## 第 4 批
- [x] 4.1 小问题合集（阅读书架空态同时判断书与分组；编辑字体改用根节点 --body-font 并新增黑体；备份名使用本地日期；关于页显示 package 版本和隐私说明；新书直达章节页；简单表单和搜索框主动聚焦；书名/复制正文/显示设置用词统一；安卓根页返回键改为 2 秒内连按退出；typecheck 0 错，107 个用例全部通过）　- [x] 4.2 导航、设置页、合并搜索（底部导航改为写作/阅读/设置；设置页集中导入、备份、缓存和关于；书架菜单按写作根目录/分组/阅读精简；放大镜合并书名与全文搜索，切换保留输入并分别记忆关键词；备份测试显式等待恢复 reload；typecheck 0 错，110 个用例全部通过）　- [x] 4.3 设置分类（显示设置改为版面/字体/主题/排版规则四类；边距归版面、纸墨色归主题，一键排版参数单列并增加不影响当前显示的提示；删除重复的本章搜索和导出文档；默认标签改为版面；typecheck 0 错，111 个用例全部通过）　- [x] 4.4 目录（打开目录时当前章滚动到中央；超过 50 章显示章号跳转表单，输入值夹到有效范围；新增 60 章导入、当前章可见和跳到第 10 章测试；typecheck 0 错，112 个用例全部通过）
- [x] 4.5 章节列表恢复位置（router 在离开章节页前按书记录内存滚动位置，渲染章节页后下一帧恢复；从编辑器返回时当前章短暂显示朱砂高亮，不在视口时居中；减少动态效果模式同样保留路由快照；typecheck 0 错，113 个用例全部通过）　- [x] 4.6 新建章节（章节页新建后直接进入编辑器并全选标题；更多工具新增“新建下一章”并插入当前章之后；末章 next 复用同一逻辑自动新建；typecheck 0 错，115 个用例全部通过）　- [x] 4.7 标题输入（标题与正文统一为 plaintext-only；标题回车转到正文开头；纯文本粘贴把换行归一为空格并保持撤销/input 流程；typecheck 0 错，117 个用例全部通过）　- [x] 4.8 导入章节到本书（书籍菜单使用独立 import-chapters 动作；复用 TXT Worker 预览并隐藏书名、作者、重复和去向字段；追加后立即保存，失败恢复原章节数组；刷新后章节仍在且不新增书；typecheck 0 错，118 个用例全部通过）
- [x] 4.9 查找（编辑器本章搜索改为顶栏下方查找条，支持记忆关键词、150ms 防抖、最多 5000 处、从光标后起步和前后循环；定位在 focus:false 时不抢正文焦点或改选区，跨 contenteditable 块节点仍能准确高亮滚动；替换预填当前词；本书/全书/阅读器本章/合并搜索按范围内存记忆；新增可选 search 工具但不改默认工具栏；typecheck 0 错，118 个用例全部通过）　- [x] 4.10 进度与排序（阅读位置新增 percent/at 并随阅读回调保存；阅读书架按章索引和章内百分比显示整书进度，未读书显示“未读”；菜单可切换最近阅读/手动顺序，最近排序保持分组在前并按 at 降序；typecheck 0 错，119 个用例全部通过）　- [x] 4.11 管理（管理模式点分组保持原页并提示先完成；书籍全选可切换取消全选；写作书架长按书和章节页长按章节均直接进入管理并选中目标；章节管理新增整体移动到最前、最后或第 N 章之后，保持选中章节相对顺序；删除测试补等待保存以消除 reload 竞态；typecheck 0 错，122 个用例全部通过）　- [x] 4.12 保存状态点（编辑器字数徽标前新增保存状态点；监听 moye:save-state，dirty/saving 使用朱砂、saved 使用次要墨色、failed 使用危险色；离开编辑器时移除监听；typecheck 0 错，123 个用例全部通过）
- [x] 4.13 快速滚动条（新增 kit/fast-scroll.ts：6px 滑块、24px 触控区、滚动显示、1.2 秒淡出并支持拖动映射滚动位置；接入目录面板、章节列表 Window 和编辑器正文，均按页面生命周期解绑；目录拖到底部专项测试通过；四个 CSS 共 571 行；typecheck 0 错，123 个用例全部通过）　- [x] 4.14 章节识别（标题限制 50 字，支持卷/部/集、正文前缀、括号标题与停用词/标点误切过滤；相邻卷章合并，否则卷独立成章；无第N类标题时按至少 5 个且八成连号启用纯数字标题；10 章以上短章超 30% 生成 warning 并在预览摘要下方显示；原文重组不变量保留；附录 R 9 例及 warning UI 覆盖，typecheck 0 错，134 个用例全部通过）　- [x] 4.15 搜索线程常驻（搜索弹层关闭只 cancel 当前请求，不再 dispose Worker；每次 Worker 搜索重置 5 分钟空闲释放计时；新增关闭后重开只创建一次 Worker 的 UI 回归；typecheck 0 错，135 个用例全部通过）　- [x] 4.16 本批收尾（typecheck 0 错，135 个用例全部通过，Web build 退出码 0；四个 CSS 共 571 行；颜色/字号扫描仅有允许的表单输入 16px；旧运行时引用与 diff 检查通过；性能见下；无远端权限，按约定本地合并 main，未推送）

### 第 4 批性能（大书库 1500 章）
- 书架可见：1666 ms
- 章节列表（1500 行）：480 ms
- 打开阅读器：1292 ms
- 打开目录：1027 ms
- 目录跳到第 1001 章：1996 ms

## 第 5 批
- [x] 5.1 窗口化阅读（连续阅读改为半径 1 的动态窗口，常规最多 5 章；离边缘 1.5 屏补载、2 屏外裁剪并补偿顶部 DOM 变化；目录与阅读搜索跳章复用当前会话，不重建滚动容器；正文只由 mountReader 写入一次；大书库打开阅读器 204ms、目录跳章 82ms，低于 2000/1500ms 上限；typecheck 0 错，138 个用例全部通过）　- [x] 5.2 页脚与标签（删除 reader-label 模板和样式；页脚右侧显示章数与独立百分比节点，换章同步更新；typecheck 0 错，138 个用例全部通过）　- [x] 5.3 阅读排版（schema v3 增加阅读字体与段落整理；支持系统默认/宋体/黑体和关/紧凑/宽松，正文两端对齐；整理结果按正文缓存，阅读渲染与搜索共用显示文本，切换时按文字锚点重挂恢复且不修改原文；typecheck 0 错，139 个用例全部通过）　- [x] 5.4 点击翻页（schema v4 增加点击翻页开关；控制栏显示时点按只收起，否则上/下三分区按视口减两行翻屏、中间呼出控制栏，平滑滚动尊重减少动态效果；typecheck 0 错，140 个用例全部通过）
- [x] 5.5 原生插件（TextDocumentsPlugin 改为统一 MoyeNativePlugin，保留文档保存和缓存清理；新增常亮、窗口亮度、沉浸、电量、音量键和分享 intent 接收；MainActivity 注册新插件并拦截音量键，Manifest 增加 VIEW/SEND text/plain；JS 统一使用 native.ts 桥接；typecheck、Web build、140 个用例及 JDK 21 Android debug build 通过）　- [x] 5.6 阅读器接上原生能力（schema v5 增加音量键翻页、屏幕常亮、沉浸阅读、亮度跟随系统；路由进入阅读器同步原生状态，离开时恢复；网页只在非原生且手动亮度时使用 CSS filter；阅读设置四开关和亮度禁用逻辑接入，音量事件翻屏并清理监听；typecheck 0 错，141 个用例全部通过）　- [x] 5.7 打开方式与分享导入（share.ts 注册网页/原生分享处理器，base64 分享内容转 File；原生分享回到写作书架并复用 TXT 导入预览，openImport 支持传入 File；typecheck 0 错，TXT 23 个和全量 142 个用例通过）
- [x] 5.8 删除无用插件（卸载 @capacitor/filesystem 和 @capacitor/status-bar，同步 Android；package.json、android/capacitor.settings.gradle、android/app/capacitor.build.gradle 均无残留；typecheck 和 Web build 通过）　- [x] 5.9 本批收尾（JDK 21 下 Android debug build `BUILD SUCCESSFUL`；typecheck、Web build、全量 142 个 Playwright 用例和 diff 检查通过；无远端权限，本地合并 main）

### 第 5 批性能（大书库 1500 章）
- 打开阅读器：548 → 204 ms
- 目录跳到第 1001 章：944 → 82 ms

## 第 6 批
- [x] 6.1 版本号（package.json 与 package-lock.json 更新到 1.1.0；Android versionCode 读取版本号计算为 10100，versionName 同步为 1.1.0）
- [x] 6.2 清理死代码（严格 noUnusedLocals/noUnusedParameters 检查通过；删除未使用的 InputSession 和 directory.ts 导入；旧插件、旧标签及无用导出残留扫描通过）
- [x] 6.3 文档（更新 README 的开发、测试、备份兼容、调试包与 Release 说明；新增 CHANGELOG.md；更新 CLAUDE.md 目录结构和发布说明）
- [ ] 6.4 最终回归
- [ ] 6.5 交付

## 发现的问题
（不在本方案范围内、但值得以后处理的问题）
- 工作区不是 git 克隆（无 .git），已按方案 0.2.3 的本地合并流程初始化仓库；无 gh/推送权限，各批完成后在本地合并到 main，未推送。
- 本机默认 Java 是 JDK 17；JDK 21 位于 `C:\Users\HP\Tools\jdk-21.0.12.1+1`，设置 `JAVA_HOME` 后 Android 调试包构建通过。
- moye-main 基线与方案的差异：测试总数 78（方案写 77，多出的用例在 pickers.spec.ts）；prototype.js 1623 行、styles.css 2353 行与方案一致。

## 阻塞
（现象 / 已尝试的办法 / 需要用户决定的问题）
