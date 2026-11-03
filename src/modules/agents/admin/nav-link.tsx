'use client'

import { Link, useConfig, useTranslation } from '@payloadcms/ui'

import { agentsAdminText } from './text'

/** In the admin nav, after the review queue: open /admin/agents. */
export function AgentsNavLink() {
  const { config } = useConfig()
  const { i18n } = useTranslation()
  return (
    <div style={{ marginTop: 'calc(var(--base) / 2)' }}>
      <Link className="nav__link" href={`${config.routes.admin}/agents`} prefetch={false}>
        <span className="nav__link-label">{agentsAdminText(i18n.language).title}</span>
      </Link>
    </div>
  )
}
