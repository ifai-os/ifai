import type { Locale } from '@/i18n/config'
import { siteUrl } from '@/lib/site-url'
import { getAppsBySlugs } from '@/modules/apps/data'
import { getSkillsBySlugs } from '@/modules/resources/public/data'

import { maxLinkCards, siteLinks, type LinkCard, type PostView } from './rules'

/**
 * The cards for the apps and Skills on IFAI that posts link to (docs/specs/circles.md rule 17),
 * named in `locale` (English where a Skill has no name in it). Kept apart from ./data.ts, which
 * stays free of the Payload config: the apps and Skills are read through their own modules'
 * cached reads, so only published ones get a card. A hidden post gets none, like its pictures.
 */
export async function withLinkCards(posts: PostView[], locale: Locale): Promise<PostView[]> {
  const origin = siteUrl()
  const linked = new Map(posts.map((post) => [post.id, post.hidden ? [] : siteLinks(post.body, origin)]))
  const all = [...linked.values()].flat()
  if (all.length === 0) return posts
  const slugsOf = (kind: 'app' | 'skill') => [...new Set(all.filter((link) => link.kind === kind).map((link) => link.slug))]
  const [apps, skills] = await Promise.all([getAppsBySlugs(slugsOf('app'), locale), getSkillsBySlugs(slugsOf('skill'), locale)])
  const appCards = new Map<string, LinkCard>(
    apps.map((app) => [app.slug, { kind: 'app', slug: app.slug, name: app.name, tagline: app.tagline, logo: app.logo }]),
  )
  const skillCards = new Map<string, LinkCard>(
    skills.map((skill) => [skill.slug, { kind: 'skill', slug: skill.slug, name: skill.name, author: skill.author.name, installs: skill.installs }]),
  )
  return posts.map((post) => {
    const links = (linked.get(post.id) ?? [])
      .map((link) => (link.kind === 'app' ? appCards : skillCards).get(link.slug))
      .filter((card) => card !== undefined)
      .slice(0, maxLinkCards)
    return links.length > 0 ? { ...post, links } : post
  })
}
