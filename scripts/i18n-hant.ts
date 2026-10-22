/**
 * Generates messages/zh-hant.json from messages/zh-hans.json with OpenCC
 * (Simplified → Taiwan Traditional, with phrases), then applies
 * messages/overrides/zh-hant.json for UI wording OpenCC cannot infer
 * (登录 → 登入, 邮箱 → 電子郵件 …).
 *
 *   pnpm i18n:hant           write messages/zh-hant.json
 *   pnpm i18n:hant --check   exit 1 if the committed file is out of date (CI)
 */
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { toHant } from '../src/lib/i18n/hant'

type Messages = { [key: string]: string | Messages }

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourceFile = path.join(root, 'messages/zh-hans.json')
const overridesFile = path.join(root, 'messages/overrides/zh-hant.json')
const targetFile = path.join(root, 'messages/zh-hant.json')

function convert(node: Messages): Messages {
  const out: Messages = {}
  for (const [key, value] of Object.entries(node)) {
    out[key] = typeof value === 'string' ? toHant(value) : convert(value)
  }
  return out
}

/** Overrides may only replace existing keys, so a renamed key can't leave a stale override behind. */
function applyOverrides(base: Messages, overrides: Messages, trail: string[] = []): Messages {
  const out: Messages = { ...base }
  for (const [key, value] of Object.entries(overrides)) {
    const here = [...trail, key].join('.')
    const current = base[key]
    if (current === undefined) {
      throw new Error(`Override "${here}" does not exist in zh-hans.json — remove it or rename it.`)
    }
    if (typeof value === 'string') {
      if (typeof current !== 'string') throw new Error(`Override "${here}" replaces a group with a string.`)
      out[key] = value
    } else {
      if (typeof current === 'string') throw new Error(`Override "${here}" replaces a string with a group.`)
      out[key] = applyOverrides(current, value, [...trail, key])
    }
  }
  return out
}

async function readJson(file: string): Promise<Messages> {
  return JSON.parse(await readFile(file, 'utf8')) as Messages
}

async function buildHant(): Promise<string> {
  const source = await readJson(sourceFile)
  const overrides = await readJson(overridesFile)
  const result = applyOverrides(convert(source), overrides)
  return `${JSON.stringify(result, null, 2)}\n`
}

async function main() {
  const output = await buildHant()

  if (process.argv.includes('--check')) {
    const current = await readFile(targetFile, 'utf8').catch(() => '')
    if (current !== output) {
      console.error('messages/zh-hant.json is out of date. Run `pnpm i18n:hant` and commit the result.')
      process.exit(1)
    }
    console.log('messages/zh-hant.json is up to date.')
    return
  }

  await writeFile(targetFile, output)
  console.log('Wrote messages/zh-hant.json')
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
