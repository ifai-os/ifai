import type { Locale } from '@/i18n/config'
import { breadcrumbs, pageUrl, siteOrganization, type JsonLdObject } from '@/lib/structured-data'

import type { SkillDetail } from './data'
import { skillHref, skillsHref } from './list-params'

/**
 * A Skill's page as SoftwareSourceCode, plus its breadcrumb trail (首页 › 资源 › 分类 › Skill).
 * The version and date are the shown version's, as on the page. Fixed version links and
 * delisted Skills get none: they are kept out of search engines or say it is gone.
 */
export function skillJsonLd(
  skill: SkillDetail,
  locale: Locale,
  labels: { home: string; resources: string; category: string },
): JsonLdObject[] {
  const url = pageUrl(locale, skillHref(skill.slug))
  const code: JsonLdObject = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareSourceCode',
    name: skill.name.value,
    url,
    mainEntityOfPage: url,
    description: skill.tagline?.value,
    codeRepository: skill.repository,
    license: skill.license ? `https://spdx.org/licenses/${encodeURIComponent(skill.license)}.html` : undefined,
    // "official" means written by IFAI.
    author: skill.author.official ? siteOrganization() : { '@type': 'Person', name: skill.author.name, url: skill.author.url },
    version: skill.shown?.version,
    dateModified: skill.shown?.publishedAt,
    keywords: skill.tags.map((tag) => tag.name.value).join(', '),
  }
  return [
    code,
    breadcrumbs(locale, [
      { name: labels.home, path: '/' },
      { name: labels.resources, path: skillsHref() },
      { name: labels.category, path: skillsHref({ category: skill.category }) },
      { name: skill.name.value, path: skillHref(skill.slug) },
    ]),
  ]
}
