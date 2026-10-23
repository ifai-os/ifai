import { useTranslations } from 'next-intl'

import { Icon } from '@/components/icon'

import type { ScanBadge } from '../data'

const badge = 'inline-flex h-6 items-center gap-1 rounded-tag px-2 text-small font-medium whitespace-nowrap'

/** 「IFAI 认证」: the owner installed it and ran it (rule 5). One per Skill. */
export function CertifiedBadge() {
  const t = useTranslations('resources')
  return (
    <span className={`${badge} bg-info-soft text-link`}>
      <Icon name="verified" size={14} />
      {t('certified')}
    </span>
  )
}

/**
 * The automatic scan of the version shown: 「安全检测通过」when every check passed; 「已人工复核」
 * when the scan had something to look at and the owner published it after looking.
 */
export function ScanBadgeView({ scan }: { scan: ScanBadge }) {
  const t = useTranslations('resources')
  return scan === 'passed' ? (
    <span className={`${badge} bg-success-soft text-success-ink`}>
      <Icon name="shield" size={14} />
      {t('scan.passed')}
    </span>
  ) : (
    <span className={`${badge} bg-surface text-ink-2`}>
      <Icon name="shield" size={14} />
      {t('scan.reviewed')}
    </span>
  )
}

/** 「需 API Key」 */
export function ApiKeyBadge() {
  const t = useTranslations('resources')
  return <span className={`${badge} bg-warn text-warn-ink`}>{t('needsKey')}</span>
}
