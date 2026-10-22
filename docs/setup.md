# 账号、环境变量与部署

这份文档写给站长本人。下面的账号和密钥都由你创建和保管：只填进本地 `.env` 和 Vercel 的环境变量，不要提交到仓库，也不要发给任何人（包括 AI 助手）。

需要的账号：Neon、Vercel、Cloudflare（R2）、Google Cloud、GitHub OAuth App、Resend；日报还要 OpenRouter 和 Inngest。文中 `<域名>` 指正式站点域名，例如 `ifai.example`。

## 1. 本地开发

```bash
corepack enable          # 启用 pnpm（版本见 package.json 的 packageManager）
pnpm install
cp .env.example .env     # 至少填 DATABASE_URI、PAYLOAD_SECRET、BETTER_AUTH_SECRET
pnpm payload migrate     # 在数据库里建表
pnpm dev                 # http://localhost:3000
```

- 第一次打开 http://localhost:3000/admin 会让你创建后台管理员账号。
- 本地没配 Resend 时，邮箱登录链接会打印在运行 `pnpm dev` 的终端里。
- 两个密钥都用随机字符串，两者不要相同：`openssl rand -base64 32`
- 后台任务（日报采集、写作）：另开一个终端运行 `pnpm inngest`，打开 http://localhost:8288 就是 Inngest 的本地控制台；`.env` 里保留 `INNGEST_DEV=1`。
- 本地默认不调用模型（`MODEL_CALLS_ENABLED=false`）。要试真实调用，填 `OPENROUTER_API_KEY` 并把开关改成 `true`。

## 2. Neon（数据库）

1. 在 neon.com 注册，新建项目。区域选 **AWS US East (N. Virginia)**，和 Vercel 默认的函数区域（华盛顿 iad1）挨着，延迟最低。
2. 项目默认有 `main` 分支，用作生产库。再建一个 `dev` 分支给本地开发用。
3. 在 Connect 面板选分支，复制**带连接池**的连接串（主机名里有 `-pooler`）：
   - `dev` 分支 → 本地 `.env` 的 `DATABASE_URI`
   - `main` 分支 → Vercel Production 环境的 `DATABASE_URI`
4. pgvector 不用手动开：迁移 `model_receipts_pgvector` 会执行 `CREATE EXTENSION IF NOT EXISTS vector`（Neon 支持）。

## 3. Vercel（部署与预览环境）

1. 在 Vercel 导入 GitHub 仓库 `ifai-os/ifai`（仓库是私有的，需要允许 Vercel 的 GitHub App 访问 `ifai-os` 组织下的这个仓库）。
2. 框架会识别为 Next.js。构建命令已写在 `vercel.json`：`pnpm run ci`，即先执行数据库迁移、再构建。所以每次部署都会自动把迁移应用到对应环境的数据库。
3. 添加 Neon 集成：Vercel 项目 → Integrations → Neon，连接到上面的 Neon 项目，并打开「为每个预览部署创建数据库分支」。之后每个 PR 的预览环境都有自己的数据库分支，变量名是 `DATABASE_URL`，代码会自动读取。
4. 环境变量（Settings → Environment Variables）：

