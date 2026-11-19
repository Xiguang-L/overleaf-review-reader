# Overleaf Review Reader

Read, search and export the review comments in the Overleaf project you have open. The reader shows each comment with its replies, author names and resolution status. JSON exports include the whole project, regardless of the current filters. Comment text is kept verbatim in `threads[].messages[].body`.

[简体中文](#简体中文) · [Privacy policy / 隐私政策](PRIVACY.md)

### Local installation

1. Download and unzip the ZIP from the [latest release](https://github.com/Xiguang-L/overleaf-review-reader/releases/latest).
2. Open `chrome://extensions`, turn on **Developer mode**, then choose **Load unpacked** and select the unzipped folder. If you cloned the source instead, select its `extension` folder.
3. Open an Overleaf project editor while signed in. Click **Overleaf Review Reader** from that tab. On first use, read the access notice and click **Read project comments**.

The reader follows Chrome's display language if it is English or Simplified Chinese, with English as the fallback. Use **Language** at the top of the reader to override it. Changing the interface language does not translate or change your comments or JSON export.

The extension only reads data the signed-in user can access. It does not download the project's source files, talk to GitHub, or modify the project. It relies on Overleaf's internal endpoints, which may change. **Include selected source text** is off by default; excerpts and positions may be unavailable, and offsets are not mapped to local `.tex` lines.

Overleaf Review Reader is independent and is not affiliated with Overleaf.

## 简体中文

在已登录的 Overleaf 项目里点击扩展，可在新标签页阅读全项目的评论、回复和解决状态。可以搜索正文或按状态筛选；导出的 JSON 仍包含全项目的讨论。正文在 `threads[].messages[].body`，按原样保存。

界面默认跟随 Chrome，支持英文和简体中文，其他界面语言默认用英文。可在阅读页右上方手动切换；语言设置不改变评论和 JSON。

### 本地加载

1. 从[最新发布页](https://github.com/Xiguang-L/overleaf-review-reader/releases/latest)下载 ZIP 并解压。
2. 打开 `chrome://extensions`，开启「开发者模式」，点「加载已解压的扩展程序」，选择解压后的目录。用源码安装时，选择 `extension` 文件夹。
3. 打开 Overleaf 项目的编辑器标签页，点击工具栏里的 **Overleaf Review Reader**。首次使用先看访问说明，再点「读取项目评论」。

### 读取范围

- 默认只发一个请求，读取当前项目的评论列表。不逐文件切换、不下载项目源码、不登录 GitHub，也不读取或保存 Cookie。扩展依靠用户点击后授予的 `activeTab` 临时权限；如果关了原标签页或切换了项目，需要重新从编辑器打开扩展。
- 「同时读取被圈选的原文」默认关闭。开启时额外读一次评论位置，用讨论 ID 关联引用原文。引用可缺失，评论正文照样保留。JSON 里的偏移量是 Overleaf 返回的字符位置，没有换算成本地 `.tex` 的文件路径或行号。
- Overleaf 不保证内部接口一直可用。接口异常会显示提示；没有可用正文时不能导出。部分缺失的导出保留 `body: null` 和 `body_status`，不会用引用原文补位。接口返回的字符串按原样保留。「读取诊断」只显示状态和计数，可用来定位问题。
- 扩展以打开时的账号权限读取，无法读取已删除或账号不可见的评论。不会回复、标记已解决、修改源码或上传数据。只支持 `overleaf.com` 及 `www.overleaf.com`；不包含 Track Changes、PDF 或 Git 同步。

## Development / 开发

- Run `npm test` for the unit tests, which need no dependencies.
- Run `python tests/smoke.py` with Playwright and Chromium installed to test the viewer against simulated Overleaf responses. It does not visit real projects.
- Run `python tools/build_release.py <output-dir>` with Pillow installed to build the Chrome Web Store ZIP, icon and listing text. To capture both localized screenshots from a fictional project, run `python tests/smoke.py --screenshots <output-dir> --package <path-to-zip>`. See [Store submission](STORE-LISTING.md).

References: Overleaf's [thread loading](https://github.com/overleaf/overleaf/blob/main/services/web/frontend/js/features/review-panel/context/threads-context.tsx) and [project ranges](https://github.com/overleaf/overleaf/blob/main/services/web/frontend/js/features/review-panel/hooks/use-project-ranges.ts), and the [Mangluu exporter](https://github.com/Mangluu/overleaf-comments-export/tree/main/browser-extension).

License: [MIT](LICENSE).
