/**
 * 原文核对 (docs/specs/daily.md「流程」7): every name and number in the written text must
 * appear in the source reports. This is a plain text check, not a model call: numbers, and
 * Latin-script tokens that look like names (OpenAI, GPT-5, NVIDIA, a capitalised word inside a
 * sentence), are looked up in the material. What is not found is shown at review time.
 */

/** Generic acronyms and words that are not names and may be absent from the reports. */
const IGNORED = new Set(
  [
    'AI', 'AIs', 'API', 'APIs', 'CEO', 'CTO', 'CFO', 'COO', 'US', 'USA', 'UK', 'EU', 'UN', 'GPU', 'GPUs', 'CPU', 'CPUs',
    'LLM', 'LLMs', 'PDF', 'URL', 'IT', 'PC', 'TV', 'PR', 'IPO', 'R&D', 'Q&A', 'FAQ', 'OK', 'PM', 'AM',
  ].map((word) => word.toLowerCase()),
)

function isSentenceStart(text: string, index: number): boolean {
  const before = text.slice(0, index).replace(/[\s"'“‘「『(\[]+$/u, '')
  return before.length === 0 || /[.!?:;。！？：；\n]$/u.test(before)
}

const CJK = /[぀-ヿ㐀-䶿一-鿿가-힯]/u

/**
 * The tokens of a written text that must be traceable to the reports: numbers (not the digits
 * inside a name like GPT-5 or H100, which are checked as part of the name), and Latin words that
 * look like names. In Chinese, Japanese and Korean text every Latin word is treated as a name;
 * in English a capitalised word at the start of a sentence is left alone, since it is usually
 * just the first word ("Today", "The"), so an invented name in that position goes unchecked.
 */
export function tokensToVerify(text: string): string[] {
  const tokens = new Set<string>()
  const cjk = CJK.test(text)
  for (const match of text.matchAll(/(?<![A-Za-z0-9-])\d+(?:[.,]\d+)*/g)) tokens.add(match[0])
  for (const match of text.matchAll(/(?<![A-Za-z0-9])[A-Za-z][A-Za-z0-9.+&-]*[A-Za-z0-9](?![A-Za-z0-9])/g)) {
    const word = match[0]
    if (IGNORED.has(word.toLowerCase())) continue
    const hasDigit = /\d/.test(word)
    const innerUpper = /[a-z][A-Z]/.test(word) || /^[A-Z][A-Z]+[a-z]/.test(word)
    const allCaps = /^[A-Z][A-Z&.+-]+$/.test(word)
    const capitalised = /^[A-Z][a-z]+$/.test(word) && (cjk || !isSentenceStart(text, match.index))
    if (hasDigit || innerUpper || allCaps || capitalised) tokens.add(word)
  }
  return [...tokens]
}

/** Lower-case and drop thousands separators, so "10,000" matches "10000" and "GPT-5" matches "gpt-5". */
function normalize(text: string): string {
  return text.toLowerCase().replace(/(\d),(?=\d{3}\b)/g, '$1')
}

/** Tokens of `text` that are not in `material`. */
export function missingFrom(text: string, material: string): string[] {
  const haystack = normalize(material)
  return tokensToVerify(text).filter((token) => !haystack.includes(normalize(token)))
}

export type Verification = {
  ok: boolean
  /** Names and numbers that were not found in the reports, by language. */
  missing: Array<{ locale: string; token: string }>
  checked: number
}

/** Check every language's title, summary and try-it against the combined reports. */
export function verifyWriting(texts: Record<string, string>, material: string): Verification {
  const missing: Verification['missing'] = []
  let checked = 0
  for (const [locale, text] of Object.entries(texts)) {
    checked += tokensToVerify(text).length
    for (const token of missingFrom(text, material)) missing.push({ locale, token })
  }
  return { ok: missing.length === 0, missing, checked }
}
