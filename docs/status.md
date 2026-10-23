# 项目进度

给接手的人和 AI 会话看的：开工前先读 [AGENTS.md](../AGENTS.md)，再读这一页。每合并一个 PR，顺手更新「现在到哪了」和「下一步」。

更新于 2026-10-23（应用资料每 90 天提醒核对；日报收藏；Vercel 变量标 Sensitive 的影响；全站搜索；线上配置进展；结构化数据与分享卡片；账号页与删除账号；隐私政策和用户协议；应用首批导入清单；后台保存被拒时的提示统一用 `rejectField`；画布·海报画板和 `night` 令牌；应用第 6 步·桌面详情的四个标签；应用第 5 步·提交应用；站点地图与 robots.txt；日报·邮件订阅第 2 步·发送；资源第 5 步·加载骨架；应用第 5 步·报错；日报·邮件订阅第 1 步·订阅与退订；资源第 5 步·投稿；应用第 5 步·评价翻译；资源第 5 步·统计汇总、使用指南、收藏；日报·邮件订阅规格）。

## 现在到哪了

- **地基（第 1–2 周）已完成**，在 `main` 上，CI 通过。当时首页用的是演示数据、三个入口是「即将上线」占位页，现在都已换成各模块的真实页面（最后的占位页和演示数据在资源第 4 步删掉）。详见 [specs/foundation.md](./specs/foundation.md)。
- **账号页与删除账号已完成**：账号菜单进「账号」（`/[locale]/me/account`），读者可以自己删除账号，收藏、评价、应用提交和 Skill 投稿一起删，日报订阅不受影响。一天内登录过才能删，否则先重新登录。详见 [specs/foundation.md](./specs/foundation.md)「账号页与删除账号」。
- **日报收藏已完成**：日报详情页「来源」下面加了「收藏」，复用通用的 `saves` 表（`saveTypes` 加 `story`，不用迁移），只有已发布的新闻能收藏；「我的收藏」最上面多一段日报，撤回或并入的不再显示。手机日报画板列表里每条的收藏没做（一页 30 条，各读一次太重）。详见 [specs/daily.md](./specs/daily.md)「收藏」。
- **日报规格已确认**：[specs/daily.md](./specs/daily.md)。画布上的日报画板已经按规格改好（画布第 77 版）。
- **日报第 1 步（基础）已完成**：装好了 Inngest、Vercel AI SDK + OpenRouter、feedsmith（RSS）、cheerio、linkedom + Readability；迁移 `model_receipts_pgvector` 启用 pgvector 并建 `model_receipts` 表；`src/lib/ai` 提供按用途选模型、回执（重试不重复扣费）、每日预算（上海时间，默认 10 美元）、总开关；Inngest 入口 `/api/inngest`，带一个不花钱的 `health-check` 任务（事件 `ifai/health.check`）用来验证连通。真实模型调用已用 `pnpm ai:smoke` 验证过（DeepSeek，一次 0.00004 美元）。
- **日报第 2 步（信源与采集）已完成**：`sources` 集合（后台「日报 → 信源」，每条有「试抓」按钮，接口 `POST /api/sources/:id/test-fetch`，只预览不入库）；迁移 `daily_sources_raw_items` 建 `sources`、`raw_items`（1536 维向量列 + HNSW 索引，外键随信源级联删除）并导入 16 个信源，其中 Future Tools、The Rundown、Forward Future 三个网页列表信源的选择器是占位值，先停用，站长试抓确认后再启用；三种读取器（RSS / Atom / JSON Feed、网页列表、Hacker News JSON）在 `src/modules/daily/readers/`；Inngest 任务 `daily-collect-due-sources`（每 15 分钟找到期信源，也可发事件 `daily/collect.run` 手动跑）、`daily-fetch-source`（抓一个信源，按判重 / 48 小时 / 首次导入最多 30 条的规则写入 `raw_items`，自动调整间隔，失败原因记在信源上）、`daily-fetch-item-content`（Readability 取原文正文、发布时间和外链）。三个任务都先检查 `COLLECT_ENABLED`。沙盒连不到新闻站点，真实信源还没抓过，要在预览环境验证。
- **日报第 3 步（判断与写作）已完成**：提示词在 `src/modules/daily/prompts/`（预筛、评分、结构化、归组、写作，版本 = 名字 + 指令内容的哈希，每条分析和每条新闻记下用过的版本）；迁移 `daily_judge_stories` 建 `item_analyses`、`events`、`event_items` 和 Payload 集合 `stories`（后台「日报 → 新闻」）。
  - 判断：Inngest 任务 `daily-judge-item`（取完正文后自动触发）按五个步骤走：预筛 → 两次评分（`variant` a / b，门槛 T1 60、T1_5 65、T2 76，可用 `DAILY_SCORE_THRESHOLD_<分级>` 调）→ 结构化（分类、公司、产品、事实、是新闻 / 汇总稿 / 材料不足，疑似推广和教程类打标）→ 向量（写回 `raw_items.embedding`）→ 归组（pgvector 在近 14 天里找相似度 > 0.75 的报道，模型判断同一次发生 / 后续 / 无关；同一次发生的并入事件、不进队列，后续和新事件进队列）。结果在 `item_analyses.outcome`：`queued` 待写作，`merged` 已并入，`irrelevant` / `low_score` / `insufficient` / `roundup` 不进队列，`blocked` 要人看。汇总稿按正文外链挂到事件上。`daily-judge-sweep` 每 30 分钟补漏。开关关闭或预算用完时任务不改状态，等补漏重跑；同一调用失败 3 次才标 `blocked`。
  - 写作：进队列的报道自动触发 `daily-write-story`（用途 `write`，一次调用写出简体、英语、日语、韩语的标题、先给答案的摘要、可选的「试一试」和英文 slug；繁体由共用的 `syncHantFromHans` 钩子从简体转换，站长改简体时繁体跟着更新）。同一事件里「同一次发生」的其他报道作为补充材料，官方信源排在前面；「后续」单独成条，事件里更早的报道只作背景。写完做原文核对（标题、摘要、试一试里的名字和数字逐个回原文找，找不到的记在 `stories.verification` 里给审核看）。结果是一条状态「待审」的 `stories`，来源列表原文在前、报道在后、Hacker News 讨论最后；slug 重复时加数字后缀。`daily-write-sweep` 每 30 分钟（整点 15 分、45 分）补写漏掉的。未发布的新闻只有登录后台才能读到。
  - 本地库上用假模型跑通了同一事件三家报道、后续、无关、无关主题、低分、材料不足、汇总稿，以及写作、重复写作跳过、slug 冲突、原文核对找出编造的名字和数字这些情况。`OPENROUTER_BASE_URL` 可把模型调用指向本机的兼容接口（只用于本地测试）。
- **日报第 4 步（审核与发布）已完成**：后台「审核队列」在 `/admin/collections/stories/review`（左侧导航、「日报 → 新闻」列表上方的按钮和列表里的「审核」列都能进去；已发布的条目从同一页进「更正」）。代码在 `src/modules/daily/review/`（规则、队列、详情、操作、接口）和 `src/modules/daily/admin/review/`（界面），迁移 `daily_review` 给 `stories` 加了 `laterAt`、`mergedInto`、`keptApartFrom`。
  - 队列按热度、再按分数排序，可按分类筛选；卡片标出「另有 N 家报道」「可能和已发布的重复」「数字和原文对不上」「某语言写作失败」「两次评分差 N 分」「疑似推广」「教程类」「稍后再看」「已撤回」。顶部四张卡：待审、今天已发布、信源（失败的可以「立即重试」，发事件 `daily/source.fetch`）、模型用量。「今日海报」那一栏留到第 6 步。
  - 审核一条：改简体的标题（≤ 40 字）、摘要（≤ 120 字，中文算 1 字、英文算半字）、试一试、分类、来源；原文核对结果实时显示（改掉找不到的数字，提示就消失）；AI 辅助「缩短摘要」「换个标题」（用途 `assist`）；英、日、韩各自的状态。改了简体，其他三种语言就标成「简体改过了」，发布或保存更正时先按新的简体重写（用途 `write`，提示词 `prompts/rewrite.ts`），繁体由钩子自动跟着变；哪种语言写作失败就记下原因，界面上可以单独「重试」，失败的语言没写好不能发布。
  - 重复判断：同一事件里已经有已发布的新闻（归组判成后续），或 14 天内已发布新闻的原文向量相似度 > 0.75，就提示「可能和已发布的重复」，并给出相似度；「并入那一条」把这条的报道挂到那条的事件和来源列表里（状态「已并入」），「不是同一件事」记在 `keptApartFrom` 上，这一对不再互相提示。
  - 动作：通过并发布（`publishedAt` = 通过时间）、拒绝（归档）、稍后再看（排到队列末尾）、撤回发布（状态「已撤回」，回到队列，可以再发布）、保存更正（`correctedAt`）。发布、更正、并入、撤回都会调用 `revalidateTag('daily', 'max')`（`src/modules/daily/review/cache.ts`）；第 5 步的页面和 RSS 读已发布新闻时要加 `cacheTag('daily')`，才能在 1 分钟内更新。
  - 接口都挂在 `stories` 集合上，要登录后台：`GET /api/stories/review-queue`、`GET /api/stories/:id/review`、`POST /api/stories/:id/review/<edit|publish|correct|reject|later|withdraw|merge|keep-separate|rewrite|assist>`。
  - 本地库上用假模型跑通了：队列排序与稍后再看、改简体后标记过期、标题超长拒绝发布、发布时重写三种语言、同事件和向量相似两种重复提示、不是同一件事、重写失败记原因并阻止发布、单独重试、并入（来源列表和事件成员都更新）、更正、撤回后再发布、拒绝、AI 建议。界面还没在浏览器里点过，要在预览环境看。
