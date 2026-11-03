'use client'

import { useTranslations } from 'next-intl'

import { agentRules } from '../rules'
import type { Sent } from './request'

type Problem = Extract<Sent<never>, { ok: false }>['error']

/** What went wrong, in a sentence for the member; null when there is nothing to say. */
export function ProblemText({ problem, id }: { problem: Problem | null; id?: string }) {
  const t = useTranslations('agents')
  if (!problem) return null
  const text = (() => {
    switch (problem) {
      case 'empty-name':
        return t('emptyName')
      case 'name-too-long':
        return t('nameTooLong', { max: agentRules.maxName })
      case 'about-too-long':
        return t('aboutTooLong', { max: agentRules.maxAbout })
      case 'name-taken':
        return t('nameTaken')
      case 'too-many-agents':
        return t('limitReached', { max: agentRules.maxAgents })
      case 'too-many-keys':
        return t('tooManyKeys', { max: agentRules.maxKeys })
      case 'unverified':
        return t('unverified')
      case 'disabled':
        return t('disabledNoKeys')
      case 'sign-in':
        return t('signedOut')
      case 'not-found':
        return t('gone')
      default:
        return t('failed')
    }
  })()
  return (
    <p id={id} role="alert" className="text-small text-down">
      {text}
    </p>
  )
}
