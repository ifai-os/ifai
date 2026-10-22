# 项目进度

给接手的人和 AI 会话看的：开工前先读 [AGENTS.md](../AGENTS.md)，再读这一页。每合并一个 PR，顺手更新「现在到哪了」和「下一步」。

更新于 2026-10-22（日报第 4 步·审核与发布）。

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
- **应用第 1 步（集合与后台录入）已完成**：`src/modules/apps/collections/` 里的 `app-categories`、`apps` 两个集合，迁移 `apps` 建表并写入首批 8 个分类（五种语言）。后台「应用」分组可以手动录入；公开接口只返回已发布的应用。繁体由简体自动转换：通用钩子 `syncHantFromHans`（`src/lib/i18n/hant-sync.ts`），日报的 `stories` 也在用。
- **应用第 3 步（列表页和详情页）已完成**：`/[locale]/apps`（全部应用，按名称 A–Z，每页 50 条）、`/[locale]/apps/category/[slug]`（分类，数量含次分类）、`?q=` 搜索（名称、别名、一句话介绍、标签，五种语言都查，搜索页不进索引）、`/[locale]/apps/[slug]`（简介、资料、标签、它是什么、核心功能、常见问题、替代品、打开网站、分享）。代码在 `src/modules/apps/`（`data.ts` 读数据，`components/` 是页面组件），页面文件只做组装。缺读者语言的内容回退英文并标 `lang`。数据缓存挂标签 `apps`，后台保存应用或分类后立即刷新。还没有热度，所以榜单、热度前三、走势、首页「热门应用」都留到第 4 步；收藏、评价、提交应用、「信息有误？」留到第 5 步。和规格不同的地方写在 apps.md「页面与路由」末尾。本机示例数据：`pnpm payload run scripts/seed-apps.ts`（只认本机数据库），CI 冒烟测试用它。
- **共用的空状态与加载状态已做好**，按「空状态与加载状态」画板：列表骨架、卡片骨架、空状态、加载失败重试、断网提示、全站 `error.tsx` 和 404，在 `src/components/states/`（按钮在 `src/components/button.tsx`）。各模块的页面直接用，不要再各写一套；和模块绑定的状态（日报未发布、搜索无结果、Skill 安全扫描、机器翻译标记、需要登录弹窗、提交成功）留给各自的模块。
- **线上环境还没配**。Neon、Vercel、R2、Google / GitHub 登录、Resend 这几个账号由站长按 [setup.md](./setup.md) 开，密钥不经过 AI。

## 分期

导航按 `NEXT_PUBLIC_SITE_PHASE` 显示，见 `src/config/site.ts`。没上线的模块不提前建页面或数据表。

| 期 | 周 | 模块 | 状态 |
|---|---|---|---|
| 第一期 | 1–2 | 地基 | 完成 |
| 第一期 | 3 起 | 日报 | 第 4 步完成，下一步前台 |
| 第一期 | 日报之后 | 应用 | 第 1 步（集合与后台录入）、第 3 步（列表页和详情页）完成，下一步官网取材与资料草稿 |
| 第一期 | 日报之后 | 资源（Agent Skills） | 第 1 步（集合、skill_events 表、后台录入）完成，下一步导入与检测 |
| 第二期 | 13–20 | 推荐（长文）、圈子（短动态） | 只有画板 |
| 第三期 | 21–26 | 排行（模型盲测）、Wiki | 只有画板 |

第一期在第 12 周末上线。之后每期 6–8 周，开工前先过闸口：用上一期的数据决定下一期是否开工。每两周在预览环境里从用户视角走一遍新功能。

## 下一步

1. **日报第 5 步（前台）**，对应画板「IFAI 日报（新版）」「手机 · 日报」「IFAI 资讯详情页 · v1」：`/[locale]/daily` 列表（最新在前、按读者本地日期分组、分类筛选）、`/[locale]/daily/[slug]` 详情（来源列表原文在前、同一事件的其他进展、更正时间）、每种语言的 RSS、首页「今天的 AI」改读真实数据、本地时间组件。只读 `status = published` 的 `stories`，缓存读取加 `cacheTag('daily')`（审核后台发布时会刷新这个标签）。「另有 N 家报道」用 `sources` 里 `role = report` 的条数。
2. 日报第 6 步（热度与海报）：事件热度、热门标记、每日海报（审核后台右栏「今日海报」也在这一步做）；归组时后来并入事件的「同一次发生」报道要同步加进已发布新闻的来源列表。
3. **应用第 2 步：官网取材与资料草稿**（见 apps.md「实现顺序」），日报第 1 步已合并，可以开工；新迁移在 main 最新的迁移之上生成。之后是第 4 步热度（榜单、走势、首页「热门应用」，日报提及接日报第 3 步的结果）→ 第 5 步收藏、评价与提交。首批应用从 Toolify 挑网址，这个沙盒的网络策略不放行 toolify.ai 和 tranco-list.eu，到时要在项目设置里加白名单，或者在你自己的电脑上跑。
4. **资源第 2 步：导入与检测**（见 resources.md「实现顺序」）。日报第 1 步已合并，可以直接用它的 Inngest 开工；第 3 步说明起草用它的 `src/lib/ai`。后台现在可以手动录入 Skill 和上传 Zip 版本（sha256 自动算出）；6 个宿主已建好，Codex 之后几个的目录位置、官网和安装说明要站长在后台补。收藏复用应用的 `saves` 表，谁先做谁建表。

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

