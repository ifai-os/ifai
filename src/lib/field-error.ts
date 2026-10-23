import { ValidationError } from 'payload'

/**
 * Stop a save from a collection hook with a message on one field. The message is the error's own
 * too: the production build loads `payload` once for pages and once for routes, and when the
 * back office page started Payload, the REST route does not see a ValidationError here and keeps
 * only the message. Without this the toast reads "The following field is invalid: status" and the
 * note under the field is gone (docs/status.md「已知问题」).
 */
export function rejectField(collection: string, path: string, message: string): never {
  const error = new ValidationError({ collection, errors: [{ path, message }] })
  error.message = message
  throw error
}

/**
 * Whether an error is a ValidationError on `path`, read by its shape rather than `instanceof`:
 * for the reason above, the database adapter may throw the other copy's ValidationError (a unique
 * index turning a save away, for one).
 */
export function isFieldError(error: unknown, path: string): boolean {
  const problems = (error as { data?: { errors?: unknown } } | null)?.data?.errors
  return Array.isArray(problems) && problems.some((problem) => (problem as { path?: unknown } | null)?.path === path)
}
