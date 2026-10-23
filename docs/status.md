# 项目进度

给接手的人和 AI 会话看的：开工前先读 [AGENTS.md](../AGENTS.md)，再读这一页。每合并一个 PR，顺手更新「现在到哪了」和「下一步」。

更新于 2026-10-23（应用·日报改动后立即匹配提及；日报第 6 步前半·热度；应用第 4 步后半·热度页面；资源第 3 步·说明起草）。

## 现在到哪了

- **地基（第 1–2 周）已完成**，在 `main` 上，CI 通过。首页用的是演示数据，日报、应用、资源三个入口是「即将上线」占位页。详见 [specs/foundation.md](./specs/foundation.md)。
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
- **应用第 1 步（集合与后台录入）已完成**：`src/modules/apps/collections/` 里的 `app-categories`、`apps` 两个集合，迁移 `apps` 建表并写入首批 8 个分类（五种语言）。后台「应用」分组可以手动录入；公开接口只返回已发布的应用。繁体由简体自动转换：通用钩子 `syncHantFromHans`（`src/lib/i18n/hant-sync.ts`），日报的 `stories` 也在用。
- **应用第 3 步（列表页和详情页）已完成**：`/[locale]/apps`（全部应用，按名称 A–Z，每页 50 条）、`/[locale]/apps/category/[slug]`（分类，数量含次分类）、`?q=` 搜索（名称、别名、一句话介绍、标签，五种语言都查，搜索页不进索引）、`/[locale]/apps/[slug]`（简介、资料、标签、它是什么、核心功能、常见问题、替代品、打开网站、分享）。代码在 `src/modules/apps/`（`data.ts` 读数据，`components/` 是页面组件），页面文件只做组装。缺读者语言的内容回退英文并标 `lang`。数据缓存挂标签 `apps`，后台保存应用或分类后立即刷新。还没有热度，所以榜单、热度前三、走势、首页「热门应用」都留到第 4 步；收藏、评价、提交应用、「信息有误？」留到第 5 步。和规格不同的地方写在 apps.md「页面与路由」末尾。本机示例数据：`pnpm payload run scripts/seed-apps.ts`（只认本机数据库），CI 冒烟测试用它。
- **应用第 2 步（官网取材与资料草稿）已完成**：后台打开应用，右栏「资料草稿」点「生成草稿」；或在应用列表页上方「批量添加应用」每行贴「名称, 官网网址」（只贴网址也行，最多 300 行，按域名跳过已收录的，去掉推广参数）。Inngest 任务 `apps-draft-profile` 抓官网首页和定价页（只访问公网地址），用途 `profile` 一次读事实、四种语言各写一次（繁体转换），定价和平台要带官网原文，找不到就留空；名字和数字做原文核对，结果和留空的建议显示在右栏。logo 取官网图标，截图取 og 图，存媒体库。分类、定价、平台、开发者、图片只在空着时填；重新生成只重写介绍、功能、常见问题和标签。开关关着或预算用完时停在「待生成」，`apps-draft-sweep` 每 20 分钟补漏。迁移 `apps_profile_drafts` 加 `draft_status`、`draft_info`，主分类改成发布前必填（草稿可以空着）。代码在 `src/modules/apps/profile/`、`prompts/profile.ts`、`admin/`。沙盒里用假模型和假网页在本机库上跑通了导入、改名、四种语言、繁体、核对、留空、图片和失败的情况；真实网站和真实模型要在预览环境试。Toolify 在这里打不开，没法先看它的条款，所以首批名单先人工挑，贴进批量添加。
- **应用第 4 步前半（热度的数据与任务）已完成**：迁移 `apps_heat` 建 Drizzle 表 `app_clicks`、`app_mentions`、`app_metrics_daily`、`app_heat_runs`（`src/modules/apps/schema.ts`）。Inngest 任务 `apps-heat-daily` 每天上海时间 06:00（或后台应用列表上方「现在重算」，事件 `apps/heat.run`）：下载 Tranco 每日名单按注册域名查名次（失败沿用最近一次的名次并在后台提示），匹配近 30 天已发布日报的产品、公司和来源链接写进 `app_mentions`，再按 `src/modules/apps/heat.ts` 打分写 `app_metrics_daily`、刷新 `apps` 缓存。「打开网站」改走 `/[locale]/apps/[slug]/visit`：同一访客每天每个应用记一次点击（哈希在 `src/lib/visitor.ts`，不存 IP，爬虫和预取不记），再跳官网。后台应用编辑页多了「热度」标签（三项构成、名次、近 30 天、匹配到的日报，误配可以删掉）。收藏第 5 步才有，现在这一项只算点击。本地库上用假的 Tranco 名单跑通了打分、7 天变化、飙升、同一事件只算一次、删掉误配、Tranco 失败沿用、点击去重和爬虫过滤。tranco-list.eu 在沙盒里连不上，上线后第一次运行要在后台确认名单编号。做法写在 apps.md「热度」末尾。
- **应用第 4 步后半（热度页面）已完成**：列表默认综合榜（按热度），`?board=rising` 飙升榜、`?board=new` 新上架（收录 30 天内），可以和分类、搜索叠加；表头「热度」「7 天变化」「网站排名」点了按它排（`?sort=`）。桌面有热度前三卡片，第一页先显示 10 行、「查看第 11–50 名」展开，每行有 7 天走势小线；列表下面是「本周新上架」和「热度怎么算」。详情页简介下面一排数字（热度、分类榜名次、日报提及），核心功能之后是热度：近 7 / 30 / 90 天折线（可以逐天查看，读屏有表格）、三项得分和来源、榜单位置，然后是「日报里提到它」。替代品没指定时取同类热度前 6。首页「热门应用」和「本周精选应用」（飙升榜第一，没有就取综合榜第一）读真实数据，顶部提示改成只说 Skill 还是示例。页面一律显示最近一次算好的那一天。两个新环境变量：`APPS_SHOW_TRANCO_RANK=true` 才显示 Tranco 名次（默认不显示，照常算分）；`APPS_NEW_SINCE` 让首批导入的应用不进新上架。排序规则是纯函数（`src/modules/apps/boards.ts`），有单元测试；读热度在 `heat-reads.ts`。`scripts/seed-apps.ts` 现在按真实打分规则写几周示例热度，在 `seed-stories.ts` 之后跑会匹配示例日报；冒烟测试覆盖三个榜、表头排序、详情的热度和首页。站长在后台指定精选、「同类热门」侧栏、嵌入徽章没做。做法写在 apps.md「页面与路由」末尾。
- **应用：日报改动后立即匹配提及**：Inngest 任务 `apps-mentions-story-changed` 监听日报的 `daily/story.changed`（发布、更正、撤回、并入），把那条新闻发布时间前后的新闻重新匹配进 `app_mentions` 并刷新 `apps` 缓存，应用详情「日报里提到它」和日报列表右栏「今天提到的应用」不用再等每天 06:00；撤回的新闻的匹配会去掉。热度里的提及数仍在 06:00 算。本地库上用示例新闻跑通了撤回（匹配去掉）、重新发布（按新时间加回）。做法写在 apps.md「热度」末尾。
- **资源第 1 步（集合与后台录入）已完成**：`src/modules/resources/collections/` 里的 `skills`、`skill-versions`（上传集合，Zip 存 R2 的 `skills/` 前缀）、`agent-hosts`、`skill-tags`、`skill-submissions`，Drizzle 表 `skill_events`（`db/schema.ts`），迁移 `resources` 建表并写入 6 个宿主；分类固定 7 个在 `categories.ts`，名称在 `messages/`。
- **资源第 2 步（导入与检测）已完成**：后台 Skill 页侧栏有「导入版本」（接口 `POST /api/skills/:id/import`，可填分支 / tag / commit 和版本号），发事件 `skill/import` 给 Inngest 任务 `skill-import`（`src/modules/resources/import/`）：从 codeload 拉仓库的 tar.gz 快照（commit 取自归档头，公开仓库不用令牌；可选 `GITHUB_TOKEN` 提限额），按仓库地址里的子目录或唯一的 `SKILL.md` 找到 Skill 目录，去掉 `.git`、`.DS_Store` 之类，打成确定性的 Zip（同样的文件得到同样的 sha256），以「待审」状态创建版本；版本号取请求的 → `SKILL.md` 头部的 → 最新版本号加一；同一 commit 只导入一次；结果写在 Skill 侧栏「最近导入」里。sha256、文件清单、SKILL.md 原文与 frontmatter、声明的域名和静态检测全部在 `skill-versions` 的上传钩子里由 Zip 算出（`package/inspect.ts`），所以手动上传的 Zip 和导入的走同一套检查。静态检测（`scan/`）按规格 7 项：包结构、密钥、敏感位置为「拦截」，危险命令、外联、提示注入为「有提示」，许可缺失则不能发布（仓库 SPDX → `SKILL.md` 的 `license` → 包内或仓库根 LICENSE → Skill 上填的许可 → 「作者书面同意」勾选）。发布校验：拦截不能发，待检测不能发，有提示要填「复核备注」，没有许可要有许可或作者同意；发布时自动填 `publishedAt`，把 Skill 的当前版本换成更新的版本并让草稿 Skill 上线。已发布 / 已弃用 / 已撤回的版本不能换 Zip、不能退回待审，版本号、commit、sha256、文件清单、SKILL.md、frontmatter、声明、检测结果都不能改（规则 2）；更新说明和兼容记录仍可改。撤回要填原因，Skill 下架要填原因，已发布的 Skill 必须指向已发布的版本。`skills` 开了 Payload 版本历史（显示字段的修改记录）。本地库上用假的 GitHub 响应跑通了导入、重复导入、导入失败记录、拦截不能发布、有提示需备注、发布后 Skill 上线、不可改、撤回、下架。
- **资源第 3 步（说明起草）已完成**：新用途 `describe`（`src/lib/ai/purposes.ts`，可用 `AI_MODEL_DESCRIBE` 换模型）。起草以版本为单位（`src/modules/resources/describe/`，提示词在 `prompts/describe.ts`）：一次调用按文件提取声明（外联域名、读写范围、工具、API Key，温度 0），四次调用分别写简体、英语、日语、韩语的显示名、一句话介绍、「它能做什么」、使用示例、工作流程和注意事项；SKILL.md、README（包内的，没有时取仓库根目录的，存在版本的 `readme` 字段）和文件清单全部用 `untrusted()` 包成数据。文字写进 Skill（简体先写，繁体由钩子生成），声明写进版本；名字和数字用日报的原文核对检查，文件里找不到的外联域名、工具、API Key 不写入，列在面板上；版本已发布时不改它的声明（规则 2）。状态记在版本上：「说明草稿」待生成 → 已生成 / 没生成（`draftStatus`、`draftInfo`）。Skill 还没有说明时，导入后自动排队起草，只填空着的字段；之后在版本页侧栏点「生成说明草稿」重写（接口 `POST /api/skill-versions/:id/describe`），显示名只在空着时填，试用笔记不动，「需要 API Key」和运行依赖也只在空着时填。Inngest 任务 `skill-describe`（同一版本的新请求取消旧的，模型调用失败三次标「没生成」）和 `skill-describe-sweep`（每 20 分钟补漏：开关关着、预算用完或事件丢了的草稿）。模型关着、没有 key、预算用完时草稿停在「待生成」，导入照常完成。迁移 `resources_describe` 给 `skill_versions` 加 `draft_status`、`draft_info`、`readme`。本地库上用假模型跑通了：四种语言和繁体写入、声明核对、只填空字段与重写、旧请求不覆盖新请求、补漏、已发布版本不改声明、没有 SKILL.md 正文时标「没生成」、开关关着时等待。真实模型的草稿质量要在预览环境试。
- **共用的空状态与加载状态已做好**，按「空状态与加载状态」画板：列表骨架、卡片骨架、空状态、加载失败重试、断网提示、全站 `error.tsx` 和 404，在 `src/components/states/`（按钮在 `src/components/button.tsx`）。各模块的页面直接用，不要再各写一套；和模块绑定的状态（日报未发布、搜索无结果、Skill 安全扫描、机器翻译标记、需要登录弹窗、提交成功）留给各自的模块。
- **线上环境还没配**。Neon、Vercel、R2、Google / GitHub 登录、Resend 这几个账号由站长按 [setup.md](./setup.md) 开，密钥不经过 AI。

