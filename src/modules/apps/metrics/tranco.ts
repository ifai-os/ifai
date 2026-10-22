/**
 * Tranco (https://tranco-list.eu): a research ranking of the top million sites by registrable
 * domain, averaged over 30 days. The daily list for yesterday (UTC) is looked up by date and
 * downloaded as CSV ("rank,domain" per line, no header); only the apps' domains are kept. These
 * are the endpoints the official Python client (DistriNet/tranco-python-package) uses.
 */

const trancoSite = 'https://tranco-list.eu'
const listIdPattern = /^[A-Z0-9]{3,12}$/i
/** The million-line CSV is about 22 MB; anything far larger is not the list. */
const maxListBytes = 64 * 1024 * 1024
/** A complete download has a million lines; fewer means it was cut off. */
const minListLines = 900_000

export class TrancoError extends Error {
  name = 'TrancoError'
}

export type TrancoRanks = { listId: string; ranks: Record<string, number> }

type Deps = { fetch?: typeof fetch; now?: Date; timeoutMs?: number }

/** Yesterday's date in UTC: today's list is not out yet in the early hours. */
export function trancoListDate(now: Date): string {
  return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

async function get(url: string, fetchFn: typeof fetch, signal: AbortSignal): Promise<Response> {
  let response: Response
  try {
    response = await fetchFn(url, { signal, headers: { accept: 'text/plain, text/csv' } })
  } catch (error) {
    throw new TrancoError(`${url}: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (!response.ok) throw new TrancoError(`${url}: HTTP ${response.status}`)
  return response
}

/**
 * Ranks of the given domains in the latest daily list; domains not in the list are left out.
 * Throws TrancoError when the list cannot be found or the download is incomplete.
 */
export async function fetchTrancoRanks(domains: Iterable<string>, deps: Deps = {}): Promise<TrancoRanks> {
  const fetchFn = deps.fetch ?? fetch
  const wanted = new Set([...domains].map((domain) => domain.toLowerCase()))
  const signal = AbortSignal.timeout(deps.timeoutMs ?? 120_000)

  const date = trancoListDate(deps.now ?? new Date())
  const idResponse = await get(`${trancoSite}/daily_list_id?date=${date}&subdomains=false`, fetchFn, signal)
  const listId = (await idResponse.text()).trim()
  if (!listIdPattern.test(listId)) throw new TrancoError(`No list for ${date} (got "${listId.slice(0, 40)}")`)
  if (wanted.size === 0) return { listId, ranks: {} }

  const listResponse = await get(`${trancoSite}/download/${listId}/1000000`, fetchFn, signal)
  if (!listResponse.body) throw new TrancoError('The list download was empty')

  const ranks: Record<string, number> = {}
  let found = 0
  let lines = 0
  let bytes = 0
  let rest = ''
  const decoder = new TextDecoder()
  const reader = listResponse.body.getReader()

  const read = (line: string) => {
    const comma = line.indexOf(',')
    if (comma < 1) return
    lines++
    const domain = line.slice(comma + 1).trim().toLowerCase()
    if (!wanted.has(domain) || domain in ranks) return
    const rank = Number(line.slice(0, comma))
    if (!Number.isInteger(rank) || rank < 1) return
    ranks[domain] = rank
    found++
  }

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > maxListBytes) throw new TrancoError(`The list is larger than ${maxListBytes} bytes`)
      const text = rest + decoder.decode(value, { stream: true })
      const parts = text.split('\n')
      rest = parts.pop() ?? ''
      for (const line of parts) read(line)
      // Every domain found: no need to read the rest of the million lines.
      if (found === wanted.size) {
        await reader.cancel()
        return { listId, ranks }
      }
    }
  } catch (error) {
    if (error instanceof TrancoError) throw error
    throw new TrancoError(`Reading the list: ${error instanceof Error ? error.message : String(error)}`)
  }
  read(rest + decoder.decode())

  if (lines < minListLines) throw new TrancoError(`The list stopped after ${lines} lines`)
  return { listId, ranks }
}
