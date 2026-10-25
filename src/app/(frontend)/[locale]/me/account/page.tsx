import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { AccountPage, type SettingsView } from '@/components/account/account-page'
import { parseSection, type SettingsSection } from '@/components/account/sections'
import type { LinkResult } from '@/components/account/sign-in-methods'
import { isLocale } from '@/i18n/config'
import { auth, type Session } from '@/lib/auth/auth'
import { authProviders } from '@/lib/auth/providers'
import { dailyEmailState, linkedAccounts, signedInDevices, socialProviders } from '@/lib/auth/settings'
import { getDb } from '@/lib/db/drizzle'
import { alternatesFor } from '@/lib/seo'
import { siteUrl } from '@/lib/site-url'
import { circlesLaunched } from '@/modules/circles/public'
import { subscribingOpen } from '@/modules/daily/email/delivery'
import { profileSettings } from '@/modules/profiles/data'

type SearchParams = { deleted?: string | string[]; section?: string | string[]; provider?: string | string[]; error?: string | string[] }

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<SearchParams> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const t = await getTranslations({ locale, namespace: 'account' })
  return {
    title: t('title'),
    description: t('description'),
    alternates: alternatesFor('/me/account', locale),
    robots: { index: false },
  }
}

const one = (value: string | string[] | undefined) => (typeof value === 'string' ? value : undefined)

/** Back from connecting Google or GitHub (sign-in-methods.tsx): `?provider=`, and `&error=` from Better Auth when it failed. */
function linkResult(query: SearchParams): LinkResult | null {
  const provider = socialProviders.find((item) => item === one(query.provider))
  return provider ? { provider, error: one(query.error) ?? null } : null
}

/** Reads only what the open section shows. */
async function viewFor(section: SettingsSection, session: Session, query: SearchParams): Promise<SettingsView> {
  switch (section) {
    case 'sign-in': {
      const { payload } = await getDb()
      const [accounts, devices] = await Promise.all([
        linkedAccounts(payload, session.user.id),
        signedInDevices(payload, session.user.id, session.session.id, new Date()),
      ])
      return { section, accounts, devices, result: linkResult(query) }
    }
    case 'notifications': {
      const { payload } = await getDb()
      return { section, dailyEmail: await dailyEmailState(payload, session.user), subscribing: subscribingOpen() }
    }
    case 'profile': {
      // The page address, the line about oneself and the site come with the circles.
      if (!circlesLaunched()) return { section, profile: null, siteHost: '' }
      const { payload } = await getDb()
      return { section, profile: await profileSettings(payload, session.user.id), siteHost: new URL(siteUrl()).host }
    }
    default:
      return { section }
  }
}

// The member's own settings, so rendered on every request.
export default async function AccountRoute({ params, searchParams }: Props) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)
  const session = await auth.api.getSession({ headers: await headers() })
  const query = await searchParams
  const section = parseSection(one(query.section))
  const member = session
    ? { user: { id: session.user.id, email: session.user.email, name: session.user.name }, view: await viewFor(section, session, query) }
    : null

  return (
    <AccountPage
      member={member}
      section={section}
      deleted={one(query.deleted) === '1'}
      signIn={authProviders()}
    />
  )
}
