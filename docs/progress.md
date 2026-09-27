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
- [x] 0.4 调试包能和正式版同时安装（build.gradle 加 debug 后缀 .debug/-debug，src/debug/res/values/strings.xml 名为"墨页测试"；本机 JDK 17 不满足构建要求 JDK 21，构建验证以 CI 为准）
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

## 第 2 批（进行中；当前分支 batch-2-split，从合并后的 main 切出）
- [x] 2.1 基础模块（app/core/dom.ts、app/core/state.ts、app/kit/ui.ts 已建立；prototype.js 的 $/esc/icon/ib/toolMenu 与初始状态改为从这些模块导入；ib 的动作名特殊处理已删，阅读器顶栏直接传"本书搜索"。95 个用例通过）
- [x] 2.2 动作表（action() 的 if 链改为 handlers 映射 + dispatch()：共 80 个 kind 与原分支一一对应，多 kind 共用分支按方案用同一函数注册多次；"切换页面前先 dispose"的判断移入 dispatch；match-hit 中原对完整动作字符串的比较改写为 'match-hit:' + arg（生成格式不变，等价）；prototype.js 1598→1602 行。typecheck 0 错、95 用例通过、build 通过）
- [x] 2.3 核心模块（新建 core/toast.ts、core/context.ts、core/actions.ts、core/router.ts：toast 与 notice-action 搬进 toast.ts；ctx 提供 state/dispose/onDispose/action/render 等附录 L 接口；动作表经 registerActions 注册、createDispatcher 分派，共用动作函数第 4 参数按附录 L 从 kind 改为 raw（内部 split 取 kind，行为不变）；router.render() 在前后各取一次快照做动画（删掉原 wrap IIFE），并保留原 render 的调度（bookUndo 清理、dispose、prepare、按页分派）；renderEditor/renderLayout/renderChapters 的 5 处外部调用与 layoutSettings 改为 ctx.render()；disposeReadingEditing 拆为编辑/阅读分支各自 ctx.onDispose 登记的钩子。typecheck 0 错、95 用例通过、build 通过）
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
- 工作区不是 git 克隆（无 .git），已按方案 0.2.3 的本地合并流程初始化仓库；无 gh/推送权限，各批完成后在本地合并到 main，未推送。
- 本机 JDK 17，方案要求 JDK 21；安卓构建任务（0.4、3.8、5.5 等）以 CI 为准，本地未验证。
- moye-main 基线与方案的差异：测试总数 78（方案写 77，多出的用例在 pickers.spec.ts）；prototype.js 1623 行、styles.css 2353 行与方案一致。

## 阻塞
（现象 / 已尝试的办法 / 需要用户决定的问题）
