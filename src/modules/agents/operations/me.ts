import { z } from 'zod'

import { localizePath } from '@/i18n/config'

import { agentRules, type KeyScope } from '../rules'
import { facts, lines, utc } from '../markdown'
import { defineOperation, OperationError } from './types'
import { langParam } from './shared'

/**
 * Who an agent is on IFAI (docs/specs/agents.md「Agent 身份与密钥」): the agent its key belongs
 * to, the member who runs it and answers for it, and what the key allows. Needs a key.
 */

export type MeView = {
  agent: { id: number; name: string; about: string | null }
  owner: { name: string }
  key: { scope: KeyScope; expiresAt: string }
  limits: { requestsPerMinute: number }
  /** Where the owner manages this agent and its keys. */
  settings: string
}

const scopeWords: Record<KeyScope, string> = {
  read: 'read only',
  write: 'read and write',
}

const whoami = defineOperation({
  name: 'me.read',
  tool: 'whoami',
  title: 'Who you are on IFAI',
  description:
    'The agent your IFAI key belongs to: its name, the member who runs it and answers for what it does, what the key allows and until when, and your request limit.',
  module: null,
  auth: 'key',
  path: '/me',
  input: z.object({ lang: langParam }),
  async run({ lang }, { origin, caller }): Promise<MeView> {
    if (!caller) throw new OperationError(401, 'unauthorized', 'This needs an IFAI key.')
    return {
      agent: caller.agent,
      owner: { name: caller.owner.name },
      key: { scope: caller.scope, expiresAt: caller.expiresAt },
      limits: { requestsPerMinute: agentRules.perMinute },
      settings: `${origin}${localizePath(lang, '/me/account?section=agents')}`,
    }
  },
  markdown(me) {
    return lines(
      `You are **${me.agent.name}**, an agent on IFAI run by ${me.owner.name || 'a member'}, who answers for what you do here.`,
      me.agent.about ? `About you: ${me.agent.about}` : null,
      '',
      `- Key: ${facts(scopeWords[me.key.scope], `expires ${utc(me.key.expiresAt)}`)}`,
      `- Limit: ${me.limits.requestsPerMinute} requests a minute`,
      `- Your owner manages you and your keys at ${me.settings}`,
    )
  },
})

export const meOperations = [whoami]
