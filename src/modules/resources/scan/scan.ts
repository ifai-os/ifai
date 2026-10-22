import { frontmatterLicense, frontmatterProblems, parseSkillMd, type ParsedSkillMd } from '../package/frontmatter'
import { PACKAGE_LIMITS, SKILL_FILE, utf8, type PackageFile, type RejectedFile } from '../package/types'
import {
  BINARY_EXTENSIONS,
  DANGEROUS_COMMAND_RULES,
  EXECUTABLE_MAGIC,
  IGNORED_HOSTS,
  IMAGE_EXTENSIONS,
  INJECTION_RULES,
  LICENSE_FILE,
  PLACEHOLDER,
  READ_VERBS,
  SECRET_RULES,
  SENSITIVE_PATH_RULES,
  SHELL_RC,
  URL_PATTERN,
} from './rules'

/**
 * The static scan every version goes through (docs/specs/resources.md, «静态检测»). Pure: files
 * in, results out. Three outcomes: passed; warnings (the owner looks, then may publish);
 * blocked (cannot be published). Nothing here runs or evaluates anything from the package.
 */
export type CheckKey =
  | 'structure'
  | 'secrets'
  | 'sensitive_paths'
  | 'dangerous_commands'
  | 'network'
  | 'prompt_injection'
  | 'license'

export const CHECK_KEYS: CheckKey[] = [
  'structure',
  'secrets',
  'sensitive_paths',
  'dangerous_commands',
  'network',
  'prompt_injection',
  'license',
]

export type CheckResult = 'pass' | 'warn' | 'block'
export type Check = { key: CheckKey; result: CheckResult; note?: string }
export type Finding = { severity: 'high' | 'medium'; file?: string; line?: number; message: string }
export type ScanStatus = 'passed' | 'warnings' | 'blocked'

/** What is known about the license from outside the package. */
export type LicenseContext = {
  /** SPDX id reported by the repository host, e.g. "MIT"; "NOASSERTION" means unknown text. */
  spdx?: string | null
  /** LICENSE / COPYING file at the repository root. */
  repoLicenseFile?: string | null
  /** The license the owner entered on the Skill. */
  skillLicense?: string | null
  /** The author agreed in writing (rule 13). */
  consent?: boolean
}

export type ScanInput = {
  files: PackageFile[]
  rejected?: RejectedFile[]
  symlinks?: string[]
  others?: string[]
  license?: LicenseContext
}

export type ScanResult = {
  status: ScanStatus
  checks: Check[]
  findings: Finding[]
  skillMd: ParsedSkillMd | null
  /** Every host the package talks to, and the ones SKILL.md itself mentions. */
  domains: string[]
  declaredDomains: string[]
}

const MAX_FINDINGS = 100

const high = (message: string, file?: string, line?: number): Finding => ({ severity: 'high', message, file, line })
const medium = (message: string, file?: string, line?: number): Finding => ({ severity: 'medium', message, file, line })

function pathProblem(path: string): string | undefined {
  if (path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path)) return 'Absolute path'
  if (path.includes('\\')) return 'Backslash in path'
  if (/[\u0000-\u001f\u007f]/.test(path)) return 'Control character in path'
  const segments = path.split('/')
  if (segments.some((segment) => segment === '..')) return 'Path escapes the package (..)'
  if (segments.some((segment) => segment === '' || segment === '.')) return 'Empty or "." path segment'
  return undefined
}

type Kind = { text: boolean; block?: string }

/** Text files are scanned line by line; images pass through; everything else is refused. */
export function classifyFile(file: PackageFile): Kind {
  const name = file.path.split('/').pop() ?? file.path
  const dot = name.lastIndexOf('.')
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
  if (IMAGE_EXTENSIONS.has(ext)) return { text: false }
  if (BINARY_EXTENSIONS.has(ext)) return { text: false, block: `File type .${ext} is not allowed (text files and images only)` }
  const head = file.data.subarray(0, 8192)
  for (const magic of EXECUTABLE_MAGIC) {
    if (magic.bytes.every((byte, i) => head[i] === byte)) return { text: false, block: magic.name }
  }
  if (head.includes(0)) return { text: false, block: 'Binary file (text files and images only)' }
  return { text: true }
}

