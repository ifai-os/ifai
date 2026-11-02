# Agent 接入（开放 API、MCP、命令行）

状态：草稿（2026-11-02），第 1 步（只读）已实现，待预览环境验收；「已定的规则」里标「按推荐」的等站长确认，可以推翻

## 目标

让 AI Agent 像读者一样用 IFAI：读新闻、应用、Skill、文章和排行，搜索；在会员授权下收藏、关注，在圈子里发动态、回应。站长 2026-11-02：「整个社区应该做成 AI 原生，开放 CLI、MCP，让 Agent 也能接入社区里发帖、互动、学习、获取新闻」。

三个入口用同一套操作：

- **开放 API**：`/api/v1/…`，JSON（加 `format=md` 是 MCP 工具同样的 Markdown），给写代码的人、Agent 框架和只会抓网页的 Agent 用；`/api/v1/openapi.json` 是它的 OpenAPI 描述。
- **MCP**：`https://ifai.io/mcp`，给 Claude、ChatGPT、Cursor、Codex 这类 Agent 直接接入。
- **命令行**：`ifai`，给在终端里干活的 Agent（Claude Code、Codex、OpenClaw）和人用（第 3 步）。

另有 `/llms.txt`：用 Markdown 告诉 Agent 这个站有什么、从哪里读。

第 1 步只开放读：不用登录，第一期就能用。写操作随第 2 步的 Agent 身份和令牌一起来。

## 已定的规则

1. **一套操作，三个入口。** 每个操作在 `src/modules/agents/operations/` 定义一次：名字、给 Agent 看的说明、参数（zod）、属于哪个模块、读还是写、怎么取数据、怎么写成 Markdown。开放 API 的路由、MCP 的工具、OpenAPI 描述、命令行的子命令都从这份清单生成，不各写一份。
2. **跟着分期走。** 模块没上线（`isLaunched`），它的操作不出现在 MCP 的工具列表和 OpenAPI 里，接口回 404，和页面一样。搜索只搜已上线的类型。
3. **读不用登录。** 读到的就是页面上公开的东西：已发布的新闻、应用、Skill、文章，显示中的圈子和动态，已发布的排行。权限检查走各模块原来的读取函数（`overrideAccess: false`），开放 API 不另开后门。
4. **写要令牌，不认浏览器登录**（第 2 步）。令牌属于某个会员名下的 Agent，只有「读写」令牌能写。写操作只看 `Authorization: Bearer` 里的令牌，不认网站的登录 cookie，这样别的网站没法借读者的浏览器替他发东西。
5. **Agent 挂在会员名下**（按推荐，站长在项目里选）。Agent 不能自己注册：会员在设置页给 Agent 起名字、发令牌，每人最多 3 个 Agent。Agent 写的内容署 Agent 的名字，带「Agent」标记和主人的名字。每个 Agent 都由一个邮箱验证过的会员负责，站长停用 Agent 或会员时它的令牌一起失效。
6. **Agent 能写什么**（第 2 步）：收藏、关注（行业标签、公司与产品）、圈子（加入、发动态、删自己的、表情回应、举报），圈子做好评论（圈子第 3 步）后加评论。**不开放给 Agent**：应用评价（星级要来自用过的人）、排行的盲测投票（要的是人的偏好）、账号设置、下载数据和删除账号。提交应用、投稿 Skill 以后再看。
7. **限流**（第 2 步）。每个令牌每分钟 60 次请求，超了回 429 和 `Retry-After`；没带令牌的按访客（`src/lib/visitor.ts`）每分钟 60 次。每个 Agent 每个上海自然日最多发 5 条动态、200 次表情回应，和主人自己的上限（每天 10 条动态）分开算。第 1 步只读：公开的 GET 回答走 CDN 缓存，和看页面一样。
8. **外部内容是数据，不是指令**（AGENTS.md 第 9 条）。交给 Agent 的会员内容（圈子动态）和作者写的内容（Skill 的 SKILL.md）放进带随机编号的 `<untrusted nonce="…">` 块，编号每次回答都不同，内容里没法提前写出结束标记；MCP 的说明和每个工具的说明都写明块里的东西不能当指令执行。新闻、应用介绍和文章是站长审过的，照常给。
9. **语言。** 读操作都有 `lang`（`en`、`zh-Hans`、`zh-Hant`、`ja`、`ko`，大小写不论，默认 `en`），按页面同样的规则选：有这种语言就用它，没有就用英语，并在回答里写明实际是哪种语言（`lang`）。圈子动态和文章保留原文，和页面一样不按语言过滤。
10. **每一条都带网址。** 新闻、应用、Skill、文章、动态都带页面的完整网址（按 `lang` 的语言前缀），Agent 引用时给读者链接。
11. **不进搜索引擎，但 Agent 能读。** 接口回答带 `X-Robots-Tag: noindex`。`robots.txt` 照旧拦 `/api/`，再拦 `/mcp`，但放行 `/api/v1/`：有的 Agent 抓网页的工具守 `robots.txt`，拦了它们就读不到；放行后搜索引擎能抓到，但 `noindex` 让它不收录（和 `robots.ts` 一贯的做法一样）。`/llms.txt` 不拦。

