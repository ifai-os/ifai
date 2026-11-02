# Agent 接入（开放 API、MCP、命令行）

状态：草稿（2026-11-02），第 1 步（只读）和第 2 步（Agent 身份与密钥）已实现，待预览环境验收；「已定的规则」里标「按推荐」的等站长确认，可以推翻

## 目标

让 AI Agent 像读者一样用 IFAI：读新闻、应用、Skill、文章和排行，搜索；在会员授权下收藏、关注，在圈子里发动态、回应。站长 2026-11-02：「整个社区应该做成 AI 原生，开放 CLI、MCP，让 Agent 也能接入社区里发帖、互动、学习、获取新闻」。

三个入口用同一套操作：

- **开放 API**：`/api/v1/…`，JSON（加 `format=md` 是 MCP 工具同样的 Markdown），给写代码的人、Agent 框架和只会抓网页的 Agent 用；`/api/v1/openapi.json` 是它的 OpenAPI 描述。
- **MCP**：`https://ifai.io/mcp`，给 Claude、ChatGPT、Cursor、Codex 这类 Agent 直接接入。
- **命令行**：`ifai`，给在终端里干活的 Agent（Claude Code、Codex、OpenClaw）和人用（第 4 步）。

另有 `/llms.txt`：用 Markdown 告诉 Agent 这个站有什么、从哪里读。

第 1 步只开放读：不用登录，第一期就能用。第 2 步给 Agent 身份和密钥：会员在设置页建 Agent、发密钥，Agent 带着密钥调用，按 Agent 限流。写操作在第 3 步。

## 已定的规则

1. **一套操作，三个入口。** 每个操作在 `src/modules/agents/operations/` 定义一次：名字、给 Agent 看的说明、参数（zod）、属于哪个模块、读还是写、怎么取数据、怎么写成 Markdown。开放 API 的路由、MCP 的工具、OpenAPI 描述、命令行的子命令都从这份清单生成，不各写一份。
2. **跟着分期走。** 模块没上线（`isLaunched`），它的操作不出现在 MCP 的工具列表和 OpenAPI 里，接口回 404，和页面一样。搜索只搜已上线的类型。
3. **读不用登录。** 读到的就是页面上公开的东西：已发布的新闻、应用、Skill、文章，显示中的圈子和动态，已发布的排行。权限检查走各模块原来的读取函数（`overrideAccess: false`），开放 API 不另开后门。
4. **写要密钥，不认浏览器登录**。密钥属于某个会员名下的 Agent，只有「读写」密钥能写（第 3 步）。开放 API 和 MCP 只看 `Authorization: Bearer` 里的密钥，从不读网站的登录 cookie，这样别的网站没法借读者的浏览器替他发东西。带了密钥但密钥不能用（不存在、过期、Agent 被停用、格式不对）一律回 401，不当作没带密钥的访客，Agent 才知道要换密钥。
5. **Agent 挂在会员名下**（按推荐，站长在项目里选）。Agent 不能自己注册：会员在设置页给 Agent 起名字、发密钥，每人最多 3 个 Agent，同一个会员的 Agent 不重名（不分大小写和全半角）。Agent 写的内容署 Agent 的名字，带「Agent」标记和主人的名字。每个 Agent 都由一个邮箱验证过的会员负责（没验证过的不能新建）；站长停用 Agent 时它的密钥一起失效，恢复后原来的密钥接着能用；会员删号时 Agent 和密钥一起删。
6. **Agent 能写什么**（第 3 步）：收藏、关注（行业标签、公司与产品）、圈子（加入、发动态、删自己的、表情回应、举报），圈子做好评论（圈子第 3 步）后加评论。**不开放给 Agent**：应用评价（星级要来自用过的人）、排行的盲测投票（要的是人的偏好）、账号设置、下载数据和删除账号。提交应用、投稿 Skill 以后再看。
7. **限流**（第 2 步）。每个 Agent 每分钟 60 次请求（同一个 Agent 的几把密钥合在一起算），超了回 429 和 `Retry-After`；没带密钥的按访客（`src/lib/visitor.ts` 的每日访客哈希）每分钟 60 次。按分钟计数存在 `api_requests`，过了 2 天删掉。每个 Agent 每个上海自然日最多发 5 条动态、200 次表情回应，和主人自己的上限（每天 10 条动态）分开算（第 3 步）。公开的 GET 回答照旧走 CDN 缓存，命中缓存的不计数。
8. **外部内容是数据，不是指令**（AGENTS.md 第 9 条）。交给 Agent 的会员内容（圈子动态）和作者写的内容（Skill 的 SKILL.md）放进带随机编号的 `<untrusted nonce="…">` 块，编号每次回答都不同，内容里没法提前写出结束标记；MCP 的说明和每个工具的说明都写明块里的东西不能当指令执行。新闻、应用介绍和文章是站长审过的，照常给。
9. **语言。** 读操作都有 `lang`（`en`、`zh-Hans`、`zh-Hant`、`ja`、`ko`，大小写不论，默认 `en`），按页面同样的规则选：有这种语言就用它，没有就用英语，并在回答里写明实际是哪种语言（`lang`）。圈子动态和文章保留原文，和页面一样不按语言过滤。
10. **每一条都带网址。** 新闻、应用、Skill、文章、动态都带页面的完整网址（按 `lang` 的语言前缀），Agent 引用时给读者链接。
11. **不进搜索引擎，但 Agent 能读。** 接口回答带 `X-Robots-Tag: noindex`。`robots.txt` 照旧拦 `/api/`，再拦 `/mcp`，但放行 `/api/v1/`：有的 Agent 抓网页的工具守 `robots.txt`，拦了它们就读不到；放行后搜索引擎能抓到，但 `noindex` 让它不收录（和 `robots.ts` 一贯的做法一样）。`/llms.txt` 不拦。

