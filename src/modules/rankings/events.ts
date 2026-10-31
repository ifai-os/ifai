/**
 * The rankings module's job events. This file stays free of the Payload config and the job code,
 * so collections and endpoints can import it.
 */

/** Generate the missing answers now (data `{}`), instead of waiting for the half-hourly run. */
export const answersEvent = 'rankings/answers.generate'

/** Compute this week's snapshot of every published arena now (data `{}`), instead of waiting for Monday. */
export const snapshotEvent = 'rankings/snapshot.run'

/** Import the outside leaderboards now (data `{ full?: true }`), instead of waiting for the morning run. */
export const externalImportEvent = 'rankings/external.import'