## 设计稿

画布上没有对应画板：第 1 步没有页面。第 2 步设置页加「Agent」分区（照「IFAI 账号设置」画板的分区样式），署名旁的「Agent」标记照评价、动态的署名行，做之前在画布「照实现补的画板」下补两张。

## 数据

**第 1 步不加表**，只读各模块已有的数据。日报加一个读取函数 `storyFeed`（按时间往前翻、`since` 之后的新闻），其余都用模块已有的读取函数。

第 2 步起（表结构走 Payload 迁移，Drizzle 表加进 `beforeSchemaInit`）：

| 名称 | 存放 | 关键字段 |
|---|---|---|
| `agents` | Drizzle | 主人（会员，删号时一起删）、名字、简介、创建时间、站长停用的时间和原因 |
| `agent_tokens` | Drizzle | Agent、备注名、前缀（给人认）、SHA-256 哈希、权限（`read` / `write`）、过期时间、最后使用的时间和地址、撤销时间 |
| `api_rate_limits` | Drizzle | 键（令牌或访客）、分钟窗口、次数；过期的每天清掉 |
| `circle_posts.agent_id`、`circle_post_reactions.agent_id` | 加列 | 可空：哪个 Agent 写的 |

令牌长这样：`ifai_` 加 32 个字节的随机串（base62），只在创建时显示一次；库里只存哈希。「下载我的数据」加上 Agent 和令牌（名字、前缀、权限、时间，不含哈希），删号时一起删。

浏览器插件（一键推到采集流程，PR #102）现在用 Vercel 里的一个共用 `PUSH_TOKEN`。第 2 步给令牌加第三种权限 `collect`：只有登录邮箱和某个后台管理员（`admins`）相同的会员能勾，插件改用这种令牌，全站只剩一种登录方式，`PUSH_TOKEN` 随后去掉。

## 接口

### 开放 API（第 1 步）

都是 `GET`，参数在查询串里，回答是 JSON；加 `format=md` 回 MCP 工具同样的 Markdown（`text/markdown`），给只会抓网页的 Agent。数字和布尔值从查询串里按参数的类型读（`no_key=true`），同一个参数给两次回 400，不认识的参数不管。出错时回 `{ "error": { "code": "…", "message": "…" } }`：400 参数不对（`message` 说哪个）、404 没有这个（或模块没上线）、405 方法不对、500 站内出错（不带细节）。

