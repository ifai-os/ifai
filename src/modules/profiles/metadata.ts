import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { localizePath, type Locale } from '@/i18n/config'
import { shareCard } from '@/lib/seo'

import { getPeoplePage, getProfilePage, resolveHandle } from './public'
import { parseBefore, parseProfileTab, peoplePath, profileLocale, profilePath, type PeopleSide } from './rules'

const notIndexed = { robots: { index: false, follow: true } }

type Query = { tab?: string; before?: string }

/**
 * A member's page (docs/specs/circles.md「/u/[handle]」):「林栖（@linqi）」, their line about
 * themselves, canonical in its language and without hreflang (like a post's page). A page with no
 * post or review anyone can see, and every ?tab= or ?before= page, is followed but not indexed.
 */
export async function profileMetadata(raw: string, locale: Locale, query: Query): Promise<Metadata> {
  const found = await resolveHandle(raw)
  if (found.status !== 'found') return {}
  const page = await getProfilePage(found.userId, locale, parseProfileTab(query.tab), parseBefore(query.before))
  if (!page) return {}
  const t = await getTranslations({ locale })
  const { profile, stats } = page
  const name = profile.name || t('circles.anonymous')
  const empty = stats.posts === 0 && stats.reviews === 0
  return {
    title: t('profiles.metaTitle', { name, handle: profile.handle }),
    description: profile.bio || t('profiles.metaDescription', { name }),
    alternates: { canonical: localizePath(profileLocale(profile), profilePath(profile.handle)) },
    ...((empty || query.tab !== undefined || query.before !== undefined) && notIndexed),
    ...shareCard(locale),
  }
}

/** The followers and following lists: named after the member, never indexed. */
export async function peopleMetadata(raw: string, locale: Locale, side: PeopleSide, before: string | undefined): Promise<Metadata> {
  const found = await resolveHandle(raw)
  if (found.status !== 'found') return {}
  const page = await getPeoplePage(found.userId, side, parseBefore(before))
  if (!page) return {}
  const t = await getTranslations({ locale })
  const { profile } = page
  return {
    title: t(side === 'followers' ? 'profiles.followersTitle' : 'profiles.followingTitle', { name: profile.name || t('circles.anonymous') }),
    alternates: { canonical: localizePath(profileLocale(profile), peoplePath(profile.handle, side)) },
    ...notIndexed,
    ...shareCard(locale),
  }
}