品牌：

- Logo 定稿为「简化 3」：横条眼睛，f 的横杠只向右伸出。文件在 `public/brand/`、`src/app/icon.svg`、`favicon.ico`、`apple-icon.png`。

仓库：GitHub `ifai-os/ifai`（私有），默认分支 `main`。

## 待站长处理

- [x] 把 Claude 的 GitHub 应用装到 ifai-os 组织，只授权 `ifai` 这一个仓库（2026-10-22 已完成）。以后要给它加仓库：ifai-os 组织 → Settings → GitHub Apps → Claude → Configure → Repository access。
- [ ] 删除临时的 `bootstrap` 分支和两个「Temporary bootstrap」草稿 release。
- [ ] 按 `docs/setup.md` 开账号、配 Vercel。
- [ ] 开 OpenRouter（setup.md 第 8 步）和 Inngest（第 9 步，装 Vercel 集成），在 Vercel 填 `OPENROUTER_API_KEY`、`AI_DAILY_BUDGET_USD`、`MODEL_CALLS_ENABLED`、`COLLECT_ENABLED`。先在 Inngest 控制台跑通 `ifai/health.check`。
- [ ] 日报第 4 步部署到预览环境后：后台左侧点「审核队列」，走一遍通过并发布、改简体再发布（看英日韩是否重写、繁体是否跟着变）、拒绝、稍后再看、撤回、保存更正；重写和 AI 辅助要 `MODEL_CALLS_ENABLED=true`。前台页面要等第 5 步才能看到发布结果。
- [ ] 日报第 2 步部署到预览环境后：把预览环境的 `COLLECT_ENABLED` 设为 `true`，在后台「日报 → 信源」逐个点「试抓」，确认抓到的是文章、日期也对；给 Future Tools、The Rundown、Forward Future 填好选择器后启用；试抓 Anthropic、Meta AI 的新闻列表页，能读就新建信源（T1）。然后发事件 `daily/collect.run`，看 `raw_items` 里有没有条目。
- [ ] 资源模块上线前：Claude Code、Codex、OpenClaw、Hermes、Pi、WorkBuddy 的官方授权 logo 文件。Skill 详情页现在用的是首字母占位图标。
- [ ] 以后再定：商业化方式；排行第一批参赛模型和题库（第三期前）。

## 已知问题

- 有的沙盒连不上 npm registry（DNS 失败或代理返回 403）。上次的绕法：在临时分支上用 GitHub Actions 安装依赖，打包成草稿 release 再下载回来，用完要删掉分支和 release。新会话先直接试 `pnpm install`（2026-10-22 的会话可以直接装）。
- 沙盒里可以用 apt 装 `postgresql-16-pgvector`，再 `service postgresql start`，在本地库上跑迁移和 `pnpm build`。
- 沙盒的代理不放行新闻站点（techcrunch.com、openai.com、hn.algolia.com 都返回 403），信源抓取只能把 `fetch` 换成假数据在本地库上验证；真实抓取要在预览环境看。模型流水线同理，本地只能用 `ai/test` 的假模型跑；真实跑一遍要在站长的电脑上（`OPENROUTER_BASE_URL` 指向局域网接口）或预览环境。
- 两个并行 PR 各自带 Payload 迁移时，后合并的要先合并 main、删掉自己的迁移再重新 `pnpm payload migrate:create`，因为迁移快照会缺对方的表（应用 PR #6 和日报的迁移就是这种情况）。
- 安装时 inngest 依赖的 OpenTelemetry 会报 `@opentelemetry/api` 的 peer 警告，不影响运行。
- 结束 `next start` 进程时按 PID 结束，不要用 `pkill -f`，否则会连自己的 shell 一起结束。
- 在 Payload 钩子里调用 Local API 并传入 `req`（为了留在同一个事务里）时，Payload 会就地改写这个 `req` 的语言、回退语言、`depth` 和 `context`，保存后面的步骤会拿到被改过的请求。`syncHantFromHans` 已经在调用后还原（见 `hant-sync.ts` 的 `keepingRequest`），别的钩子这样调用时照着做。
- `revalidateTag` 只能在 Next.js 里调用。`pnpm payload run` 的脚本和迁移在 Next.js 之外，应用页面的缓存刷新钩子在那里什么也不做；用脚本改了应用数据，页面最晚一小时后更新。
- 两个分支各自生成了迁移时，后合并的那个要先合并 `main`，删掉自己的迁移，再重新 `pnpm payload migrate:create`。否则最新的快照（`.json`）里缺了对方的表，下一次生成迁移会出错。
- Payload 生成的 down 迁移会先 `DROP TABLE … CASCADE`，再删已经被连带删掉的外键，执行时报错。生成后把这类 `DROP CONSTRAINT` 改成 `DROP CONSTRAINT IF EXISTS`，并跑一次 `pnpm payload migrate:down` 验证。
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
