import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { postgresAdapter } from '@payloadcms/db-postgres'
import { resendAdapter } from '@payloadcms/email-resend'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { s3Storage } from '@payloadcms/storage-s3'
import { en } from '@payloadcms/translations/languages/en'
import { zh } from '@payloadcms/translations/languages/zh'
import { buildConfig } from 'payload'
import sharp from 'sharp'

import { Admins } from './collections/Admins'
import { Media } from './collections/Media'
import { defaultLocale, localeNames, locales } from './i18n/config'
import { withAdminLog } from './lib/admin-log/hooks'
import { adminLogTables } from './lib/admin-log/schema'
import { aiTables } from './lib/ai/schema'
import { authTables } from './lib/auth/schema'
import { databaseUrl } from './lib/db/url'
import { AppCategories } from './modules/apps/collections/AppCategories'
import { AppReports } from './modules/apps/collections/AppReports'
import { AppSubmissions } from './modules/apps/collections/AppSubmissions'
import { Apps } from './modules/apps/collections/Apps'
import { appsTables } from './modules/apps/schema'
import { Posters } from './modules/daily/collections/posters'
import { Sources } from './modules/daily/collections/sources'
import { Stories } from './modules/daily/collections/stories'
import { Subscribers } from './modules/daily/collections/subscribers'
import { dailyEmailTables } from './modules/daily/email/schema'
import { dailyTables } from './modules/daily/schema'
import { AgentHosts } from './modules/resources/collections/AgentHosts'
import { Skills } from './modules/resources/collections/Skills'
import { SkillSubmissions } from './modules/resources/collections/SkillSubmissions'
import { SkillTags } from './modules/resources/collections/SkillTags'
import { SkillVersions } from './modules/resources/collections/SkillVersions'
import { resourcesTables } from './modules/resources/db/schema'
import { savesTables } from './modules/saves/schema'
import { WikiEntries } from './modules/wiki/collections/WikiEntries'
import { WikiTopics } from './modules/wiki/collections/WikiTopics'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

/** "IFAI <hello@example.com>" → name + address, for Payload's own emails (admin password resets). */
function parseFrom(value: string | undefined): { name: string; address: string } | undefined {
  const match = value?.match(/^\s*(.*?)\s*<([^>]+)>\s*$/)
  if (match) return { name: match[1] || 'IFAI', address: match[2] }
  return value ? { name: 'IFAI', address: value.trim() } : undefined
}

const emailFrom = parseFrom(process.env.EMAIL_FROM)

const r2Enabled = Boolean(
  process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET,
)

export default buildConfig({
  admin: {
    user: Admins.slug,
    importMap: { baseDir: path.resolve(dirname) },
    meta: { titleSuffix: ' · IFAI 后台' },
    components: {
      // The site's button styles on every admin page (src/admin/theme/admin.css).
      providers: ['/admin/theme/provider#AdminTheme'],
      // 界面语言 (中文 / English) in the header, next to the content-language picker.
      actions: ['/admin/ui-language/switch#UiLanguageSwitch'],
      // The daily review queue, model usage and the admin log, next to the collection links.
      afterNavLinks: [
        '/modules/daily/admin/review/links#ReviewNavLink',
        '/admin/model-usage/nav-link#ModelUsageNavLink',
        '/admin/admin-log/nav-link#AdminLogNavLink',
      ],
      views: {
        // Spend, budget, switches and failed calls across modules (docs/specs/foundation.md「后台 · 模型用量」).
        modelUsage: { Component: '/admin/model-usage/view#ModelUsageView', path: '/model-usage', exact: true },
        // Who did what in the back office (docs/specs/foundation.md「后台 · 操作记录」).
        adminLog: { Component: '/admin/admin-log/view#AdminLogView', path: '/admin-log', exact: true },
      },
    },
  },
  // Admin UI language (the back office is for the site owner, and our admin text exists in these two only).
  // Chinese unless the owner picks English in the header; src/proxy.ts makes that the default.
  i18n: {
    supportedLanguages: { zh, en },
    fallbackLanguage: 'zh',
    // The header's locale picker chooses which language of the content is edited, not the interface.
    translations: {
      zh: { general: { locale: '内容语言' } },
      en: { general: { locale: 'Content language' } },
    },
  },
  // Every collection records what admins save, delete and press (docs/specs/foundation.md「后台 · 操作记录」).
  collections: withAdminLog([
    Admins,
    Media,
    AppCategories,
    Apps,
    AppReports,
    AppSubmissions,
    Sources,
    Stories,
    Posters,
    Subscribers,
    Skills,
    SkillVersions,
    AgentHosts,
    SkillTags,
    SkillSubmissions,
    WikiTopics,
    WikiEntries,
  ]),
  editor: lexicalEditor(),

  // Content locales = the five interface languages. Fields opt in with `localized: true`;
  // missing translations fall back to English.
  localization: {
    locales: locales.map((code) => ({ code, label: localeNames[code] })),
    defaultLocale,
    fallback: true,
  },

  secret: process.env.PAYLOAD_SECRET || '',
  // Admin emails go through Resend when it is configured; otherwise Payload prints them to the console.
  ...(process.env.RESEND_API_KEY &&
    emailFrom && {
      email: resendAdapter({
        apiKey: process.env.RESEND_API_KEY,
        defaultFromAddress: emailFrom.address,
        defaultFromName: emailFrom.name,
      }),
    }),
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },

  db: postgresAdapter({
    pool: { connectionString: databaseUrl() },
    // Schema changes only through migrations (src/migrations), never by auto-push.
    push: false,
    migrationDir: path.resolve(dirname, 'migrations'),
    // Our own Drizzle tables (Better Auth, model receipts, the daily module's raw_items and subscribe attempts,
    // skill install events, the admin log) join Payload's schema so migrations create and track them.
    beforeSchemaInit: [
      ({ schema }) => ({
        ...schema,
        tables: {
          ...schema.tables,
          ...authTables,
          ...aiTables,
          ...dailyTables,
          ...dailyEmailTables,
          ...resourcesTables,
          ...appsTables,
          ...savesTables,
          ...adminLogTables,
        },
      }),
    ],
  }),

  sharp,

  plugins: [
    s3Storage({
      enabled: r2Enabled,
      collections: {
        media: { prefix: 'media' },
        // Downloads go to a short-lived R2 address; the site's own reads (the file viewer) stream through.
        'skill-versions': {
          prefix: 'skills',
          signedDownloads: { expiresIn: 300, shouldUseSignedURL: ({ req }) => !req.context?.internalRead },
        },
      },
      bucket: process.env.R2_BUCKET || '',
      config: {
        endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        region: 'auto',
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
        },
        forcePathStyle: true,
      },
    }),
  ],
})
