import { z } from 'zod'

import { getDb } from '@/lib/db/drizzle'
import { storyHref } from '@/modules/daily/public/list-params'
import { skillHref } from '@/modules/resources/public/list-params'
import { saveState, setSaved } from '@/modules/saves/data'
import { saveTypes, type SaveType } from '@/modules/saves/target'

import { count } from '../markdown'
import { defineOperation, notFound } from './types'
import { actorOf, langParam, pageUrl } from './shared'

/**
 * Saves for a member's agent (docs/specs/agents.md「写操作」): the agent keeps things in its owner's
 * 「我的收藏」, as the save buttons do (src/app/api/saves). Things are named by slug, as agents read them.
 */

const collections = { app: 'apps', skill: 'skills', story: 'stories' } as const satisfies Record<SaveType, string>

const hrefs: Record<SaveType, (slug: string) => `/${string}`> = {
  app: (slug) => `/apps/${slug}`,
  skill: skillHref,
  story: storyHref,
}

const words: Record<SaveType, string> = { app: 'the app', skill: 'the Skill', story: 'the story' }

/** The id of the thing with this slug, as its collection holds it: readers see only what is published. */
async function idOf(type: SaveType, slug: string, published: boolean): Promise<number | null> {
  const { payload } = await getDb()
  const { docs } = await payload.find({
    collection: collections[type],
    where: type === 'story' && published ? { and: [{ slug: { equals: slug } }, { status: { equals: 'published' } }] } : { slug: { equals: slug } },
    overrideAccess: !published,
    depth: 0,
    limit: 1,
    pagination: false,
    select: { slug: true },
  })
  return docs[0]?.id ?? null
}

export type SaveResult = { type: SaveType; slug: string; saved: boolean; members: number; url: string }

export const save = defineOperation({
  name: 'saves.set',
  tool: 'save',
  title: 'Save for your owner',
  description:
    'Saves an app, a Skill or a news story to your owner’s saves on IFAI, or with saved=false takes it out. Name it by type and slug, from a list, search or read_ tool. ' +
    'Do it when your owner asks you to keep something, not on your own.',
  module: null,
  method: 'POST',
  auth: 'write',
  hints: { idempotent: true },
  path: '/saves',
  input: z.object({
    type: z.enum(saveTypes).describe('app, skill or story (a news story).'),
    slug: z
      .string()
      .regex(/^[a-z0-9][a-z0-9-]{0,199}$/, 'A slug is lowercase letters, digits and hyphens.')
      .describe('Its slug.'),
    saved: z.boolean().default(true).describe('false takes it out of the saves.'),
    lang: langParam,
  }),
  async run({ type, slug, saved, lang }, { origin, caller }): Promise<SaveResult> {
    const actor = actorOf(caller, origin)
    // Saving takes what readers can see; taking out also works for something no longer listed, if it is saved.
    let id = await idOf(type, slug, true)
    if (!id && !saved) {
      const listed = await idOf(type, slug, false)
      if (listed && (await saveState({ type, id: listed }, actor.userId)).saved) id = listed
    }
    if (!id) throw notFound(`IFAI has no published ${type} with the slug "${slug}".`)
    const state = await setSaved({ type, id }, actor.userId, saved)
    return {
      type,
      slug,
      saved: state.saved,
      members: state.count,
      url: pageUrl(origin, lang, hrefs[type](slug)),
    }
  },
  markdown(result, { lang }, { origin, caller }) {
    const owner = caller?.owner.name || 'your owner'
    return result.saved
      ? `Saved ${words[result.type]} \`${result.slug}\` for ${owner}, in their saves at ${pageUrl(origin, lang, '/me/saves')} (saved by ${count(result.members, 'member')} in all). ${result.url}`
      : `Took ${words[result.type]} \`${result.slug}\` out of ${owner}’s saves. ${result.url}`
  },
})

export const saveOperations = [save]