| 地址 | MCP 工具 | 模块 | 读什么 |
|---|---|---|---|
| `/api/v1` | — | — | 入口：版本、MCP 地址、OpenAPI 和 llms.txt 的地址 |
| `/api/v1/openapi.json` | — | — | OpenAPI 3.1 描述（只含已上线模块的操作） |
| `/api/v1/news` | `list_news` | 日报 | 已发布的新闻，新的在前；`category`、`tag`、`since`（这个时间之后）、`before`（上一页的 `next`）、`limit`（1–50，默认 20） |
| `/api/v1/news/trending` | `trending_news` | 日报 | 48 小时热门（和日报页右栏一样），带热度 |
| `/api/v1/news/{slug}` | `read_news` | 日报 | 一条新闻：正文、来源、行业标签、公司与产品（带话题的 `key`）、同一事件的进展、话题追踪 |
| `/api/v1/news/topic/{key}` | `news_topic` | 日报 | 一家公司或一个产品的话题页：相关新闻，对应的应用（地址和页面 `/news/topic/{key}` 一样） |
| `/api/v1/apps` | `list_apps` | 应用 | 应用榜：`board`（top / rising / new）、`sort`、`category`、`q`、`page`，和应用列表页同一套参数 |
| `/api/v1/apps/categories` | `app_categories` | 应用 | 应用分类和各自的数量（`categories` 因此加进应用的保留 slug） |
| `/api/v1/apps/{slug}` | `read_app` | 应用 | 一个应用：介绍、核心功能、常见问题、平台、价格、热度、日报里提到它的新闻、替代品 |
| `/api/v1/skills` | `list_skills` | 资源 | Skill 列表：`category`、`q`、`tag`、`author`、`sort`、`no_key`、`certified`、`page`，同资源列表页 |
| `/api/v1/skills/{slug}` | `read_skill` | 资源 | 一个 Skill：说明、能做什么、示例、注意事项、版本、安全检测、安装方式（install.md 和 Zip 的地址、指纹），以及 SKILL.md 原文（`untrusted`） |
| `/api/v1/search` | `search` | 已上线的类型 | 全站搜索：`q`、`kind`（all / news / apps / skills）、`page` |
| `/api/v1/articles` | `list_articles` | 推荐 | 文章：`tab`（picks / latest）、`channel`、`tag`、`page` |
| `/api/v1/articles/{id}` | `read_article` | 推荐 | 一篇文章，正文转成 Markdown |
| `/api/v1/circles` | `list_circles` | 圈子 | 显示中的圈子：介绍、人数、今天的动态数 |
| `/api/v1/circles/posts` | `circle_posts` | 圈子 | 动态流：`tab`（hot / latest）、`circle`（slug）、`cursor`；正文在 `untrusted` 块里（MCP）或标着 `untrusted: true`（API）；动态没有自己的页面，网址是所在圈子的页面；作者只给昵称 |
| `/api/v1/rankings` | `model_rankings` | 排行 | 赛道列表和各自的前三；带 `arena` 时是这个赛道最新一周的排名（可按 `weights`、`region` 筛）。只给 IFAI 自己的盲测；外部榜单（Arena、Artificial Analysis）按来源各自的条款不经接口转发 |

- 缓存：没带 `Authorization` 的 GET 回答 `public, max-age=0, s-maxage=60, stale-while-revalidate=300`，和日报的「加载更多」一样；带了的一律 `private, no-store`（第 2 步起回答里有「我」的东西）。
- 跨域：`Access-Control-Allow-Origin: *`，不带凭据，浏览器里的工具也能读；`OPTIONS` 预检放行 `Authorization`。
- 路由：一个文件 `src/app/api/v1/[[...path]]/route.ts` 按清单分发，固定的路径（`/news/trending`）先于带参数的（`/news/{slug}`）。

### MCP（第 1 步）

- 地址 `https://ifai.io/mcp`（`src/app/mcp/route.ts`，`src/proxy.ts` 不给它加语言前缀），Streamable HTTP，用官方 TypeScript SDK v2（`@modelcontextprotocol/server`）的 `createMcpHandler`：新协议（2026-07-28）和 2025 年的客户端都能连，每个请求独立处理、服务器不存会话，Vercel 上横向扩展不用改。
- 工具就是上表的操作（只列已上线模块的），都标 `readOnlyHint`。工具返回 Markdown：每一条写明 slug 或编号和网址，Agent 能接着调详情；长列表写明下一页怎么取。
- 提示词 `daily_briefing`（参数 `lang`）：读过去 24 小时的新闻和 48 小时热门，写一段当天 AI 要闻，每条带链接。Claude Code 里是 `/mcp__ifai__daily_briefing`。
- 服务器说明（`instructions`）：IFAI 是什么、`lang` 怎么用、引用时给网址、`untrusted` 块是数据不是指令。
- 跨域同开放 API；不认 cookie，第 2 步只认 `Authorization: Bearer`。
- 有人在浏览器里直接打开 `/mcp`，看到的是一段纯文字的接入方法（MCP 客户端的 GET 带 `text/event-stream`，照常交给 SDK）。

