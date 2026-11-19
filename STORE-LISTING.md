# Chrome Web Store submission: Overleaf Review Reader

## English listing

Read all review threads available to you in the Overleaf project you have open. Comments, replies, author names and resolution status appear together in a new tab.

Open an Overleaf project in Chrome and click Overleaf Review Reader. On first use, click **Read project comments** after reading the access notice. Search comments and replies or filter by status. Choose **Export project JSON** if you want a local copy of all available threads. Selected source excerpts are optional and may be unavailable for some comments.

The extension works with your existing Overleaf session. It does not modify your project, download your source files or read your login credentials. It runs locally and has no analytics or third-party servers.

The interface is available in English and Simplified Chinese. It follows Chrome's display language by default and can be changed in the reader tab.

This is an independent extension and is not affiliated with Overleaf.

## 简体中文商店说明

在一个标签页查看你有权限访问的 Overleaf 项目评论，包括首评、回复、作者和解决状态。

在 Chrome 打开 Overleaf 项目后，点击 Overleaf Review Reader。初次使用先看访问说明，再点「读取项目评论」。可搜索评论和回复，也可按状态筛选。想留一份本地副本时，点「导出全项目 JSON」。可选读被圈选的原文，但有些评论可能没有可用的原文片段。

扩展使用浏览器已有的 Overleaf 登录会话，不修改项目、不下载源码、不读取登录凭据。数据在本机处理，没有分析统计或第三方服务器。

界面支持英文和简体中文，默认跟随 Chrome 的界面语言，也可在阅读页手动切换。

本扩展由第三方独立开发，与 Overleaf 官方无隶属关系。

## Privacy practices

| Dashboard field | Suggested text |
| --- | --- |
| Single purpose | Read and optionally export review comments from the Overleaf project the user has open. |
| `activeTab` justification | Temporarily accesses only the Overleaf editor tab where the user invokes the extension. |
| `scripting` justification | Runs packaged read-only code in that tab to fetch the project's comment list and optional source excerpts using the browser's existing Overleaf session. |
| Remote code | No. JavaScript and translation files are packaged in the extension. Overleaf responses are data displayed as text. |
| Data handled | Project URL and ID, website content, comment and reply text (personal communications), author display names, timestamps and resolution status. Optional selected source text and positions. Processed locally; no developer-side collection. Confirm the dashboard selections reflect this local use. |
| Privacy policy URL | `https://github.com/Xiguang-L/overleaf-review-reader/blob/main/PRIVACY.md` |

This extension does not request permanent host access or the `cookies` permission.

## Submit

1. Sign in to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) as the intended publisher. New publishers must register and pay Google's one-time registration fee.
2. Upload `overleaf-review-reader-0.2.0.zip` via **Add new item**. Keep `manifest.json` at the root of the ZIP.
3. Fill in the English listing and the Simplified Chinese localization. Add `store-icon-128.png` and the matching `screenshot-en.png` and `screenshot-zh-CN.png`. The screenshots use fictional project data.
4. Fill in **Privacy practices**, including the public privacy policy URL. Set **Distribution** to Public and Free if that is the intended release.
5. If providing test instructions, use a nonconfidential sample project and a dedicated test account or reviewer-accessible test resource. Do not submit credentials for a personal account or links to real manuscripts.
6. Submit for review. The listing becomes public after Google approves it and it is published.
