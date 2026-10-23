import config from '@payload-config'
import { unstable_cache } from 'next/cache'
import { getPayload } from 'payload'

import type { SitemapPage } from '@/lib/sitemap'

import { skillCategories } from '../categories'
import { skillsCacheTag } from './cache'
import { guideHref, skillHref, skillsHref, submitHref } from './list-params'

const findSkills = unstable_cache(
  async () => {
    const { docs } = await (await getPayload({ config })).find({
      collection: 'skills',
      where: { status: { equals: 'published' } },
      sort: '-updatedAt',
      pagination: false,
      depth: 0,
      select: { slug: true, updatedAt: true },
      overrideAccess: false,
    })
    return docs.map((skill) => ({ slug: skill.slug, updatedAt: skill.updatedAt }))
  },
  ['skills-sitemap'],
  { tags: [skillsCacheTag], revalidate: 3600 },
)

/**
 * The resources pages in the sitemap: the list and its categories, the install guide, the
 * publishing guide and every published Skill's page. Fixed versions, files, searches, filters
 * and sorts are noindex and stay out; a delisted Skill's page stays up but leaves the sitemap.
 */
export async function resourcesSitemap(): Promise<{ pages: SitemapPage[]; skills: SitemapPage[] }> {
  const skills = await findSkills()
  return {
    pages: [
      { path: skillsHref() },
      ...skillCategories.map((category) => ({ path: skillsHref({ category }) })),
      { path: guideHref },
      { path: submitHref },
    ],
    skills: skills.map((skill) => ({ path: skillHref(skill.slug), lastModified: skill.updatedAt })),
  }
}
