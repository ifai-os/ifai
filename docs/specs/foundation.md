# 地基（第 1–2 周）

## 目标

把所有模块共用的部分先搭好：应用框架、数据库与迁移、账号、五种语言路由、设计令牌与基础组件、CI 和预览环境。做完以后，开始任何一个模块都只需要写这个模块自己的代码。

## 设计稿

- 设计令牌：画布「设计令牌」画板 → `src/app/(frontend)/globals.css`
- 导航栏：各页面画板顶部的导航（logo、7 个模块、语言切换、登录）
- 卡片：「IFAI 首页」画板上的日报条目、热门应用、新上架 Skills、即将上线
- 图标：「IFAI 图标（已定稿）」画板的简化 3 → `src/app/icon.svg`、`favicon.ico`、`apple-icon.png`、`public/brand/`
- 状态：「空状态与加载状态」画板的通用部分 → `src/components/states/`（骨架、空状态、加载失败、断网提示）、`error.tsx`、`not-found.tsx`

## 已实现

| 清单项 | 位置 |
|---|---|
| Next.js 16 + Payload 3 + Postgres，连接 Neon；文件存 R2 | `src/payload.config.ts`、`src/app/(payload)/` |
| Better Auth：Google、GitHub、邮箱魔法链接 | `src/lib/auth/`、`src/app/api/auth/[...all]/`、`/[locale]/sign-in` |
| next-intl 五语言路由；简 → 繁转换脚本 | `src/i18n/`、`src/proxy.ts`、`scripts/i18n-hant.ts` |
| 设计令牌写成 Tailwind 主题；导航栏和卡片组件 | `globals.css`、`src/components/` |
| 空状态与加载状态：列表 / 卡片骨架（300 ms 后显示，10 s 后改为重试）、空状态、加载失败、断网提示（恢复后自动刷新）、全站错误页、404 | `src/components/states/`、`src/components/button.tsx`、`[locale]/error.tsx`、`[locale]/not-found.tsx` |
| 站点地图与 robots.txt（见下） | `src/lib/sitemap.ts`、`src/lib/robots.ts`、`src/app/sitemap.xml/`、`src/app/sitemaps/`、`src/app/robots.ts`、各模块的 `sitemap.ts` |
| 结构化数据（JSON-LD）与分享卡片（见下） | `src/lib/structured-data.tsx`、`src/lib/seo.ts`（`shareCard`）、各模块的 `structured-data.ts` |
| AGENTS.md、GitHub Actions、Vercel 预览环境 | `AGENTS.md`、`.github/workflows/`、`vercel.json`、`docs/setup.md` |

首页目前用 `src/modules/home/demo-data.ts` 里的示例数据，页面顶部有「演示数据」提示；日报、应用、资源三个入口是「即将上线」占位页。

## 站点地图与 robots.txt

技术方案第 9 节：sitemap 和页面 `<head>` 里的 canonical / hreflang 用同一套语言映射（`src/lib/seo.ts`），只列已发布、可索引的规范地址。

- `/sitemap.xml` 是索引，列出四段：`pages`（首页、三个模块的列表和分类、资源的使用指南和发布指南、应用的提交页、已生成的海报）、`daily`（已发布新闻）、`apps`（已发布应用）、`skills`（已发布 Skill 的主页）。每段一个文件 `/sitemaps/<段>-<序号>.xml`，超过 9000 个页面（× 5 种语言 = 45,000 个地址，低于 50,000 的上限）自动拆成下一个文件。
- 每个页面的五种语言各占一条 `<url>`，每条都带完整的 hreflang（五种语言 + `x-default` 指英文），和页面 `<head>` 一致。`lastmod` 只写知道的：新闻是更正时间或发布时间，应用和 Skill 是更新时间，海报是生成或改动时间，列表页不写。
- 不列：搜索、筛选、排序、翻页、应用的其他榜单、Skill 固定版本和文件页、下架的 Skill（页面还在但不进 sitemap）、撤回或待审的新闻、草稿、个人页、登录页、管理订阅页。
- 数据跟着各模块自己的缓存标签走（`daily`、`apps`、`skills`），发布、撤回、下架后随页面一起刷新；CDN 缓存 10 分钟。
- `robots.txt`：只拦不是页面的地址（`/admin`、`/api/`、应用的「打开网站」跳转 `/*/apps/*/visit`，爬虫点它会算进应用热度）。noindex 的页面不拦，否则爬虫读不到 noindex。Vercel 预览环境整站 `Disallow: /`。

## 结构化数据与分享卡片

技术方案「SEO 验收」：页面标题、描述、结构化数据与可见内容、日期一致。JSON-LD 只写页面上看得到的东西，用 `<JsonLd>` 输出（`<`、`>`、`&` 转义，空字段不写）。