- **日报第 5 步（前台）已完成**：`/[locale]/daily`（最新在前，按读者本地日期分组成「今天 / 昨天 / 日期」，每页 30 条，「加载更早的新闻」翻页）、`/[locale]/daily/category/<分类>`（五个分类筛选）、`/[locale]/daily/[slug]`（标题、首次发布和最后更新时间、摘要、试一试、来源列表原文在前并标出原文 / 报道 / 讨论、更正提示、分享、右栏「同一事件的其他进展」）、`/[locale]/daily/rss.xml`（每种语言一份，feedsmith 生成，页脚有 RSS 链接）；首页「今天的 AI」改读已发布的新闻，列出读者本地「今天」的前 5 条，今天还没有时显示最近一天的。代码在 `src/modules/daily/public/`（`data.ts` 读数据，`story-item.ts` 选语言，`rss.ts` 生成 feed，`components/` 是页面组件），页面文件只做组装。时间一律由服务器先按 UTC 输出带 `datetime` 的 `<time>`，浏览器水合后按自己的时区重新渲染和分组（`src/lib/local-time.ts`、`src/components/local-time.tsx`，用 `useSyncExternalStore`，不会水合不一致）。只读 `status = published`（`overrideAccess: false`），缓存标签 `daily`，审核后台发布、更正、并入、撤回时立即失效（`revalidateTag('daily', { expire: 0 })`）。缺读者语言的内容回退英文并标 `lang`。本机示例数据：`pnpm payload run scripts/seed-stories.ts`（只认本机数据库），CI 冒烟测试用它（`tests/e2e/daily.spec.ts`，含东京和洛杉矶时区的本地时间检查）。分享按钮搬到了 `src/components/share-button.tsx`，应用详情页也用它。和规格不同的地方写在 daily.md「页面与路由」末尾。页面还没在浏览器里看过，要在预览环境点一遍。
- **日报第 6 步前半（热度）已完成**：迁移 `daily_heat` 加 Drizzle 表 `hot_signals`（Hacker News 上已经收过的链接的分数、评论数和讨论帖），给 `events` 加 `heat_before`、`event_items` 加 `matched_item_id`，给 `stories` 加 `heatTrend`、`sourcesSeen`。算法在 `src/modules/daily/heat/rules.ts`，写在 daily.md「流程」后面：每个独立信源 48 小时内算一次、每 24 小时减半，Hacker News 按分数加权，换成 0–100 分；和 6 小时前比，标「新」或「上升」。Inngest 任务 `daily-heat-refresh` 每小时第 5 分钟（或事件 `daily/heat.refresh`）先同步来源、再重算近 54 小时有动静的事件，把热度抄到新闻上（审核队列本来就按它排）；归组和并入时立即重算那个事件，写作时带上当时的热度。后来判成「同一次发生」的报道和 Hacker News 讨论帖会加进对应新闻的来源列表，站长删掉的来源不会被加回来。发布、更正、撤回、并入时发事件 `daily/story.changed`，应用模块可以据此立即重新匹配。列表页加了「今日最热」（深色卡片，近 24 小时热度最高的一条，只在全部新闻第一页）、右栏「今天提到的应用」（读 `app_mentions`，读者本地今天，最多 6 个）和「48 小时热门」（一个事件一条，前 5）；手机上右栏排在列表后面。新设计令牌 `night`（#1F2024）。本地库上实跑了 Hacker News 证据记录、来源同步（含站长删掉后不再加回、后来的报道照常加入）和热度计算；示例数据给新闻加了热度、给示例应用加了「日报提到」，冒烟测试覆盖这三块。和规格不同的地方写在 daily.md「页面与路由」末尾。
- **日报第 6 步后半（海报）已完成**：迁移 `daily_posters` 建 Payload 集合 `posters`（后台「日报 → 每日海报」，一天一条，字段只读）。审核后台右栏「今日海报」（`src/modules/daily/admin/review/poster-column.tsx`）：上海日期，站长没动过时按热度自动选当天已发布的前 8 条（一件事一条、同一信源最多 2 条），可以上移、下移、移出、从「今天其他已发布」里加入（加不进去时写明原因），点标题进入更正；「生成海报」把五种语言的标题和摘要冻结下来、五种语言各画一次，之后再改会提示「条目改过了」，要重新生成。调整过的海报，之后通过审核的新闻有空位就自动加到末尾；撤回、退回、删除的新闻立即从列表和已生成的图片上去掉。接口：`GET /api/posters/desk`、`POST /api/posters/desk/arrange`、`POST /api/posters/desk/generate`。前台：`/[locale]/daily/poster/[日期]`（读者语言的海报图、五种语言下载、海报上的新闻、分享、上一期 / 下一期，带分享卡片），图片 `/[locale]/daily/poster/[日期]/image.png`（1080×1920，`next/og` 第一次请求时画出并缓存，字体按需从 Google Fonts 下载 Noto Sans 各语言字族、只取用到的字），列表页右上角「每日 AI 大事」卡片（最近 7 天里最新一期）。字号按条数和文字长短自动选：条数少时字大、带摘要并上下居中，标题能放下就不截断。代码在 `src/modules/daily/poster/`（`rules.ts` 规则、`snapshot.ts` 冻结内容、`layout.ts` 排字号、`image.tsx` 画图、`desk.ts` 后台、`hooks.ts` 跟着发布和撤回）。本机生产构建上走过一遍：后台三栏（窄屏时海报栏排到下面），点「重新生成」后海报页和五张图立即换新，列表卡片和海报页在手机宽度下没有横向溢出；本地库上跑通了新发布自动加入、同一件事和同源限制、保存顺序的检查、生成、撤回和删除立即从图上去掉、最后一条去掉后回到未生成。示例数据会生成当天的海报，冒烟测试覆盖卡片 → 海报页 → 五种语言的图片和下载。和规格不同的地方写在 daily.md「页面与路由」末尾。
- **日报·邮件订阅规格已确认**：[specs/daily-email.md](./specs/daily-email.md)。按画板上的三处订阅框（列表页、手机列表页、首页）和后台「订阅者」来写：填了邮箱就订阅成功（不做双重确认，改用收信服务器检查、拼写提示、欢迎信和退信自动停发来防错），按订阅者时区早上 8 点用 Resend 批量接口发，一键退订，预览环境只给管理员发。分两步实现：订阅与退订、发送。
- **日报·邮件订阅第 1 步（订阅与退订）已完成**：迁移 `daily_email_subscribers` 建 Payload 集合 `subscribers`（后台「日报 → 订阅者」，列表上方是按语言分的已订阅人数；站长可以停发或撤销自己的停发，不能替人订阅、不能改邮箱，退信和投诉停发的不能删）和 Drizzle 表 `subscribe_attempts`（限频）。新开关 `DAILY_EMAIL_ENABLED`（默认关）打开、并且部署的环境配好 `RESEND_API_KEY` 和 `DAILY_EMAIL_FROM` 时，三处出现订阅框：日报列表右上（海报卡片下面，没有海报时占那一栏）、手机和平板的列表后面、首页「今天的 AI」下面。`POST /api/subscriptions`：格式检查、收信服务器检查（MX，没有再查 A / AAAA，查询出错不拦）、常见邮箱拼写提示（「是不是 gmail.com？」，浏览器里先查）、每个访客每小时 10 次、隐藏字段；有效邮箱一律回答成功，新订阅和退订后重新订阅在响应之后发欢迎信（订阅的语言，写明当地 8 点、第一封的时间、怎么改设置和一键退订；同一邮箱一天最多一封），带 `List-Unsubscribe` 和一键退订头。`/[locale]/daily/subscription?token=…` 管理订阅（邮箱打码、状态、下一封的时间，改语言和时区、退订、重新订阅；不进索引，不带 Referer），接口 `POST /api/subscriptions/manage` 和邮件客户端的一键退订 `POST /api/subscriptions/unsubscribe`。令牌是订阅者 id 加 `PAYLOAD_SECRET` 派生的签名，不存库。代码在 `src/modules/daily/email/`。本地没配 Resend 时欢迎信打印在终端里。每天早上的发送、退信和投诉回调、后台的发送情况在第 2 步，所以这一步合并后生产环境先不开开关。冒烟测试（CI 打开开关）覆盖五种语言的订阅框、手机宽度、拼写提示、订阅和欢迎信、重复提交、隐藏字段、限频、管理订阅页、一键退订、链接失效和投诉停发。本机生产构建上点过一遍：三处订阅框（桌面、平板、手机宽度都不溢出）、拼写提示、订阅成功、五种语言的欢迎信、管理订阅页、后台订阅者列表和站长停发；真实的 Resend 发送要在预览环境试。实现时定下的细节写在 daily-email.md「页面与路由」末尾。
- **日报·邮件订阅第 2 步（发送）已完成**：迁移 `daily_email_sends` 建 Drizzle 表 `email_sends`（每个订阅者每个当地日期一行，唯一索引挡住第二封）、`email_events`（回调去重）和 `resend_state`（Resend 报的用量和最近一次失败）。Inngest 任务 `daily-email-send` 每 15 分钟（UTC 第 0、15、30、45 分，也可以发事件 `daily/email.run`）找当地时间 8:00–11:00、当天 8 点前订阅、今天还没收到的人：过去 24 小时的新闻按海报的排序挑最多 10 条（一件事一条，不限同一信源），只读一次、冻结在这次运行里；先写「发送中」的行，再每 100 封一批调 Resend 的批量接口，带幂等键，重试不会重复发；额度用完时停下这一轮、不算一次尝试，当地 11 点前的下一轮再发；失败的最多试 3 次。邮件（`src/modules/daily/email/digest.ts`）：订阅者当地的日期、「过去 24 小时 · N 件大事」、头条单独一块、其余编号带摘要和「分类 · 原文发布方」、「在网站上看全部」，五种语言，带纯文本版和一键退订头，十条长新闻也不到 100 KB。`POST /api/subscriptions/webhook` 验 Resend（Svix）的签名，处理送达、永久退信、禁发名单、投诉（停发并写明原因）和失败，按回调 id 去重，地址要和标签里的订阅者对得上；每封邮件带环境标签，生产和预览共用一个 Resend 账号也各管各的；欢迎信退信也停发。预览环境只发给正在订阅的管理员邮箱。`daily-email-cleanup` 每天 UTC 4:30 删退订满 30 天的订阅和过期记录。后台「订阅者」列表上方改成概览：人数、今天（上海时间）的发送、Resend 免费版今天还剩多少、最近一次失败、到 80 人提示换 Pro，还有「预览邮件」（五种语言）和「发测试邮件」（发到当前管理员）。审核后台顶部那行说明改成画板上的句子。单元测试覆盖东京、洛杉矶（两次夏令时切换）、伦敦、加尔各答、加德满都、查塔姆每天 8:00–10:45 的 12 次运行、选稿、邮件内容、批量发送和各种拒绝、回调签名和事件、额度显示；本机数据库上用模拟的 Resend 跑过完整流程（到点才发、只发一次、额度用完、重试、退订后不发、回调、清理），跑出一处回调没核对地址的问题，已改；冒烟测试加了回调验签、欢迎信退信停发、重复回调、送达，以及后台接口只给管理员。真实的 Resend 发送和回调要在预览环境试。实现时定下的细节写在 daily-email.md「定时任务」末尾。
- **日报邮件的画板已补**（画布第 82 版，在「照实现补的画板」下）：「日报邮件（照实现）」画了收件箱里五种语言的发件人、主题和预览文字，桌面的晨报（10 条），手机上的日语晨报、缺译文时用英文的韩语晨报、韩语欢迎信，桌面的欢迎信，旁边写版式尺寸和规则；「管理订阅页（照实现）」画了桌面已订阅，手机上的已退订、已停发（退信）、链接已失效，和规则。示例新闻是虚构的。改邮件或管理订阅页时同步改这两张。
- **海报画板和 `night` 令牌已补**（画布第 83 版）：「设计令牌 v1」的「语义」组加了 `night`。「照实现补的画板」下加了「每日 AI 大事海报（照实现）」：按 1/2 画了 8 条的简体中文海报，旁边写尺寸、颜色和各部分的字号；按 1/3 画了 3 条英语、5 条日语、8 条韩语（其中一条没有韩语译文，用英文）三张，字号都是 `layout.ts` 对这些示例算出来的，下面写选稿、生成、字号、语言、断行和用在哪里的规则。示例新闻是虚构的。改 `src/modules/daily/poster/` 的版式时同步改这张。
- **应用第 1 步（集合与后台录入）已完成**：`src/modules/apps/collections/` 里的 `app-categories`、`apps` 两个集合，迁移 `apps` 建表并写入首批 8 个分类（五种语言）。后台「应用」分组可以手动录入；公开接口只返回已发布的应用。繁体由简体自动转换：通用钩子 `syncHantFromHans`（`src/lib/i18n/hant-sync.ts`），日报的 `stories` 也在用。
- **应用第 3 步（列表页和详情页）已完成**：`/[locale]/apps`（全部应用，按名称 A–Z，每页 50 条）、`/[locale]/apps/category/[slug]`（分类，数量含次分类）、`?q=` 搜索（名称、别名、一句话介绍、标签，五种语言都查，搜索页不进索引）、`/[locale]/apps/[slug]`（简介、资料、标签、它是什么、核心功能、常见问题、替代品、打开网站、分享）。代码在 `src/modules/apps/`（`data.ts` 读数据，`components/` 是页面组件），页面文件只做组装。缺读者语言的内容回退英文并标 `lang`。数据缓存挂标签 `apps`，后台保存应用或分类后立即刷新。还没有热度，所以榜单、热度前三、走势、首页「热门应用」都留到第 4 步；收藏、评价、提交应用、「信息有误？」留到第 5 步。和规格不同的地方写在 apps.md「页面与路由」末尾。本机示例数据：`pnpm payload run scripts/seed-apps.ts`（只认本机数据库），CI 冒烟测试用它。
- **应用第 2 步（官网取材与资料草稿）已完成**：后台打开应用，右栏「资料草稿」点「生成草稿」；或在应用列表页上方「批量添加应用」每行贴「名称, 官网网址」（只贴网址也行，最多 300 行，按域名跳过已收录的，去掉推广参数）。Inngest 任务 `apps-draft-profile` 抓官网首页和定价页（只访问公网地址），用途 `profile` 一次读事实、四种语言各写一次（繁体转换），定价和平台要带官网原文，找不到就留空；名字和数字做原文核对，结果和留空的建议显示在右栏。logo 取官网图标，截图取 og 图，存媒体库。分类、定价、平台、开发者、图片只在空着时填；重新生成只重写介绍、功能、常见问题和标签。开关关着或预算用完时停在「待生成」，`apps-draft-sweep` 每 20 分钟补漏。迁移 `apps_profile_drafts` 加 `draft_status`、`draft_info`，主分类改成发布前必填（草稿可以空着）。代码在 `src/modules/apps/profile/`、`prompts/profile.ts`、`admin/`。沙盒里用假模型和假网页在本机库上跑通了导入、改名、四种语言、繁体、核对、留空、图片和失败的情况；真实网站和真实模型要在预览环境试。Toolify 在这里打不开，没法先看它的条款，所以首批名单先人工挑，贴进批量添加。
- **应用第 4 步前半（热度的数据与任务）已完成**：迁移 `apps_heat` 建 Drizzle 表 `app_clicks`、`app_mentions`、`app_metrics_daily`、`app_heat_runs`（`src/modules/apps/schema.ts`）。Inngest 任务 `apps-heat-daily` 每天上海时间 06:00（或后台应用列表上方「现在重算」，事件 `apps/heat.run`）：下载 Tranco 每日名单按注册域名查名次（失败沿用最近一次的名次并在后台提示），匹配近 30 天已发布日报的产品、公司和来源链接写进 `app_mentions`，再按 `src/modules/apps/heat.ts` 打分写 `app_metrics_daily`、刷新 `apps` 缓存。「打开网站」改走 `/[locale]/apps/[slug]/visit`：同一访客每天每个应用记一次点击（哈希在 `src/lib/visitor.ts`，不存 IP，爬虫和预取不记），再跳官网。后台应用编辑页多了「热度」标签（三项构成、名次、近 30 天、匹配到的日报，误配可以删掉）。收藏在第 5 步前半接上。本地库上用假的 Tranco 名单跑通了打分、7 天变化、飙升、同一事件只算一次、删掉误配、Tranco 失败沿用、点击去重和爬虫过滤。tranco-list.eu 在沙盒里连不上，上线后第一次运行要在后台确认名单编号。做法写在 apps.md「热度」末尾。
- **应用第 4 步后半（热度页面）已完成**：列表默认综合榜（按热度），`?board=rising` 飙升榜、`?board=new` 新上架（收录 30 天内），可以和分类、搜索叠加；表头「热度」「7 天变化」「网站排名」点了按它排（`?sort=`）。桌面有热度前三卡片，第一页先显示 10 行、「查看第 11–50 名」展开，每行有 7 天走势小线；列表下面是「本周新上架」和「热度怎么算」。详情页简介下面一排数字（热度、分类榜名次、日报提及），核心功能之后是热度：近 7 / 30 / 90 天折线（可以逐天查看，读屏有表格）、三项得分和来源、榜单位置，然后是「日报里提到它」。替代品没指定时取同类热度前 6。首页「热门应用」和「本周精选应用」（飙升榜第一，没有就取综合榜第一）读真实数据，顶部提示改成只说 Skill 还是示例。页面一律显示最近一次算好的那一天。两个新环境变量：`APPS_SHOW_TRANCO_RANK=true` 才显示 Tranco 名次（默认不显示，照常算分）；`APPS_NEW_SINCE` 让首批导入的应用不进新上架。排序规则是纯函数（`src/modules/apps/boards.ts`），有单元测试；读热度在 `heat-reads.ts`。`scripts/seed-apps.ts` 现在按真实打分规则写几周示例热度，在 `seed-stories.ts` 之后跑会匹配示例日报；冒烟测试覆盖三个榜、表头排序、详情的热度和首页。站长在后台指定精选、「同类热门」侧栏、嵌入徽章没做。做法写在 apps.md「页面与路由」末尾。
- **应用：日报改动后立即匹配提及**：Inngest 任务 `apps-mentions-story-changed` 监听日报的 `daily/story.changed`（发布、更正、撤回、并入），把那条新闻发布时间前后的新闻重新匹配进 `app_mentions` 并刷新 `apps` 缓存，应用详情「日报里提到它」和日报列表右栏「今天提到的应用」不用再等每天 06:00；撤回的新闻的匹配会去掉。热度里的提及数仍在 06:00 算。本地库上用示例新闻跑通了撤回（匹配去掉）、重新发布（按新时间加回）。做法写在 apps.md「热度」末尾。
- **应用第 5 步前半（收藏）已完成**：迁移 `saves` 建通用的 Drizzle 表 `saves`（`src/modules/saves/`：会员、类型、对象 id、时间，会员 + 类型 + id 唯一；类型现在只有 `app`，资源和日报在 `target.ts` 加类型即可，不用新表）。接口 `GET/POST /api/saves`（读收藏数和自己的状态；收藏、取消收藏要登录，只接受本站页面的请求）。应用详情页仍是静态的，收藏按钮和收藏数在浏览器里读：桌面「打开网站 / 收藏 / 分享」，收藏数在开发者和分类后面；手机底栏「收藏 + 数字」和「打开网站」，分享挪到名称旁边。没登录点收藏弹出登录对话框（`src/components/auth/sign-in-dialog.tsx`，复用登录表单），登录链接回到原页面并带 `?save=app-12`，页面自动完成收藏。`/[locale]/me/saves`「我的收藏」（账号菜单进入，没登录时直接显示登录表单，可以取消收藏，空状态按画板）。热度「站内点击与收藏」算上近 7 天新增的收藏。本机开发服务器上走过一遍真实的邮件登录链接：新标签页回到原页面自动收藏，原来那页回来后对话框关掉、显示已收藏。冒烟测试用直接写库的临时会员测收藏、自动完成、我的收藏和取消（`tests/e2e/member.ts`，要 `DATABASE_URI` 和 `BETTER_AUTH_SECRET`，CI 有）。做法写在 apps.md「页面与路由」末尾。
- **应用第 5 步中段（评价）已完成**：迁移 `app_reviews` 建 Drizzle 表 `app_reviews`（会员、应用、星级、正文、正文语言、显示 / 隐藏、修改时间；一人对一个应用一条）和 `app_review_reports`（评价、举报人、原因、处理时间）。接口 `GET/POST/DELETE /api/reviews`（读汇总、自己的和其他人的评价，每次 10 条；写、改、删自己的要登录，只接受本站页面的请求，每人每个上海自然日最多新写 5 条）和 `POST /api/reviews/report`（游客也能举报，按当天的访客哈希算一个人）。正文语言按文字判断（`src/lib/i18n/detect.ts`），页面上带这个 `lang`。应用详情页仍是静态的，评价在浏览器里读：桌面在开发者和分类后面写星级、平均分和条数（满 5 条才有平均分），常见问题和替代品之间是评价区（自己的在最上面，可以修改、删除；其他人的可以举报；手机先显示 3 条），写评价是对话框（星级、正文、署名，署名就是账号的名字）。没登录点「写评价」先登录，回到原页面（`?review=write`）自动打开。后台应用编辑页多了「评价」标签（全部评价、邮箱、举报次数和原因，隐藏 / 恢复显示 / 保留），应用列表上方有待处理的举报时显示红框。星星用新令牌 `star`（#d97a1e）。代码在 `src/modules/apps/reviews/`，同源检查挪到 `src/lib/same-origin.ts`（收藏和评价共用）。本机生产构建上用直接写库的会员和评价走了一遍桌面、手机和后台；冒烟测试覆盖访客、写、改、删、举报和每天 5 条上限。评价翻译留到下一步。做法写在 apps.md「页面与路由」末尾。
- **应用第 5 步 5c（评价翻译）已完成**：迁移 `review_translations` 建 Drizzle 表 `app_review_translations`（一条评价一行：译自哪段正文、原文语言、各语言译文、模型、译好 / 失败、当天翻了几次；正文一改旧译文就作废）。评价写好或改了正文后，后台任务 `apps-review-translate`（事件 `apps/review.translate`，一分钟内连着改只翻最后一次）用新用途 `translate` 一次译出英、简、日、韩里原文以外的几种，繁体由简体译文用 OpenCC 转换；简繁之间只用 OpenCC。每条评价每个上海自然日最多花钱翻 5 次（站长点「重新翻译」不算）。`apps-review-translate-sweep` 每 30 分钟把已发布应用里还没译文的显示中评价补上（模型开关关着或预算用完时不排）。读评价的接口带 `locale`，每条带 `translatable`；有译文的评价下面有「翻译」，点了才读 `GET /api/reviews/translation`（不缓存、`X-Robots-Tag: noindex`），译文标「机器翻译」，可以「查看原文」。后台「评价」标签每条下面写译文状态，可以展开看译文、「重新翻译」。新图标 `translate`（画板「机器翻译标记」）。冒烟测试用直接写库的评价和译文测「翻译」「查看原文」和繁体页的 OpenCC 转换；本机生产构建上另用一个假的 Inngest 收事件，确认写评价后和点「重新翻译」后都发出了翻译事件，补漏查询在本机库上按 10 种情况核对过。真实模型的译文质量要在预览环境看。做法写在 apps.md「页面与路由」末尾。
- **应用第 5 步 5d（报错）已完成**：迁移 `app_reports` 建 Payload 集合 `app-reports`（后台「应用 → 报错」：应用、问题类型（资料有误 / 已停运 / 其他）、说明、联系方式、读者看的页面语言、报告人、待处理 / 已处理和处理时间；读者写的内容在后台只读，后台也不能新建；应用删掉时它的报错一起删）。接口 `POST /api/app-reports/new`（游客也能报，只接受本站页面的请求，每人每个上海自然日最多 10 次，会员按账号、游客按当天的访客哈希算；不用 `/api/app-reports`，那是 Payload 给这个集合的 REST 地址）。应用详情页：桌面有官网图片时，图片下面一行左边「图片更新于」、右边「信息有误？」；没有图片时和手机一样在页面底部放「信息有误？告诉我们」。对话框里选问题类型（「已停运」不用写说明）、写说明和联系方式（选填）。后台应用编辑页多了「报错」标签（待处理的在前，写类型、时间、页面语言、会员还是游客、联系方式；可以标记完成、全部标记完成；有待处理的「已停运」时可以下架，要再点一次确认，表单里有没保存的修改时不下架），应用列表上方有待处理的报错时显示红框，按应用列出各类型的条数。代码在 `src/modules/apps/reports/`。本机生产构建上走了一遍桌面、手机（简、英、日、韩）和后台（标记完成、有没保存的修改时不下架、下架后详情页 404、删掉应用时报错一起删）；冒烟测试覆盖接口的检查、游客从详情页报错和每天 10 次的上限。做法写在 apps.md「页面与路由」末尾。
- **应用第 5 步 5e（提交应用）已完成**，第 5 步全部做完：迁移 `app_submissions` 建 Payload 集合 `app-submissions`（后台「应用 → 提交」：编号如 `A-1023-01`（上海日期的月日 + 当天最大序号加一）、名称、官网网址和域名、分类（选填）、一句话说明、联系邮箱、提交人、邮件语言、状态（待审 / 已收录 / 重复 / 未收录）、关联应用、给提交人的说明、处理备注、已通知提交人和邮件发送时间）。接口 `POST /api/app-submissions/new`（要登录，只接受本站页面的请求，每人每个上海自然日 5 个；同一个人同一域名还在待审时给回原来的编号；域名已是已发布的应用时返回 409 和那个应用，页面上链过去，不建提交）。`/[locale]/apps/submit`：没登录是登录表单，登录后是表单（官网网址、名称、分类、一句话说明、联系邮箱）和「我的提交」（最近 20 条，状态、站长的说明、已收录和重复的链到应用页；名称和说明带自己的 `lang`）；地址带 `?name=` 时预先填好名称。提交成功用共用的「提交成功」卡片：分类和编号，已提交 → 审核中（上海的两个工作日之后）→ 上线。入口三个：桌面「热度怎么算」卡片底部「提交或更新你的应用 ›」、手机列表最后的「做了一个 AI 应用？」卡片、搜索无结果时的「提交应用」（带上搜索词）。后台应用列表上方有待审的提交时显示提醒，点「去处理」到筛好的列表；提交右栏「处理」：「收录：生成草稿」（按名称、官网和分类新建草稿应用并开始生成资料草稿，同域名已有没发布的应用时关联那一个）、同域名已有已发布的应用时「标为重复」；不收录是把状态改成「未收录」并写好给提交人的说明。手动改成「已收录」「重复」要先关联已发布的应用；关联的草稿发布后，待审的提交自动改成「已收录」。四种邮件（收到、已收录、重复、未收录，按提交时页面的语言）由 Inngest 任务 `apps-submission-notify`（事件 `apps/submission-notify`）发出，`apps-submission-notify-sweep` 每小时第 41 分钟补发。`src/lib/shanghai-day.ts` 加了 `shanghaiWorkingDaysAfter`。代码在 `src/modules/apps/submissions/`。本机生产构建上走了一遍：访客、填错、已收录的提示、提交成功、「我的提交」四种状态、四种语言和手机，后台的提醒、生成草稿、关联、标为重复、未收录的检查、草稿发布后自动收录，四种邮件；冒烟测试覆盖接口的检查、提交和编号、同域名不重复、已收录的提示和三个入口。和画板不同的地方写在 apps.md「页面与路由」末尾。
- **应用第 6 步（桌面详情的四个标签）已完成**，应用的实现顺序至此全部做完。宽度 768px 起，详情页标签上面的部分不变，下面拆成四个标签：概览（它是什么、核心功能、常见问题）、热度（走势，下面热度构成和「日报里提到它」并排）、评价、替代品；右边侧栏是「榜单位置」，换标签时一直在，窗口窄时排到下面。没有内容的标签不显示（示例数据里 Orbit Notes 没有概览，第一个标签就是热度）。打开的标签写进地址（`#heat`、`#reviews`、`#alternatives`，第一个不带；用 `replaceState`，不增加浏览记录）。带着这些地址打开页面，或者点标题下面的评价数，会打开对应的标签并滚到标签栏；`#faqs`、`#mentions` 这类标签里面的位置，先打开所在的标签再滚过去。登录后回来写评价时地址换成 `#reviews`。手机仍是一屏长页，顺序不变，没有标签栏，读屏软件也不读出标签。四个标签的内容都在页面里，只是隐藏，页面仍是静态的。组件在 `src/modules/apps/components/detail-tabs.tsx`；「日报里提到它」挪进了热度部分（`app-heat.tsx`），榜单位置抽成 `HeatPlaces`，手机放在热度里，桌面放在侧栏。冒烟测试覆盖桌面切换标签、方向键和 Home / End、地址打开标签、评价数链接、登录回来打开评价，以及手机没有标签、各部分按顺序都在。和画板不同的地方写在 apps.md「页面与路由」末尾。
- **应用资料每 90 天提醒核对已完成**：应用发布时自动填上「资料核对时间」；已发布、超过 90 天没核对的应用（没有核对时间的按收录时间算），应用列表上方提醒，并能打开只列这些应用的列表。不用迁移。做法写在 apps.md「后台」末尾。
- **应用首批导入清单已备好**：[apps/first-batch-all.txt](./apps/first-batch-all.txt)，247 个，按八个分类分组（AI 助手 25、搜索与研究 26、编程 33、图像与设计 35、视频与动画 35、音乐与音频 29、写作与文案 29、办公效率 35）；[apps/first-batch-try.txt](./apps/first-batch-try.txt) 是先试的 10 个（八个分类各一个，另加 Kimi、Wrtn）。toolify.ai 在沙盒打不开，按它的分类榜单人工挑，只取名称和官网网址。没收成人陪聊、换脸、绕过 AI 检测的改写工具，也没收今年已停服或不再接新用户的（Sora、Firebase Studio、Phind、Relay.app、Reve、LOVO、Roo Code 等）。两份都用批量添加的解析规则检查过：每行都能解析，域名不重复，不超过 300 行。网址沙盒里打不开，没有逐个核对，草稿抓不到官网的会在右栏写明原因。
- **资源第 1 步（集合与后台录入）已完成**：`src/modules/resources/collections/` 里的 `skills`、`skill-versions`（上传集合，Zip 存 R2 的 `skills/` 前缀）、`agent-hosts`、`skill-tags`、`skill-submissions`，Drizzle 表 `skill_events`（`db/schema.ts`），迁移 `resources` 建表并写入 6 个宿主；分类固定 7 个在 `categories.ts`，名称在 `messages/`。
- **资源第 2 步（导入与检测）已完成**：后台 Skill 页侧栏有「导入版本」（接口 `POST /api/skills/:id/import`，可填分支 / tag / commit 和版本号），发事件 `skill/import` 给 Inngest 任务 `skill-import`（`src/modules/resources/import/`）：从 codeload 拉仓库的 tar.gz 快照（commit 取自归档头，公开仓库不用令牌；可选 `GITHUB_TOKEN` 提限额），按仓库地址里的子目录或唯一的 `SKILL.md` 找到 Skill 目录，去掉 `.git`、`.DS_Store` 之类，打成确定性的 Zip（同样的文件得到同样的 sha256），以「待审」状态创建版本；版本号取请求的 → `SKILL.md` 头部的 → 最新版本号加一；同一 commit 只导入一次；结果写在 Skill 侧栏「最近导入」里。sha256、文件清单、SKILL.md 原文与 frontmatter、声明的域名和静态检测全部在 `skill-versions` 的上传钩子里由 Zip 算出（`package/inspect.ts`），所以手动上传的 Zip 和导入的走同一套检查。静态检测（`scan/`）按规格 7 项：包结构、密钥、敏感位置为「拦截」，危险命令、外联、提示注入为「有提示」，许可缺失则不能发布（仓库 SPDX → `SKILL.md` 的 `license` → 包内或仓库根 LICENSE → Skill 上填的许可 → 「作者书面同意」勾选）。发布校验：拦截不能发，待检测不能发，有提示要填「复核备注」，没有许可要有许可或作者同意；发布时自动填 `publishedAt`，把 Skill 的当前版本换成更新的版本并让草稿 Skill 上线。已发布 / 已弃用 / 已撤回的版本不能换 Zip、不能退回待审，版本号、commit、sha256、文件清单、SKILL.md、frontmatter、声明、检测结果都不能改（规则 2）；更新说明和兼容记录仍可改。撤回要填原因，Skill 下架要填原因，已发布的 Skill 必须指向已发布的版本。`skills` 开了 Payload 版本历史（显示字段的修改记录）。本地库上用假的 GitHub 响应跑通了导入、重复导入、导入失败记录、拦截不能发布、有提示需备注、发布后 Skill 上线、不可改、撤回、下架。
- **资源第 3 步（说明起草）已完成**：新用途 `describe`（`src/lib/ai/purposes.ts`，可用 `AI_MODEL_DESCRIBE` 换模型）。起草以版本为单位（`src/modules/resources/describe/`，提示词在 `prompts/describe.ts`）：一次调用按文件提取声明（外联域名、读写范围、工具、API Key，温度 0），四次调用分别写简体、英语、日语、韩语的显示名、一句话介绍、「它能做什么」、使用示例、工作流程和注意事项；SKILL.md、README（包内的，没有时取仓库根目录的，存在版本的 `readme` 字段）和文件清单全部用 `untrusted()` 包成数据。文字写进 Skill（简体先写，繁体由钩子生成），声明写进版本；名字和数字用日报的原文核对检查，文件里找不到的外联域名、工具、API Key 不写入，列在面板上；版本已发布时不改它的声明（规则 2）。状态记在版本上：「说明草稿」待生成 → 已生成 / 没生成（`draftStatus`、`draftInfo`）。Skill 还没有说明时，导入后自动排队起草，只填空着的字段；之后在版本页侧栏点「生成说明草稿」重写（接口 `POST /api/skill-versions/:id/describe`），显示名只在空着时填，试用笔记不动，「需要 API Key」和运行依赖也只在空着时填。Inngest 任务 `skill-describe`（同一版本的新请求取消旧的，模型调用失败三次标「没生成」）和 `skill-describe-sweep`（每 20 分钟补漏：开关关着、预算用完或事件丢了的草稿）。模型关着、没有 key、预算用完时草稿停在「待生成」，导入照常完成。迁移 `resources_describe` 给 `skill_versions` 加 `draft_status`、`draft_info`、`readme`。本地库上用假模型跑通了：四种语言和繁体写入、声明核对、只填空字段与重写、旧请求不覆盖新请求、补漏、已发布版本不改声明、没有 SKILL.md 正文时标「没生成」、开关关着时等待。真实模型的草稿质量要在预览环境试。
- **资源第 4 步（前台）已完成**：`/[locale]/resources` Skills 列表：顶部收录数和本周新增（真实数字）、本周精选（站长勾的「精选」，没勾时取最近更新的认证 Skill）、三步用上 Skill、7 个分类（带数量）、搜索（显示名、一句话介绍、标签，五种语言都查，也查 slug）、「无需 API Key」「仅看认证」筛选、标签和作者筛选、综合 / 近期飙升 / 安装数 / 最近上新四种排序、列表 / 卡片切换（记在浏览器里）、每页 30 条、热门标签、三种空状态；分类、排序、筛选、搜索词、标签、作者、页码都在查询参数里，搜索、筛选和非默认排序的页面不进索引。`/[locale]/resources/skills/[slug]` 详情：面包屑、徽章、安装面板（6 个宿主切换，安装指令和兼容状态跟着变，复制安装指令、下载 Zip）、概述 / 文件 / 版本记录 / 安全检测四个页签（地址带 `#files` 这类锚点）、信息、内容指纹、相关 Skill（同分类按安装数取 6 条，换一换）；手机上的顺序是头部 → 安装面板 → 页签 → 信息。`/v/[version]` 固定版本页（不进索引，提示是不是当前版本；已撤回的显示原因、安装面板禁用；已弃用的照常可装并提示），`/v/[version]/files/...` 看单个文件的原文（转义后放在 `<pre>` 里，按 Zip 的 sha256 缓存）。已下架的 Skill 主页保留并显示原因，没有安装面板。接口：`GET /api/skills/<slug>/install.md`（`?v=` 固定版本，`?host=` 把那个宿主排第一），英文 Markdown，只写站长审过的字段和由 Zip 算出的值，不放作者写的任何文字；`GET /api/skills/<slug>/<版本>.zip` 核对版本后记一次下载，302 到 Payload 的文件地址，配了 R2 时再跳到 5 分钟有效的签名地址；`POST /api/skills/<slug>/installs` 记「复制安装指令」。三种安装都写进 `skill_events`，同一访客（`src/lib/visitor.ts`）对同一 Skill 在同一个上海日只算一次，爬虫不算；汇总成安装数是第 5 步的事，现在页面上的安装数读 Skill 上的统计缓存。页面显示的版本：当前版本已发布就用它，否则用最新的已发布版本。缓存标签 `skills`，Skill、版本、宿主、标签保存或删除后立即刷新。首页「新上架 Skills」读最近发布的 4 条，右上「新上架 Skill」读本周精选；演示数据、演示提示和「即将上线」占位页都删了。代码在 `src/modules/resources/public/`（`data.ts` 读数据，`order.ts` 筛选和排序，`install.ts` 生成 install.md，`components/` 是页面组件），页面文件只做组装。本机示例数据：`pnpm payload run scripts/seed-skills.ts`（只认本机数据库，带已撤回、已弃用、已下架和草稿的例子），CI 冒烟测试用它（`tests/e2e/resources.spec.ts`，`E2E_SAMPLE_SKILLS=1`）。收藏、使用指南、投稿、安装榜和本周飙升、加载骨架留到第 5 步。和规格不同的地方写在 resources.md「页面与路由」末尾。
- **资源第 5 步之一（收藏）已完成**：复用 `saves`（`saveTypes` 加了 `skill`，只有已发布的 Skill 能收藏）。详情页桌面在头部标签下面放「收藏」「分享」，收藏数跟在安装数后面；手机上分享是名字旁边的图标，底部固定一栏放收藏和「复制安装指令」（和安装面板共用选中的宿主，`components/install-state.tsx`）。已下架的 Skill 没有收藏。「我的收藏」在应用后面加了一段 Skill，空状态多一个「逛逛 Skill」。冒烟测试在 `tests/e2e/saves.spec.ts`。
- **资源第 5 步之二（使用指南）已完成**：`/[locale]/resources/guide`，三步用上 Skill、各 AI 助手的 Skills 目录（读后台「宿主」的目录、官网和安装说明，安装说明按读者的语言）、核对内容指纹的命令、安全检测查什么。列表「三步用上 Skill」和详情页指纹下的「如何验证」链过去。没有画板，版式跟详情页。
- **资源第 5 步之三（统计汇总）已完成**：Inngest 任务 `skill-stats-rollup`（`src/modules/resources/stats/`）每小时第 7 分钟（或事件 `skill/stats-rollup` 立即跑）从 `skill_events` 数总安装数、近 7 天和前 7 天（往前 7–14 天）的安装数，从 `saves` 数收藏，写进 Skill 的统计缓存；迁移 `skills_stats_prev_week` 加了「前 7 天安装数」。只写数字变了的 Skill，经数据库适配器直接写：不跑钩子、不进修改记录、不改更新时间；有变化才刷新 `skills` 缓存，所以页面上的安装数最多晚一小时。列表「三步用上 Skill」下面加「本周飙升」：按规格第 14 条，近 7 天至少 20 次而且比前 7 天多才算，按增幅排，前 7 天是 0 的显示「新上榜」，够 3 条才显示。右栏热门标签上面加「安装榜」前 5（没人装过的不上榜，「完整榜单」= 按安装数排序的列表）。「近期飙升」排序用同一口径：在涨的 Skill 按增幅排前面，其余按近 7 天安装数。本地库上实跑过汇总（数字和直接查库一致，更新时间和修改记录不变，第二次运行不写）。示例数据只有一条在涨，冒烟测试看的是「本周飙升」不显示和安装榜的顺序。
- **资源第 5 步之四（发布指南与投稿）已完成**：`/[locale]/resources/submit`（页面没有画板，版式跟使用指南）：发布前先看、之后会怎样、投稿表单。表单要登录（访客看到登录表单，登录后回到这一页），填 GitHub 地址、一句话说明（最多 200 字）、联系邮箱（默认账号邮箱）；从地址栏复制的地址和指向 SKILL.md 的链接都会整理成导入用的地址。接口 `POST /api/resources/submissions`：只收本站页面的请求，每人每个上海日 5 个，同一仓库还在待处理时返回原来的编号。成功后表单换成「空状态与加载状态」画板的「提交成功」：仓库和编号，已提交 → 审核中（预计完成日，上海的两个工作日之后）→ 上线。列表右上加「发布 Skill」按钮，右栏最后加投稿卡片。邮件三种（收到、已收录附 Skill 页面、没收录附「给投稿人的说明」和检测拦截的文件与行号），按投稿时页面的语言写，版式在 `src/lib/email/layout.ts`（登录邮件也改用它）；投稿保存后状态和「已通知投稿人」不同就发事件 `skill/submission-notify`，任务 `skill-submission-notify` 发信并记下，Inngest 当时没收到的每小时第 37 分钟补发。后台投稿加了邮件语言、已通知投稿人、邮件发送时间、给投稿人的说明；改成「已收录」前必须在「导入为」选好已发布的 Skill；编号改成按那天已有的最大号往后排（原来按条数，删掉一条以后会撞号）。迁移 `skill_submissions_notify`（迁移前的投稿算已通知）。代码在 `src/modules/resources/submit/`。本地库上实跑了编号、同仓库不重复、每天 5 个、「已收录」的检查和三种邮件。「转为 Skill」没做，见 resources.md「第 5 步的做法」。
- **资源第 5 步之五（加载骨架）已完成**，资源第 1–5 步至此全部完成。列表没有用 `loading.tsx`（它会让 `?page=0`、超过最后一页这些地址返回 200）：分类、排序、筛选、标签、作者、搜索、翻页这些列表里的链接改在页面里切换（`components/list-navigation.tsx`），页面不动，过 300 毫秒结果区换成骨架（列表和卡片两种视图都按真实条目的形状，`skill-list-skeleton.tsx`），10 秒还没到换成「加载失败」和重试。详情页是静态生成的，加了 `[slug]/loading.tsx`（`skill-detail-skeleton.tsx`，按页面自己的栅格），不存在的 Skill 仍然返回 404；它在点进 Skill 而页面还没到的时候显示，网速正常时一闪而过或看不到。两个骨架都是客户端组件，原因见「已知问题」。冒烟测试拦住列表请求看骨架、加载失败和重试，再用限速看详情骨架。
- **站点地图与 robots.txt 已完成**（技术方案第 9 节的 sitemap 部分）：`/sitemap.xml` 是索引，分 `pages`、`daily`、`apps`、`skills` 四段，每段超过 9000 个页面自动拆文件；每个页面的五种语言各一条，带和页面 `<head>` 一样的 hreflang 和 `x-default`。只列已发布、可索引的规范地址，跟着各模块的缓存标签刷新。`robots.txt` 只拦 `/admin`、`/api/` 和应用的「打开网站」跳转，预览环境整站不让抓。做法写在 foundation.md「站点地图与 robots.txt」。本地库上用示例数据把 sitemap 里的 155 个地址全部请求过一遍，都是 200，抽查的 canonical 和 sitemap 一致。
- **结构化数据与分享卡片已完成**（技术方案「SEO 验收」的结构化数据部分）：首页 `WebSite` + `Organization`，日报详情 `NewsArticle`，应用详情 `SoftwareApplication`，Skill 详情 `SoftwareSourceCode`，三个详情页带面包屑；只写页面上看得到的内容和日期，应用不写评分。顺手修了日报详情的分享卡片：它自己设了 `openGraph`，把布局里的站名、语言和图片整个替换掉了，现在一律经过 `src/lib/seo.ts` 的 `shareCard()`；应用详情的分享图换成官网图。做法见 [specs/foundation.md](./specs/foundation.md)「结构化数据与分享卡片」。上线后用 Google 富媒体搜索结果测试和 Search Console 的「增强功能」看有没有报错。
- **隐私政策和用户协议已完成**（[specs/legal.md](./specs/legal.md)）：`/[locale]/privacy`、`/[locale]/terms`，五种语言，进站点地图；条文放在 `messages/*.json` 的 `legal`，生效日期、各节顺序和联系邮箱 `hello@ifai.io` 在 `src/modules/legal/documents.ts`。页脚加了两个链接，登录页和登录对话框表单下面写「继续即表示你同意《用户协议》和《隐私政策》」（新标签页打开）。条文按现有代码核对过收集了什么、交给谁、留多久；以后新增收集或接入统计、报错工具，先改这两页再上线。
- **全站搜索已完成**（[specs/search.md](./specs/search.md)，PRD R15）：顶栏语言按钮左边的放大镜进 `/[locale]/search`，一次查日报新闻（标题、摘要）、应用（名称、别名、一句话介绍、标签）和 Skill（显示名、一句话介绍、标签、slug），五种语言的字段都查，只返回已发布的。「全部」每类最多 5 条，类型标签（全部 / 日报 / 应用 / Skills）带数量，单个类型每页 20 条；应用和 Skill 名称完全相同的排最前、以搜索词开头的其次，其余按热度和「综合」，新闻新的在前。每行写明类型（R15「链接类型可见」）。没结果时保留输入、给「热门」（热度前 4 的应用和安装最多的 2 个 Skill）；画板上的纠错建议和「大家在搜」要有搜索日志，这一期不做。404 页加了搜索框。搜索页 `noindex, follow`，不进站点地图。不缓存、不记录搜索词，用 Postgres 的 `ILIKE`（Payload `like`），内容多了再接 Meilisearch。代码在 `src/modules/search/`，各模块加了 `searchApps`、`searchSkills`、`searchStories`。类型跟着 `NEXT_PUBLIC_SITE_PHASE`（`kinds.ts`），以后推荐、圈子、Wiki 上线时各加一种。
- **共用的空状态与加载状态已做好**，按「空状态与加载状态」画板：列表骨架、卡片骨架、空状态、加载失败重试、断网提示、全站 `error.tsx` 和 404，在 `src/components/states/`（按钮在 `src/components/button.tsx`）。各模块的页面直接用，不要再各写一套；和模块绑定的状态（日报未发布、搜索无结果、Skill 安全扫描、机器翻译标记、需要登录弹窗、提交成功）留给各自的模块；其中「提交成功」资源投稿做成了共用的 `src/components/states/submitted.tsx`，应用的提交表单直接用。`LoadingState` 可以传 `skeleton` 换成按页面形状画的骨架，一行字的占位用 `SkeletonLine`。
- **线上环境还没配**。Neon、Vercel、R2、Google / GitHub 登录、Resend 这几个账号由站长按 [setup.md](./setup.md) 开，密钥不经过 AI。
- **部署改由 GitHub Actions 做**（`.github/workflows/deploy.yml`）：Vercel Hobby 不能导入私有组织仓库，所以 Vercel 项目 `ifai1/ifai` 不连 Git，`main` 用 Vercel CLI 部署生产；每个 PR 先由 `neondatabase/create-branch-action` 建 Neon 分支 `preview/pr-<编号>`，连接串作为 `DATABASE_URI` 传给构建（迁移）和预览运行时，部署完对预览地址跑冒烟测试（原来挂在 `deployment_status` 上的 `preview-smoke.yml` 删掉了），PR 关闭时删分支。Vercel 的 Neon 集成不再用。缺 secret 时 Deploy 跳过、不报错。生产部署先关着（站长说暂不用生产），仓库变量 `PRODUCTION_DEPLOY=true` 后才部署。

