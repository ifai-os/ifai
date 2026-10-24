'use client'

import { Link, useConfig, useTranslation } from '@payloadcms/ui'

import { logText } from './text'

/** In the admin nav, under model usage: open /admin/admin-log. */
export function AdminLogNavLink() {
  const { config } = useConfig()
  const { i18n } = useTranslation()
  return (
    <div style={{ marginTop: 'calc(var(--base) / 2)' }}>
      <Link className="nav__link" href={`${config.routes.admin}/admin-log`} prefetch={false}>
        <span className="nav__link-label">{logText(i18n.language).title}</span>
      </Link>
    </div>
  )
}
