/**
 * Patterns for the static scan (docs/specs/resources.md, «静态检测»). Rules, not a model: every
 * hit names the pattern and the line, so the owner can judge it. Skill content is data (rule 4).
 */
export type Rule = { name: string; re: RegExp }

/** Hard-coded credentials → blocked. */
export const SECRET_RULES: Rule[] = [
  { name: 'AWS access key', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { name: 'GitHub token', re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b/ },
  { name: 'Anthropic API key', re: /\bsk-ant-[A-Za-z0-9_-]{30,}/ },
  { name: 'OpenAI API key', re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}T3BlbkFJ[A-Za-z0-9_-]{20,}|\bsk-[A-Za-z0-9]{48}\b/ },
  { name: 'Stripe secret key', re: /\b[sr]k_live_[A-Za-z0-9]{20,}\b/ },
  { name: 'Slack token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'Private key block', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  {
    name: 'Credential assigned in code',
    re: /\b(?:api[_-]?key|api[_-]?secret|secret[_-]?key|access[_-]?token|auth[_-]?token|password|passwd)\b\s*[:=]\s*["'](?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{24,}["']/i,
  },
]

/** Values that look like a key but are obviously a stand-in. */
export const PLACEHOLDER = /xxx|your[_-]?|example|placeholder|<[^>]*>|\.\.\.|\*{3,}|replace|change[_-]?me|dummy|sample|insert|redacted|key[_-]?here|0{8,}|1234567890/i

const home = String.raw`(?:~|\$HOME|\$\{HOME\}|%USERPROFILE%|/home/[^/\s'"]+|/Users/[^/\s'"]+|/root)`

/** Reading credential stores and private data → blocked. */
export const SENSITIVE_PATH_RULES: Rule[] = [
  { name: 'SSH keys (~/.ssh)', re: new RegExp(`${home}/\\.ssh\\b|\\.ssh/(?:id_[a-z0-9]+|authorized_keys|known_hosts|config)\\b`, 'i') },
  { name: 'AWS credentials (~/.aws)', re: new RegExp(`${home}/\\.aws\\b|\\.aws/(?:credentials|config)\\b`, 'i') },
  { name: 'GnuPG or netrc credentials', re: new RegExp(`${home}/\\.(?:gnupg|netrc)\\b`, 'i') },
  { name: 'Cloud and tool credentials (~/.kube, ~/.docker, ~/.config/gh)', re: new RegExp(`${home}/\\.(?:kube/config|docker/config\\.json|config/gh/hosts\\.yml)`, 'i') },
  { name: 'macOS keychain', re: /\bsecurity\s+(?:find-generic-password|find-internet-password|dump-keychain|export)\b|login\.keychain/i },
  {
    name: 'Browser profile data',
    re: /Application Support\/(?:Google\/Chrome|Firefox|BraveSoftware|Microsoft Edge|Arc)|\.mozilla\/firefox|\.config\/(?:google-chrome|chromium|BraveSoftware|microsoft-edge)|AppData\/(?:Local|Roaming)\/(?:Google\/Chrome|Mozilla\/Firefox|Microsoft\/Edge)|\/(?:Login Data|Cookies|Web Data)\b/i,
  },
]

/** Shell startup files: blocked when read or copied, flagged when merely mentioned (setup instructions). */
export const SHELL_RC = new RegExp(`${home}/\\.(?:bashrc|zshrc|bash_profile|bash_login|profile|zprofile|zshenv)\\b`, 'i')
export const READ_VERBS =
  /\b(?:cat|source|less|more|head|tail|grep|awk|sed|cp|scp|rsync|curl|wget|base64|xxd|strings|open|read|readFile|readFileSync|print)\b|(?:^|\s)\.\s/

/** Dangerous shell patterns → flagged for the owner to look at. */
export const DANGEROUS_COMMAND_RULES: Rule[] = [
  { name: 'rm -rf', re: /\brm\s+(?:-[a-zA-Z]*[rR][a-zA-Z]*[fF]|-[a-zA-Z]*[fF][a-zA-Z]*[rR])\b|\brm\s+-[rRfF]\s+-[rRfF]\b|\brm\s+--recursive\s+--force\b/ },
  { name: 'Download piped into a shell', re: /\b(?:curl|wget)\b[^|\n]*\|\s*(?:sudo\s+(?:-\S+\s+)*)?(?:ba|z|k|da|fi)?sh\b/ },
  { name: 'sudo', re: /(?:^|[\s;&|(`])sudo\s/ },
  { name: 'base64 decoded and executed', re: /base64\s+(?:-d|-D|--decode)\b[^|\n]*\|\s*(?:sudo\s+)?(?:ba|z|k)?sh\b|\b(?:eval|exec)\s*\(?[^\n]{0,80}(?:base64|b64decode|atob\()/ },
  { name: 'Obfuscated eval', re: /\beval\s*\(?[^\n]{0,120}(?:\\x[0-9a-fA-F]{2}|fromCharCode|unescape\(|\\u00[0-9a-fA-F]{2}|chr\(\d+\)\s*\+)|\bexec\s*\(\s*(?:compile|bytes\.fromhex|codecs\.decode)/ },
]

/** Text that tries to steer the assistant against the user → flagged. */
export const INJECTION_RULES: Rule[] = [
  { name: 'Asks to ignore instructions', re: /\b(?:ignore|disregard|forget)\s+(?:all\s+|any\s+)?(?:the\s+|your\s+|of\s+your\s+)?(?:previous|prior|above|earlier|preceding|system|safety)\s+(?:instructions?|rules?|prompts?|guidelines?|guardrails?)/i },
  { name: 'Asks to hide something from the user', re: /\b(?:do\s+not|don'?t|never)\s+(?:tell|inform|mention|reveal|show|notify|warn|alert)\s+(?:this\s+to\s+)?(?:the\s+)?(?:user|human|operator)\b|\bwithout\s+(?:telling|informing|notifying|asking|alerting)\s+(?:the\s+)?(?:user|human)\b/i },
  { name: 'Asks to hide actions', re: /\b(?:hide|conceal)\s+(?:this|these|the|any|all|your)\s+(?:action|actions|step|steps|change|changes|command|commands|output)\b|\b(?:secretly|covertly|silently)\s+(?:run|execute|send|upload|copy|install|exfiltrate|delete)\b/i },
  { name: 'Role override', re: /\byou\s+are\s+now\s+(?:in\s+)?(?:developer|dan|jailbreak|unrestricted|god)\s*(?:mode)?\b/i },
  { name: 'Asks for certification', re: /\bmark\s+(?:this|the)\s+skill\s+as\s+(?:certified|verified|safe|trusted)\b/i },
  { name: 'Asks to ignore instructions', re: /忽略(?:掉|以上|上面|上述|之前|前面|所有|全部)?(?:的)?(?:规则|指令|要求|提示|说明)/ },
  { name: 'Asks to hide something from the user', re: /(?:不要|别|不得|勿|无需)(?:告诉|通知|提醒|让)用户|用户(?:不需要|无需)知道/ },
  { name: 'Asks to hide actions', re: /(?:隐藏|不要显示|不显示|悄悄|偷偷)(?:这个|此|这些|任何)?\s*(?:操作|步骤|命令|改动|执行|上传|发送)/ },
  { name: 'Asks for certification', re: /(?:把|将)(?:这个|此|本)?\s*Skill\s*(?:标|标记|设)为(?:认证|已认证|可信|安全)/ },
]

/** http(s) addresses; the host is what the network check compares. */
export const URL_PATTERN = /\bhttps?:\/\/([a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*)(?::\d{1,5})?(?=[/?#\s'"<>)\]]|$)/gi

/** Hosts that are documentation stand-ins, never real traffic. */
export const IGNORED_HOSTS = /^(?:localhost|127\.0\.0\.1|0\.0\.0\.0|example\.(?:com|org|net)|(?:[a-z0-9-]+\.)+example\.(?:com|org|net)|.*\.(?:test|invalid|localhost))$/i

export const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp'])

/** Compiled code, archives and the like: never part of a Skill (text files and images only). */
export const BINARY_EXTENSIONS = new Set([
  'exe', 'dll', 'so', 'dylib', 'bin', 'o', 'a', 'class', 'pyc', 'pyo', 'wasm', 'jar', 'war',
  'zip', 'tar', 'gz', 'tgz', 'bz2', 'xz', '7z', 'rar', 'dmg', 'iso', 'img', 'msi', 'deb', 'rpm', 'apk',
  'node', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'woff', 'woff2', 'ttf', 'otf', 'eot',
  'mp3', 'mp4', 'mov', 'avi', 'wav', 'ogg', 'flac', 'sqlite', 'db', 'pkl', 'pickle', 'npy', 'npz', 'onnx', 'pt', 'pth', 'safetensors', 'gguf',
])

/** Magic numbers of executables. */
export const EXECUTABLE_MAGIC: { name: string; bytes: number[] }[] = [
  { name: 'ELF executable', bytes: [0x7f, 0x45, 0x4c, 0x46] },
  { name: 'Mach-O executable', bytes: [0xcf, 0xfa, 0xed, 0xfe] },
  { name: 'Mach-O executable', bytes: [0xce, 0xfa, 0xed, 0xfe] },
  { name: 'Mach-O executable', bytes: [0xfe, 0xed, 0xfa, 0xcf] },
  { name: 'Mach-O executable', bytes: [0xfe, 0xed, 0xfa, 0xce] },
  { name: 'Mach-O or Java class file', bytes: [0xca, 0xfe, 0xba, 0xbe] },
]

export const LICENSE_FILE = /^(?:LICENSE|LICENCE|COPYING)(?:\.[A-Za-z0-9]+)?$/i