function summarize(findings: Finding[], fallback: string): string {
  if (!findings.length) return fallback
  const names = [...new Set(findings.map((finding) => finding.message))]
  const shown = names.slice(0, 3).join('; ')
  return names.length > 3 ? `${shown}; +${names.length - 3} more` : shown
}

function check(key: CheckKey, findings: Finding[], passNote: string): Check {
  const result: CheckResult = findings.some((f) => f.severity === 'high') ? 'block' : findings.length ? 'warn' : 'pass'
  return { key, result, note: result === 'pass' ? passNote : summarize(findings, passNote) }
}

function hostsIn(text: string): Map<string, number> {
  const hosts = new Map<string, number>()
  const lines = text.split(/\r?\n/)
  lines.forEach((line, index) => {
    for (const match of line.matchAll(URL_PATTERN)) {
      const host = match[1].toLowerCase()
      if (!IGNORED_HOSTS.test(host) && !hosts.has(host)) hosts.set(host, index + 1)
    }
  })
  return hosts
}

export function scanPackage(input: ScanInput): ScanResult {
  const { files } = input
  const rejected = input.rejected ?? []
  const checks: Check[] = []
  const all: Finding[] = []
  const record = (key: CheckKey, findings: Finding[], passNote: string) => {
    checks.push(check(key, findings, passNote))
    all.push(...findings)
  }

  // Structure: SKILL.md with a valid header, sane paths, limits, text and images only.
  const structure: Finding[] = []
  const skillFile = files.find((file) => file.path === SKILL_FILE)
  const skillMd = skillFile ? parseSkillMd(utf8(skillFile.data)) : null
  if (!skillMd) structure.push(high(`No ${SKILL_FILE} at the top level of the package`))
  else for (const problem of frontmatterProblems(skillMd)) structure.push(high(problem, SKILL_FILE))
  for (const file of files) {
    const problem = pathProblem(file.path)
    if (problem) structure.push(high(problem, file.path))
  }
  for (const path of input.symlinks ?? []) structure.push(high('Symbolic or hard link', path))
  for (const path of input.others ?? []) structure.push(high('Not a regular file', path))
  const tooMany = rejected.filter((r) => r.reason === 'too_many_files').length
  if (files.length + tooMany > PACKAGE_LIMITS.maxFiles) {
    structure.push(high(`More than ${PACKAGE_LIMITS.maxFiles} files (${files.length + tooMany})`))
  }
  const fileMb = PACKAGE_LIMITS.maxFileBytes / 1024 / 1024
  for (const r of rejected.filter((r) => r.reason === 'file_too_large')) structure.push(high(`Larger than ${fileMb} MB`, r.path))
  for (const file of files) if (file.data.length > PACKAGE_LIMITS.maxFileBytes) structure.push(high(`Larger than ${fileMb} MB`, file.path))
  const totalBytes = files.reduce((sum, file) => sum + file.data.length, 0)
  if (rejected.some((r) => r.reason === 'total_too_large') || totalBytes > PACKAGE_LIMITS.maxTotalBytes) {
    structure.push(high(`Unpacked size over ${PACKAGE_LIMITS.maxTotalBytes / 1024 / 1024} MB`))
  }
  const kinds = new Map(files.map((file) => [file.path, classifyFile(file)]))
  for (const [path, kind] of kinds) if (kind.block) structure.push(high(kind.block, path))
  record('structure', structure, `${files.length} files, ${Math.max(1, Math.round(totalBytes / 1024))} KB`)

  // Line-by-line checks over the text files.
  const texts = files
    .filter((file) => kinds.get(file.path)?.text)
    .map((file) => ({ path: file.path, lines: utf8(file.data).split(/\r?\n/) }))
  const secrets: Finding[] = []
  const sensitive: Finding[] = []
  const dangerous: Finding[] = []
  const injection: Finding[] = []
  for (const { path, lines } of texts) {
    lines.forEach((line, index) => {
      const number = index + 1
      for (const rule of SECRET_RULES) {
        const match = rule.re.exec(line)
        if (match && !PLACEHOLDER.test(match[0])) {
          secrets.push(high(rule.name, path, number))
          break
        }
      }
      for (const rule of SENSITIVE_PATH_RULES) {
        if (rule.re.test(line)) {
          sensitive.push(high(`Reads a sensitive location: ${rule.name}`, path, number))
          break
        }
      }
      if (SHELL_RC.test(line)) {
        sensitive.push(
          READ_VERBS.test(line)
            ? high('Reads a shell startup file (~/.bashrc, ~/.zshrc, …)', path, number)
            : medium('Mentions a shell startup file', path, number),
        )
      }
      for (const rule of DANGEROUS_COMMAND_RULES) {
        if (rule.re.test(line)) {
          dangerous.push(medium(rule.name, path, number))
          break
        }
      }
      for (const rule of INJECTION_RULES) {
        if (rule.re.test(line)) {
          injection.push(medium(`Prompt-injection pattern: ${rule.name}`, path, number))
          break
        }
      }
    })
  }
  record('secrets', secrets, 'No credentials found')
  record('sensitive_paths', sensitive, 'No access to credential stores or private data')
  record('dangerous_commands', dangerous, 'No dangerous shell patterns')

  // Network: every host in the package versus the hosts SKILL.md itself mentions.
  const declared = skillMd ? hostsIn(skillMd.raw) : new Map<string, number>()
  const domains = new Set(declared.keys())
  const network: Finding[] = []
  for (const { path, lines } of texts) {
    if (path === SKILL_FILE) continue
    for (const [host, line] of hostsIn(lines.join('\n'))) {
      if (!domains.has(host)) network.push(medium(`Connects to ${host}, which SKILL.md does not mention`, path, line))
      domains.add(host)
    }
  }
  record('network', network, declared.size ? `${declared.size} domains, all mentioned in SKILL.md` : 'No network addresses')
  record('prompt_injection', injection, 'No prompt-injection patterns')

  // License: from the repository host, the header, a LICENSE file, the back office or consent.
  const license = input.license ?? {}
  const spdx = license.spdx && !/^(?:NOASSERTION|OTHER)$/i.test(license.spdx) ? license.spdx : undefined
  const packageLicense = files.find((file) => LICENSE_FILE.test(file.path))
  const header = frontmatterLicense(skillMd?.frontmatter ?? null)
  const source = spdx
    ? `repository license ${spdx}`
    : header
      ? `SKILL.md declares ${header}`
      : packageLicense
        ? `${packageLicense.path} in the package`
        : license.repoLicenseFile
          ? `${license.repoLicenseFile} at the repository root`
          : license.skillLicense
            ? `license "${license.skillLicense}" entered in the back office`
            : license.consent
              ? 'the author’s written consent'
              : undefined
  record(
    'license',
    source ? [] : [medium('No recognizable open-source license; publishing needs a license or the author’s written consent (rule 13)')],
    `Source: ${source}`,
  )

  const findings = all.slice(0, MAX_FINDINGS)
  if (all.length > MAX_FINDINGS) findings.push(medium(`${all.length - MAX_FINDINGS} more findings not shown`))
  const status: ScanStatus = checks.some((c) => c.result === 'block')
    ? 'blocked'
    : checks.some((c) => c.result === 'warn')
      ? 'warnings'
      : 'passed'
  return { status, checks, findings, skillMd, domains: [...domains].sort(), declaredDomains: [...declared.keys()].sort() }
}
