/**
 * GitHub as the source of Skill packages: the repository address the owner enters, the archive
 * (codeload …/tar.gz/<ref>, one request, no token needed for public repositories) and, best
 * effort, the repository metadata for the default branch and the license.
 */
export type RepoRef = {
  owner: string
  repo: string
  /** Branch, tag or commit from a …/tree/<ref>/… address. */
  ref?: string
  /** Directory inside the repository that holds SKILL.md. */
  subdir?: string
}

const repoAddress =
  /^https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:\/(?:tree|blob)\/([^/\s]+)(?:\/([^\s]*?))?)?\/?$/

/** https://github.com/owner/repo[/tree/<ref>[/<path>]] → its parts; anything else → null. */
export function parseRepositoryUrl(input: string): RepoRef | null {
  const match = repoAddress.exec(input.trim())
  if (!match) return null
  const [, owner, repo, ref, subdir] = match
  if (!owner || !repo || owner === '.' || owner === '..') return null
  const cleanSubdir = subdir ? decodeURIComponent(subdir).replace(/\/+$/, '') : ''
  return {
    owner,
    repo,
    ref: ref ? decodeURIComponent(ref) : undefined,
    subdir: cleanSubdir || undefined,
  }
}

/** A branch, tag or commit name we are willing to put in a URL. */
export function isValidRef(ref: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(ref) && !ref.includes('..') && !ref.endsWith('/') && !ref.endsWith('.lock')
}

export function archiveUrl({ owner, repo }: RepoRef, ref: string): string {
  const path = ref.split('/').map(encodeURIComponent).join('/')
  return `https://codeload.github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/tar.gz/${path}`
}

export function repoApiUrl({ owner, repo }: RepoRef): string {
  return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
}

export type RepoInfo = {
  defaultBranch: string
  /** SPDX id, "NOASSERTION" for unrecognized text, null when there is no license. */
  license: string | null
}

export type GithubDeps = {
  fetch?: typeof fetch
  /** Optional GITHUB_TOKEN: raises the API rate limit and reaches private repositories. */
  token?: string
  userAgent?: string
}

export class ImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImportError'
  }
}

/** Compressed snapshot we are willing to download. */
export const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024

function headers(deps: GithubDeps, accept: string): Record<string, string> {
  const result: Record<string, string> = { accept, 'user-agent': deps.userAgent ?? 'IFAIBot/0.1' }
  if (deps.token) result.authorization = `Bearer ${deps.token}`
  return result
}

/** Default branch and license, or null when the API is unreachable or rate limited. */
export async function fetchRepoInfo(repo: RepoRef, deps: GithubDeps = {}): Promise<RepoInfo | null> {
  const doFetch = deps.fetch ?? fetch
  try {
    const response = await doFetch(repoApiUrl(repo), {
      headers: headers(deps, 'application/vnd.github+json'),
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) return null
    const body = (await response.json()) as { default_branch?: string; license?: { spdx_id?: string | null } | null }
    return {
      defaultBranch: body.default_branch || 'HEAD',
      license: body.license?.spdx_id ?? null,
    }
  } catch {
    return null
  }
}

/** The tar.gz snapshot of one ref, with a size cap and a timeout. */
export async function fetchArchive(repo: RepoRef, ref: string, deps: GithubDeps = {}): Promise<Uint8Array> {
  const doFetch = deps.fetch ?? fetch
  const url = archiveUrl(repo, ref)
  let response: Response
  try {
    response = await doFetch(url, {
      headers: headers(deps, 'application/octet-stream'),
      redirect: 'follow',
      signal: AbortSignal.timeout(60_000),
    })
  } catch (error) {
    throw new ImportError(`Could not download ${url}: ${(error as Error).message}`)
  }
  if (response.status === 404) throw new ImportError(`Repository or ref not found: ${repo.owner}/${repo.repo}@${ref}`)
  if (!response.ok) throw new ImportError(`Download of ${repo.owner}/${repo.repo}@${ref} failed with HTTP ${response.status}`)
  const declared = Number(response.headers.get('content-length'))
  if (declared > MAX_ARCHIVE_BYTES) throw new ImportError(`Archive is too large (${declared} bytes)`)
  const buffer = new Uint8Array(await response.arrayBuffer())
  if (buffer.byteLength > MAX_ARCHIVE_BYTES) throw new ImportError(`Archive is too large (${buffer.byteLength} bytes)`)
  return buffer
}