## 分期

导航按 `NEXT_PUBLIC_SITE_PHASE` 显示，见 `src/config/site.ts`。没上线的模块不提前建页面或数据表。

| 期 | 周 | 模块 | 状态 |
|---|---|---|---|
| 第一期 | 1–2 | 地基 | 完成 |
| 第一期 | 3 起 | 日报 | 第 1–6 步（实现顺序）完成，下一步预览环境验收；邮件订阅第 1–2 步（订阅与退订、发送）完成，下一步预览环境验收后打开生产开关 |
| 第一期 | 日报之后 | 应用 | 第 1–6 步（集合与后台录入、官网取材与资料草稿、列表页和详情页、热度，收藏、评价、评价翻译、报错、提交应用，桌面详情的四个标签）完成，首批导入清单已备好，下一步首批导入和预览环境验收 |
| 第一期 | 日报之后 | 资源（Agent Skills） | 第 1–5 步（实现顺序）完成，下一步预览环境验收 |
| 第二期 | 13–20 | 推荐（长文）、圈子（短动态） | 只有画板 |
| 第三期 | 21–26 | 排行（模型盲测）、Wiki | 只有画板 |

第一期在第 12 周末上线。之后每期 6–8 周，开工前先过闸口：用上一期的数据决定下一期是否开工。每两周在预览环境里从用户视角走一遍新功能。