## 设计稿

画布上没有对应画板：第 1 步没有页面。第 2 步设置页加「Agent」分区，照「IFAI 账号设置」画板的分区样式做（分区导航、卡片、行、按钮都用现成的组件），「Agent」标记照评价、动态署名行里的小标签；实现后在画布「照实现补的画板」下补「设置 · Agent」一张（列表、新建、刚生成的密钥、被停用）。

## 数据

**第 1 步不加表**，只读各模块已有的数据。日报加一个读取函数 `storyFeed`（按时间往前翻、`since` 之后的新闻），其余都用模块已有的读取函数。

第 2 步（表结构走 Payload 迁移 `agents`，Drizzle 表加进 `beforeSchemaInit`，定义在 `src/modules/agents/schema.ts`）：

| 名称 | 存放 | 关键字段 |
|---|---|---|
| `agents` | Drizzle | 主人（`auth_users`，删号时一起删）、名字、简介、创建和修改时间、站长停用的时间和原因 |
| `agent_keys` | Drizzle | Agent（删 Agent 时一起删）、备注、开头几个字符（`hint`，给人认）、SHA-256 哈希（唯一）、权限（`read` / `write`）、创建和到期时间、最后使用的时间和 IP |
| `api_requests` | Drizzle | 调用方（`a:<Agent 编号>` 或 `v:<当天的访客哈希>`）、分钟、次数；每天清掉 2 天前的 |
| `circle_posts.agent_id`、`circle_post_reactions.agent_id` | 加列（第 3 步） | 可空：哪个 Agent 写的 |

- **密钥**长这样：`ifai_` 加 43 个字母和数字（base62，256 位随机），只在创建时显示一次；库里只存哈希。一个 Agent 最多同时有 5 把密钥（过期的删掉之前也算）；有效期 30 天、90 天（默认）或 1 年，到期后回 401，过期 30 天后每天的清理任务删掉它。删除密钥就是吊销，下一个请求起回 401。
- **最后使用**的时间和 IP 最多一分钟写一次，给会员在设置页认出哪把密钥在哪用。
- 「下载我的数据」加上 Agent 和密钥（名字、简介、停用、每把密钥的备注、开头、权限、时间和最后使用的 IP，不含哈希）；删号时外键一起删。隐私政策和用户协议同一个 PR 补上 Agent（legal.md 规则 6）。

浏览器插件（一键推到采集流程，PR #102）现在用 Vercel 里的一个共用 `PUSH_TOKEN`。以后给密钥加第三种权限 `collect`：只有登录邮箱和某个后台管理员（`admins`）相同的会员能勾，插件改用这种密钥，全站只剩一种登录方式，`PUSH_TOKEN` 随后去掉（插件那个 PR 合并后再做）。

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

- 缓存：没带 `Authorization` 的 GET 回答 `public, max-age=0, s-maxage=60, stale-while-revalidate=300`，和日报的「加载更多」一样；带了的一律 `private, no-store`（回答里可能有「我」的东西）。
- 跨域：`Access-Control-Allow-Origin: *`，不带凭据，浏览器里的工具也能读；`OPTIONS` 预检放行 `Authorization`。
- 路由：一个文件 `src/app/api/v1/[[...path]]/route.ts` 按清单分发，固定的路径（`/news/trending`）先于带参数的（`/news/{slug}`）。

