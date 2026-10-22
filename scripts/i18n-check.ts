/**
 * Checks that every locale file has exactly the keys of messages/en.json and
 * uses the same {placeholders}. Run in CI together with `i18n:hant --check`.
 *
 *   pnpm i18n:check
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { locales, messagesFileName } from '../src/i18n/config'

type Messages = { [key: string]: string | Messages }

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function flatten(node: Messages, prefix = '', out = new Map<string, string>()): Map<string, string> {
  for (const [key, value] of Object.entries(node)) {
    const here = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') out.set(here, value)
    else flatten(value, here, out)
  }
  return out
}

/** Argument names: "{count, plural, …}" → count, "{email}" → email. */
function placeholders(message: string): string[] {
  const names = new Set<string>()
  for (const match of message.matchAll(/\{\s*([A-Za-z_][\w]*)\s*(?=[,}])/g)) names.add(match[1])
  return [...names].sort()
}

async function load(name: string): Promise<Map<string, string>> {
  const file = path.join(root, 'messages', `${name}.json`)
  return flatten(JSON.parse(await readFile(file, 'utf8')) as Messages)
}

async function main() {
  const reference = await load(messagesFileName('en'))
  const problems: string[] = []

  for (const locale of locales) {
    if (locale === 'en') continue
    const name = messagesFileName(locale)
    const messages = await load(name)

    for (const key of reference.keys()) {
      if (!messages.has(key)) problems.push(`${name}.json is missing "${key}"`)
    }
    for (const [key, value] of messages) {
      const expected = reference.get(key)
      if (expected === undefined) {
        problems.push(`${name}.json has "${key}", which en.json does not`)
        continue
      }
      if (!value.trim()) problems.push(`${name}.json has an empty "${key}"`)
      const want = placeholders(expected).join(', ')
      const got = placeholders(value).join(', ')
      if (want !== got) problems.push(`${name}.json "${key}" uses {${got}} but en.json uses {${want}}`)
    }
  }

  if (problems.length > 0) {
    console.error(`Translation problems (${problems.length}):\n- ${problems.join('\n- ')}`)
    process.exit(1)
  }
  console.log(`All ${locales.length} locales have the same ${reference.size} keys.`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
