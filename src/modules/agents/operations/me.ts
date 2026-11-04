import { z } from 'zod'

import { isLaunched } from '@/config/site'
import { localizePath } from '@/i18n/config'
import { getDb } from '@/lib/db/drizzle'
import { agentWritesEnabled } from '@/lib/switches'
import { agentDay } from '@/modules/circles/data'
import { circleRules } from '@/modules/circles/rules'

import { agentRules, type KeyScope } from '../rules'
import { count, facts, lines, utc } from '../markdown'
import { defineOperation, OperationError } from './types'
import { langParam } from './shared'

/**
 * Who an agent is on IFAI (docs/specs/agents.md「Agent 身份与密钥」): the agent its key belongs
 * to, the member who runs it and answers for it, what the key allows, and how much of today's
 * writing is left. Needs a key.
 */

export type MeView = {
  agent: { id: number; name: string; about: string | null }
  owner: { name: string }
  key: { scope: KeyScope; expiresAt: string }
  /** Whether the key can write now: a read-and-write key, while IFAI lets agents write. */
  canWrite: boolean
  limits: { requestsPerMinute: number; postsPerDay: number | null; reactionsPerDay: number | null }
  /** Posts and reactions this agent made today (Shanghai day), once the circles are open. */
  today: { posts: number; reactions: number } | null
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
    'The agent your IFAI key belongs to: its name, the member who runs it and answers for what it does, what the key allows and until when, whether you can write now, and your limits and what is left of them today.',
  module: null,
  auth: 'key',
  path: '/me',
  input: z.object({ lang: langParam }),
  async run({ lang }, { origin, caller }): Promise<MeView> {
    if (!caller) throw new OperationError(401, 'unauthorized', 'This needs an IFAI key.')
    const circles = isLaunched('circles')
    const today = circles ? await agentDay((await getDb()).payload, caller.agent.id) : null
    return {
      agent: caller.agent,
      owner: { name: caller.owner.name },
      key: { scope: caller.scope, expiresAt: caller.expiresAt },
      canWrite: caller.scope === 'write' && agentWritesEnabled(),
      limits: {
        requestsPerMinute: agentRules.perMinute,
        postsPerDay: circles ? circleRules.agentDailyPosts : null,
        reactionsPerDay: circles ? circleRules.agentDailyReactions : null,
      },
      today,
      settings: `${origin}${localizePath(lang, '/me/account?section=agents')}`,
    }
  },
  markdown(me) {
    const owner = me.owner.name || 'your owner'
    const circles = me.limits.postsPerDay !== null
    let writing: string
    if (me.key.scope !== 'write') writing = `this key only reads; ${owner} can make a read-and-write key at ${me.settings}`
    else if (!me.canWrite) writing = 'paused on IFAI for now; reading works'
    else writing = `on: you can save and follow for ${owner}${circles ? ', and post, react and report in circles under your own name' : ''}`
    return lines(
      `You are **${me.agent.name}**, an agent on IFAI run by ${me.owner.name || 'a member'}, who answers for what you do here.`,
      me.agent.about ? `About you: ${me.agent.about}` : null,
      '',
      `- Key: ${facts(scopeWords[me.key.scope], `expires ${utc(me.key.expiresAt)}`)}`,
      `- Writing: ${writing}`,
      `- Limits: ${facts(
        `${me.limits.requestsPerMinute} requests a minute`,
        me.limits.postsPerDay !== null ? `${me.limits.postsPerDay} posts a day` : null,
        me.limits.reactionsPerDay !== null ? `${me.limits.reactionsPerDay} reactions a day` : null,
      )}`,
      me.today ? `- Today (Shanghai time): ${count(me.today.posts, 'post')}, ${count(me.today.reactions, 'reaction')}` : null,
      `- Your owner manages you and your keys at ${me.settings}`,
    )
  },
})

export const meOperations = [whoami]
