import type { Payload } from 'payload'

import { isValidVersion, nextVersion, normalizeVersion } from '../normalize'
import { frontmatterVersion, parseSkillMd } from '../package/frontmatter'
import type { ImportContext } from '../package/inspect'
import { isSelectionError, selectSkillDir } from '../package/select'
import { readTarGz, TarError } from '../package/tar'
import { PACKAGE_LIMITS, SKILL_FILE, utf8 } from '../package/types'
import { buildZip } from '../package/zip'
import { fetchArchive, fetchRepoInfo, ImportError, isValidRef, parseRepositoryUrl, type GithubDeps } from './github'

/**
 * `skill/import` (docs/specs/resources.md, «后台» 1 and «定时任务与 AI»): take a snapshot of the
 * Skill's repository, cut out the directory that holds SKILL.md, pack it as the Zip users
 * download, and create a version in review. The Zip's fingerprint, file list, SKILL.md and the
 * static scan are filled in by the version's own upload hook, so a hand-uploaded Zip and an
 * imported one go through exactly the same checks. The same commit is imported only once.
 */
export type ImportRequest = {
  skillId: number
  /** Branch, tag or commit; defaults to the one in the repository address, then the default branch. */
  ref?: string
  /** Version number; defaults to the one in SKILL.md, then the next patch number. */
  version?: string
}

export type ImportDeps = GithubDeps & { payload: Payload; now?: () => Date }

export type ImportResult =
  | { outcome: 'created'; versionId: number; version: string; commit: string; scanStatus: string }
  | { outcome: 'exists'; versionId: number; version: string; commit: string }
  | { outcome: 'failed'; message: string }

type LastImport = {
  status: 'queued' | 'running' | 'done' | 'failed'
  ref?: string | null
  commit?: string | null
  message?: string | null
  at: string
}

async function writeLastImport(payload: Payload, skillId: number, lastImport: LastImport) {
  await payload.update({ collection: 'skills', id: skillId, data: { lastImport }, depth: 0, context: { system: true } })
}

function describe(error: unknown): string {
  if (error instanceof ImportError || error instanceof TarError) return error.message
  if (error instanceof Error) return `${error.name}: ${error.message}`.slice(0, 1000)
  return String(error).slice(0, 1000)
}

/** Import and record the outcome on the Skill, so the back office shows what happened. */
export async function runImport(request: ImportRequest, deps: ImportDeps): Promise<ImportResult> {
  const now = () => (deps.now ?? (() => new Date()))().toISOString()
  await writeLastImport(deps.payload, request.skillId, { status: 'running', ref: request.ref ?? null, commit: null, message: null, at: now() })
  try {
    const result = await importSkillVersion(request, deps)
    const message =
      result.outcome === 'created'
        ? `Created v${result.version} from commit ${result.commit.slice(0, 7)}; scan: ${result.scanStatus}`
        : `Commit ${result.commit.slice(0, 7)} was already imported as v${result.version}`
    await writeLastImport(deps.payload, request.skillId, { status: 'done', ref: request.ref ?? null, commit: result.commit, message, at: now() })
    return result
  } catch (error) {
    const message = describe(error)
    await writeLastImport(deps.payload, request.skillId, { status: 'failed', ref: request.ref ?? null, commit: null, message, at: now() })
    return { outcome: 'failed', message }
  }
}