## 分期

导航按 `NEXT_PUBLIC_SITE_PHASE` 显示，见 `src/config/site.ts`。没上线的模块不提前建页面或数据表。

| 期 | 周 | 模块 | 状态 |
|---|---|---|---|
| 第一期 | 1–2 | 地基 | 完成 |
| 第一期 | 3 起 | 日报 | 第 1–5 步、第 6 步前半（热度）完成，下一步海报 |
| 第一期 | 日报之后 | 应用 | 第 1–4 步（集合与后台录入、官网取材与资料草稿、列表页和详情页、热度）完成，下一步收藏、评价与提交 |
| 第一期 | 日报之后 | 资源（Agent Skills） | 第 1 步（集合、skill_events 表、后台录入）、第 2 步（导入与检测）、第 3 步（说明起草）完成，下一步前台 |
| 第二期 | 13–20 | 推荐（长文）、圈子（短动态） | 只有画板 |
| 第三期 | 21–26 | 排行（模型盲测）、Wiki | 只有画板 |

第一期在第 12 周末上线。之后每期 6–8 周，开工前先过闸口：用上一期的数据决定下一期是否开工。每两周在预览环境里从用户视角走一遍新功能。

## 下一步

1. **日报第 6 步后半（海报）**，对应画板「日报审核后台」右栏「今日海报」和「IFAI 日报（新版）」的「每日 AI 大事」卡片：`posters` 集合（上海日期、条目顺序、状态），审核后台按规则自动选当天已发布的前 8 条（一件事一条、按热度和分数、同一信源最多 2 条），可以调整顺序、移出、加入，生成五种语言的图片，`/[locale]/daily/poster/[YYYY-MM-DD]` 和分享图，列表页右上角的「每日 AI 大事」卡片。
2. **应用首批导入**：站长从 Toolify 挑 200–300 个应用的名称和官网网址，贴进后台「批量添加应用」，在预览环境先试几个，确认草稿质量后再批量。然后是**应用第 5 步**：收藏（`saves` 表，资源也用）与「我的收藏」、评价与评价翻译、提交应用、「信息有误？」；做完热度里的「站内点击与收藏」才算上收藏。这个沙盒的网络策略不放行 toolify.ai 和 tranco-list.eu，Tranco 下载要在预览环境验证，或者在项目设置里加白名单。
3. **资源第 4 步：前台**（见 resources.md「实现顺序」，画板「IFAI 资源 · Skills」「IFAI Skill 详情」「手机 · Skill 详情」）：列表、详情（桌面、手机）、固定版本页、`install.md` 和下载接口、安装事件（访客哈希用 `src/lib/visitor.ts`，同一访客对同一 Skill 一天算一次）、首页「新上架 Skills」接真实数据。说明起草要在预览环境配好 `OPENROUTER_API_KEY`、打开 `MODEL_CALLS_ENABLED`，对两三个真实 Skill 点「生成说明草稿」看质量。6 个宿主里 Codex 之后几个的目录位置、官网和安装说明要站长在后台补。收藏复用应用的 `saves` 表，谁先做谁建表。

