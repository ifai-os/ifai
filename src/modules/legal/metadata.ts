import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import type { Locale } from '@/i18n/config'
import { alternatesFor } from '@/lib/seo'

import { legalHref, type LegalDocument } from './documents'

/** One page per language, in search engines (rule 1). */
export async function legalMetadata(document: LegalDocument, locale: Locale): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'legal' })
  return { title: t(`${document}.title`), description: t(`${document}.description`), alternates: alternatesFor(legalHref[document], locale) }
}