### MCP（第 1 步）

- 地址 `https://ifai.io/mcp`（`src/app/mcp/route.ts`，`src/proxy.ts` 不给它加语言前缀），Streamable HTTP，用官方 TypeScript SDK v2（`@modelcontextprotocol/server`）的 `createMcpHandler`：新协议（2026-07-28）和 2025 年的客户端都能连，每个请求独立处理、服务器不存会话，Vercel 上横向扩展不用改。
- 工具就是上表的操作（只列已上线模块的），都标 `readOnlyHint`。工具返回 Markdown：每一条写明 slug 或编号和网址，Agent 能接着调详情；长列表写明下一页怎么取。
- 提示词 `daily_briefing`（参数 `lang`）：读过去 24 小时的新闻和 48 小时热门，写一段当天 AI 要闻，每条带链接。Claude Code 里是 `/mcp__ifai__daily_briefing`。
- 服务器说明（`instructions`）：IFAI 是什么、`lang` 怎么用、引用时给网址、`untrusted` 块是数据不是指令。
- 跨域同开放 API；不认 cookie，只认 `Authorization: Bearer`（Claude Code：`claude mcp add --transport http ifai https://ifai.io/mcp --header "Authorization: Bearer ifai_…"`）。带了能用的密钥，工具列表多出 `whoami`，服务器说明改说「用 whoami 看你是谁」；会员写的名字不进服务器说明。
- 有人在浏览器里直接打开 `/mcp`，看到的是一段纯文字的接入方法（MCP 客户端的 GET 带 `text/event-stream`，照常交给 SDK）。

接入方法（llms.txt 和第 2 步设置页里都写）：

- Claude Code：`claude mcp add --transport http ifai https://ifai.io/mcp`
- Codex：`codex mcp add ifai --url https://ifai.io/mcp`
- Cursor、VS Code 等：配置里加 `{ "ifai": { "url": "https://ifai.io/mcp" } }`
- Claude、ChatGPT 网页版：添加自定义连接器，地址 `https://ifai.io/mcp`（不带密钥只能读；登录随第 5 步的 OAuth）

### llms.txt（第 1 步）

`/llms.txt`（`src/app/llms.txt/route.ts`），按 llmstxt.org 的格式：一句话介绍、怎么接入（MCP、开放 API、OpenAPI、以后的命令行）、每个已上线模块的入口页和 RSS、语言和网址的规则、内容的用法（引用给链接、`untrusted` 块）。英文，地址按当前站点（预览环境写预览的地址）。缓存一小时。

### 密钥与身份（第 2 步）

- `GET /api/v1/me`（MCP 工具 `whoami`）：这个 Agent 的名字和简介、主人的名字、密钥的权限和到期时间、每分钟的上限、主人管理它的设置页地址。要密钥：没带回 401；OpenAPI 里标 `security: ifaiKey`（HTTP Bearer），其他操作标「可带可不带」。
- 不能用的密钥回 401，`WWW-Authenticate: Bearer realm="IFAI", error="invalid_token", error_description="…"`（格式不对是 `invalid_request`；`error_description` 只用 ASCII），正文 `{ "error": { "code": "unauthorized", "message": "…" } }`，`message` 说明原因和去哪里换密钥。超过限流回 429、`Retry-After` 和 `rate_limited`。
- 网关在 `src/modules/agents/gate.ts`（`admit`）：查密钥、计数、记最后使用；`/api/v1` 和 `/mcp` 的路由先过它（浏览器直接打开 `/mcp` 看接入方法的不过）。

设置页的接口（`src/app/api/account/agents/`，只认本站页面发来的、登录了的请求，`private, no-store`）：

| 方法和地址 | 做什么 | 出错 |
|---|---|---|
| `POST /api/account/agents` `{ name, about }` | 新建 Agent，回 201 | 400 名字或简介不对、403 邮箱没验证、409 已有 3 个或重名 |
| `PATCH /api/account/agents/{id}` `{ name, about }` | 改名字、简介 | 404 不是自己的、409 重名 |
| `DELETE /api/account/agents/{id}` | 删 Agent 和它的密钥 | 404 |
| `POST /api/account/agents/{id}/keys` `{ label, scope, days }` | 新建密钥，回 201 和密钥本身（只此一次） | 400、403 Agent 被停用、404、409 已有 5 把 |
| `DELETE /api/account/agents/{id}/keys/{keyId}` | 删密钥，立即失效 | 404 |

