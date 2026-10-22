import { useTranslations } from 'next-intl'

import { Logo } from '@/components/brand/logo'

export function SiteFooter() {
  const t = useTranslations('footer')

  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-content items-center gap-2 px-4 py-8 text-meta text-ink-4">
        <Logo size={20} />
        <span>{t('copyright', { year: new Date().getFullYear() })}</span>
      </div>
    </footer>
  )
}