| 变量 | Production | Preview | 说明 |
|---|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | `https://<域名>` | 不填 | 预览环境自动使用 Vercel 分配的地址 |
| `NEXT_PUBLIC_SITE_PHASE` | `1` | `1` | 想在预览里看后面的模块时改成 2 或 3 |
| `DATABASE_URI` | Neon `main` 分支 | **不填** | 预览用 Neon 集成注入的 `DATABASE_URL`；在这里填了会覆盖它，导致预览连到生产库 |
| `PAYLOAD_SECRET` | 随机字符串 | 另一个随机字符串 | |
| `BETTER_AUTH_SECRET` | 随机字符串 | 另一个随机字符串 | |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | 见第 5 步 | 不填 | 预览地址不固定，第三方登录只在生产和本地可用 |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | 见第 6 步 | 不填 | 同上 |
| `RESEND_API_KEY` / `EMAIL_FROM` | 见第 7 步 | 同生产 | 预览环境用邮箱魔法链接登录 |
| `R2_*` | 见第 4 步 | 建议用单独的存储桶 | |
| `OPENROUTER_API_KEY` | 见第 8 步 | 另一个 key | 预览用单独的 key，额度设小一点 |
| `AI_DAILY_BUDGET_USD` | `10` | `1` | 每天（上海时间）的模型费用上限，美元 |
| `MODEL_CALLS_ENABLED` | `true` | `false`（要测时再开） | 不是 `true` 就不调用模型 |
| `COLLECT_ENABLED` | `true` | `false`（要测时再开） | 不是 `true` 就不抓信源 |
| `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` | Inngest 集成自动注入 | 同左 | 见第 9 步，不要手填 `INNGEST_DEV` |
| `GITHUB_TOKEN` | 可选 | 可选 | Skill 导入用的只读 GitHub 令牌（Fine-grained，Contents: Read）；不填只能导入公开仓库，且受匿名限额 |

5. 预览环境默认开着 Vercel 的访问保护。要让 GitHub Actions 对预览环境跑冒烟测试：Settings → Deployment Protection → Protection Bypass for Automation 生成一个密钥，把它加到 GitHub 仓库的 Settings → Secrets → Actions，名字叫 `VERCEL_AUTOMATION_BYPASS_SECRET`。

## 4. Cloudflare R2（图片与文件）

1. Cloudflare 控制台 → R2 Object Storage，开通（需要绑定付款方式；10 GB 以内免费，出口流量不收费）。
2. 新建存储桶，例如 `ifai-media`（预览环境可以再建一个 `ifai-media-preview`）。
3. Manage API Tokens → Create API Token，权限选 **Object Read & Write**，范围限定到这个存储桶。记下：
   - Access Key ID → `R2_ACCESS_KEY_ID`
   - Secret Access Key → `R2_SECRET_ACCESS_KEY`（只显示一次）
   - R2 概览页上的 Account ID → `R2_ACCOUNT_ID`
   - 存储桶名 → `R2_BUCKET`
4. 可选：存储桶 Settings → Public access，绑定自定义域名（例如 `media.<域名>`），填到 `R2_PUBLIC_URL`，图片就直接从 Cloudflare 的 CDN 输出。

四个 `R2_*` 变量都填了才会启用 R2；否则上传的文件存在本地 `media/` 目录（Vercel 上不能写文件，所以生产环境必须配 R2）。

## 5. Google 登录

1. Google Cloud Console 新建项目 → Google Auth Platform（OAuth 同意屏幕）：用户类型选「外部」，填应用名 IFAI、支持邮箱、授权域名 `<域名>`，然后发布。
2. Clients → 创建 OAuth 客户端，类型选「Web 应用」：
   - 已获授权的 JavaScript 来源：`https://<域名>`、`http://localhost:3000`
   - 已获授权的重定向 URI：`https://<域名>/api/auth/callback/google`、`http://localhost:3000/api/auth/callback/google`
3. 把客户端 ID 和密钥填到 `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`。

## 6. GitHub 登录

GitHub 的 OAuth App 只能填一个回调地址，所以建两个：

1. GitHub → Settings → Developer settings → OAuth Apps → New OAuth App
   - 生产：Homepage `https://<域名>`，回调 `https://<域名>/api/auth/callback/github`
   - 本地：Homepage `http://localhost:3000`，回调 `http://localhost:3000/api/auth/callback/github`
2. 各自生成 Client secret，生产的填到 Vercel，本地的填到 `.env`（`GITHUB_CLIENT_ID`、`GITHUB_CLIENT_SECRET`）。

登录按钮上的品牌图标，请从 Google 和 GitHub 官方的品牌资源页下载后再加，现在按钮只有文字。

## 7. Resend（登录邮件）