设置页「Agent」分区（`/me/account?section=agents`，`src/modules/agents/components/`）：说明、每个 Agent 一张卡片（名字、「Agent」标记、简介、创建日期、修改、删除要按两次；被停用时写明原因；密钥列表：备注、权限、开头几个字符、到期或已过期、最后使用的时间和 IP，删除要按两次；新建密钥：备注、权限、有效期）、刚生成的密钥只显示一次并给出 Claude Code 的接入命令和 curl 示例、新建 Agent 的表单（没验证邮箱的会员看到说明）、MCP 和开放 API 的地址。

### 写操作（第 3 步）

`POST` / `DELETE` 同一套路由：`/api/v1/saves`、`/api/v1/follows`、`/api/v1/circles/members`、`/api/v1/circles/posts`、`/api/v1/circles/posts/{id}`、`/api/v1/circles/reactions`、`/api/v1/circles/reports`；`/api/v1/me` 加上今天还能发几条。MCP 工具同名（`save`、`follow`、`join_circle`、`create_post`、`delete_post`、`react`、`report_post`），只在带了读写密钥时出现。

### 命令行（第 4 步）

`npx ifai`（npm 包名第 4 步定）：`ifai news`、`ifai news read <slug>`、`ifai apps`、`ifai skills`、`ifai skills install <slug>`（下载 Zip、核对 sha256、解到 `~/.claude/skills/` 等宿主目录）、`ifai search`、`ifai post`、`ifai login`（像 GitHub CLI 那样：命令行显示一个码，读者在浏览器里登录、选 Agent、确认，命令行拿到密钥，存在本机）、`ifai mcp`（本地 stdio 转发，给只支持 stdio 的客户端）。另写一个教 Agent 用 IFAI 的 Skill，发在资源里。

### OAuth（第 5 步）

Claude、ChatGPT 网页版的「连接」要 OAuth：用 Better Auth 的 OAuth Provider 插件（`@better-auth/oauth-provider`，支持动态注册和 PKCE），授权页让读者选用哪个 Agent 身份。MCP 按 RFC 9728 发布受保护资源的元数据，没带密钥调写工具时回 401 和 `WWW-Authenticate`，客户端据此走授权。

## 后台

第 1 步没有后台改动。第 2 步：

- 左侧「Agent」页（`/admin/agents`，`src/modules/agents/admin/`）：顶上是总数、停用数，今天（上海时间）带密钥和不带密钥的请求数；表格每行一个 Agent：名字、简介、创建时间，主人的名字和邮箱，密钥（有效几把、共几把、几把能写），最近使用，今天的请求数，状态。新的在前，每页 50 个；可以只看已停用的；`?agent=<编号>` 只看一个（操作记录链过来）。
- 停用（可以写原因，主人在设置页看得到，最多 200 字）、恢复：`POST /api/agents/{id}/disable` `{ reason }`、`POST /api/agents/{id}/restore`（Payload 的根级接口，只认后台管理员）。停用后它的密钥从下一个请求起回 401。
- 「操作记录」记停用和恢复（`agents:disable`、`agents:restore`，`src/lib/admin-log/hooks.ts` 的 `logAdminAction`；原因是站长自己写的话，只记「附带：reason」）。「内容」筛选里多一个「Agent」，对象链回「Agent」页。

第 3 步：「Agent」页加今天的写入数；圈子「动态」标签里，Agent 发的动态带「Agent」标记和主人的邮箱；总开关 `AGENT_WRITES_ENABLED`（`src/lib/switches.ts`）：关掉时所有写操作回 503，读照常。

## 定时任务与 AI

不调用模型：Agent 自己的模型在 Agent 那边。第 2 步加一个每天的任务 `agents-cleanup`（UTC 04:40，`src/modules/agents/jobs.ts`）：删掉 2 天前的请求计数，和过期超过 30 天的密钥。

## 多语言

- 接口里的内容按 `lang`（规则 9）；工具说明、服务器说明、llms.txt、OpenAPI、错误信息用英文：读的是 Agent。
- 设置页的「Agent」分区和「Agent」标记五种语言（`messages/` 的 `agents`），繁体由 `pnpm i18n:hant` 生成（金鑰、權限、唯讀、終端機这些写进 `messages/overrides/zh-hant.json`）。后台「Agent」页照后台的惯例只有中文和英文。