## 已做的决定

产品与技术：

- 面向海外用户，部署在海外，不做中国大陆备案。站点名 IFAI。
- 五种语言：英语（默认）、简体中文、繁体中文、日语、韩语。繁体中文一律用 OpenCC 从简体转换，不用模型翻译。
- 技术栈按技术方案：Next.js 16 + Payload 3 + Neon Postgres + Better Auth + next-intl / OpenCC + Tailwind 4 + R2 + Resend + Vercel。之后按模块接入 Inngest、Vercel AI SDK + OpenRouter、Meilisearch、Langfuse、PostHog、Sentry。
- 登录方式：Google、GitHub、邮箱魔法链接。不开放邮箱 + 密码注册。
- 新闻引擎借鉴 [AIHOT](https://github.com/KKKKhazix/AIHOT)（MIT）的流程、门槛、热度算法和提示词结构，用 Inngest + Payload 重写，不照搬它的运行时。

日报（2026-10-22，细节见 daily.md）：

- 信源都是英文。第一批 16 个：6 个媒体和聚合站，加 10 个官方 RSS。X 和 Notion 信源以后再接。
- AI 分别用简体中文、英语、日语、韩语写标题和摘要，繁体由简体转换。网址用英文 slug，五种语言共用。
- 审核通过就立即发布，没有刊期。时间按读者自己的时区显示。
- 每日 AI 大事海报按上海时间的自然日出。
- 页面不标注「AI 撰写」。
- 邮件订阅放在第 6 周：在订阅者当地时间早上 8 点发，内容是过去 24 小时热度前 10 条。

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

品牌：

- Logo 定稿为「简化 3」：横条眼睛，f 的横杠只向右伸出。文件在 `public/brand/`、`src/app/icon.svg`、`favicon.ico`、`apple-icon.png`。

仓库：GitHub `ifai-os/ifai`（私有），默认分支 `main`。

## 待站长处理

- [x] 把 Claude 的 GitHub 应用装到 ifai-os 组织，只授权 `ifai` 这一个仓库（2026-10-22 已完成）。以后要给它加仓库：ifai-os 组织 → Settings → GitHub Apps → Claude → Configure → Repository access。
- [ ] 删除临时的 `bootstrap` 分支和两个「Temporary bootstrap」草稿 release。
- [ ] 按 `docs/setup.md` 开账号、配 Vercel。
- [ ] 开 OpenRouter（setup.md 第 8 步）和 Inngest（第 9 步，装 Vercel 集成），在 Vercel 填 `OPENROUTER_API_KEY`、`AI_DAILY_BUDGET_USD`、`MODEL_CALLS_ENABLED`、`COLLECT_ENABLED`。先在 Inngest 控制台跑通 `ifai/health.check`。
- [ ] 画布「设计令牌」画板补上新令牌 `night`（#1F2024，白字对比度 16.3:1），用在列表页「今日最热」卡片和以后的海报上。
- [ ] 日报第 6 步前半部署到预览环境后：打开采集，等 Hacker News 抓过一两轮，在后台「日报 → 新闻」看热度和「上升 / 新」有没有出来，看 `/en/daily` 顶部「今日最热」和右栏「48 小时热门」。新闻发布后一两分钟内「今天提到的应用」应该出现提到的应用（应用模块监听 `daily/story.changed`），撤回后消失。
- [ ] 应用第 4 步部署到预览环境后：后台应用列表上方点「现在重算」，确认 Tranco 名单编号正常、应用数和提及数对得上；再看 `/zh-hans/apps` 三个榜和表头排序、一个应用的详情（热度折线、三项得分、日报里提到它）、首页「热门应用」，手机宽度也点一遍。看过 Tranco 的使用条款后决定要不要在 Vercel 设 `APPS_SHOW_TRANCO_RANK=true`；首批应用导入完，把 `APPS_NEW_SINCE` 设成上线那天。
- [ ] 日报第 5 步部署到预览环境后：在后台发布一条新闻，1 分钟内看 `/en/daily`、`/zh-hans/daily`、详情页、`/en/daily/rss.xml` 和首页「今天的 AI」有没有出现；保存更正和撤回也同样看一遍。把浏览器时区换到别的地区（或用手机）看时间和「今天 / 昨天」分组是否跟着变；手机宽度下点一遍列表和详情。
- [ ] 日报第 4 步部署到预览环境后：后台左侧点「审核队列」，走一遍通过并发布、改简体再发布（看英日韩是否重写、繁体是否跟着变）、拒绝、稍后再看、撤回、保存更正；重写和 AI 辅助要 `MODEL_CALLS_ENABLED=true`。前台页面要等第 5 步才能看到发布结果。
- [ ] 日报第 2 步部署到预览环境后：把预览环境的 `COLLECT_ENABLED` 设为 `true`，在后台「日报 → 信源」逐个点「试抓」，确认抓到的是文章、日期也对；给 Future Tools、The Rundown、Forward Future 填好选择器后启用；试抓 Anthropic、Meta AI 的新闻列表页，能读就新建信源（T1）。然后发事件 `daily/collect.run`，看 `raw_items` 里有没有条目。
- [ ] 资源模块上线前：Claude Code、Codex、OpenClaw、Hermes、Pi、WorkBuddy 的官方授权 logo 文件。Skill 详情页现在用的是首字母占位图标。
- [ ] 以后再定：商业化方式；排行第一批参赛模型和题库（第三期前）。

## 已知问题

- 有的沙盒连不上 npm registry（DNS 失败或代理返回 403）。上次的绕法：在临时分支上用 GitHub Actions 安装依赖，打包成草稿 release 再下载回来，用完要删掉分支和 release。新会话先直接试 `pnpm install`（2026-10-22 的会话可以直接装）。
- 沙盒里可以用 apt 装 `postgresql-16-pgvector`，再 `service postgresql start`，在本地库上跑迁移和 `pnpm build`。
- 沙盒的代理也不放行 codeload.github.com 和 api.github.com，Skill 导入只能把 `fetch` 换成假响应、用 `tests/unit/resources/fixtures/skill-repo.tar.gz` 在本地库上验证；真实导入要在预览环境里点「导入版本」试（需要 Inngest 集成）。
- 沙盒的代理不放行新闻站点（techcrunch.com、openai.com、hn.algolia.com 都返回 403），信源抓取只能把 `fetch` 换成假数据在本地库上验证；真实抓取要在预览环境看。模型流水线同理，本地只能用 `ai/test` 的假模型跑；真实跑一遍要在站长的电脑上（`OPENROUTER_BASE_URL` 指向局域网接口）或预览环境。
- 两个并行 PR 各自带 Payload 迁移时，后合并的要先合并 main、删掉自己的迁移再重新 `pnpm payload migrate:create`，因为迁移快照会缺对方的表（应用 PR #6 和日报的迁移就是这种情况）。
- 安装时 inngest 依赖的 OpenTelemetry 会报 `@opentelemetry/api` 的 peer 警告，不影响运行。
- 结束 `next start` 进程时按 PID 结束，不要用 `pkill -f`，否则会连自己的 shell 一起结束。
- 在 Payload 钩子里调用 Local API 并传入 `req`（为了留在同一个事务里）时，Payload 会就地改写这个 `req` 的语言、回退语言、`depth` 和 `context`，保存后面的步骤会拿到被改过的请求。`syncHantFromHans` 已经在调用后还原（见 `hant-sync.ts` 的 `keepingRequest`），别的钩子这样调用时照着做；资源模块的钩子用 `src/modules/resources/collections/guards.ts` 里的 `peek` / `systemUpdate`，它们已经包了一层。
- `revalidateTag` 只能在 Next.js 里调用。`pnpm payload run` 的脚本和迁移在 Next.js 之外，应用页面的缓存刷新钩子在那里什么也不做；用脚本改了应用数据，页面最晚一小时后更新。
- 两个分支各自生成了迁移时，后合并的那个要先合并 `main`，删掉自己的迁移，再重新 `pnpm payload migrate:create`。否则最新的快照（`.json`）里缺了对方的表，下一次生成迁移会出错。
- Payload 生成的 down 迁移会先 `DROP TABLE … CASCADE`，再删已经被连带删掉的外键，执行时报错。生成后把这类 `DROP CONSTRAINT` 改成 `DROP CONSTRAINT IF EXISTS`，并跑一次 `pnpm payload migrate:down` 验证。
- 应用资料草稿的每一步（`src/modules/apps/profile/draft.ts`）都可以传入 `fetch`、`resolve`、`ai`，本机用假网页和假模型在本地库上跑通整条流程。抓取只访问公网地址，所以假网页要配一个返回公网 IP 的 `resolve`。仓库外的临时脚本用 `pnpm payload run` 跑时，扩展名用 `.mts`，并把仓库的 `node_modules` 链接到脚本旁边。
- 沙盒里有 PostgreSQL 16：`service postgresql start`，建库 `ifai`，在 `.env` 里填本地的 `DATABASE_URI`，就能跑迁移和 `pnpm build`。
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
| IFAI 资讯首页 · v1（按需求文档） | 旧版日报列表，已被「IFAI 日报（新版）」取代 |
| 少数派 · 设计风格提取、文章详情页、话题（一派）详情页、派早报模板 | 视觉风格参考，不是 IFAI 的页面 |

## 其他文档

- 技术方案调研（私有）：https://claude.ai/artifact/7zipcpFS92xvs5GXsdTZnR 。日报部分以 `docs/specs/daily.md` 为准。
- 决策台（2026-10-21，22 个问题的选择）：https://claude.ai/artifact/28c8qGXCcKKU5nsovQSBra 。其中技术路线、语言和日报的题已被上面的决定取代。
- 需求文档 v0.3（MRD / PRD / TRD，Word 版）在站长手上。
