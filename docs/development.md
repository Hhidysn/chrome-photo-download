# 开发、测试与打包

扩展使用原生 JavaScript、HTML 和 CSS，没有运行时第三方依赖，也没有前端编译步骤。直接加载 `extension` 即可运行。项目脚本只依赖 Node.js 内置模块；当前命令验证环境为 Windows、Node.js 24.13.0、npm 11.17.0。

## 项目结构

| 路径 | 用途 |
| --- | --- |
| extension/ | Chrome 可直接加载的扩展，包含清单、侧边栏、后台与取图 / 保存模块 |
| tests/ | Node 模块测试，以及浏览器 DOM 扫描样例 |
| scripts/ | 检查、模拟预览、图标生成和 Windows 打包脚本 |
| docs/ | 当前使用、架构与验证文档；history/ 保存历史记录 |
| target/ | 本地临时文件、私人验证资料与可选图片基线，Git 忽略 |
| dist/ | 生成的安装包与哈希清单，Git 忽略 |

## 检查与测试

在项目根目录运行，无需先执行 `npm install`：

```sh
npm test
npm run check
```

`npm test` 检查快照字节解码、资源匹配、去重、可见范围、稳定元素身份、命名、文件失败 / 损坏 / 停止处理和后台来源路由。`npm run check` 检查扩展清单、权限、入口、图标、界面元素引用和脚本语法。

其中一项可选测试使用本地 `target/downloadDir/001.jpg` 原图基线。私人图片不随仓库分发，因此干净检出预期 20 项通过、1 项明确跳过；原始验证工作区包含该基线，21 项全部执行通过。不要为了消除 skip 上传私人图片。

## 界面预览

```sh
npm run preview
```

终端会输出绑定 `127.0.0.1` 的随机端口地址。打开该地址查看合成图片界面；`/responsive.html` 提供 380×640 布局样例，`/scan-fixture.html` 提供真实 DOM 的可见范围样例。

预览中的 Chrome、目录与 IndexedDB API 是模拟适配器，不会安装扩展、访问浏览器用户资料或写入真实图片目录。它适合检查布局和交互，不能替代正式扩展的权限、目录选择或重启恢复测试。

## 在 Chrome 中调试

在扩展管理页加载 `extension`。修改文件后，手动重载扩展，并关闭、重新打开侧栏以加载新代码。正式测试使用普通 HTTP/HTTPS 页面，先完成目录选择，再核对导出的 JSON 和实际文件。

测试图片、真实页面标题 / URL 和下载报告放在 Git 忽略的 `target` 或项目外目录。截图可使用预览的合成图片。

## 生成安装包

在 Windows 项目根目录运行：

```sh
npm run package
```

脚本根据 `extension/manifest.json` 的版本生成 `dist/page-image-save-<版本>.zip`，只包含 `extension` 内容。`dist/build.json` 记录 ZIP 与每个扩展文件的 SHA-256。

ZIP 解压后包含 `manifest.json`，可作为已解压扩展加载。发布前核对 ZIP 内容、文件哈希和[验证状态](verification.md)。打包不上传文件或自动发布。

图标源脚本为 `scripts/icons.ps1`，使用 Windows System.Drawing；仓库已包含生成好的图标，普通使用与测试无需重新生成。
