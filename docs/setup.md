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
- 本地没配 Resend 时，邮箱登录链接会打印在运行 `pnpm dev` 的终端里。日报邮件也一样：`.env` 里设 `DAILY_EMAIL_ENABLED=true` 才有订阅框，订阅后的欢迎信打印在终端里，里面有管理订阅和退订的链接。
- 两个密钥都用随机字符串，两者不要相同：`openssl rand -base64 32`
- 后台任务（日报采集、写作）：另开一个终端运行 `pnpm inngest`，打开 http://localhost:8288 就是 Inngest 的本地控制台；`.env` 里保留 `INNGEST_DEV=1`。
- 本地默认不调用模型（`MODEL_CALLS_ENABLED=false`）。要试真实调用，填 `OPENROUTER_API_KEY` 并把开关改成 `true`。

## 2. Neon（数据库）

1. 在 neon.com 注册，新建项目。区域选 **AWS US East (N. Virginia)**，和 Vercel 默认的函数区域（华盛顿 iad1）挨着，延迟最低。
2. 项目默认有 `main` 分支，用作生产库。再建一个 `dev` 分支给本地开发用。
3. 在 Connect 面板选分支，复制**带连接池**的连接串（主机名里有 `-pooler`）：
   - `dev` 分支 → 本地 `.env` 的 `DATABASE_URI`
   - `main` 分支 → Vercel Production 环境的 `DATABASE_URI`
4. 预览库不用手动建：每个 PR 由 GitHub Actions 从 `main` 分支复制出 `preview/pr-<编号>`，PR 关闭后删除（见第 3 步）。`main` 的预览用一个长期分支 `preview/main`：第一次部署时复制出来，之后每次合并只跑迁移，里面的数据一直留着。免费版每个项目最多 10 个分支，同时开着的 PR 别太多；关掉的 PR 如果分支没删掉（例如那次运行失败了），在 Neon 控制台 → Branches 里手动删。
5. pgvector 不用手动开：迁移 `model_receipts_pgvector` 会执行 `CREATE EXTENSION IF NOT EXISTS vector`（Neon 支持）。

## 3. Vercel（部署与预览环境）

部署不走 Vercel 的 Git 集成：Vercel Hobby 不能导入私有组织下的仓库，所以由 GitHub Actions（`.github/workflows/deploy.yml`）用 Vercel CLI 构建并部署。

- 推送到 `main`（合并 PR）→ 部署 `main` 的预览：连长期的 Neon 分支 `preview/main`（构建前先跑迁移），部署完把固定地址 `https://ifai-preview-ifai1.vercel.app` 指向这次部署，所以这个地址总是 `main` 最新的样子。打开 `PRODUCTION_DEPLOY` 之后（见第 3 条）同时部署生产环境。
- 开 PR 或往 PR 推提交 → 先在 Neon 建（或复用）分支 `preview/pr-<编号>`，再部署预览环境，部署完对预览地址跑冒烟测试。复用的分支上如果跑过这次提交里已经没有的迁移（PR 合并 `main` 后重新生成了迁移，旧名字的那个已经在库里跑过），就先把分支从它的父分支（Neon 的默认分支）重置，再迁移；这个 PR 预览里点出来的数据会清掉，`preview/main` 和生产不受影响。PR 页面的「Deployments」里能点开预览地址，Actions 运行页的摘要里也有。
- PR 关闭或合并 → 删掉它的 Neon 分支。
- 想给预览加示例数据：Actions → **Seed preview** → Run workflow（手动运行）。PR 编号留空时往 `main` 的预览（`preview/main`）写 `main` 的示例；填了编号就往那个 PR 的预览（`preview/pr-<编号>`）写这个 PR 最新提交里的示例，只接受本仓库开着的 PR，分支还没建（预览还没部署过）就报错，不会新建。写入的是和 CI 冒烟测试一样的示例新闻、应用和 Skill，写完清掉 Vercel 的数据缓存，页面马上就能看到。可以重复运行，只覆盖示例本身，不动别的数据。预览没配 R2，示例新闻没有配图（视频照常能播），示例 Skill 的 Zip 也下载不了。这个 workflow 合并进 `main` 之前，要在「Use workflow from」里选带它的分支才会出现 PR 编号这一栏。

