# 上线安全

## 目标

正式上线（`ifai.io` 接到 Vercel）之前，把站点的防护做到「尽量不花钱、站长一个人照看得过来」：挡住刷接口、刷邮件、撞后台密码和常见的网页攻击，出了事能很快止血。

这一页同时是清单：哪些在代码里（PR 做），哪些要站长在 Cloudflare、Vercel、GitHub 的控制台里点。

## 现状（2026-11-04 盘点）

已经做好的：

- 写接口（收藏、评价、投稿、圈子、订阅……）只接受本站页面发来的请求（`isCrossSite`），并要求登录；评价每天 5 条、圈子动态每天 10 条、订阅每个访客每小时 5 次，超了返回 429。
- 开放 API 和 MCP（`/api/v1`、`/mcp`）按 Agent 密钥或访客分别限次，不读登录 Cookie。
- `STORY_IMPORT_TOKEN`、`PUSH_TOKEN`、退订令牌、Resend 回调签名都用 `timingSafeEqual` 比较。
- 后台（Payload `admins`）连续输错 5 次锁 15 分钟，登录 8 小时过期；没有密码注册，会员只能用 Google、GitHub 或邮件链接登录。
- 密钥只在 Vercel 和本地 `.env`；预览环境在 Vercel Deployment Protection 后面。
- 用户上传的 Skill 只做静态检测，站内不执行。

缺口（按风险排）：

1. **邮件可以被刷**：登录链接（`/api/auth/sign-in/magic-link`）谁都能让站点给任意地址发信。Better Auth 的限流存在服务器内存里，Vercel 上每个实例各算各的，几乎拦不住。Resend 免费版每天 100 封、和日报邮件共用，被刷光后当天谁都登录不了，发信域名的信誉也会受影响。订阅框按「IP + 浏览器标识」限次，换个浏览器标识就绕过去了。
2. **没有安全响应头**：站点能被别的网站用 iframe 套起来（点击劫持），也没有 HSTS、`nosniff`。（本 PR 已补）
3. **GraphQL 接口开着**：`/api/graphql` 没有任何地方用，但对外开放。（本 PR 已关）
4. **`INNGEST_DEV` 被误填到生产时**，Inngest 不验签，任何人都能调 `/api/inngest` 跑后台任务。（本 PR 在生产强制关掉开发模式）
5. **后台只有密码一道门**，Payload 没有两步验证，`/admin` 全世界都能打开。
6. **没有边缘防护规则**：没有 WAF 规则、没有机器人拦截、没有按路径的限流。

## 架构选择：Cloudflare 只做 DNS，防护用 Vercel 自带的

Vercel 官方不建议在它前面再套 Cloudflare 代理（橙色云）：代理后 Vercel 看不到真实访客，自带的 DDoS 防护、机器人拦截和防火墙规则会失灵或误判，缓存也会出问题。所以：

- `ifai.io`、`www.ifai.io` 在 Cloudflare 上设为 **仅 DNS（灰色云）**，指向 Vercel。
- 网站的防护用 **Vercel Firewall**（所有方案都有，被拦下的请求不计费）：DDoS 自动防护、Attack Challenge Mode、自定义规则、机器人拦截规则集。
- **Cloudflare 免费的部分照样用**：DNS（DNSSEC、CAA）、R2 图片域名（`media.ifai.io`，R2 绑定自定义域名本来就走 Cloudflare 代理）、**Turnstile**（免费的人机验证，不依赖代理）。
- 代码里的 IP 继续读 `x-forwarded-for`（Vercel 写的，可信）；不要改成读 `cf-connecting-ip`，那是能伪造的。

## 清单

### 代码（PR）

- [x] 安全响应头（`src/lib/security-headers.ts`，`next.config.ts` 的 `headers()`）：HSTS（不带 `includeSubDomains`，`ifai.io` 下还有飞书邮箱等别的服务）、`nosniff`、`Referrer-Policy`、`frame-ancestors 'self'` 和 `X-Frame-Options`、关掉用不到的摄像头 / 麦克风 / 定位。暂不限制脚本和样式来源：Next.js 和 Payload 后台有内联脚本，要做基于 nonce 的 CSP，先用 report-only 观察一段时间再说。
- [x] 关掉 Payload 的 GraphQL（`payload.config.ts` 的 `graphQL.disable`）。
- [x] 生产环境强制关闭 Inngest 开发模式（`src/lib/inngest/client.ts`）。
- [x] **Turnstile**：登录链接（`/api/auth/sign-in/magic-link`）和日报订阅（`POST /api/subscriptions`）发信前先过 Cloudflare Turnstile。登录用 Better Auth 自带的 `captcha` 插件，只管邮件链接，Google、GitHub 登录不受影响；订阅接口在服务端自己校验（`src/lib/turnstile.ts`），没过返回 403 `captcha`。两个表单的 action 不同（`sign-in`、`subscribe`），令牌不能拿到另一个表单用。浏览器这边是 `src/components/turnstile.tsx` 的 `useTurnstile`：点「发送」或「订阅」时才要令牌，Cloudflare 觉得可疑才出现勾选框（Managed + `interaction-only`），语言跟着页面；每次发送用一个新令牌。Cloudflare 没回应、没拿到令牌，都按失败处理，表单显示「发送失败，请重试」，不放行。`NEXT_PUBLIC_TURNSTILE_SITE_KEY` 和 `TURNSTILE_SECRET_KEY` 两个都填才打开，本地、冒烟测试和预览不填。隐私政策「我们用到的服务」加了 Cloudflare Turnstile，生效日期改为 2026-11-04。
- [ ] 以后再做：基于 nonce 的完整 CSP（report-only 起步）；Better Auth 限流改存数据库（要迁移）。