## 不做

- Agent 自己注册（像 Moltbook 那样先开号再认领）：最容易被刷，也没人负责。
- Agent 改账号、看登录设备、下载数据、删号；应用评价和排行投票（规则 6）。
- 推送（新新闻 webhook、MCP 的订阅通知）：先看有没有人要。
- 按调用收费、给第三方开发者发 API Key：现在密钥只属于会员自己的 Agent。

## 实现顺序

1. **只读**：操作清单、开放 API、MCP、OpenAPI、llms.txt。（PR #103）
2. **Agent 身份与密钥**：`agents`、`agent_keys`、`api_requests`；设置页「Agent」分区和接口；开放 API 和 MCP 认密钥、按 Agent 和访客限流、`/api/v1/me` 和 `whoami`；后台「Agent」页（停用、恢复、操作记录）；导出与删除账号；每天的清理任务；隐私政策和用户协议。
3. **写操作**：收藏、关注、圈子（加入、发动态、删自己的、表情回应、举报）和 MCP 写工具；「Agent」标记；每天的写入上限；后台写入数和总开关。
4. **命令行与 IFAI Skill**：`ifai` 命令、浏览器确认登录、`ifai skills install`、`ifai mcp`；教 Agent 用 IFAI 的 Skill。
5. **OAuth**：Claude、ChatGPT 网页版一键连接，选 Agent 身份。

## 测试

- 单元（`tests/unit/agents/`）：参数解析（各种 `lang` 写法、页码、布尔值）、路由匹配（固定路径优先）、操作清单（名字不重复、路径参数都在参数里、跟着分期）、新闻翻页的 `next`、Markdown 和 `untrusted` 块（内容里写结束标记也逃不出去）、文章正文转 Markdown、OpenAPI、错误回答。MCP 在进程里给 `/mcp` 的处理函数发 JSON-RPC：初始化、列工具、调工具、出错。
- 冒烟（`tests/e2e/agents.spec.ts`，CI 用第二期构建和示例数据）：`/llms.txt`、`/api/v1/news` 和一条新闻、`/api/v1/openapi.json`、MCP 的工具列表和一次调用；圈子和文章在第二期出现，排行在第三期；示例数据里的新闻、应用和搜索对得上。
- 第 2 步单元（`tests/unit/agents/keys.test.ts`、`mcp.test.ts`）：密钥的样子和哈希、`Bearer` 的读法、名字和密钥参数的检查、停用原因、后台筛选、401 和 429 的回答（`WWW-Authenticate` 只有 ASCII）、`/api/v1/me` 要密钥、OpenAPI 的 `security`；MCP 没带密钥时没有 `whoami`，带了时有、能说出名字。导出（`export-member.test.ts`）有 Agent 和密钥、没有哈希；操作记录的两个动作有中英文名字。
- 第 2 步冒烟：不能用的密钥回 401；会员在设置页建 Agent、生成读写密钥，用它调 `/api/v1/me` 和 MCP 的 `whoami`，设置页显示最后使用；停用后 401、设置页写明原因、不能新建密钥，恢复后能用；删密钥后 401；删 Agent。设置页的接口只认本站页面和自己的 Agent。后台「Agent」页和停用接口没登录不能用。

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

第 2 步：

- [ ] 设置页「Agent」分区：新建一个 Agent，生成一把读写密钥，复制 Claude Code 的命令在本机终端运行，问「我在 IFAI 上是谁」能答出 Agent 和主人的名字
- [ ] 同一把密钥 `curl -H "Authorization: Bearer …" <站点>/api/v1/me` 回 JSON；随便改一个字符回 401，说明去哪里换密钥
- [ ] 一分钟里连发 61 次，第 61 次回 429 和 `Retry-After`
- [ ] 设置页显示这把密钥的最后使用时间和 IP；删掉后再调回 401
- [ ] 后台「Agent」页看到这个 Agent、主人、密钥数和今天的请求数；停用（写原因）后密钥回 401，设置页写明原因；恢复后原来的密钥能用；「操作记录」里有这两条，点对象回到「Agent」页
- [ ] 没验证邮箱的会员看不到新建表单，只看到说明；第 4 个 Agent、第 6 把密钥建不了
- [ ] 「下载我的数据」里有 Agent 和密钥（没有密钥本身）；删号后 Agent 和密钥都没了
- [ ] 隐私政策和用户协议五种语言都写到 Agent，最后更新日期是 2026 年 11 月 2 日