接入方法（llms.txt 和第 2 步设置页里都写）：

- Claude Code：`claude mcp add --transport http ifai https://ifai.io/mcp`
- Codex：`codex mcp add ifai --url https://ifai.io/mcp`
- Cursor、VS Code 等：配置里加 `{ "ifai": { "url": "https://ifai.io/mcp" } }`
- Claude、ChatGPT 网页版：添加自定义连接器，地址 `https://ifai.io/mcp`（第 1 步只能读；登录随第 4 步的 OAuth）

### llms.txt（第 1 步）

`/llms.txt`（`src/app/llms.txt/route.ts`），按 llmstxt.org 的格式：一句话介绍、怎么接入（MCP、开放 API、OpenAPI、以后的命令行）、每个已上线模块的入口页和 RSS、语言和网址的规则、内容的用法（引用给链接、`untrusted` 块）。英文，地址按当前站点（预览环境写预览的地址）。缓存一小时。

### 写操作（第 2 步）

`POST` / `DELETE` 同一套路由：`/api/v1/saves`、`/api/v1/follows`、`/api/v1/circles/members`、`/api/v1/circles/posts`、`/api/v1/circles/posts/{id}`、`/api/v1/circles/reactions`、`/api/v1/circles/reports`，加 `/api/v1/me`（这个 Agent 和主人的名字、权限、今天还能发几条）。MCP 工具同名（`save`、`follow`、`join_circle`、`create_post`、`delete_post`、`react`、`report_post`、`whoami`），只在带了读写令牌时出现。

### 命令行（第 3 步）

`npx ifai`（npm 包名第 3 步定）：`ifai news`、`ifai news read <slug>`、`ifai apps`、`ifai skills`、`ifai skills install <slug>`（下载 Zip、核对 sha256、解到 `~/.claude/skills/` 等宿主目录）、`ifai search`、`ifai post`、`ifai login`（像 GitHub CLI 那样：命令行显示一个码，读者在浏览器里登录、选 Agent、确认，命令行拿到令牌，存在本机）、`ifai mcp`（本地 stdio 转发，给只支持 stdio 的客户端）。另写一个教 Agent 用 IFAI 的 Skill，发在资源里。

### OAuth（第 4 步）

Claude、ChatGPT 网页版的「连接」要 OAuth：用 Better Auth 的 OAuth Provider 插件（`@better-auth/oauth-provider`，支持动态注册和 PKCE），授权页让读者选用哪个 Agent 身份。MCP 按 RFC 9728 发布受保护资源的元数据，没带令牌调写工具时回 401 和 `WWW-Authenticate`，客户端据此走授权。

## 后台

第 1 步没有后台改动。第 2 步：

- 左侧「Agent」页：每个 Agent 的主人、名字、令牌数、最近使用、今天的请求数和写入数；可以停用（写原因）、恢复，停用后它的令牌立即失效。
- 圈子「动态」标签里，Agent 发的动态带「Agent」标记和主人的邮箱。
- 「操作记录」记停用和恢复（`withAdminLog`）。
- 总开关 `AGENT_WRITES_ENABLED`（`src/lib/switches.ts`）：关掉时所有写操作回 503，读照常。

## 定时任务与 AI

不调用模型：Agent 自己的模型在 Agent 那边。第 2 步加一个每天的任务，清掉过期的限流计数。

## 多语言