1. 在 resend.com 添加发信域名（建议用子域名，如 `mail.<域名>`），按提示添加 DNS 记录并验证。
2. 新建 API Key（Sending access）→ `RESEND_API_KEY`。
3. `EMAIL_FROM` 填 `IFAI <hello@mail.<域名>>`。

同一套配置也用于后台管理员的找回密码邮件；没配 Resend 时，这类邮件只打印在服务器日志里。

## 8. OpenRouter（模型）

所有模型调用都经过 OpenRouter，代码里只写用途（`src/lib/ai/purposes.ts`），不写模型名。

1. 在 openrouter.ai 注册，Credits 页充值（先充 20 美元就够试运行）。
2. Keys → Create Key，建两个：`ifai-production`、`ifai-preview`。每个 key 都可以设额度上限（Credit limit），建议生产 50 美元、预览 5 美元，作为代码里每日预算之外的第二道保险。
3. 把 key 填到 Vercel 对应环境的 `OPENROUTER_API_KEY`；本地要试真实调用时填进 `.env`。
4. 默认模型写在 `src/lib/ai/purposes.ts`。想给某个用途换模型，不用改代码：在 Vercel 加 `AI_MODEL_<用途>`，例如 `AI_MODEL_WRITE=openai/gpt-5`，模型 ID 从 openrouter.ai/models 复制。换向量模型（`AI_MODEL_EMBED`）前先找开发确认，因为向量维度写在迁移里。
5. 验证：本地 `.env` 里填好 `OPENROUTER_API_KEY`，把 `MODEL_CALLS_ENABLED` 设为 `true`，运行 `pnpm ai:smoke`。它会做三次很小的调用（文本、结构化输出、向量），打印每次的模型、用量和费用，并确认第二次相同调用直接复用回执、不再付费。不需要数据库。
6. 每次调用的费用记在数据库 `model_receipts` 表里；OpenRouter 的 Activity 页也能看到每一笔（应用名显示为 IFAI）。
7. 本机测试可以不走 OpenRouter：在 `.env` 里填 `OPENROUTER_BASE_URL`（任何兼容 OpenAI 接口的地址，填到 `/v1` 为止）和那个服务的 key（仍填在 `OPENROUTER_API_KEY`），再用 `AI_MODEL_<用途>` 指定它的模型名，例如 `AI_MODEL_PREFILTER=antigravity/gemini-3.8-flash`。这类服务不报费用，预算统计会显示 0；`embed` 用途需要向量模型，本机测试时可以继续指向 OpenRouter 或跳过归组。只在本机用，不要填到 Vercel。

## 9. Inngest（后台任务）

日报的定时采集、评分、写作和应用的资料草稿、热度都是 Inngest 任务，入口是 `/api/inngest`。

