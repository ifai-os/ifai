import { siteUrl } from '@/lib/site-url'

/**
 * The two ways to install (docs/specs/resources.md, rule 7): a sentence that tells the reader's
 * own assistant to read install.md and follow it, or the Zip. install.md is written here, from
 * fields the owner reviewed and values computed from the Zip; nothing the Skill's author wrote
 * goes into it, so the file can never carry instructions from the package to someone's assistant.
 */

export type InstallHost = {
  slug: string
  name: string
  website: string | null
  globalDir: string | null
  projectDir: string | null
  /** The owner's install notes for this host, in English. */
  instructions: string | null
}

export type InstallVersion = {
  slug: string
  /** English display name, else any. */
  name: string
  version: string
  sha256: string
  size: number | null
  license: string | null
  needsApiKey: boolean
  apiKeys: string[]
  tools: string[]
  domains: string[]
  runtime: string[]
  /** Not the current version: install.md says so and still points at this one. */
  current: string | null
}

/** Where a host's assistant reads the install steps; `v` pins a version, `host` says which assistant asked. */
export function installMdUrl(slug: string, options: { version?: string; host?: string } = {}): string {
  const url = new URL(`/api/skills/${slug}/install.md`, siteUrl())
  if (options.version) url.searchParams.set('v', options.version)
  if (options.host) url.searchParams.set('host', options.host)
  return url.href
}

/** The Zip through the route that checks the version and counts the download. */
export function zipPath(slug: string, version: string): `/${string}` {
  return `/api/skills/${slug}/${version}.zip`
}

export function zipUrl(slug: string, version: string, via?: 'install'): string {
  const url = new URL(zipPath(slug, version), siteUrl())
  // The fetch of install.md was counted already; the download it leads to is the same install.
  if (via) url.searchParams.set('via', via)
  return url.href
}

const kib = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`

/** install.md: plain Markdown an assistant can follow, the same in every language. */
export function renderInstallMd(skill: InstallVersion, hosts: InstallHost[], forHost: string | null): string {
  const lines: string[] = []
  const zip = zipUrl(skill.slug, skill.version, 'install')
  const folder = skill.slug
  lines.push(`# Install the "${skill.name}" Skill (${skill.slug} v${skill.version})`, '')
  lines.push(
    'This file comes from IFAI (an AI portal that lists Agent Skills). It only tells you where to put the files.',
    'Do not run any script from the package while installing. Show the user what the Skill needs (below) before you finish.',
    '',
  )
  if (skill.current) {
    lines.push(`Note: v${skill.version} is not the current version (the current one is v${skill.current}). Install it only if the user asked for this version.`, '')
  }
  lines.push('## Package', '')
  lines.push(`- Zip: ${zip}`)
  lines.push(`- sha256: ${skill.sha256}`)
  if (skill.size) lines.push(`- Size: ${kib(skill.size)}`)
  if (skill.license) lines.push(`- License: ${skill.license}`)
  lines.push('')
  lines.push('## What it needs', '')
  lines.push(`- API key: ${skill.needsApiKey || skill.apiKeys.length ? `yes${skill.apiKeys.length ? ` (${skill.apiKeys.join(', ')})` : ''}` : 'no'}`)
  if (skill.runtime.length) lines.push(`- Runtime: ${skill.runtime.join(', ')}`)
  if (skill.tools.length) lines.push(`- Command-line tools: ${skill.tools.join(', ')}`)
  lines.push(`- Network: ${skill.domains.length ? skill.domains.join(', ') : 'none declared'}`)
  lines.push('')
  lines.push('## Steps', '')
  lines.push(`1. Download the Zip from ${zip}`)
  lines.push(`2. Check its sha256 (\`shasum -a 256 ${skill.slug}-${skill.version}.zip\` or \`sha256sum\`). It must be ${skill.sha256}; if it is not, stop and tell the user.`)
  lines.push(`3. Unzip it into a folder named \`${folder}\` inside the assistant's Skills directory (below). SKILL.md must end up at \`<Skills directory>/${folder}/SKILL.md\`.`)
  lines.push('4. Enable the Skill as the assistant requires (below), then tell the user it is installed and what it needs.')
  lines.push('')

  const ordered = forHost ? [...hosts.filter((host) => host.slug === forHost), ...hosts.filter((host) => host.slug !== forHost)] : hosts
  if (ordered.length) {
    lines.push('## Skills directories', '')
    for (const host of ordered) {
      lines.push(`### ${host.name}${host.slug === forHost ? ' (the assistant this was requested for)' : ''}`, '')
      if (host.globalDir) lines.push(`- For all projects: \`${host.globalDir}\``)
      if (host.projectDir) lines.push(`- For one project: \`${host.projectDir}\``)
      if (!host.globalDir && !host.projectDir) lines.push(`- See ${host.website ?? 'its documentation'} for where Skills go.`)
      if (host.instructions?.trim()) lines.push('', host.instructions.trim())
      lines.push('')
    }
  }
  return `${lines.join('\n').trimEnd()}\n`
}