1. Vercel 项目已经建好：团队 `ifai1` 下的 `ifai`，没有连接 Git。不要再导入仓库，也不要在 Vercel 里装 Neon 集成（预览库由 GitHub Actions 建，见下面第 3 条）。
2. 构建命令写在 `vercel.json`：`pnpm run ci`，即先执行数据库迁移、再构建。构建在 GitHub Actions 的机器上跑，所以迁移也是从那里连 Neon 执行的：生产连 `main` 分支，PR 的预览连自己的 `preview/pr-<编号>` 分支，`main` 的预览连 `preview/main`，都不会碰生产库。
3. 在 GitHub 仓库 Settings → Secrets and variables → Actions → **Secrets** 里添加：

| Secret | 从哪里拿 |
|---|---|
| `VERCEL_TOKEN` | Vercel 右上头像 → Account Settings → Tokens → Create，Scope 选团队 `ifai1`。 |
| `NEON_API_KEY` | Neon 控制台 → Account settings → API keys → Create new API key（也可以建只限这个项目的 Project API key）。 |
| `NEON_PROJECT_ID` | Neon 项目 → Settings → General 里的 Project ID（形如 `cool-name-123456`）。 |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | 见第 5 条，预览开着访问保护时才需要。 |

   Vercel 的团队 ID 和项目 ID 已经写在 workflow 里（不是密钥）；换项目时在同一页的 **Variables** 里加 `VERCEL_ORG_ID`、`VERCEL_PROJECT_ID` 覆盖。前三个 secret 填齐之前，Deploy 会提示缺哪个并跳过，不会报错。`main` 预览的固定地址也可以在 **Variables** 里用 `MAIN_PREVIEW_DOMAIN` 换成别的 `*.vercel.app` 名字。

   生产部署默认关着：在同一页的 **Variables** 里加 `PRODUCTION_DEPLOY` = `true` 之后，推送到 `main` 才会部署生产（之前先配好 Vercel 生产环境的变量，见下面第 4 条）。

4. 环境变量（Vercel 项目 → Settings → Environment Variables）：

| 变量 | Production | Preview | 说明 |
|---|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | `https://<域名>` | 不填 | 预览环境自动使用 Vercel 分配的地址；`main` 的预览用固定地址（workflow 传入 `PREVIEW_SITE_URL`） |
| `NEXT_PUBLIC_SITE_PHASE` | `1` | `1` | 想在预览里看后面的模块时改成 2 或 3 |
| `DATABASE_URI` | Neon `main` 分支 | **不填** | 预览的连接串由 GitHub Actions 传入：PR 用自己的 Neon 分支，`main` 的预览用 `preview/main` |
| `PAYLOAD_SECRET` | 随机字符串 | 另一个随机字符串 | |
| `BETTER_AUTH_SECRET` | 随机字符串 | 另一个随机字符串 | |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | 见第 5 步 | 不填 | 预览地址不固定，第三方登录只在生产和本地可用 |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | 见第 6 步 | 不填 | 同上 |
| `RESEND_API_KEY` / `EMAIL_FROM` | 见第 7 步 | 同生产 | 预览环境用邮箱魔法链接登录 |
| `DAILY_EMAIL_FROM` | `news@ifai.io`（见第 7 步） | 同生产 | 日报邮件的发件地址。和 `RESEND_API_KEY` 都配好，订阅框才会出现 |
| `DAILY_EMAIL_ENABLED` | 先不填，预览环境验过发送后改成 `true` | 要测订阅和发送时设 `true` | 不是 `true` 就不显示订阅框、不接受新订阅、不发日报邮件；已有的订阅保留。预览环境只给管理员的邮箱发 |
| `RESEND_WEBHOOK_SECRET` | 见第 7 步 | 不填 | Resend 回调的签名密钥。不填时退信和投诉不会自动停发 |
| `R2_*` | 见第 4 步 | 建议用单独的存储桶 | |
| `OPENROUTER_API_KEY` | 见第 8 步 | 另一个 key | 预览用单独的 key，额度设小一点 |
| `AI_DAILY_BUDGET_USD` | `10` | `1` | 每天（上海时间）的模型费用上限，美元 |
| `ARENA_DAILY_BUDGET_USD` | 第三期前不用填（默认 `2`） | 不填 | 排行生成参赛回答每天（上海时间）的花费上限，美元，也算在 `AI_DAILY_BUDGET_USD` 里 |
| `MODEL_CALLS_ENABLED` | `true` | `false`（要测时再开） | 不是 `true` 就不调用模型 |
| `COLLECT_ENABLED` | `true` | `false`（要测时再开） | 不是 `true` 就不抓信源 |
| `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` | Inngest 集成自动注入 | 同左 | 见第 9 步，不要手填 `INNGEST_DEV` |
| `GITHUB_TOKEN` | 可选 | 可选 | Skill 导入用的只读 GitHub 令牌（Fine-grained，Contents: Read）；不填只能导入公开仓库，且受匿名限额 |
| `YOUTUBE_API_KEY` | 可选 | 不填 | 圈子的 YouTube 视频卡显示时长要用它（Google Cloud 里开 YouTube Data API v3，建一个 API key，限定只能调这个 API）；不填也能读标题和封面，只是没有时长 |
| `APPS_SHOW_TRANCO_RANK` | 看过 Tranco 条款再决定 | 同生产 | 写成 `true` 才在应用页面显示 Tranco 名次（列表的「网站排名」列、详情页的数字）；不填不显示，名次照常算进热度 |
| `APPS_NEW_SINCE` | 首批应用导入完后填上线那天，如 `2026-11-01` | 同生产 | 上海日期。这天之前收录的应用不进「新上架」榜和「本周新上架」，免得首批导入占满一个月；不填不限 |

