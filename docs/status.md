# 项目进度

给接手的人和 AI 会话看的：开工前先读 [AGENTS.md](../AGENTS.md)，再读这一页。每合并一个 PR，顺手更新「现在到哪了」和「下一步」。

更新于 2026-10-22（日报第 1 步）。

## 现在到哪了

- **地基（第 1–2 周）已完成**，在 `main` 上，CI 通过。首页用的是演示数据，日报、应用、资源三个入口是「即将上线」占位页。详见 [specs/foundation.md](./specs/foundation.md)。
- **日报规格已确认**：[specs/daily.md](./specs/daily.md)。画布上的日报画板已经按规格改好（画布第 77 版）。
- **日报第 1 步（基础）已完成**：装好了 Inngest、Vercel AI SDK + OpenRouter、feedsmith（RSS）、cheerio、linkedom + Readability；迁移 `model_receipts_pgvector` 启用 pgvector 并建 `model_receipts` 表；`src/lib/ai` 提供按用途选模型、回执（重试不重复扣费）、每日预算（上海时间，默认 10 美元）、总开关；Inngest 入口 `/api/inngest`，带一个不花钱的 `health-check` 任务（事件 `ifai/health.check`）用来验证连通。还没有任何信源和真实模型调用。
- **应用第 1 步（集合与后台录入）已完成**：`src/modules/apps/collections/` 里的 `app-categories`、`apps` 两个集合，迁移 `apps` 建表并写入首批 8 个分类（五种语言）。后台「应用」分组可以手动录入；公开接口只返回已发布的应用。繁体由简体自动转换：通用钩子 `syncHantFromHans`（`src/lib/i18n/hant-sync.ts`），日报的 `stories` 以后也可以用。前台页面还没做。
- **共用的空状态与加载状态已做好**，按「空状态与加载状态」画板：列表骨架、卡片骨架、空状态、加载失败重试、断网提示、全站 `error.tsx` 和 404，在 `src/components/states/`（按钮在 `src/components/button.tsx`）。各模块的页面直接用，不要再各写一套；和模块绑定的状态（日报未发布、搜索无结果、Skill 安全扫描、机器翻译标记、需要登录弹窗、提交成功）留给各自的模块。
- **线上环境还没配**。Neon、Vercel、R2、Google / GitHub 登录、Resend 这几个账号由站长按 [setup.md](./setup.md) 开，密钥不经过 AI。

## 分期

导航按 `NEXT_PUBLIC_SITE_PHASE` 显示，见 `src/config/site.ts`。没上线的模块不提前建页面或数据表。

| 期 | 周 | 模块 | 状态 |
|---|---|---|---|
| 第一期 | 1–2 | 地基 | 完成 |
| 第一期 | 3 起 | 日报 | 第 1 步（基础）完成，下一步信源与采集 |
| 第一期 | 日报之后 | 应用 | 第 1 步（集合与后台录入）完成，下一步官网取材与资料草稿 |
| 第一期 | 日报之后 | 资源（Agent Skills） | 规格已确认（[resources.md](./specs/resources.md)），待实现 |
| 第二期 | 13–20 | 推荐（长文）、圈子（短动态） | 只有画板 |
| 第三期 | 21–26 | 排行（模型盲测）、Wiki | 只有画板 |

第一期在第 12 周末上线。之后每期 6–8 周，开工前先过闸口：用上一期的数据决定下一期是否开工。每两周在预览环境里从用户视角走一遍新功能。

## 下一步

1. **日报第 2 步：信源与采集**（见 daily.md「实现顺序」）：`sources` 集合、16 个信源、后台试抓、RSS / 网页列表 / JSON 三种读取器、写入 `raw_items`（判重、48 小时规则）。采集任务先检查 `collectEnabled()`。
2. 日报第 3–6 步：判断与写作 → 审核与发布 → 前台 → 热度与海报。模型调用用 `ai.object` / `ai.text` / `ai.embed`（`src/lib/ai`），两次评分用 `variant: 'a'` / `'b'` 区分；`ModelCallError.retryable` 为 false 时（开关关闭、预算用完、同一调用失败 3 次）任务应停住并在后台告警。`raw_items` 的向量列用 `EMBEDDING_DIMENSIONS`（1536）。
3. **应用第 2 步：官网取材与资料草稿**（见 apps.md「实现顺序」），要等日报第 1 步合并（用它的 `src/lib/ai` 和 Inngest）。第 3 步前台不依赖它，可以先做。之后是热度 → 收藏、评价与提交；热度里的日报提及要等日报第 3 步。首批应用从 Toolify 挑网址，这个沙盒的网络策略不放行 toolify.ai 和 tranco-list.eu，到时要在项目设置里加白名单，或者在你自己的电脑上跑。
4. **资源第 1 步：数据与后台**（见 resources.md「实现顺序」），不依赖日报，可以和日报、应用并行；第 2、3 步（导入与检测、说明起草）要等日报第 1 步的 Inngest 和 `src/lib/ai`。收藏复用应用的 `saves` 表，谁先做谁建表。

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
- [ ] 开 OpenRouter（setup.md 第 8 步）和 Inngest（第 9 步，装 Vercel 集成），在 Vercel 填 `OPENROUTER_API_KEY`、`AI_DAILY_BUDGET_USD`、`MODEL_CALLS_ENABLED`、`COLLECT_ENABLED`。日报第 2 步合并前要能在 Inngest 控制台跑通 `ifai/health.check`。
- [ ] 资源模块上线前：Claude Code、Codex、OpenClaw、Hermes、Pi、WorkBuddy 的官方授权 logo 文件。Skill 详情页现在用的是首字母占位图标。
- [ ] 以后再定：商业化方式；排行第一批参赛模型和题库（第三期前）。

## 已知问题

- 有的沙盒连不上 npm registry（DNS 失败或代理返回 403）。上次的绕法：在临时分支上用 GitHub Actions 安装依赖，打包成草稿 release 再下载回来，用完要删掉分支和 release。新会话先直接试 `pnpm install`（2026-10-22 的会话可以直接装）。
- 沙盒里可以用 apt 装 `postgresql-16-pgvector`，再 `service postgresql start`，在本地库上跑迁移和 `pnpm build`。
- 安装时 inngest 依赖的 OpenTelemetry 会报 `@opentelemetry/api` 的 peer 警告，不影响运行。
- 结束 `next start` 进程时按 PID 结束，不要用 `pkill -f`，否则会连自己的 shell 一起结束。
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
