# 当前实现

此文描述 `extension` 中 1.0.0 的已实现代码。使用方式见[使用说明](../usage.md)，运行证据与边界见[验证状态](../verification.md)，早期路线决策保存在 [history](../history)。

## 原生侧边栏

用户希望直接在当前界面操作，当前实现使用 Chrome Side Panel，网页保持可操作，图片选择与保存由扩展侧边栏文档完成。没有弹窗、新标签页、网页内跨域扩展 iframe 或本地辅助程序。

新增 `sidePanel` 与 `storage` 权限；其余沿用 `activeTab`、`scripting`、`pageCapture`。没有 host_permissions、downloads、debugger、Cookie、unlimitedStorage 或永久内容脚本权限。

`background.js` 在工具栏 / 快捷键手势内立即打开侧栏，再将 tab/window/requestId/mode 放到 storage.session。每个窗口使用独立来源键。侧栏恢复与快捷下载消费标记也在 session 中，避免重复执行同一次自动请求。来源改变时等待当前操作完成，不在写入途中替换任务。

## 取图与匹配

`lib/scan.mjs` 是可序列化的独立扫描函数，运行在 activeTab 的隔离环境。它递归扫描可访问的同源框架和开放 Shadow DOM，记录页面顺序、图片地址别名、自然尺寸 / 背景元素尺寸、出现位置 ID 与几何可见性。

元素身份保存在扩展隔离环境的 WeakMap，不修改原页面 DOM。无关的节点插入不会改变已有图片 ID 或误判来源改变；真正图片增加、替换、地址或尺寸变化仍会使捕获对照失效。

侧栏对照读取前后 URL、documentId、图片地址、编号和尺寸。期间来源或清单改变时拒绝提交这次快照；滚动引起的位置变化不会误判为文件变化。

`lib/mhtml.mjs` 只读取 Chrome 生成的受控 multipart/related 快照中的图片，处理 base64、quoted-printable 和原始二进制。不执行 HTML，不把网页内容注入侧栏。它保留原始字节，拒绝截断和未知传输编码。解析时按 `content-type` 跳过全部非图片部件（HTML、CSS、字体），不解码也不保存。

扩展自身不发起任何图片请求：CSP 为 `connect-src 'none'`，代码里没有 fetch / XHR，缩略图由快照字节的 Blob URL 生成。由于字节来自网页自己已加载的资源，防盗链、Referer 检查、Cookie 与跨域 CORS 都不参与，目标图片服务器不会被再次访问。代价是没加载过的图片（懒加载未触发、已从渲染进程缓存淘汰、跨域 iframe）不会出现在快照里，只能报为未能提取，不会由扩展补请求。

`lib/catalog.mjs` 匹配 currentSrc 和唯一的 src 别名。一个 src 对应不同响应式图片时，禁止使用该冲突回退；资源缺失和重复地址冲突变成单项 unavailable，不影响其他项。内嵌 data 图片单独解码。按 SHA-256 去重，合并所有重复出现的可见性。

通过常用格式签名检查后，侧栏用 Blob URL 延迟显示缩略图；不会再次请求图片服务器。图片预览失败仍可保存原字节。刷新 / 离开页面时释放预览 URL。

## 目录与任务

`lib/storage.mjs` 用 IndexedDB 保存目录句柄和任务元数据。偏好放在 chrome.storage.local，图片与快照仅保留在内存。

目录选择 / requestPermission 在点击处理器内立即调用，不在快照生成后才尝试获取用户激活。自动快捷下载只 queryPermission，授权不足时等待用户点击。保存按钮首次也可以直接唤起目录选择。

每次保存 / 重试冻结图片子集、根目录和清洗后的子目录名。重试使用界面此时显示的目录配置。`navigator.locks` 对本扩展所有窗口的写入串行化；原生目录 API 没有独占创建新文件的接口，因此不能保证与外部程序并发创建文件时完全无竞态。

`lib/files.mjs` 逐文件查找可用序号名、写入、关闭、读取并核对字节哈希。已有文件 / 同名目录避让；写入失败 abort 当前流，其他图片继续。每项完成后持久化日志；日志持久化失败会停止后续写入。停止按钮完成当前文件后将剩余项标记取消。

日志保存来源、目标显示名、请求编号/哈希和成功/失败结果，不保存原始字节。关闭中断后提示记录，不跨重启自动续写。iframe / 文档变化 / 磁盘和授权异常都没有隐式网络或“另存为每张图片”回退。

侧栏 CSP 禁止 connect、object、frame 和远程脚本，仅允许本地脚本、样式与 Blob/data 图片。文件名与标题使用文本赋值；不通过 innerHTML 执行网页内容。

## 平台证据

查证日期：2026-10-05。Gemini 的 UX 评审见[独立评审记录](../history/gemini-ui-review.md)；模型意见不替代 API 或运行时证据。

- [Chrome Side Panel](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)：在主网页旁承载扩展文档，open 需要用户手势，面板可持续显示。
- [File System Access 规范](https://wicg.github.io/file-system-access/#api-showdirectorypicker)：选择器和授权要求用户激活与顶级同源环境；不能把跨域网页 iframe 当成已验证的目录选择替代方案。
- [Chrome storage](https://developer.chrome.com/docs/extensions/reference/api/storage)：本地偏好和 session 生命周期。
- [Chrome scripting](https://developer.chrome.com/docs/extensions/reference/api/scripting)：临时页面访问和 documentId 结果。
- [Chrome pageCapture](https://developer.chrome.com/docs/extensions/reference/api/pageCapture)：快照 API 的参数只有 `tabId`，无法指定缓存模式；取图字节与资源映射的初始实证保留在前期验证记录。
- Chromium [frame_serializer.cc](https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/core/frame/frame_serializer.cc)（2026-10-05 读取 main 分支）：`AddImageToResources()` 直接使用已加载图片对象的数据（`image->GetImage()->Data()`），图片缺失或出错时跳过而不重新请求；`SerializeCSSFile()` 对外链 CSS 使用 `FetchCacheMode::kDefault`，注释说明允许走缓存或网络；`AddFontToResources()` 对字体使用 `kForceCache`，注释说明避免新增网络请求。因此“图片零网络”成立，捕获阶段唯一可能新增的请求是外链 CSS，它不影响图片字节，也不属于扩展发起。

快照字节与目录写入经过原型及正式构建验证，见[正式核验记录](../history/extension-native-validation.md)。当前已测和未测范围统一以[验证状态](../verification.md)为准，不从一次成功写入推断全部平台行为通过。