5. 预览环境默认开着 Vercel 的访问保护。要让 GitHub Actions 对预览环境跑冒烟测试：Settings → Deployment Protection → Protection Bypass for Automation 生成一个密钥，把它加到 GitHub 仓库的 Settings → Secrets → Actions，名字叫 `VERCEL_AUTOMATION_BYPASS_SECRET`。没有这个 secret 时，Deploy 照常部署预览，只跳过冒烟测试（不然每条测试都会被保护页挡住）。如果决定关掉预览的访问保护，就不用这个 secret，改在仓库 Variables 里加 `PREVIEW_UNPROTECTED` = `true`，冒烟测试照样会跑。带这个密钥时，预览的冒烟测试不录 trace，也不上传 Playwright 报告：两者都会写下请求头，密钥会跟着进 artifact。测试失败时看那次 job 的日志，日志里的密钥会被 Actions 打码。
6. 这些环境变量**不要勾 Sensitive**。构建在 GitHub Actions 上跑，要用 `vercel pull` 把变量取下来；标成 Sensitive 的变量取不到值，只拿到占位符 `[SENSITIVE]`：`DATABASE_URI` 拿到占位符，构建时的迁移就连不上数据库；`NEXT_PUBLIC_*` 拿到占位符，写进页面的也是它。只在运行时用的密钥勾了也能用，网站运行时读得到真值，预览的 `PAYLOAD_SECRET`、`BETTER_AUTH_SECRET` 现在就标着 Sensitive；这时构建日志里 Better Auth 会警告密钥不到 32 个字符（`at least 32 characters`）、熵太低（`low-entropy`），说的是占位符，不用换密钥。改了环境变量要重新部署才生效：生产和 `main` 的预览在 Actions → Deploy 里重跑 `main` 最近一次，PR 的预览往 PR 推一个提交或重跑它的 Deploy。Vercel 控制台的 Redeploy 也可以。
7. 正式域名：`ifai.io` 现在在 Cloudflare 上指向别的服务。接到 Vercel 之前（Vercel 项目 → Settings → Domains 添加，再按提示改 Cloudflare 的 DNS），生产只能用 Vercel 分配的 `*.vercel.app` 地址访问，依赖正式域名的回调都收不到：Resend 的退信和投诉回调（第 7 步）、Google 和 GitHub 登录的回调地址（第 5、6 步）。

## 4. Cloudflare R2（图片与文件）