## 下一步

1. **日报预览环境验收**：按 daily.md「验收标准」在预览环境逐条过一遍（要先按 setup.md 配好 Neon、Vercel、OpenRouter、Inngest），发现的问题各开一个 PR。邮件订阅两步都已完成：按 setup.md 第 7 步配好 Resend 和回调，在预览环境按 [specs/daily-email.md](./specs/daily-email.md)「验收标准」过一遍，再在生产打开 `DAILY_EMAIL_ENABLED`。
2. **应用首批导入**：清单已备好（[docs/apps/](./apps/)，247 个）。预览环境部署好后，先在后台「批量添加应用」贴 `first-batch-try.txt` 的 10 个，确认草稿质量，再整份贴 `first-batch-all.txt`（已收录的按域名跳过）。应用第 1–6 步都已合并，导入之后按 apps.md「验收标准」在预览环境逐条过一遍。这个沙盒的网络策略不放行 toolify.ai 和 tranco-list.eu，Tranco 下载要在预览环境验证，或者在项目设置里加白名单。
3. **资源预览环境验收**：第 1–5 步都已合并，按 resources.md「验收标准」在预览环境逐条过一遍。说明起草要在预览环境配好 `OPENROUTER_API_KEY`、打开 `MODEL_CALLS_ENABLED`，对两三个真实 Skill 点「生成说明草稿」看质量。6 个宿主里 Codex 之后几个的目录位置、官网和安装说明要站长在后台补（使用指南和 install.md 都读这里）。

