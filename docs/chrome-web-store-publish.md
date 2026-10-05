# Chrome 网上应用店 (Chrome Web Store) 上架指南

本文档记录将“页面图片保存”扩展发布到 Google Chrome 网上应用店的完整准备工作与提交流程。后续准备上线时可按此清单逐项核对操作。

---

## 一、前期准备

### 1. 注册 Chrome Web Store 开发者账号
* **开发者控制台入口**：[Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
* **账号要求**：使用个人或团队 Google 账号登录。
* **开发者注册费**：需支付一次性注册费 **$5 美元**（终身有效，需准备支持外币的信用卡，如 Visa / MasterCard）。
* **账户信息配置**：
  * 开发者公开展示名称（Developer Display Name）。
  * 联系邮箱（Contact Email，用于接收审核反馈与商店通知）。
  * 开发者两步验证（Google 要求开发者账号必须启用 2FA）。

---

## 二、生成上传安装包

Chrome 应用商店后台只接收 `.zip` 格式的压缩文件，且要求根目录必须直接包含 `manifest.json`。

### 1. 执行打包
在项目根目录下运行打包命令：

```bash
npm run package
```

### 2. 获取输出文件
打包脚本会自动输出至：
```
dist/page-image-save-1.0.0.zip
```
*(同时会在 `dist/build.json` 中记录当前包及各源码文件的 SHA-256 校验和)*

---

## 三、商店展示素材清单 (Store Listing Assets)

进入控制台点击 **“新增商品 (Add new item)”** 并上传 ZIP 后，需在“商品详情”页面完善以下资料：

### 1. 应用图标
* **尺寸要求**：`128 × 128` 像素 PNG 格式。
* **位置**：直接使用项目中已生成的 [`extension/icons/icon-128.png`](../extension/icons/icon-128.png)。

### 2. 界面截图 (Screenshots)
* **数量要求**：至少 1 张，建议 3~4 张。
* **尺寸规格**：必须严格为 **`1280 × 800`** 像素或 **`640 × 400`** 像素。
* **建议内容**：
  * 截图 1：主界面（浅色模式）——展示网页侧边栏读取图片效果。
  * 截图 2：深色模式——展示暗色主题与自适应侧栏体验。
  * 截图 3：保存目录与批量下载——展示自定义子目录、多选/连选与原图去重。
* **素材来源**：可直接基于 [`docs/assets/panel-preview.png`](assets/panel-preview.png) 和 [`docs/assets/panel-preview-dark.png`](assets/panel-preview-dark.png) 放在 1280×800 背景画板中导出。

### 3. 文案草案

* **扩展名称 (Extension Name)**：
  > 页面图片保存 (Page Image Downloader)
* **短描述 (Summary，132 字以内)**：
  > 在原生侧边栏多选并批量保存当前网页已加载的原图，支持按网页标题建目录、格式与尺寸筛选、原图去重及失败重试。
* **详细描述 (Detailed Description)**：
  > 【核心特性】
  > 1. 原生侧边栏设计：使用 Chrome Side Panel，保存图片时不打扰主网页浏览与操作。
  > 2. 原图无损提取：直接从已渲染内容中提取原始图片二进制字节，避免二次请求和网络重复消耗。
  > 3. 智能目录与命名：通过原生文件系统 API 直接保存到本地指定目录，支持按页面标题自动创建子目录，同名文件自动避让。
  > 4. 高效筛选与去重：支持基于 SHA-256 原图去重，支持按可见视口、最小分辨率多维度筛选。
  > 5. 键盘与手势增强：支持 Shift 连选、Ctrl+A 全选以及 Alt+Shift+D 一键保存快捷键。
  > 6. 安全无侵入：严格遵循 Manifest V3，所有图片与目录操作完全在用户本地浏览器完成，绝不向任何外部服务器上传数据。

* **类别 (Category)**：
  > 照片 (Photos) 或 生产力工具 (Productivity)
* **主要语言 (Primary Language)**：
  > 中文（简体） / Chinese (Simplified)

---

## 四、权限理由与隐私政策填写 (审核核心重点)

Chrome Web Store 对扩展权限审查极其严格，在后台 **“隐私权做法 (Privacy practices)”** 标签页中需填写各权限的必要性理由。

> [!TIP]
> 本扩展在 CSP 中明确声明了 `connect-src 'none'`（禁止所有外联网络请求），这是审核时巨大的安全加分项，表明扩展绝无任何数据外传行为。

### 1. 单一用途说明 (Single Purpose)
* **声明内容**：
  > 本扩展仅用于让用户在浏览器的原生侧边栏中查看并批量保存当前活动网页中已经加载好的图片资源至本地磁盘。

### 2. 权限使用理由模板 (Permission Justifications)
在申请的权限列表中，对照填写如下原因：

| 权限名称 | 审核理由参考 (可直接复制中英文) |
| :--- | :--- |
| **`activeTab`** | 仅在用户主动点击扩展图标或快捷键时，获取当前标签页临时访问权，用于读取该页面已展示的图片信息。<br>*(Used only when the user invokes the extension to inspect images currently displayed on the active tab.)* |
| **`scripting`** | 仅在用户主动调用的当前网页中执行独立的轻量图片扫描函数，统计图片尺寸、地址别名和可见性。<br>*(Used to execute an isolated scanning function on the active tab to detect loaded image elements and dimensions.)* |
| **`pageCapture`** | 导出当前网页的受控 MHTML 离线快照，以便直接从中提取已加载图片的原始二进制字节，无需重新向服务器发起网络下载。<br>*(Used to obtain a local MHTML snapshot of the current page to extract original image bytes without re-fetching.)* |
| **`sidePanel`** | 提供 Chrome 原生的持久化侧边栏交互界面，防止弹窗因失焦误关闭而中断长任务下载。<br>*(Used to display the UI in Chrome's native Side Panel so downloads are not interrupted when the main page is clicked.)* |
| **`storage`** | 用于在浏览器本地保存用户的筛选偏好（如默认最小尺寸、是否建子目录）和会话任务状态，不涉及用户敏感数据。<br>*(Used only to store user UI preferences and session task states locally within Chrome.)* |

### 3. 数据收集与隐私声明 (Data Usage)
* **数据收集声明**：勾选 **“不收集任何用户数据 (Does not collect any user data)”**。
* **认证声明**：勾选以下所有合规项：
  * 不出售用户数据。
  * 不将数据用于与核心功能无关的用途。
  * 不将数据用于信贷审查或借贷评估。
* **隐私权政策链接 (Privacy Policy URL)**：
  * Google 要求当涉及 activeTab / scripting 权限时必须提供公开的隐私政策网页。
  * **建议做法**：在 GitHub Pages 或公开 Gist / Notion 建立一个简单的只读页面，内容声明“本插件所有逻辑完全在本地运行，绝不搜集、存储或传输任何个人信息与图片数据至第三方”。

---

## 五、提交审核与发布流程

1. 完成上述所有信息填写与素材上传后，点击右上角的 **“提交审核 (Submit for Review)”**。
2. **审核周期**：Manifest V3 插件通常在 **1 ~ 3 个工作日** 内完成审核。若遇到节假日可能会稍有延长。
3. **审核结果**：
   * **通过**：控制台状态变为 **已发布 (Published)**，插件会自动上线并生成专属公开链接。
   * **驳回**：Google 审查团队会发邮件明确指出需要修改的说明项或截图（通常只需要补充权限理由或隐私说明，按要求调整后再次点击提交即可）。

---

## 六、后续版本更新流程

当后续扩展代码有改动或界面更新时：
1. 修改 `extension/manifest.json` 中的 `"version": "1.0.1"`（版本号必须递增）。
2. 运行 `npm run package` 重新打包。
3. 登录开发者控制台，进入该商品，点击 **“上传更新的程序包 (Upload updated package)”**。
4. 填写该版本的更新说明（Changelog），点击提交审核。
5. 审核通过后，已安装该扩展的所有 Chrome 用户将在数小时内自动静默更新到最新版本。
