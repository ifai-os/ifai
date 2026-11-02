import type { AgentsError } from '../rules'

export type Sent<T> = { ok: true; data: T } | { ok: false; error: AgentsError | 'network' }

/** One call to the settings page's agent routes (src/app/api/account/agents). */
export async function send<T = object>(url: string, method: 'POST' | 'PATCH' | 'DELETE', body?: object): Promise<Sent<T>> {
  try {
    const response = await fetch(url, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = (await response.json().catch(() => null)) as (T & { error?: AgentsError }) | null
    if (response.ok && data) return { ok: true, data }
    return { ok: false, error: data?.error ?? 'network' }
  } catch {
    return { ok: false, error: 'network' }
  }
}
