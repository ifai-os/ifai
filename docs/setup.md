# 账号、环境变量与部署

这份文档写给站长本人。下面的账号和密钥都由你创建和保管：只填进本地 `.env` 和 Vercel 的环境变量，不要提交到仓库，也不要发给任何人（包括 AI 助手）。

需要的账号：Neon、Vercel、Cloudflare（R2）、Google Cloud、GitHub OAuth App、Resend。文中 `<域名>` 指正式站点域名，例如 `ifai.example`。

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

## 2. Neon（数据库）

1. 在 neon.com 注册，新建项目。区域选 **AWS US East (N. Virginia)**，和 Vercel 默认的函数区域（华盛顿 iad1）挨着，延迟最低。
2. 项目默认有 `main` 分支，用作生产库。再建一个 `dev` 分支给本地开发用。
3. 在 Connect 面板选分支，复制**带连接池**的连接串（主机名里有 `-pooler`）：
   - `dev` 分支 → 本地 `.env` 的 `DATABASE_URI`
   - `main` 分支 → Vercel Production 环境的 `DATABASE_URI`
4. pgvector 现在不用开，日报做去重时会通过迁移启用。

## 3. Vercel（部署与预览环境）

1. 在 Vercel 导入 GitHub 仓库 `ifai-rd/ifai`（仓库是私有的，需要允许 Vercel 的 GitHub App 访问它）。
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

## 8. 第一次上线检查

1. 推送到 `main` → Vercel 构建（日志里能看到迁移执行）。
2. 打开 `https://<域名>/admin` 创建管理员。只给自己建账号，用强密码。
3. 依次打开 `/en`、`/zh-hans`、`/zh-hant`、`/ja`、`/ko`，确认导航和语言切换正常。
4. 用 Google、GitHub、邮箱各登录一次。

## 9. 以后要做的

- 后台双重验证：Payload 没有内置，开放更多管理员之前接入。
- 预览环境的第三方登录：需要时接 Better Auth 的 `oAuthProxy` 插件。
- 数据库备份：Neon 自带时间点恢复；另按技术方案加每晚 `pg_dump` 到 R2 的 GitHub Actions。