## 已做的决定

产品与技术：

- 面向海外用户，部署在海外，不做中国大陆备案。站点名 IFAI。
- 五种语言：英语（默认）、简体中文、繁体中文、日语、韩语。繁体中文一律用 OpenCC 从简体转换，不用模型翻译。
- 技术栈按技术方案：Next.js 16 + Payload 3 + Neon Postgres + Better Auth + next-intl / OpenCC + Tailwind 4 + R2 + Resend + Vercel。之后按模块接入 Inngest、Vercel AI SDK + OpenRouter、Meilisearch、Langfuse、PostHog、Sentry。
- 登录方式：Google、GitHub、邮箱魔法链接。不开放邮箱 + 密码注册。
- Better Auth 的限流不管 `/api/auth/get-session`（`src/lib/auth/auth.ts`）。原因：每个页面都读一次登录状态，默认同一地址连续 100 次以后就要停 10 秒，共用一个出口地址的读者（公司网络、手机运营商）会被显示成没登录；冒烟测试的请求都来自同一地址，测试一多也会撞上（应用提交 PR #36 的 CI 就是这样失败的）。登录、注册和邮件链接仍按 Better Auth 自带的更严的限制。
- 新闻引擎借鉴 [AIHOT](https://github.com/KKKKhazix/AIHOT)（MIT）的流程、门槛、热度算法和提示词结构，用 Inngest + Payload 重写，不照搬它的运行时。

日报（2026-10-22，细节见 daily.md）：

- 信源都是英文。第一批 16 个：6 个媒体和聚合站，加 10 个官方 RSS。X 和 Notion 信源以后再接。
- AI 分别用简体中文、英语、日语、韩语写标题和摘要，繁体由简体转换。网址用英文 slug，五种语言共用。
- 审核通过就立即发布，没有刊期。时间按读者自己的时区显示。
- 每日 AI 大事海报按上海时间的自然日出。
- 页面不标注「AI 撰写」。
- 邮件订阅放在第 6 周：在订阅者当地时间早上 8 点发，内容是过去 24 小时热度前 10 条。
- 邮件订阅（2026-10-23，细节见 daily-email.md）：尽量少让人动手，不做双重确认，填了邮箱就订阅成功；发件地址 `news@ifai.io`，回信回到这个邮箱；页脚不写通信地址（放广告或赞助前再补）；Resend 的账号和套餐由站长配置。

应用（2026-10-22，细节见 apps.md）：

- 应用按热度排序和展示：网站排名（Tranco）50%、站内点击与收藏 30%、日报提及 20%。不显示月访问量。
- 首批 200–300 个应用从 Toolify 挑，只取应用名和官网网址；资料由 AI 按官网分别写四种语言，站长审核后发布。
- logo 取官网图标，截图先用官网 og 图。
- 热度每天上海时间 06:00 算一次，页面按读者时区显示更新时间。
- Tranco 名次上线前看条款，允许就显示，不允许就只用来算分。
- 详情页有用户评价，直接发布、不审核，读者可举报、站长可隐藏。

资源（2026-10-22，细节见 resources.md）：

- 第一期只有 Agent Skills，不做评分评价和评测报告；收藏复用应用模块的通用 `saves` 表。
- 版本不可改，有固定链接；每个版本过静态安全检测；站内不执行任何 Skill。「安全检测通过」和「IFAI 认证」是两个徽章。
- 宿主显示 6 个：Claude Code、Codex、OpenClaw、Hermes、Pi、WorkBuddy；第一批只在 Claude Code 和 Codex 上验证兼容。
- 用户投稿只做轻量表单，由站长导入审核；第一批从公开仓库挑 20–30 个有明确开源许可的。
- 安装数：复制指令、下载 Zip、拉取 install.md 各算一次，同一访客对同一 Skill 一天一次。
- 说明草稿以版本为单位起草，写进 Skill 的说明字段：首次导入自动起草，只填空着的字段；之后由站长在版本页手动重写。显示名只填不改，试用笔记不动；规格列出的字段之外也起草「工作流程」。
- 下载先经过站点：`/api/skills/<slug>/<版本>.zip` 核对版本、记下载，再交给 Payload 的文件地址（R2 上是 5 分钟签名地址）。文件地址本身也只给已发布或已弃用、且 Skill 没下架的版本，绕过下载路由也拿不到撤回版本和下架 Skill 的 Zip。
- install.md 只写站长审过的字段和由 Zip 算出的值（英文，各语言共用），不放作者写的文字；里面的 Zip 地址带 `?via=install`，助手照着装只算一次安装。
- 页面显示的版本：当前版本已发布就用它；当前版本被撤回或弃用而没指定新的，就用最新的已发布版本，Skill 不会因此从列表消失。

品牌：

- Logo 定稿为「简化 3」：横条眼睛，f 的横杠只向右伸出。文件在 `public/brand/`、`src/app/icon.svg`、`favicon.ico`、`apple-icon.png`。

仓库：GitHub `ifai-os/ifai`（私有），默认分支 `main`。

## 待站长处理

- [x] 把 Claude 的 GitHub 应用装到 ifai-os 组织，只授权 `ifai` 这一个仓库（2026-10-22 已完成）。以后要给它加仓库：ifai-os 组织 → Settings → GitHub Apps → Claude → Configure → Repository access。
- [ ] 删除临时的 `bootstrap` 分支和两个「Temporary bootstrap」草稿 release。
- [ ] 按 `docs/setup.md` 开账号、配 Vercel。
- [x] 在 GitHub 仓库 Settings → Secrets and variables → Actions 填 `VERCEL_TOKEN`、`NEON_API_KEY`、`NEON_PROJECT_ID`，见 setup.md 第 3 步；Vercel 的环境变量不要勾 Sensitive。2026-10-23 已填（Neon 新建了项目 `ifai`，us-east-1；本机开发用的 `dev` 分支还没建，见 setup.md 第 2 步第 2 条），PR 会部署预览环境。`ifai.io` 接到 Vercel 之前，Resend 回调和第三方登录的回调都收不到。
- [x] Vercel 项目 → Settings → Environment Variables，给 **Preview** 填 `PAYLOAD_SECRET`、`BETTER_AUTH_SECRET`（各一个和生产不同的随机字符串）和 `NEXT_PUBLIC_SITE_PHASE` = `1`，其余按 setup.md 第 3 步第 4 条的表。2026-10-23 已填，PR #43、#46 的「Deploy to preview」都通过了。这两个密钥标了 Sensitive，不用改：构建日志里 Better Auth 的密钥警告说的是 `vercel pull` 写的占位符，不是真值，见 setup.md 第 3 步第 6 条。
- [x] 预览环境开着 Vercel 的访问保护，冒烟测试要靠 GitHub secret `VERCEL_AUTOMATION_BYPASS_SECRET` 才进得去（setup.md 第 3 步第 5 条；没有它时「Preview smoke tests」跳过）。2026-10-23 已加；在这之前跑的 PR，要在 Actions 里把那次 Deploy 整个重跑（Re-run all jobs），冒烟测试才会跑。
- [ ] 开 OpenRouter（setup.md 第 8 步）和 Inngest（第 9 步，装 Vercel 集成），在 Vercel 填 `OPENROUTER_API_KEY`、`AI_DAILY_BUDGET_USD`、`MODEL_CALLS_ENABLED`、`COLLECT_ENABLED`。先在 Inngest 控制台跑通 `ifai/health.check`。2026-10-23：Inngest 的 Vercel 集成已装。
- [ ] 邮件订阅：开好 `news@ifai.io` 邮箱，按 setup.md 第 7 步在 Resend 验证 `ifai.io`（SPF、DKIM，再加一条 DMARC `p=none`），Vercel 生产和预览都填 `DAILY_EMAIL_FROM` = `news@ifai.io`；在 Resend 加回调端点，把签名密钥填到生产的 `RESEND_WEBHOOK_SECRET`（第 7 步第 6 条）。2026-10-23：Resend 已验证 `ifai.io`（DNS 记录加在 Cloudflare，`ifai.io` 原有的飞书邮箱 MX 记录没动；打开和点击追踪是关着的，保持这样），Vercel 生产和预览都已填 `DAILY_EMAIL_FROM` = `news@ifai.io`；还差回调端点和 `RESEND_WEBHOOK_SECRET`，要等生产部署打开、`ifai.io` 接到 Vercel 之后。生产的 `DAILY_EMAIL_ENABLED` 等预览验过再打开。免费版每天 100 封、和登录邮件共用，订阅者到 80 人左右时换 Pro（后台订阅者列表上方会提示）。
- [ ] 日报邮件部署到预览环境后（Preview 要有 `RESEND_API_KEY` 和 `DAILY_EMAIL_FROM`；回调不用等）：Preview 设 `DAILY_EMAIL_ENABLED=true` 并重新部署。看 `/zh-hans/daily`（桌面右上、手机列表后面）和首页的订阅框；输 `name@gmial.com` 看提示，点一下改过来；用**管理员的邮箱**订阅（预览环境只给管理员发），在 Gmail 网页和手机上看欢迎信，点「管理订阅」改语言和时区、退订、重新订阅；后台「日报 → 订阅者」看概览和列表，点「预览邮件」切五种语言，点「发测试邮件」看收到的邮件，试一次停发再撤销。第二天当地 8:00–8:15 应该收到第一封日报邮件，后台「今天的发送」里「已发」多一封（「送达」要靠 Resend 回调，预览环境没有，等生产接上回调再看）。都没问题就在生产打开 `DAILY_EMAIL_ENABLED`。
- [ ] 日报第 6 步后半部署到预览环境后：后台「审核队列」右栏「今日海报」看自动选的条目，上移、下移、移出、加入各点一次，点「生成海报」，再点「预览 5 张海报」看海报页和五张图（中日韩字是否正常、长标题是否完整）；把海报页链接贴到 X、Telegram、微信里看分享卡片；撤回一条海报上的新闻，确认海报页和图片里马上没有它；手机宽度看列表页「每日 AI 大事」卡片和海报页。
- [ ] 日报第 6 步前半部署到预览环境后：打开采集，等 Hacker News 抓过一两轮，在后台「日报 → 新闻」看热度和「上升 / 新」有没有出来，看 `/en/daily` 顶部「今日最热」和右栏「48 小时热门」。新闻发布后一两分钟内「今天提到的应用」应该出现提到的应用（应用模块监听 `daily/story.changed`），撤回后消失。
- [ ] 画布「设计令牌」画板补上新令牌 `star`（#d97a1e，白底 3.1:1），用在应用评价的星星上；画板上的 #E8892B 只有 2.6:1，不够图形要求的 3:1。
- [ ] 应用资料核对提醒部署到预览环境后：发布一个应用，看右栏「资料核对时间」自动填上当天；把它改成 100 天前保存，回到应用列表看上方的提醒，点「查看这些应用」确认只列出它；再改回今天，提醒消失。
- [ ] 应用提交部署到预览环境后（要先配好 Resend 和 Inngest）：登录后在 `/zh-hans/apps` 搜一个没收录的名字，点「提交应用」，提交一个真实的官网，看「提交成功」和收到的邮件；再提交一个已收录应用的官网，看「已经收录」的提示。到后台应用列表点提醒里的「去处理」，一条点「收录：生成草稿」，草稿生成后发布，确认提交自动变成「已收录」、收到邮件；另一条改成「未收录」，先不写说明保存一次看提示，再写好说明保存，看邮件和「我的提交」里的说明。手机宽度看列表最后的卡片和提交页。
- [ ] 应用报错部署到预览环境后：不登录在一个应用的详情页底部点「信息有误？告诉我们」，选「资料有误」写一句提交，再选「已停运」提交一次；到后台应用列表看红框，进那个应用的「报错」标签标记完成一条，再点「下架这个应用」并确认，看详情页是否 404，然后把状态改回「已发布」。手机宽度看对话框。
- [ ] 应用评价翻译部署到预览环境后（要先配好 `OPENROUTER_API_KEY`、打开 `MODEL_CALLS_ENABLED`）：用两个账号各写一条评价，一条中文、一条英文或日文；约一分钟后换到英语页和日语页看「翻译」按钮，点开看译文和「机器翻译」标记，再「查看原文」；繁体页看简体评价的转换；到后台那个应用的「评价」标签看译文状态，展开译文，点一次「重新翻译」。
- [ ] 应用第 5 步中段部署到预览环境后：登录后在一个应用的详情页写一条评价，再修改、删除；换一个账号（或不登录）举报一条，到后台应用列表看红框提示，进那个应用的「评价」标签隐藏它，确认前台看不到、作者自己看得到并有提示；手机宽度看评价区（3 条和「查看全部」）和写评价对话框。
- [ ] 应用第 5 步前半部署到预览环境后（要先配好 Resend，或 Google / GitHub 登录）：没登录时在一个应用的详情页点「收藏」，用邮箱登录链接登录，确认回到原页面并已收藏；手机宽度看底栏；账号菜单进「我的收藏」，取消收藏。
- [ ] 应用第 4 步部署到预览环境后：后台应用列表上方点「现在重算」，确认 Tranco 名单编号正常、应用数和提及数对得上；再看 `/zh-hans/apps` 三个榜和表头排序、一个应用的详情（热度折线、三项得分、日报里提到它）、首页「热门应用」，手机宽度也点一遍。看过 Tranco 的使用条款后决定要不要在 Vercel 设 `APPS_SHOW_TRANCO_RANK=true`；首批应用导入完，把 `APPS_NEW_SINCE` 设成上线那天。
- [ ] 日报第 5 步部署到预览环境后：在后台发布一条新闻，1 分钟内看 `/en/daily`、`/zh-hans/daily`、详情页、`/en/daily/rss.xml` 和首页「今天的 AI」有没有出现；保存更正和撤回也同样看一遍。把浏览器时区换到别的地区（或用手机）看时间和「今天 / 昨天」分组是否跟着变；手机宽度下点一遍列表和详情。
- [ ] 日报第 4 步部署到预览环境后：后台左侧点「审核队列」，走一遍通过并发布、改简体再发布（看英日韩是否重写、繁体是否跟着变）、拒绝、稍后再看、撤回、保存更正；重写和 AI 辅助要 `MODEL_CALLS_ENABLED=true`。前台页面要等第 5 步才能看到发布结果。
- [ ] 日报第 2 步部署到预览环境后：把预览环境的 `COLLECT_ENABLED` 设为 `true`，在后台「日报 → 信源」逐个点「试抓」，确认抓到的是文章、日期也对；给 Future Tools、The Rundown、Forward Future 填好选择器后启用；试抓 Anthropic、Meta AI 的新闻列表页，能读就新建信源（T1）。然后发事件 `daily/collect.run`，看 `raw_items` 里有没有条目。
- [ ] 资源第 4 步部署到预览环境后：在后台发布一两个真实 Skill，看 `/zh-hans/resources` 列表的分类、搜索、筛选、排序和卡片视图，详情页（桌面和手机）的安装面板、四个页签和文件原文；点「下载 Zip」，确认最后跳到 R2 并能下载，`shasum -a 256` 和页面上的指纹一致；打开 `/api/skills/<slug>/install.md` 看内容。预览环境有部署保护，AI 助手拉不到 install.md，让 Claude Code 照安装指令实装一次要等正式环境（或者用 Vercel 的保护绕过链接）。再撤回一个版本、下架一个 Skill，1 分钟内看列表、详情和首页有没有跟着变。
- [ ] 资源收藏部署到预览环境后：未登录在 Skill 详情页点「收藏」，看登录弹窗，登录回来是否自动收好；「我的收藏」里有没有 Skill 一段，取消收藏后是否消失；手机宽度看底部那一栏的收藏和复制。
- [ ] 资源统计汇总部署到预览环境后：在 Inngest 后台确认 `skill-stats-rollup` 每小时跑（或发 `skill/stats-rollup` 立即跑）；在一个 Skill 上复制安装指令、下载 Zip，下一次汇总后列表和详情的安装数加上去，右栏安装榜跟着变。「本周飙升」要等真实安装够多才会出现。
- [ ] 资源投稿部署到预览环境后：配好 Resend（`RESEND_API_KEY`、`EMAIL_FROM`），登录后在 `/zh-hans/resources/submit` 投一个真实仓库，看页面上的编号和收到的确认邮件；在后台「Skill 投稿」里把它改成「已拒绝」并写一句说明，收到结果邮件；再导入成 Skill、发布、在「导入为」里选它、改成「已收录」，收到带 Skill 页面链接的邮件。Inngest 后台能看到 `skill-submission-notify` 的运行。
- [ ] 资源加载骨架部署到预览环境后：在浏览器开发者工具里把网速调成 Slow 3G，在 `/zh-hans/resources` 点分类、排序和下一页，看结果区的骨架（列表和卡片视图各一次，手机宽度也看）；再点进一个 Skill，看详情骨架。
- [ ] 全站搜索部署到预览环境后：五种语言点顶栏放大镜，搜一个应用名（看它是不是排第一、标着「应用」）、一个新闻里的词、一个 Skill 名；在英语页用中文搜一次；搜一个不存在的词看「热门」；切「日报 / 应用 / Skills」标签和翻页；手机宽度也点一遍；打开一个不存在的地址，在 404 页搜一次。
- [ ] 资源模块上线前：Claude Code、Codex、OpenClaw、Hermes、Pi、WorkBuddy 的官方授权 logo 文件。Skill 详情页现在用的是首字母占位图标。
- [ ] 日报收藏部署到预览环境后：没登录在一条新闻的详情页点「收藏」，看登录对话框，登录回来是否自动收好；账号菜单进「我的收藏」，日报一段在最上面，点标题回到详情，再取消收藏；在后台撤回这条新闻后再收藏一条、撤回，确认「我的收藏」里看不到它。手机宽度看详情页的两个按钮和「我的收藏」。
- [ ] 删除账号部署到预览环境后：用一个测试账号收藏一个应用、写一条评价、提交一个应用，再从账号菜单进「账号」删除，确认回到「账号已删除」、右上角变回登录图标；后台应用提交里那条没了，用同一个邮箱再登录是空账号。
- [ ] 隐私政策和用户协议：开好 `hello@ifai.io` 邮箱（或者告诉 Claude 换成别的地址，改 `src/modules/legal/documents.ts`）；正式上线前请懂当地法律的人看一遍两页条文；定了公司主体后补上适用法律和争议解决地点。账号删除的 PR 合并后，隐私政策「你可以做什么」一节加上账号页的说明。
- [ ] 正式上线后：在 Google Search Console 和 Bing Webmaster Tools 验证 `ifai.io`，提交 `https://ifai.io/sitemap.xml`，过几天看「网页索引」里有没有被排除的地址，「增强功能」里面包屑和结构化数据有没有报错；挑一条新闻、一个应用、一个 Skill 的地址贴到 https://search.google.com/test/rich-results 看一遍。
- [ ] 以后再定：商业化方式；排行第一批参赛模型和题库（第三期前）。

## 已知问题

- 有的沙盒连不上 npm registry（DNS 失败或代理返回 403）。上次的绕法：在临时分支上用 GitHub Actions 安装依赖，打包成草稿 release 再下载回来，用完要删掉分支和 release。新会话先直接试 `pnpm install`（2026-10-22 的会话可以直接装）。
- 沙盒里可以用 apt 装 `postgresql-16-pgvector`，再 `service postgresql start`，在本地库上跑迁移和 `pnpm build`。
- 沙盒的代理也不放行 codeload.github.com 和 api.github.com，Skill 导入只能把 `fetch` 换成假响应、用 `tests/unit/resources/fixtures/skill-repo.tar.gz` 在本地库上验证；真实导入要在预览环境里点「导入版本」试（需要 Inngest 集成）。
- 沙盒的代理不放行新闻站点（techcrunch.com、openai.com、hn.algolia.com 都返回 403），信源抓取只能把 `fetch` 换成假数据在本地库上验证；真实抓取要在预览环境看。模型流水线同理，本地只能用 `ai/test` 的假模型跑；真实跑一遍要在站长的电脑上（`OPENROUTER_BASE_URL` 指向局域网接口）或预览环境。
- 两个并行 PR 各自带 Payload 迁移时，后合并的要先合并 main、删掉自己的迁移再重新 `pnpm payload migrate:create`，因为迁移快照会缺对方的表（应用 PR #6 和日报的迁移就是这种情况）。
- 安装时 inngest 依赖的 OpenTelemetry 会报 `@opentelemetry/api` 的 peer 警告，不影响运行。
- 结束 `next start` 进程时按 PID 结束，不要用 `pkill -f`，否则会连自己的 shell 一起结束。
- `loading.tsx` 里不要在服务器上取文案（服务端的 `useTranslations` / `getTranslations`）：它拿不到 `params`，没法 `setRequestLocale`，next-intl 就去读请求头，静态生成的页面因此报 `DYNAMIC_SERVER_USAGE`，返回 500。骨架里要文案（`aria-label`）就写成客户端组件，像 `skill-detail-skeleton.tsx`。
- 在 Payload 钩子里调用 Local API 并传入 `req`（为了留在同一个事务里）时，Payload 会就地改写这个 `req` 的语言、回退语言、`depth` 和 `context`，保存后面的步骤会拿到被改过的请求。`syncHantFromHans` 已经在调用后还原（见 `hant-sync.ts` 的 `keepingRequest`），别的钩子这样调用时照着做；资源模块的钩子用 `src/modules/resources/collections/guards.ts` 里的 `peek` / `systemUpdate`，它们已经包了一层。
- `revalidateTag` 只能在 Next.js 里调用。`pnpm payload run` 的脚本和迁移在 Next.js 之外，应用页面的缓存刷新钩子在那里什么也不做；用脚本改了应用数据，页面最晚一小时后更新。
- 两个分支各自生成了迁移时，后合并的那个要先合并 `main`，删掉自己的迁移，再重新 `pnpm payload migrate:create`。否则最新的快照（`.json`）里缺了对方的表，下一次生成迁移会出错。
- Payload 生成的 down 迁移会先 `DROP TABLE … CASCADE`，再删已经被连带删掉的外键，执行时报错。生成后把这类 `DROP CONSTRAINT` 改成 `DROP CONSTRAINT IF EXISTS`，并跑一次 `pnpm payload migrate:down` 验证。
- 应用资料草稿的每一步（`src/modules/apps/profile/draft.ts`）都可以传入 `fetch`、`resolve`、`ai`，本机用假网页和假模型在本地库上跑通整条流程。抓取只访问公网地址，所以假网页要配一个返回公网 IP 的 `resolve`。仓库外的临时脚本用 `pnpm payload run` 跑时，扩展名用 `.mts`，并把仓库的 `node_modules` 链接到脚本旁边。
- 沙盒里有 PostgreSQL 16：`service postgresql start`，建库 `ifai`，在 `.env` 里填本地的 `DATABASE_URI`，就能跑迁移和 `pnpm build`。
- 本机重新跑示例数据脚本之后，先删掉 `.next/cache/fetch-cache` 再 `pnpm build`：数据缓存会跨构建保留，首页这类构建时预渲染的页面会用上旧数据，冒烟测试跟着失败。CI 每次都是新环境，不受影响。
- 沙盒里的 DNS 查询全部失败（ENOTFOUND），订阅接口的收信服务器检查在这里一律当作「查询出错」不拦；冒烟测试里「域名收不了信」那条在查不到 `gmail.com` 的地方自动跳过，CI 上照常跑。
- 生产构建（Turbopack）里页面和接口各有一份 `payload` 模块，Payload 实例却是共用的（谁先启动用谁的）。先打开过后台页面时，接口里 `instanceof ValidationError` 认不出钩子抛的错误：后台保存被拒时只显示错误的 `message`，字段下面的提示没有了。所以钩子拒绝保存一律用 `src/lib/field-error.ts` 的 `rejectField`（把说明也写进 `message`），判断是不是某个字段的错误用 `isFieldError`（看形状、不用 `instanceof`）。应用提交、资源（`collections/guards.ts`、`submit/submit.ts`）和日报订阅者都已改用它们；新写的钩子不要直接 `throw new ValidationError`。
- ESLint 10 的 peer 依赖警告是已知情况，见 AGENTS.md。

## 设计稿

画布（私有）：https://claude.ai/artifact/A5Kyi4ghxTUcsFMouH677D 。画板之间有冲突时以较新的为准。

| 画板 | 用途 |
|---|---|
| IFAI 首页 | 首页（今天的 AI、热门应用、新上架 Skills、即将上线） |
| IFAI 日报（新版） | 日报列表（桌面） |
| 手机 · 日报 | 日报列表（手机） |
| IFAI 资讯详情页 · v1 | 日报详情：事实、来源、更正记录的结构可以沿用 |
| IFAI 日报审核后台 | 审核队列、审核与更正、今日海报 |
| IFAI 应用首页（原排行）、IFAI 应用详情、手机 · 应用列表、手机 · 应用详情 | 应用 |
| IFAI 资源 · Skills、IFAI Skill 详情、手机 · Skill 详情 | 资源 |
| IFAI 推荐（原社区）、IFAI 推荐 · 文章详情、IFAI 圈子 | 第二期 |
| IFAI 模型排行、IFAI Wiki | 第三期 |
| 设计令牌 v1 | 对应 `src/app/(frontend)/globals.css` |
| IFAI 图标（已定稿） | Logo 与图标 |
| 空状态与加载状态 | 各页面的空状态、加载状态 |
| 日报邮件（照实现）、管理订阅页（照实现） | 晨报、欢迎信和管理订阅页，照实际输出画的；改邮件或这一页时同步改 |
| 每日 AI 大事海报（照实现） | 海报图片，照实际生成的图画的；改海报版式时同步改 |
| IFAI 资讯首页 · v1（按需求文档） | 旧版日报列表，已被「IFAI 日报（新版）」取代 |
| 少数派 · 设计风格提取、文章详情页、话题（一派）详情页、派早报模板 | 视觉风格参考，不是 IFAI 的页面 |

## 其他文档

- 技术方案调研（私有）：https://claude.ai/artifact/7zipcpFS92xvs5GXsdTZnR 。日报部分以 `docs/specs/daily.md` 为准。
- 决策台（2026-10-21，22 个问题的选择）：https://claude.ai/artifact/28c8qGXCcKKU5nsovQSBra 。其中技术路线、语言和日报的题已被上面的决定取代。
- 需求文档 v0.3（MRD / PRD / TRD，Word 版）在站长手上。