- 首页：`WebSite`（这种语言的首页地址、站点简介）和 `Organization`（IFAI 和 logo）。搜索框（`SearchAction`）等全站搜索上线后再加。
- 日报详情：`NewsArticle`。标题（超过 110 字截断）、摘要、语言是标题实际显示的语言（缺译回退英文时就是 `en`）；`datePublished` 是审核通过的时间，`dateModified` 是更正时间（没更正过就同发布时间）；`isBasedOn` 是原始公告的链接；作者和发布者都是 IFAI。
- 应用详情：`SoftwareApplication`。名字、介绍、主分类、logo、官网图、功能标题、开发者，`sameAs` 是官网。不写评分：评价在浏览器里读，满 5 条才有平均分；价格只在「免费」「开源」时写 0。常见问题不写 `FAQPage`（Google 只给政府和医疗网站显示）。
- Skill 详情：`SoftwareSourceCode`。名字、简介、仓库、许可证（SPDX 链接）、作者（「IFAI 官方」写成 IFAI）、显示的版本和它的发布时间、标签。固定版本页（noindex）和下架的 Skill 不写。
- 三个详情页都带面包屑 `BreadcrumbList`：首页 › 模块 › 分类 › 本页。
- 分享卡片：页面自己设 `openGraph` 时会整个替换布局里的（Next.js 只合并一层），所以一律经过 `shareCard()`，保留站名、语言和图片；标题和描述由 Next.js 从页面的标题、描述补上。日报详情是 `article`，带发布和更正时间；应用详情用官网图（页面上也显示），没有就用站点图；海报页用自己的海报图。

## 账号页与删除账号

面向海外读者，上线前要能自己删除账号（GDPR 的删除权）。画布上没有这一页的画板，版式照「我的收藏」：标题、一段说明、一个区块。

- **入口**：账号菜单在「我的收藏」下面加「账号」，地址 `/[locale]/me/account`，不进索引、不进 sitemap。没登录时显示登录表单，登录后回到这一页。
- **页面**：登录邮箱；「删除账号」一段写明会删掉什么、留下什么，红字按钮打开确认对话框。对话框里再说一遍，按「永久删除」才删。
- **删掉的**：账号本身和登录记录（`auth_sessions`、`auth_accounts`），收藏（`saves`），写过的应用评价和它们的译文、别人对这些评价的举报（外键级联）；提交过的应用和投稿过的 Skill（`app-submissions`、`skill-submissions`，里面有联系邮箱），报过的应用报错（`app-reports`，可能留了联系方式）和举报过的评价（`app_review_reports`），不论处理到哪一步。已经收录的应用和 Skill 本身不动。隐私政策「保留多久」写的是评价、报错和投稿保留到账号删除为止，这里照做。
- **留下的**：日报邮件订阅（按邮箱、不跟账号绑定，用邮件里的链接退订）。
- **怎么删**：Better Auth 自带的 `deleteUser`。没有密码，所以按登录时间判断：一天内登录过的直接删；超过一天的提示重新登录（对话框里给登录表单，登录后回到账号页）。删除前在 `beforeDelete` 里删投稿、报错和举报（`src/lib/auth/delete-member.ts`），这一步失败就不删账号，读者可以再试。删完回到账号页，显示「账号已删除」。
- 不发确认邮件：本地和没配 Resend 的环境也能用；重新登录这一步已经确认是本人。

## 约定

- 数据库表：Payload 集合 `admins`、`media`；Better Auth 的 `auth_*` 四张表通过 `beforeSchemaInit` 加入 Payload 的 schema，由同一套迁移创建。
- 后台管理员（Payload）与站点用户（Better Auth）分开：后台只给站长。
- 语言：代码 `en / zh-Hans / zh-Hant / ja / ko`，URL `/en /zh-hans /zh-hant /ja /ko`，默认英语。
- 分期：`NEXT_PUBLIC_SITE_PHASE` 控制导航；第一期只显示日报、应用、资源。

## 不做

搜索、定时任务、模型调用、统计与报错监控、订阅邮件、法律页面——按路线图在后续几周接入。

## 验收标准

- [x] `/` 按浏览器语言跳到对应前缀；手动切换语言后记住选择
- [x] 五种语言首页都能打开，`<html lang>` 正确
- [x] 简体文案改动后，`pnpm i18n:hant` 生成繁体；CI 检查五种语言 key 一致、繁体是最新的
- [x] 只配了哪种登录方式的环境变量，登录页就只显示哪种
- [x] 空数据库执行 `pnpm payload migrate` 后能打开 `/admin` 创建管理员
- [x] CI：类型检查、lint、单元测试、迁移、构建、Playwright 冒烟测试
- [x] 账号菜单进「账号」，删除账号后收藏、评价、报错、举报、投稿都没了，再用同一邮箱登录是一个新账号
- [ ] 在 Vercel 上配好生产与预览环境（需要你按 `docs/setup.md` 操作）
