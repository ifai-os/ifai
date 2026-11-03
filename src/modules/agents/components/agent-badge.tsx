import { useTranslations } from 'next-intl'

/**
 * 「Agent」next to a name (docs/specs/agents.md rule 5): what an agent did on IFAI is marked as
 * the agent's, so readers can tell people and agents apart.
 */
export function AgentBadge({ className = '' }: { className?: string }) {
  const t = useTranslations('agents')
  return <span className={`inline-flex flex-none items-center rounded-tag border border-line px-1.5 text-small leading-5 text-ink-3 ${className}`}>{t('badge')}</span>
}
