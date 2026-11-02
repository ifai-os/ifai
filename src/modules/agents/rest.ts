import { z } from 'zod'

import { siteUrl } from '@/lib/site-url'

import type { AgentCaller } from './data'
import { unauthorized } from './http'
import { readLang } from './lang'
import { finish, newNonce } from './markdown'
import { launchedOperations } from './operations'
import { OperationError, type AnyOperation, type ErrorCode } from './operations/types'
import { openApiDocument } from './openapi'

/**
 * The open API (docs/specs/agents.md「开放 API」): every launched operation as `GET /api/v1/…`,
 * answering JSON, or the MCP tool's Markdown with `?format=md`. Reads need no key, so answers
 * without an Authorization header are the same for everyone and the CDN keeps them for a minute;
 * the route lets a request in first (./gate.ts `admit`) and passes the agent its key belongs to.
 */

export const apiBase = '/api/v1'

const publicCache = 'public, max-age=0, s-maxage=60, stale-while-revalidate=300'
const noStore = 'private, no-store'

type Match = { operation: AnyOperation; params: Record<string, string> }

/** The operation a path names. Fixed segments win over parameters, so /news/trending is not a story. */
export function matchOperation(operations: readonly AnyOperation[], segments: readonly string[]): Match | null {
  let best: (Match & { fixed: number }) | null = null
  for (const operation of operations) {
    const pattern = operation.path.split('/').filter(Boolean)
    if (pattern.length !== segments.length) continue
    const params: Record<string, string> = {}
    let fixed = 0
    const fits = pattern.every((part, index) => {
      const name = /^\{(\w+)\}$/.exec(part)?.[1]
      if (name) {
        params[name] = segments[index]
        return segments[index] !== ''
      }
      fixed += 1
      return part === segments[index]
    })
    if (fits && (!best || fixed > best.fixed)) best = { operation, params, fixed }
  }
  return best && { operation: best.operation, params: best.params }
}

type FieldKind = 'string' | 'number' | 'boolean'
type JsonSchema = { type?: string | string[]; anyOf?: JsonSchema[]; properties?: Record<string, JsonSchema> }

function kindOf(schema: JsonSchema): FieldKind {
  const types = schema.anyOf ? schema.anyOf.map(kindOf) : [schema.type].flat()
  if (types.length && types.every((type) => type === 'number' || type === 'integer')) return 'number'
  if (types.length && types.every((type) => type === 'boolean')) return 'boolean'
  return 'string'
}

const fieldsCache = new WeakMap<AnyOperation, Map<string, FieldKind>>()

/** Each parameter of an operation and how a query string spells it. */
export function fieldKinds(operation: AnyOperation): Map<string, FieldKind> {
  let fields = fieldsCache.get(operation)
  if (!fields) {
    const schema = z.toJSONSchema(operation.input, { io: 'input' }) as JsonSchema
    fields = new Map(Object.entries(schema.properties ?? {}).map(([name, field]) => [name, kindOf(field)]))
    fieldsCache.set(operation, fields)
  }
  return fields
}

/** A query string value as the parameter's type; what does not read as one is left for the schema to reject. */
function convert(value: string, kind: FieldKind): unknown {
  if (kind === 'number') return /^-?\d+(\.\d+)?$/.test(value.trim()) ? Number(value) : value
  if (kind === 'boolean') {
    const word = value.trim().toLowerCase()
    if (word === 'true' || word === '1' || word === '') return true
    if (word === 'false' || word === '0') return false
  }
  return value
}

/** The operation's input from the path and the query string; unknown query parameters are ignored. */
export function readInput(operation: AnyOperation, params: Record<string, string>, query: URLSearchParams): Record<string, unknown> {
  const raw: Record<string, unknown> = {}
  for (const [name, kind] of fieldKinds(operation)) {
    if (name in params) {
      raw[name] = convert(params[name], kind)
      continue
    }
    const values = query.getAll(name)
    if (values.length > 1) throw new OperationError(400, 'invalid_request', `\`${name}\` is given ${values.length} times; give it once.`)
    if (values.length === 1) raw[name] = convert(values[0], kind)
  }
  if (fieldKinds(operation).has('lang')) {
    const lang = readLang(raw.lang)
    if (!lang) throw new OperationError(400, 'invalid_request', '`lang` must be en, zh-Hans, zh-Hant, ja or ko.')
    raw.lang = lang
  }
  return raw
}

