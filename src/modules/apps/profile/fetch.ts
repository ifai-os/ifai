import { lookup } from 'node:dns/promises'
import { BlockList, isIP } from 'node:net'

import { FetchError, userAgent } from '@/modules/daily/collect/fetch'

/**
 * Fetches for app profiles. The website is typed by the owner, but the pages it links to, its
 * icon and its share image are chosen by the website, and what we download is stored and shown
 * publicly. So every request, and every redirect, must go to a public address on the default
 * port: never localhost, the private network or the cloud metadata address.
 */

/** Loopback, private, link-local (cloud metadata), shared, documentation, multicast and reserved ranges. */
const blocked = new BlockList()
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 3],
] as const) {
  blocked.addSubnet(network, prefix, 'ipv4')
}
for (const [network, prefix] of [
  ['::', 96],
  ['64:ff9b::', 96],
  ['100::', 64],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  blocked.addSubnet(network, prefix, 'ipv6')
}

/** True for an address on the public internet. IPv4-mapped IPv6 addresses are checked as IPv4. */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address)
  if (family === 4) return !blocked.check(address, 'ipv4')
  if (family === 6) return !blocked.check(address, 'ipv6')
  return false
}

/** Host name → its IP addresses. */
export type Resolve = (hostname: string) => Promise<string[]>

export type FetchDeps = {
  fetch?: typeof fetch
  resolve?: Resolve
}

const resolveWithDns: Resolve = async (hostname) =>
  (await lookup(hostname, { all: true, verbatim: true })).map((entry) => entry.address)

export type Download = {
  bytes: Uint8Array
  contentType: string
  /** After redirects. */
  finalUrl: string
}

const MAX_REDIRECTS = 5

/**
 * Throws unless the URL is http(s) on the default port, without a user name, and every address
 * its host resolves to is public. The host is resolved again when connecting, so a host that
 * changes its answer in between is not caught; that is accepted for one-off profile fetches.
 */
async function assertPublic(url: URL, resolve: Resolve): Promise<void> {
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new FetchError(`Not a web address: ${url.protocol}`)
  if (url.port && url.port !== '80' && url.port !== '443') throw new FetchError(`Port ${url.port} is not allowed`)
  if (url.username || url.password) throw new FetchError('Addresses with a user name are not allowed')
  const host = url.hostname.replace(/^\[|\]$/g, '')
  let addresses: string[]
  try {
    addresses = isIP(host) ? [host] : await resolve(host)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    throw new FetchError(`Cannot find ${host}${code ? ` (${code})` : ''}`)
  }
  if (addresses.length === 0 || !addresses.every(isPublicAddress)) {
    throw new FetchError(`${host} is not a public address`)
  }
}

/** Reads at most `maxBytes` of the body; a larger body throws without being read to the end. */
async function readCapped(response: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(response.headers.get('content-length'))
  if (declared > maxBytes) {
    await response.body?.cancel()
    throw new FetchError(`Response too large (${declared} bytes)`)
  }
  if (!response.body) return new Uint8Array()
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      throw new FetchError(`Response too large (over ${maxBytes} bytes)`)
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

/** GET a public URL, following up to five redirects, each one checked again. Non-2xx responses throw. */
export async function fetchPublic(
  input: string,
  { accept, maxBytes, timeoutMs = 15_000 }: { accept: string; maxBytes: number; timeoutMs?: number },
  deps: FetchDeps = {},
): Promise<Download> {
  const doFetch = deps.fetch ?? fetch
  const resolve = deps.resolve ?? resolveWithDns
  const signal = AbortSignal.timeout(timeoutMs)
  let url: URL
  try {
    url = new URL(input)
  } catch {
    throw new FetchError(`Not a web address: ${input.slice(0, 200)}`)
  }

  for (let redirects = 0; ; redirects++) {
    await assertPublic(url, resolve)
    const response = await doFetch(url, {
      headers: { 'user-agent': userAgent(), accept, 'accept-language': 'en' },
      redirect: 'manual',
      signal,
    })
    const location = response.headers.get('location')
    if (response.status >= 300 && response.status < 400 && location) {
      await response.body?.cancel()
      if (redirects >= MAX_REDIRECTS) throw new FetchError('Too many redirects')
      url = new URL(location, url)
      continue
    }
    if (!response.ok) {
      await response.body?.cancel()
      throw new FetchError(`HTTP ${response.status}`, response.status)
    }
    return {
      bytes: await readCapped(response, maxBytes),
      contentType: response.headers.get('content-type') ?? '',
      finalUrl: url.toString(),
    }
  }
}

/** The charset from the Content-Type header, else from a <meta> near the top of the page. */
function charsetOf(bytes: Uint8Array, contentType: string): string {
  const declared = /charset=["']?([\w-]+)/i.exec(contentType)?.[1]
  if (declared) return declared
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 2048))
  return /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1] ?? 'utf-8'
}

export function decodeText(bytes: Uint8Array, contentType: string): string {
  try {
    return new TextDecoder(charsetOf(bytes, contentType)).decode(bytes)
  } catch {
    return new TextDecoder().decode(bytes)
  }
}
