import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { ModulePlaceholder } from '@/components/module-placeholder'
import type { ModuleKey } from '@/config/site'
import { isLocale } from '@/i18n/config'
import { alternatesFor } from '@/lib/seo'

type Props = { params: Promise<{ locale: string }> }

/** Page + metadata for a module route that is not built yet. Replace with the real module page. */
export function createPlaceholderPage(module: ModuleKey) {
  const pathname = `/${module}`

  async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { locale } = await params
    if (!isLocale(locale)) return {}
    const t = await getTranslations({ locale })
    return {
      title: t(`nav.${module}`),
      description: t(`modules.${module}`),
      alternates: alternatesFor(pathname, locale),
    }
  }

  async function Page({ params }: Props) {
    const { locale } = await params
    if (!isLocale(locale)) notFound()
    setRequestLocale(locale)
    return <ModulePlaceholder module={module} />
  }

  return { generateMetadata, Page }
}