/** Zod's complaints as one sentence an agent can act on. */
export function describeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((issue) => (issue.path.length ? `\`${issue.path.join('.')}\`: ${issue.message}` : issue.message))
    .join('; ')
}

function respond(body: string, status: number, contentType: string, cache: string): Response {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': cache,
      'Access-Control-Allow-Origin': '*',
      'X-Robots-Tag': 'noindex',
    },
  })
}

function json(body: unknown, status: number, cache: string): Response {
  return respond(JSON.stringify(body), status, 'application/json; charset=utf-8', cache)
}

function fail(status: number, code: ErrorCode, message: string, cache: string): Response {
  return json({ error: { code, message } }, status, cache)
}

/** GET /api/v1: what there is and where the documents are. */
function index(origin: string, operations: readonly AnyOperation[]) {
  return {
    name: 'IFAI open API',
    about: 'Read IFAI (AI news, apps, Agent Skills and the community) as an agent. No key needed for reading; send an IFAI key as `Authorization: Bearer ifai_…` to act as your agent.',
    openapi: `${origin}${apiBase}/openapi.json`,
    mcp: `${origin}/mcp`,
    llms: `${origin}/llms.txt`,
    markdown: 'Add ?format=md to any endpoint for the Markdown an MCP tool returns.',
    endpoints: operations.map((operation) => ({
      method: 'GET',
      path: `${apiBase}${operation.path}`,
      tool: operation.tool,
      title: operation.title,
      ...(operation.auth === 'key' ? { needsKey: true } : {}),
    })),
  }
}

/** Serves one GET under /api/v1, for the agent whose key came with it or for a visitor. */
export async function handleRest(request: Request, caller: AgentCaller | null = null): Promise<Response> {
  const url = new URL(request.url)
  const cache = caller || request.headers.has('authorization') ? noStore : publicCache
  const origin = siteUrl()
  const operations = launchedOperations()

  let segments: string[]
  try {
    segments = url.pathname
      .slice(apiBase.length)
      .split('/')
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment))
  } catch {
    return fail(400, 'invalid_request', 'The path is not valid.', cache)
  }

  if (segments.length === 0) return json(index(origin, operations), 200, cache)
  if (segments.length === 1 && segments[0] === 'openapi.json') return json(openApiDocument(origin, operations), 200, cache)

  const match = matchOperation(operations, segments)
  if (!match) return fail(404, 'not_found', `No endpoint at ${url.pathname}. See ${origin}${apiBase}/openapi.json.`, cache)
  const { operation, params } = match
  if (operation.auth === 'key' && !caller) return unauthorized('missing', origin)

  const format = url.searchParams.get('format')
  if (format !== null && format !== 'json' && format !== 'md' && format !== 'markdown') {
    return fail(400, 'invalid_request', '`format` must be json or md.', cache)
  }

  try {
    const parsed = operation.input.safeParse(readInput(operation, params, url.searchParams))
    if (!parsed.success) return fail(400, 'invalid_request', describeIssues(parsed.error), cache)
    const output = await operation.run(parsed.data, { origin, caller })
    if (format === 'md' || format === 'markdown') {
      const text = operation.markdown(output, parsed.data, { origin, caller, nonce: newNonce() })
      return respond(finish(text), 200, 'text/markdown; charset=utf-8', cache)
    }
    return json(output, 200, cache)
  } catch (error) {
    if (error instanceof OperationError) return fail(error.status, error.code, error.message, cache)
    console.error(`[api/v1] ${operation.name} failed`, error)
    return fail(500, 'internal_error', 'Something went wrong on IFAI’s side. Try again in a minute.', noStore)
  }
}

/** Any method but GET, HEAD and OPTIONS: the open API only reads for now. */
export function methodNotAllowed(): Response {
  const response = fail(405, 'method_not_allowed', 'The open API only reads for now: use GET.', noStore)
  response.headers.set('Allow', 'GET, HEAD, OPTIONS')
  return response
}

/** CORS preflight: any site may read the open API from a browser. */
export function preflight(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  })
}