1. Cloudflare 控制台 → R2 Object Storage，开通（需要绑定付款方式；10 GB 以内免费，出口流量不收费）。
2. 新建存储桶，例如 `ifai-media`（预览环境可以再建一个 `ifai-media-preview`）。
3. Manage API Tokens → Create API Token，权限选 **Object Read & Write**，范围限定到这个存储桶。记下：
   - Access Key ID → `R2_ACCESS_KEY_ID`
   - Secret Access Key → `R2_SECRET_ACCESS_KEY`（只显示一次）
   - R2 概览页上的 Account ID → `R2_ACCOUNT_ID`
   - 存储桶名 → `R2_BUCKET`
4. 可选：存储桶 Settings → Public access，绑定自定义域名（例如 `media.<域名>`），填到 `R2_PUBLIC_URL`，图片就直接从 Cloudflare 的 CDN 输出。

圈子的图片放在存储桶的 `circles/` 下，网站按动态是否公开决定给不给看（没发出去的、站长隐藏的都打不开），所以它们一直经过网站输出，不用公开地址。第 4 项开了公开访问的话，知道文件地址的人能从那个域名绕过去：在 Cloudflare 给那个域名加一条 WAF 规则，挡住路径以 `/circles/` 开头的请求。

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

## 7. Resend（登录邮件和日报邮件）

1. 在 resend.com 添加发信域名（建议用子域名，如 `mail.<域名>`），按提示添加 DNS 记录并验证。
2. 新建 API Key（Sending access）→ `RESEND_API_KEY`。
3. `EMAIL_FROM` 填 `IFAI <hello@mail.<域名>>`。

同一套配置也用于后台管理员的找回密码邮件；没配 Resend 时，这类邮件只打印在服务器日志里。

日报邮件（[specs/daily-email.md](./specs/daily-email.md)）从 `news@ifai.io` 发，回信直接回到这个邮箱：