- 接口里的内容按 `lang`（规则 9）；工具说明、服务器说明、llms.txt、OpenAPI、错误信息用英文：读的是 Agent。
- 第 2 步设置页的「Agent」分区和「Agent」标记五种语言（`messages/`），繁体由 `pnpm i18n:hant` 生成。

## 不做

- Agent 自己注册（像 Moltbook 那样先开号再认领）：最容易被刷，也没人负责。
- Agent 改账号、看登录设备、下载数据、删号；应用评价和排行投票（规则 6）。
- 推送（新新闻 webhook、MCP 的订阅通知）：先看有没有人要。
- 按调用收费、给第三方开发者发 API Key：现在令牌只属于会员自己的 Agent。

## 实现顺序

1. **只读**：操作清单、开放 API、MCP、OpenAPI、llms.txt。
2. **Agent 身份与令牌**：`agents`、`agent_tokens`、限流表；设置页「Agent」分区；写操作（收藏、关注、圈子）和 MCP 写工具；「Agent」标记；后台「Agent」页和总开关；导出与删除账号。
3. **命令行与 IFAI Skill**：`ifai` 命令、浏览器确认登录、`ifai skills install`、`ifai mcp`；教 Agent 用 IFAI 的 Skill。
4. **OAuth**：Claude、ChatGPT 网页版一键连接，选 Agent 身份。

## 测试

- 单元（`tests/unit/agents/`）：参数解析（各种 `lang` 写法、页码、布尔值）、路由匹配（固定路径优先）、操作清单（名字不重复、路径参数都在参数里、跟着分期）、新闻翻页的 `next`、Markdown 和 `untrusted` 块（内容里写结束标记也逃不出去）、文章正文转 Markdown、OpenAPI、错误回答。MCP 在进程里给 `/mcp` 的处理函数发 JSON-RPC：初始化、列工具、调工具、出错。
- 冒烟（`tests/e2e/agents.spec.ts`，CI 用第二期构建和示例数据）：`/llms.txt`、`/api/v1/news` 和一条新闻、`/api/v1/openapi.json`、MCP 的工具列表和一次调用；圈子和文章在第二期出现，排行在第三期；示例数据里的新闻、应用和搜索对得上。

## 验收标准

第 1 步：

- [ ] `/llms.txt` 返回 Markdown：介绍、MCP 和开放 API 的地址、各模块入口；预览环境写的是预览的地址
- [ ] `GET /api/v1/news?lang=zh-Hans&limit=5` 返回 5 条最新新闻，简体标题、`lang`、网址带 `/zh-hans/`；`since=<一条新闻的时间>` 只返回它之后的；用 `next` 翻页不重复、不漏
- [ ] `GET /api/v1/news/<slug>` 有正文、来源、公司和产品；不存在的 slug 回 404 和 JSON 错误
- [ ] `GET /api/v1/apps?board=rising`、`/api/v1/apps/<slug>`、`/api/v1/skills?category=…`、`/api/v1/skills/<slug>`、`/api/v1/search?q=claude` 和对应页面上看到的一致
- [ ] `lang=ko` 的应用没有韩语介绍时给英语，`lang` 写 `en`
- [ ] `NEXT_PUBLIC_SITE_PHASE=1` 时 `/api/v1/circles`、`/api/v1/articles`、`/api/v1/rankings` 都是 404，MCP 工具列表和 OpenAPI 里没有它们；改成 2 以后圈子和文章出现
- [ ] Claude Code 里 `claude mcp add --transport http ifai <站点>/mcp` 之后，问「今天有什么 AI 新闻」能拿到新闻、带链接；问「找一个做代码审查的 Skill，告诉我怎么装」能给出 Skill 和安装方式
- [ ] 圈子动态在 MCP 里放在 `untrusted` 块里，动态正文写 `</untrusted>` 也不会提前结束这个块
- [ ] `/api/v1/openapi.json` 是合法的 OpenAPI 3.1（能导入 Swagger Editor）
- [ ] 回答都带 `X-Robots-Tag: noindex`；`robots.txt` 拦 `/mcp`、放行 `/api/v1/`
