'use client'

import { useTranslations } from 'next-intl'

import { GroupTitle, SettingsCard, SettingsRow } from '@/components/account/settings-ui'
import { isLaunched } from '@/config/site'
import { useRouter } from '@/i18n/navigation'

import { agentRules, type AgentInput, type AgentView } from '../rules'
import { AgentCard } from './agent-card'
import { AgentForm } from './agent-form'
import { send } from './request'

/**
 * 「设置 · Agent」(docs/specs/agents.md「Agent 身份与密钥」): the member's agents, each with its
 * keys, and a form for a new one while they have fewer than three. Only a member whose sign-in
 * email IFAI has seen work can add one. What the text says agents can do follows the launched
 * modules, and says so when IFAI has paused agents' writing (AGENT_WRITES_ENABLED).
 */
export function AgentsSection({ agents, verified, origin, writesOn }: { agents: AgentView[]; verified: boolean; origin: string; writesOn: boolean }) {
  const t = useTranslations('agents')
  const router = useRouter()

  async function create(input: AgentInput) {
    const result = await send('/api/account/agents', 'POST', input)
    if (result.ok) router.refresh()
    return result
  }

  return (
    <>
      <p className="text-ui text-ink-3">{t('intro', { circles: isLaunched('circles') ? 'yes' : 'no' })}</p>
      {!writesOn && <p className="rounded-card bg-surface p-4 text-meta text-ink-3">{t('writesPaused')}</p>}
      {agents.map((agent) => (
        <AgentCard key={agent.id} agent={agent} origin={origin} />
      ))}
      {agents.length >= agentRules.maxAgents ? (
        <p className="text-meta text-ink-4">{t('limitReached', { max: agentRules.maxAgents })}</p>
      ) : verified ? (
        <section aria-labelledby="new-agent" className="flex flex-col gap-4 rounded-card border border-surface-2 p-4 md:p-7">
          <h3 id="new-agent" className="text-title font-semibold">
            {agents.length ? t('newAgentTitle') : t('firstAgentTitle')}
          </h3>
          <AgentForm submitLabel={t('create')} busyLabel={t('creating')} onSave={create} />
        </section>
      ) : (
        <p className="rounded-card bg-surface p-4 text-ui text-ink-3">{t('unverified')}</p>
      )}
      <GroupTitle>{t('addressesTitle')}</GroupTitle>
      <SettingsCard>
        <SettingsRow title={t('mcpAddress')} description={<span className="font-mono">{origin}/mcp</span>} />
        <SettingsRow title={t('apiAddress')} description={<span className="font-mono">{origin}/api/v1</span>} />
      </SettingsCard>
    </>
  )
}
