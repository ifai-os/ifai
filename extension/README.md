# IFAI 推送（Chrome 插件）

看到新闻或 AI 工具时点一下，推进 IFAI 的采集流程。规则见 [docs/specs/push.md](../docs/specs/push.md)。

## 安装

1. Vercel 里给要用的环境填 `PUSH_TOKEN`（`openssl rand -hex 32`），重新部署。
2. Chrome 打开 `chrome://extensions`，右上角打开「开发者模式」，点「加载已解压的扩展程序」，选这个 `extension` 文件夹。
3. 装好会自动打开设置页：填网站地址（只写到域名）和同一个令牌，点「保存并测试连接」，浏览器问是否允许访问这个网站时选允许。

更新：`git pull` 后在 `chrome://extensions` 里点这个插件的刷新按钮。Edge、Arc、Brave 等 Chromium 浏览器一样装。

## 用法

- 工具栏图标或 Alt+Shift+I：弹出面板，点「推为新闻」或「推为应用 / 工具」（猜的那个是红的）。
- 右键页面或链接：「推到 IFAI：新闻」「推到 IFAI：应用 / 工具」，结果显示在工具栏图标上。

文件：`manifest.json`、面板 `popup.*`、设置页 `options.*`、右键菜单 `background.js`、共用的读页面和请求 `push.js`（单元测试在 `tests/unit/push.test.ts`）。