export async function importSkillVersion(
  request: ImportRequest,
  deps: ImportDeps,
): Promise<Exclude<ImportResult, { outcome: 'failed' }>> {
  const { payload } = deps
  const skill = await payload.findByID({ collection: 'skills', id: request.skillId, depth: 0 })
  const repo = parseRepositoryUrl(skill.repository ?? '')
  if (!repo) {
    throw new ImportError('The Skill needs a GitHub repository address first: https://github.com/owner/repo, optionally /tree/<ref>/<directory>')
  }
  if (request.ref && !isValidRef(request.ref)) throw new ImportError(`Not a valid branch, tag or commit: ${request.ref}`)
  const requestedVersion = request.version ? normalizeVersion(request.version) : undefined
  if (requestedVersion && !isValidVersion(requestedVersion)) throw new ImportError(`Not a valid version number: ${request.version}`)

  const info = await fetchRepoInfo(repo, deps)
  const ref = request.ref ?? repo.ref ?? info?.defaultBranch ?? 'HEAD'
  const archive = readTarGz(await fetchArchive(repo, ref, deps))
  const commit = archive.commit
  if (!commit) throw new ImportError('The archive does not name the commit it was made from; expected a GitHub archive')

  const existing = await payload.find({
    collection: 'skill-versions',
    where: { and: [{ skill: { equals: skill.id } }, { sourceCommit: { equals: commit } }] },
    limit: 1,
    depth: 0,
  })
  if (existing.docs[0]) return { outcome: 'exists', versionId: existing.docs[0].id, version: existing.docs[0].version, commit }

  const selection = selectSkillDir(archive, repo.subdir)
  if (isSelectionError(selection)) {
    const list = selection.candidates.join(', ')
    if (selection.error === 'ambiguous') {
      throw new ImportError(`Several directories contain ${SKILL_FILE}; put one of them in the repository address (…/tree/${ref}/<directory>): ${list}`)
    }
    throw new ImportError(
      repo.subdir
        ? `No ${SKILL_FILE} in ${repo.subdir}${list ? `; directories that have one: ${list}` : ''}`
        : `No ${SKILL_FILE} anywhere in the repository`,
    )
  }
  const { files } = selection
  const totalBytes = files.reduce((sum, file) => sum + file.data.length, 0)
  const tooBig = files.find((file) => file.data.length > PACKAGE_LIMITS.maxFileBytes)
  if (files.length > PACKAGE_LIMITS.maxFiles) throw new ImportError(`The Skill directory has ${files.length} files; the limit is ${PACKAGE_LIMITS.maxFiles}`)
  if (totalBytes > PACKAGE_LIMITS.maxTotalBytes) throw new ImportError(`The Skill directory is ${Math.round(totalBytes / 1024 / 1024)} MB; the limit is ${PACKAGE_LIMITS.maxTotalBytes / 1024 / 1024} MB`)
  if (tooBig) throw new ImportError(`${tooBig.path} is ${Math.round(tooBig.data.length / 1024)} KB; the limit per file is ${PACKAGE_LIMITS.maxFileBytes / 1024 / 1024} MB`)

  const versions = await payload.find({ collection: 'skill-versions', where: { skill: { equals: skill.id } }, limit: 500, pagination: false, depth: 0 })
  const taken = versions.docs.map((doc) => doc.version)
  if (requestedVersion && taken.includes(requestedVersion)) throw new ImportError(`v${requestedVersion} already exists; pick another number or leave it empty`)
  const skillMd = parseSkillMd(utf8(files.find((file) => file.path === SKILL_FILE)!.data))
  const fromHeader = frontmatterVersion(skillMd.frontmatter)
  const headerVersion = fromHeader ? normalizeVersion(fromHeader) : undefined
  const version =
    requestedVersion ?? (headerVersion && isValidVersion(headerVersion) && !taken.includes(headerVersion) ? headerVersion : nextVersion(taken))

  const zip = buildZip(files)
  const context: ImportContext = {
    importLicense: { spdx: info?.license ?? null, repoLicenseFile: selection.repoLicenseFile ?? null },
    importSymlinks: selection.symlinks,
    importOthers: selection.others,
  }
  const created = await payload.create({
    collection: 'skill-versions',
    // scanStatus is replaced by the upload hook, which inspects the Zip (inspectUpload).
    data: { skill: skill.id, version, status: 'in_review', sourceCommit: commit, scanStatus: 'pending' },
    file: { data: zip, name: `${skill.slug}-${version}.zip`, mimetype: 'application/zip', size: zip.length },
    context,
    depth: 0,
  })

  // A license the repository host recognizes fills the empty field; the owner still reviews it.
  const spdx = info?.license && !/^(?:NOASSERTION|OTHER)$/i.test(info.license) ? info.license : undefined
  if (spdx && !skill.license?.trim()) {
    await payload.update({ collection: 'skills', id: skill.id, data: { license: spdx }, depth: 0, context: { system: true } })
  }

  return { outcome: 'created', versionId: created.id, version, commit, scanStatus: created.scanStatus }
}
