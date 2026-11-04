import type { z } from 'zod'

import type { ModuleKey } from '@/config/site'

import type { AgentCaller } from '../data'

/**
 * One thing an agent can do on IFAI (docs/specs/agents.md rule 1). It is defined once here and
 * served four ways: an open API route, an MCP tool, an OpenAPI operation and (step 4) a CLI
 * command.
 */

/** What every operation gets besides its input. */
export type OperationContext = {
  /** The site's origin without a trailing slash, for absolute addresses. */
  origin: string
  /** The agent whose key came with the request (../gate.ts); null for a visitor without one. */
  caller: AgentCaller | null
}

/** What the Markdown for an MCP tool result gets besides the operation's output. */
export type MarkdownContext = OperationContext & {
  /** Marks this answer's untrusted blocks (./markdown.ts `untrusted`); new for every answer. */
  nonce: string
}

export const errorCodes = [
  'invalid_request',
  'unauthorized',
  'forbidden',
  'not_found',
  'method_not_allowed',
  'conflict',
  'rate_limited',
  'daily_limit',
  'internal_error',
  'unavailable',
] as const
export type ErrorCode = (typeof errorCodes)[number]

/** An answer other than the result: the open API sends `status`, MCP sends `message` as a tool error. */
export class OperationError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 429 | 503,
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'OperationError'
  }
}

export const notFound = (message: string) => new OperationError(404, 'not_found', message)
export const invalid = (message: string) => new OperationError(400, 'invalid_request', message)

export type Operation<Input extends z.ZodObject = z.ZodObject, Output = unknown> = {
  /** Dotted name: the OpenAPI operationId and the CLI command (`news.list` → `ifai news list`). */
  name: string
  /** The MCP tool: lower snake case. */
  tool: string
  title: string
  /** For agents and the OpenAPI document: what it returns and when to use it, in English. */
  description: string
  /** Served only once this module has launched; null when it follows the modules it reads (search). */
  module: ModuleKey | null
  /**
   * `key`: only for an agent with an IFAI key (MCP lists it only then; the open API answers 401
   * without one). `write`: only with a read-and-write key, while IFAI lets agents write.
   */
  auth?: 'key' | 'write'
  /** GET (the default) reads; POST and DELETE change something, and need `auth: 'write'`. */
  method?: 'GET' | 'POST' | 'DELETE'
  /** For MCP clients, about a write: it removes something (destructive), or doing it again changes nothing (idempotent). */
  hints?: { destructive?: boolean; idempotent?: boolean }
  /** A write that makes something new: the open API answers 201. */
  creates?: boolean
  /** Under /api/v1; `{name}` segments are path parameters of `input`. */
  path: `/${string}`
  /** Every parameter: path, query (GET, DELETE) or JSON body (POST); the open API reads numbers and booleans from query strings. */
  input: Input
  // Methods (not function-valued properties), so any operation fits the registry's wider type.
  run(input: z.output<Input>, context: OperationContext): Promise<Output>
  /** The MCP tool result: compact Markdown that names each item's id or slug and address. */
  markdown(output: Output, input: z.output<Input>, context: MarkdownContext): string
}

// The registry holds operations of every input and output.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyOperation = Operation<z.ZodObject, any>

export function defineOperation<Input extends z.ZodObject, Output>(operation: Operation<Input, Output>): Operation<Input, Output> {
  return operation
}

/** The method an operation is served with. */
export const methodOf = (operation: AnyOperation): 'GET' | 'POST' | 'DELETE' => operation.method ?? 'GET'

/** A write: changes something on IFAI for the agent's owner, or under the agent's name. */
export const isWrite = (operation: AnyOperation): boolean => methodOf(operation) !== 'GET'
