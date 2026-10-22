# IFAI

面向海外用户的 AI 门户：每天的 AI 日报、按热度排序的 AI 应用、可以直接安装的 Agent Skills。界面有英语、简体中文、繁体中文、日语、韩语五种语言。

当前进度：第 1–2 周的地基已经搭好（框架、数据库迁移、账号、五语言路由、设计令牌与组件、CI）。首页用的是演示数据，日报、应用、资源是占位页。

## 技术栈

Next.js 16 · Payload CMS 3 · Postgres（Neon）· Better Auth · next-intl + OpenCC · Tailwind CSS 4 · Cloudflare R2 · Vercel · Vitest + Playwright

选型理由和整体规划见技术方案文档；给 AI 编程助手的项目规则见 [AGENTS.md](./AGENTS.md)。

## 本地运行

需要 Node 22 和一个 Postgres 数据库（推荐 Neon 的 dev 分支）。

```bash
corepack enable
pnpm install
cp .env.example .env      # 填 DATABASE_URI、PAYLOAD_SECRET、BETTER_AUTH_SECRET
pnpm payload migrate      # 建表
pnpm dev                  # http://localhost:3000 ，后台在 /admin
```

邮箱登录在本地不需要配置发信：登录链接会打印在终端里。

## 常用命令

| 命令 | 作用 |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | 开发、构建、运行构建结果 |
| `pnpm typecheck` · `pnpm lint` · `pnpm test` | 类型检查、代码检查、单元测试 |
| `pnpm test:e2e` | Playwright 冒烟测试（先 `pnpm build`） |
| `pnpm i18n:hant` | 由简体文案生成繁体文案 |
| `pnpm i18n:check` | 检查五种语言的文案是否齐全 |
| `pnpm payload migrate:create <名字>` | 改了数据结构后生成迁移 |
| `pnpm payload migrate` | 执行迁移 |

## 文档

- [AGENTS.md](./AGENTS.md)：目录结构、命令和开发规则
- [docs/setup.md](./docs/setup.md)：Neon、Vercel、R2、Google / GitHub 登录、Resend 的配置步骤
- [docs/specs/](./docs/specs/)：各模块规格
- 设计稿：画布（私有）https://claude.ai/artifact/A5Kyi4ghxTUcsFMouH677D

## 部署

推到 `main` 自动部署到 Vercel 生产环境，每个 PR 自动生成预览环境（带独立的数据库分支）。构建时先执行数据库迁移。GitHub Actions 在每个 PR 上跑类型检查、lint、单元测试、迁移、构建和冒烟测试。