1. 在 inngest.com 注册，先用免费档；用量在控制台的 Billing 页能看到。
2. Vercel 项目 → Integrations → 搜 Inngest → 安装并连接这个项目。集成会自动给生产和预览环境注入 `INNGEST_EVENT_KEY`、`INNGEST_SIGNING_KEY`，并在每次部署后自动同步任务列表，不用手动填。
3. 部署后在 Inngest 控制台 → Apps 能看到 `ifai`。验证连通：控制台 → Events → Send event，事件名填 `ifai/health.check`，数据填 `{}`。在 Runs 里能看到 `health-check` 运行成功，输出里有两个开关的状态和今天的模型用量。
4. 预览环境在 Inngest 里是独立的分支环境（Branch environments），不会触发生产的任务。
5. 采集：`COLLECT_ENABLED` 为 `true` 时，`daily-collect-due-sources` 每 15 分钟找一遍到期的信源，逐个抓取并取原文。要立刻跑一次，发事件 `daily/collect.run`，数据 `{}`。单个信源可以在后台「日报 → 信源」里点「试抓」预览（不入库），失败原因显示在右栏。
6. 判断：`MODEL_CALLS_ENABLED` 为 `true` 时，每条取完正文的新条目自动进入 `daily-judge-item`（预筛、两次评分、结构化、向量、归组），结果在数据库 `item_analyses` 表的 `outcome` 列。`daily-judge-sweep` 每 30 分钟把漏掉的条目补上，也可以发事件 `daily/judge.sweep` 立刻跑。单条重跑：发 `daily/item.judge`，数据 `{"itemId": 123}`；已经做过的步骤会复用回执，不再付费。
7. 写作：判断结果为进队列（`queued`）的报道自动进入 `daily-write-story`，写出四种语言加转换的繁体，结果在后台「日报 → 新闻」里，状态「待审」，右栏「原文核对」列出在原文里找不到的名字和数字。`daily-write-sweep` 每 30 分钟（整点 15 分、45 分）补写漏掉的，也可以发事件 `daily/write.sweep` 立刻跑。单条重写：先在后台删掉那条新闻，再发 `daily/story.write`，数据 `{"itemId": 123}`。
8. 审核：后台左侧「审核队列」（`/admin/collections/stories/review`）。队列按热度排序，点「审核」在中间改简体、分类、来源，然后「通过并发布」；改过简体的，发布前会按新的简体重写英、日、韩（用途 `write`，不另开任务，点一下等几秒），繁体自动转换；「缩短摘要」「换个标题」用途 `assist`。这两样都要 `MODEL_CALLS_ENABLED=true`，否则会提示失败。已发布的新闻在同一页「今天已发布」里点开可以更正或撤回；更早的从「日报 → 新闻」列表的「审核」列进。顶部「信源」卡片里失败的信源可以「立即重试」（发事件 `daily/source.fetch`）。发布、更正、撤回后前台和 RSS 1 分钟内更新（第 5 步做前台后生效）。
9. 应用资料草稿：后台「应用」里打开一个应用，右栏「资料草稿」点「生成草稿」；或在应用列表页上方「批量添加应用」里每行贴一个「名称, 官网网址」（只贴网址也行）。任务 `apps-draft-profile` 抓官网、写四种语言的草稿、取 logo 和 og 图，一般一两分钟，右栏会显示原文核对结果。也要 `MODEL_CALLS_ENABLED` 为 `true`；关着或当天预算用完时停在「待生成」，`apps-draft-sweep` 每 20 分钟把等着的重新排队，也可以发事件 `apps/draft.sweep` 立刻跑。单个应用也可以发 `apps/profile.draft`，数据 `{"appId": 12}`，但它只处理状态是「待生成」的应用，平时用后台按钮。
10. 应用热度：`apps-heat-daily` 每天上海时间 06:00 下载 Tranco 名单（不用 key）、匹配近 30 天的已发布日报、算所有已发布应用的热度。要立刻算一次，在后台应用列表上方点「现在重算」，或发事件 `apps/heat.run`，数据 `{}`；同一天再算会覆盖这一天的数字。结果在应用编辑页的「热度」标签里；列表上方显示最近一次运行，Tranco 下载失败时写明原因并沿用之前的名次。上线后第一次运行完，确认列表上方的 Tranco 名单编号不是空的。点击由「打开网站」的站内跳转 `/[locale]/apps/[slug]/visit` 记录，访客哈希用 `PAYLOAD_SECRET` 派生，不需要另配变量。

## 10. 第一次上线检查

1. 推送到 `main` → Vercel 构建（日志里能看到迁移执行）。
2. 打开 `https://<域名>/admin` 创建管理员。只给自己建账号，用强密码。
3. 依次打开 `/en`、`/zh-hans`、`/zh-hant`、`/ja`、`/ko`，确认导航和语言切换正常。
4. 用 Google、GitHub、邮箱各登录一次。

## 11. 以后要做的

- 后台双重验证：Payload 没有内置，开放更多管理员之前接入。
- 预览环境的第三方登录：需要时接 Better Auth 的 `oAuthProxy` 插件。
- 数据库备份：Neon 自带时间点恢复；另按技术方案加每晚 `pg_dump` 到 R2 的 GitHub Actions。
