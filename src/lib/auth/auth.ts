import { betterAuth } from 'better-auth'
import { nextCookies } from 'better-auth/next-js'
import { magicLink } from 'better-auth/plugins'
import { Pool } from 'pg'

import { sendMagicLinkEmail } from '@/lib/auth/email'
import { databaseUrl } from '@/lib/db/url'
import { siteUrl } from '@/lib/site-url'

const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
const githubEnabled = Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET)

const vercelOrigins = [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL]
  .filter((host): host is string => Boolean(host))
  .map((host) => `https://${host}`)

// One small pool per server instance, reused across hot reloads in development.
const globalForAuth = globalThis as typeof globalThis & { __ifaiAuthPool?: Pool }
const pool = globalForAuth.__ifaiAuthPool ?? new Pool({ connectionString: databaseUrl(), max: 5 })
if (process.env.NODE_ENV !== 'production') globalForAuth.__ifaiAuthPool = pool

const timestamps = { createdAt: 'created_at', updatedAt: 'updated_at' }

/**
 * Site members. Tables and snake_case columns are defined in ./schema.ts and
 * created by Payload migrations; the mappings below must match that file.
 */
export const auth = betterAuth({
  appName: 'IFAI',
  baseURL: process.env.BETTER_AUTH_URL || siteUrl(),
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: [siteUrl(), ...vercelOrigins],
  database: pool,

  // Every page reads the session once (the account button), so the default limit of 100 requests
  // per address would soon show readers who share one address (an office, a mobile carrier) as
  // signed out. Signing in and the email link keep their own, stricter limits.
  rateLimit: { customRules: { '/get-session': false } },

  // Members sign in with Google, GitHub or an email link — no passwords.
  emailAndPassword: { enabled: false },
  socialProviders: {
    ...(googleEnabled && {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID as string,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      },
    }),
    ...(githubEnabled && {
      github: {
        clientId: process.env.GITHUB_CLIENT_ID as string,
        clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
      },
    }),
  },

  user: {
    modelName: 'auth_users',
    fields: { emailVerified: 'email_verified', ...timestamps },
    additionalFields: {
      handle: { type: 'string', required: false, input: false },
      trustLevel: { type: 'number', required: false, defaultValue: 0, input: false, fieldName: 'trust_level' },
      uiLocale: { type: 'string', required: false, fieldName: 'ui_locale' },
    },
  },
  session: {
    modelName: 'auth_sessions',
    fields: {
      expiresAt: 'expires_at',
      ipAddress: 'ip_address',
      userAgent: 'user_agent',
      userId: 'user_id',
      ...timestamps,
    },
    // Short-lived signed cookie so most requests skip the session lookup.
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  account: {
    modelName: 'auth_accounts',
    fields: {
      accountId: 'account_id',
      providerId: 'provider_id',
      userId: 'user_id',
      accessToken: 'access_token',
      refreshToken: 'refresh_token',
      idToken: 'id_token',
      accessTokenExpiresAt: 'access_token_expires_at',
      refreshTokenExpiresAt: 'refresh_token_expires_at',
      ...timestamps,
    },
    // Same verified email from Google and GitHub → one member.
    accountLinking: { enabled: true, trustedProviders: ['google', 'github'] },
  },
  verification: {
    modelName: 'auth_verifications',
    fields: { expiresAt: 'expires_at', ...timestamps },
  },

  plugins: [
    magicLink({
      expiresIn: 10 * 60,
      sendMagicLink: async ({ email, url }) => {
        await sendMagicLinkEmail({ email, url })
      },
    }),
    // Must stay last: lets server actions set auth cookies.
    nextCookies(),
  ],
})

export type Session = typeof auth.$Infer.Session
