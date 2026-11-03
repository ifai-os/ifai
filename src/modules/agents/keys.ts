import { createHash, randomBytes } from 'node:crypto'

import { keyLength, keyPrefix } from './rules'

const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

/**
 * A new key: `ifai_` and 43 characters drawn evenly from the 62 letters and digits (256 random
 * bits). Bytes from 248 up are skipped, so every character is equally likely.
 */
export function newKey(): string {
  let body = ''
  while (body.length < keyLength - keyPrefix.length) {
    for (const byte of randomBytes(64)) {
      if (byte >= 248) continue
      body += alphabet[byte % 62]
      if (body.length === keyLength - keyPrefix.length) break
    }
  }
  return `${keyPrefix}${body}`
}

/** What IFAI keeps of a key and looks it up by. A key is random enough that no salt is needed. */
export function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}
