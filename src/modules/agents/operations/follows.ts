import { z } from 'zod'

import { listHref, topicHref } from '@/modules/daily/public/list-params'
import { storyTags, type StoryTag } from '@/modules/daily/tags'
import { isFollowable, setFollowing } from '@/modules/follows/data'
import { parseFollowTarget } from '@/modules/follows/rules'
import { followTypes, maxFollowKeyLength, maxFollows, type FollowType } from '@/modules/follows/target'

import { count } from '../markdown'
import { defineOperation, invalid, notFound, OperationError } from './types'
import { actorOf, langParam, pageUrl } from './shared'

/**
 * Follows for a member's agent (docs/specs/agents.md「写操作」): an industry tag, or a company or
 * product by its topic key, in its owner's「我的关注」, as the follow buttons do (src/app/api/follows).
 */

export type FollowResult = { type: FollowType; key: string; following: boolean; followers: number; url: string }

export const follow = defineOperation({
  name: 'follows.set',
  tool: 'follow',
  title: 'Follow for your owner',
  description:
    'Follows an industry tag, or a company or product, for your owner, so its news gathers in their Following page on IFAI; following=false stops. ' +
    'Tags are the `tags` of a story (read_news); a company or product is a `topic` key from read_news or news_topic. Do it when your owner asks you to.',
  module: 'daily',
  method: 'POST',
  auth: 'write',
  hints: { idempotent: true },
  path: '/follows',
  input: z.object({
    type: z.enum(followTypes).describe('tag (an industry tag) or topic (a company or product).'),
    key: z.string().min(1).max(maxFollowKeyLength).describe('The tag, such as agents, or the topic key, such as kimi.'),
    following: z.boolean().default(true).describe('false stops following it.'),
    lang: langParam,
  }),
  async run({ type, key, following, lang }, { origin, caller }): Promise<FollowResult> {
    const actor = actorOf(caller, origin)
    const target = parseFollowTarget(type, key)
    if (!target) {
      throw invalid(
        type === 'tag'
          ? `"${key}" is not an industry tag on IFAI. The tags: ${storyTags.join(', ')}.`
          : `"${key}" is not a topic key: use the \`topic\` of a company or product from read_news.`,
      )
    }
    // Stopping always works, so an agent can clear a company no story is about any more.
    if (following && !(await isFollowable(target))) throw notFound(`No published story is about the topic "${key}" yet.`)
    const result = await setFollowing(target, actor.userId, following)
    if (result === 'too-many') {
      throw new OperationError(409, 'conflict', `Your owner already follows ${maxFollows} tags, companies and products, as many as IFAI keeps; they can stop following some first.`)
    }
    return {
      type,
      key,
      following: result.following,
      followers: result.count,
      url: pageUrl(origin, lang, type === 'tag' ? listHref({ tag: key as StoryTag }) : topicHref(key)),
    }
  },
  markdown(result, { lang }, { origin, caller }) {
    const owner = caller?.owner.name || 'your owner'
    const what = result.type === 'tag' ? `the tag \`${result.key}\`` : `the topic \`${result.key}\``
    return result.following
      ? `${owner} now follows ${what} (${count(result.followers, 'follower')} in all); its news gathers at ${pageUrl(origin, lang, '/me/following')}. ${result.url}`
      : `${owner} no longer follows ${what}. ${result.url}`
  },
})

export const followOperations = [follow]
