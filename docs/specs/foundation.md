# 地基（第 1–2 周）

## 目标

把所有模块共用的部分先搭好：应用框架、数据库与迁移、账号、五种语言路由、设计令牌与基础组件、CI 和预览环境。做完以后，开始任何一个模块都只需要写这个模块自己的代码。

## 设计稿

- 设计令牌：画布「设计令牌」画板 → `src/app/(frontend)/globals.css`
- 导航栏：各页面画板顶部的导航（logo、7 个模块、语言切换、登录）
- 卡片：「IFAI 首页」画板上的日报条目、热门应用、新上架 Skills、即将上线
- 图标：「IFAI 图标（已定稿）」画板的简化 3 → `src/app/icon.svg`、`favicon.ico`、`apple-icon.png`、`public/brand/`

## 已实现

| 清单项 | 位置 |
|---|---|
| Next.js 16 + Payload 3 + Postgres，连接 Neon；文件存 R2 | `src/payload.config.ts`、`src/app/(payload)/` |
| Better Auth：Google、GitHub、邮箱魔法链接 | `src/lib/auth/`、`src/app/api/auth/[...all]/`、`/[locale]/sign-in` |
| next-intl 五语言路由；简 → 繁转换脚本 | `src/i18n/`、`src/proxy.ts`、`scripts/i18n-hant.ts` |
| 设计令牌写成 Tailwind 主题；导航栏和卡片组件 | `globals.css`、`src/components/` |
| AGENTS.md、GitHub Actions、Vercel 预览环境 | `AGENTS.md`、`.github/workflows/`、`vercel.json`、`docs/setup.md` |

首页目前用 `src/modules/home/demo-data.ts` 里的示例数据，页面顶部有「演示数据」提示；日报、应用、资源三个入口是「即将上线」占位页。

## 约定

- 数据库表：Payload 集合 `admins`、`media`；Better Auth 的 `auth_*` 四张表通过 `beforeSchemaInit` 加入 Payload 的 schema，由同一套迁移创建。
- 后台管理员（Payload）与站点用户（Better Auth）分开：后台只给站长。
- 语言：代码 `en / zh-Hans / zh-Hant / ja / ko`，URL `/en /zh-hans /zh-hant /ja /ko`，默认英语。
- 分期：`NEXT_PUBLIC_SITE_PHASE` 控制导航；第一期只显示日报、应用、资源。

## 不做

搜索、定时任务、模型调用、统计与报错监控、订阅邮件、法律页面——按路线图在后续几周接入。

## 验收标准

- [x] `/` 按浏览器语言跳到对应前缀；手动切换语言后记住选择
- [x] 五种语言首页都能打开，`<html lang>` 正确
- [x] 简体文案改动后，`pnpm i18n:hant` 生成繁体；CI 检查五种语言 key 一致、繁体是最新的
- [x] 只配了哪种登录方式的环境变量，登录页就只显示哪种
- [x] 空数据库执行 `pnpm payload migrate` 后能打开 `/admin` 创建管理员
- [x] CI：类型检查、lint、单元测试、迁移、构建、Playwright 冒烟测试
- [ ] 在 Vercel 上配好生产与预览环境（需要你按 `docs/setup.md` 操作）