1. 先开好 `news@ifai.io` 这个邮箱，确认能收信。读者回信会到这里（退信由 Resend 处理，不进这个邮箱）。
2. Resend → Domains → Add Domain，填 `ifai.io`，按页面给的值在 `ifai.io` 的 DNS 里加记录：SPF（`send` 子域名的 MX 和 TXT）和 DKIM（`resend._domainkey` 的 TXT），等状态变成 Verified。登录邮件用的发信域名不用动。
3. 在 `ifai.io` 的 DNS 里加一条 DMARC 记录：类型 TXT，名称 `_dmarc`，值 `v=DMARC1; p=none;`。Gmail 和 Yahoo 要求群发的域名有 DMARC，先用 `p=none` 只观察不拦截。已经有 `_dmarc` 记录的话保留原来的，不要再加一条。
4. 在这个域名的设置里确认 Click Tracking 和 Open Tracking 是关着的（默认关）：规格要求不改写链接、不统计打开。
5. Vercel 的生产和预览环境都填 `DAILY_EMAIL_FROM` = `news@ifai.io`，只填地址，发件人名称（IFAI Daily、IFAI 日报……）按订阅者的语言自动加。`RESEND_API_KEY` 用登录邮件那个；如果建 key 时限定了域名，改成全部域名，或者给 `ifai.io` 另建一个 key。
6. 退信和投诉的回调：Resend → Webhooks → Add Endpoint，地址填 `https://<域名>/api/subscriptions/webhook`，事件勾选 `email.sent`、`email.delivered`、`email.bounced`、`email.complained`、`email.failed`、`email.suppressed`。建好后点开这个端点，复制 Signing Secret（`whsec_` 开头），填到 Vercel **生产环境**的 `RESEND_WEBHOOK_SECRET`，重新部署。只建这一个端点：预览环境发出的邮件回调也会到生产，生产按邮件上的环境标记忽略它们。之后每封邮件的回调在这个端点的页面里都能看到，正常是 200。
7. `DAILY_EMAIL_ENABLED` 先只在 Preview 设 `true`。改完环境变量要重新部署一次才生效（Deployments → 最新一次 → Redeploy）。预览环境验过下一条以后，生产环境也改成 `true`，就算上线了。
8. 在预览环境试一遍：在 `/zh-hans/daily` 用**管理员的邮箱**订阅（预览环境只给管理员发），收到欢迎信后点「管理订阅」改语言和时区，再点「一键退订」，然后重新订阅。后台「日报 → 订阅者」列表上方点「预览邮件」，五种语言各看一眼；点「发测试邮件」，在 Gmail 网页和手机上看。第二天当地 8 点到 8:15 之间应该收到第一封日报邮件，后台的「今天的发送」里能看到它送达了。Gmail 会在发件人旁边显示「退订」，但新域名发得少时可能不显示，不影响邮件里的退订链接。
9. 免费版每天 100 封（UTC 0 点恢复）、每月 3,000 封，和登录邮件共用；后台订阅者列表上方显示今天还剩多少，订阅者到 80 人时会提示换 Pro（Resend → Settings → Billing）。当天额度用完时这一轮停下，后台写明原因，没发出去的在当地 11 点前的下一轮再发。

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
10. 应用热度：`apps-heat-daily` 每天上海时间 06:00 下载 Tranco 名单（不用 key）、匹配近 30 天的已发布日报、算所有已发布应用的热度。要立刻算一次，在后台应用列表上方点「现在重算」，或发事件 `apps/heat.run`，数据 `{}`；同一天再算会覆盖这一天的数字。结果在应用编辑页的「热度」标签里；列表上方显示最近一次运行，Tranco 下载失败时写明原因并沿用之前的名次。上线后第一次运行完，确认列表上方的 Tranco 名单编号不是空的。点击由「打开网站」的站内跳转 `/[locale]/apps/[slug]/visit` 记录，访客哈希用 `PAYLOAD_SECRET` 派生，不需要另配变量。算完后前台的榜单、详情页的热度和首页「热门应用」自动刷新；页面上的 Tranco 名次和「新上架」的起始日由 `APPS_SHOW_TRANCO_RANK`、`APPS_NEW_SINCE` 控制（见第 3 步的表）。
11. 应用评价翻译：读者写好或改了评价正文后，`apps-review-translate` 约一分钟后用用途 `translate` 把它译成英、简、日、韩里原文以外的几种（繁体由简体转换，简繁之间只用 OpenCC），存进 `app_review_translations`；一条评价每天最多花钱翻 5 次（站长点「重新翻译」不算）。也要 `MODEL_CALLS_ENABLED` 为 `true`；关着或当天预算用完时评价只显示原文，`apps-review-translate-sweep` 每 30 分钟把还没译文的补上，也可以发事件 `apps/translate.sweep` 立刻跑。连续失败 3 次的在后台应用的「评价」标签里标红，点「重新翻译」再试；单条也可以发 `apps/review.translate`，数据 `{"reviewId": 345}`，已经译好的会跳过。
12. 日报邮件：`DAILY_EMAIL_ENABLED` 为 `true` 时，`daily-email-send` 每 15 分钟（UTC 第 0、15、30、45 分）找当地时间到了早上 8 点、今天还没收到的订阅者，每 100 封一批经 Resend 发出；要立刻跑一次，发事件 `daily/email.run`，数据 `{}`（只发给当地 8:00–11:00 之间的人）。每次运行的结果（发了几封、停下的原因）在 Runs 里，汇总在后台订阅者列表上方。`daily-email-cleanup` 每天 UTC 4:30 删退订满 30 天的订阅和过期的记录。两个任务都不调用模型。

## 10. 第一次上线检查

1. 推送到 `main` → GitHub Actions 的 Deploy 运行（Build 步骤的日志里能看到迁移执行），完成后摘要里有部署地址。
2. 打开 `https://<域名>/admin` 创建管理员。只给自己建账号，用强密码。
3. 依次打开 `/en`、`/zh-hans`、`/zh-hant`、`/ja`、`/ko`，确认导航和语言切换正常。
4. 用 Google、GitHub、邮箱各登录一次。

## 11. 以后要做的

- 后台双重验证：Payload 没有内置，开放更多管理员之前接入。
- 预览环境的第三方登录：需要时接 Better Auth 的 `oAuthProxy` 插件。
- 数据库备份：Neon 自带时间点恢复；另按技术方案加每晚 `pg_dump` 到 R2 的 GitHub Actions。
