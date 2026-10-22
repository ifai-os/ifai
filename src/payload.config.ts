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
import { aiTables } from './lib/ai/schema'
import { authTables } from './lib/auth/schema'
import { databaseUrl } from './lib/db/url'
import { AppCategories } from './modules/apps/collections/AppCategories'
import { Apps } from './modules/apps/collections/Apps'
import { Sources } from './modules/daily/collections/sources'
import { Stories } from './modules/daily/collections/stories'
import { dailyTables } from './modules/daily/schema'
import { AgentHosts } from './modules/resources/collections/AgentHosts'
import { Skills } from './modules/resources/collections/Skills'
import { SkillSubmissions } from './modules/resources/collections/SkillSubmissions'
import { SkillTags } from './modules/resources/collections/SkillTags'
import { SkillVersions } from './modules/resources/collections/SkillVersions'
import { resourcesTables } from './modules/resources/db/schema'

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
  },
  // Admin UI language (the back office is for the site owner).
  i18n: {
    supportedLanguages: { zh, en },
    fallbackLanguage: 'zh',
  },
  collections: [Admins, Media, AppCategories, Apps, Sources, Stories, Skills, SkillVersions, AgentHosts, SkillTags, SkillSubmissions],
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
    // Our own Drizzle tables (Better Auth, model receipts, the daily module's raw_items, skill install events)
    // join Payload's schema so migrations create and track them.
    beforeSchemaInit: [
      ({ schema }) => ({
        ...schema,
        tables: { ...schema.tables, ...authTables, ...aiTables, ...dailyTables, ...resourcesTables },
      }),
    ],
  }),

  sharp,

  plugins: [
    s3Storage({
      enabled: r2Enabled,
      collections: { media: { prefix: 'media' }, 'skill-versions': { prefix: 'skills' } },
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
