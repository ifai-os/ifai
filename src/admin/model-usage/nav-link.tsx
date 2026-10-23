'use client'

import { Link, useConfig, useTranslation } from '@payloadcms/ui'

import { usageText } from './text'

/** In the admin nav, under the daily review queue: open /admin/model-usage. */
export function ModelUsageNavLink() {
  const { config } = useConfig()
  const { i18n } = useTranslation()
  return (
    <div style={{ marginTop: 'calc(var(--base) / 2)' }}>
      <Link className="nav__link" href={`${config.routes.admin}/model-usage`} prefetch={false}>
        <span className="nav__link-label">{usageText(i18n.language).title}</span>
      </Link>
    </div>
  )
}
