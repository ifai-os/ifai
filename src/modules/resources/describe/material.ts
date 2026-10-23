import type { Skill, SkillVersion } from '@/payload-types'

/**
 * What a description is drafted from: the version's SKILL.md, its README (the package's own,
 * else the repository's, captured when the Zip was inspected) and the file list. All of it is
 * outside data (AGENTS.md rule 9); the prompts wrap every piece in `untrusted()`.
 */
export type Material = {
  slug: string
  repository: string | null
  skillMd: string
  readme: string | null
  files: { path: string; size: number }[]
}

/** The version has no SKILL.md text to describe (an unreadable Zip, or a header-only file). */
export class ThinMaterialError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ThinMaterialError'
  }
}

const MIN_SKILL_MD_CHARS = 40

export function describeMaterial(
  version: Pick<SkillVersion, 'skillMd' | 'readme' | 'files'>,
  skill: Pick<Skill, 'slug' | 'repository'>,
): Material {
  const skillMd = version.skillMd?.trim() ?? ''
  if (skillMd.length < MIN_SKILL_MD_CHARS) {
    throw new ThinMaterialError(skillMd ? 'SKILL.md is too short to describe' : 'The version has no SKILL.md text; upload or import its Zip again')
  }
  return {
    slug: skill.slug,
    repository: skill.repository?.trim() || null,
    skillMd,
    readme: version.readme?.trim() || null,
    files: (version.files ?? []).map((file) => ({ path: file.path, size: file.size ?? 0 })),
  }
}

/** Everything the names and numbers of a draft are checked against. */
export function materialText(material: Material): string {
  return [material.skillMd, material.readme ?? '', material.files.map((file) => file.path).join('\n'), material.slug, material.repository ?? ''].join('\n')
}
