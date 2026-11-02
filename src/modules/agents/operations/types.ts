import type { z } from 'zod'

import type { ModuleKey } from '@/config/site'

/**
 * One thing an agent can do on IFAI (docs/specs/agents.md rule 1). It is defined once here and
 * served four ways: an open API route, an MCP tool, an OpenAPI operation and (step 3) a CLI
 * command.
 */

/** What every operation gets besides its input. */
export type OperationContext = {
  /** The site's origin without a trailing slash, for absolute addresses. */
  origin: string
}

/** What the Markdown for an MCP tool result gets besides the operation's output. */
export type MarkdownContext = OperationContext & {
  /** Marks this answer's untrusted blocks (./markdown.ts `untrusted`); new for every answer. */
  nonce: string
}

export type ErrorCode = 'invalid_request' | 'not_found' | 'method_not_allowed' | 'internal_error'

/** An answer other than the result: the open API sends `status`, MCP sends `message` as a tool error. */
export class OperationError extends Error {
  constructor(
    readonly status: 400 | 404,
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
  /** Under /api/v1; `{name}` segments are path parameters of `input`. */
  path: `/${string}`
  /** Every parameter, path and query alike; the open API reads numbers and booleans from strings. */
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