### 站长要动手的

**Cloudflare（免费）**

1. `ifai.io` 接 Vercel 时（setup.md 第 3 步第 7 条），`@` 和 `www` 记录用 **灰色云（仅 DNS）**。
2. DNS → Settings → 打开 **DNSSEC**，按提示在域名注册商那边填 DS 记录（如果域名就在 Cloudflare 注册，自动完成）。
3. 加 **CAA** 记录，只允许 Vercel 和 Cloudflare 用到的证书机构签发：`0 issue "letsencrypt.org"`、`0 issue "pki.goog"`、`0 issue "sectigo.com"`（Vercel 用 Let's Encrypt；R2 自定义域名由 Cloudflare 签，用 Google Trust Services 或 Sectigo）。
4. R2 图片：存储桶绑定 `media.ifai.io`（setup.md 第 4 步第 4 条），这个子域名保持橙色云；Security → Settings 打开 **Bot Fight Mode**，再加一条免费的速率限制规则（每 IP 每 10 秒 100 次以上就拦），防止有人刷流量。R2 的出口流量免费，主要防的是请求次数。再加一条自定义规则：路径不以 `/media/` 开头 → Block（页面只用 `media/` 下的图，见 setup.md 第 4 步第 4 条）。
5. **Turnstile**：Cloudflare 控制台 → Turnstile → Add widget，域名填 `ifai.io`（和预览用的 `ifai-preview-ifai1.vercel.app`），模式选 Managed。主机名填 `ifai.io`。把 Site Key 填到 Vercel 生产的 `NEXT_PUBLIC_TURNSTILE_SITE_KEY`、Secret Key 填到 `TURNSTILE_SECRET_KEY`（标 Sensitive），重新部署；预览不填（见 setup.md 环境变量表）。

**Vercel（Pro，2026-11-05 从 Hobby 升级；项目 → Firewall）**

1. **Bot Protection** 规则集打开（先 Log 观察一周，再改成 Challenge）。**AI Bots** 规则集先保持关闭：日报和应用希望被 AI 搜索引用。
2. 自定义规则（Pro 最多 40 条，现在用三条）：
   - **后台**：路径以 `/admin` 开头或等于 `/api/admins/login` → Challenge（真人点一下就过，脚本撞密码过不去）。
   - **扫描器**：路径包含 `/wp-admin`、`/wp-login`、`/.env`、`/.git`、`/phpmyadmin`、`xmlrpc.php` → Deny。
   - **登录和订阅限流**：路径是 `/api/auth/sign-in/magic-link` 或 `/api/subscriptions`，按 IP 每分钟 10 次 → Deny（Pro 支持限流规则；Turnstile 照样兜底）。
3. 被攻击时：Firewall → **Attack Challenge Mode** 一键打开，所有访客先过验证，攻击过去再关。
4. 生产的 `INNGEST_DEV` 不要填；`INNGEST_SIGNING_KEY` 由 Inngest 集成自动填好，确认它在。
5. 所有密钥类变量标 **Sensitive**（status.md 已记录过 Sensitive 的影响）。
6. 已升 Pro（每月 20 美元，可以商业使用）。超出额度按量计费、不再停站，所以在团队 Settings → Billing → **Spend Management** 设每月上限（例如 50 美元）和用量提醒，被刷流量时不会失控。

**后台账号**

1. 管理员用密码管理器生成的 20 位以上随机密码，只建需要的账号，不用的删掉。
2. `PAYLOAD_SECRET`、`BETTER_AUTH_SECRET` 两个不同、都 32 位以上；怀疑泄露就换（换 `PAYLOAD_SECRET` 会让后台重新登录；换 `BETTER_AUTH_SECRET` 会让所有会员重新登录）。

**GitHub（免费）**

1. 仓库 → Settings → Code security：打开 **Dependabot alerts** 和 **Dependabot security updates**（私有仓库免费）。
2. 组织和个人账号都开两步验证；Actions 里的 `VERCEL_TOKEN`、`NEON_API_KEY` 只放在仓库 Secrets。

**Google、GitHub 登录**

- 回调地址只留 `https://ifai.io/api/auth/callback/<google|github>` 和预览地址，不要留通配。

## 验收

- `curl -I https://ifai.io/en` 能看到上面的响应头；别的网站用 iframe 嵌 `ifai.io` 显示不出来。
- `POST /api/graphql` 返回 404。
- 连续 20 次请求登录链接，后面的被 Vercel 拦下（或 填了 Turnstile 的 key 后，没有令牌的请求直接被拒（返回 400 或 403））。
- 打开 `/admin` 先出现 Vercel 的验证页；`/wp-login.php` 返回 403。
- Cloudflare DNSSEC 显示 Active；`dig CAA ifai.io` 能看到三条记录。
