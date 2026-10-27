/**
 * What each model call is for. Business code names a purpose, never a model; the model
 * for each purpose can be swapped on its own with an AI_MODEL_<PURPOSE> environment
 * variable. IDs are OpenRouter model IDs.
 *
 * Test-phase defaults: one cheap model for every text purpose (the owner asked to start
 * with DeepSeek-class models). Point a purpose at a stronger model with its env var, e.g.
 * AI_MODEL_WRITE=anthropic/claude-sonnet-4.5, once the pipeline runs end to end.
 */
const CHEAP = 'deepseek/deepseek-v3.2'

export const textPurposes = {
  /** Is this item about AI at all? Cheap and permissive. */
  prefilter: CHEAP,
  /** Newsworthiness score (0–100), run twice independently. */
  score: CHEAP,
  /** Category, companies, products, facts, item kind. */
  structure: CHEAP,
  /** Relationship between two reports: same happening, follow-up, unrelated, roundup. */
  group: CHEAP,
  /** Titles, summaries and "try it" in zh-Hans, en, ja, ko. */
  write: CHEAP,
  /** Review helpers: shorten a summary, suggest another title. */
  assist: CHEAP,
  /** App profiles from the app's website (apps.profile): facts, then the profile per language. */
  profile: CHEAP,
  /** Skill descriptions from SKILL.md and the README (skill.describe): declarations, then the text per language. */
  describe: CHEAP,
  /** Readers' app reviews into the other site languages (apps.review-translate), one call per review. */
  translate: CHEAP,
} as const

/**
 * Purposes that search X (Twitter) through xAI's own API: OpenRouter does not offer xAI's
 * `x_search` tool, so these IDs are xAI model IDs and the calls need XAI_API_KEY. They still
 * go through the same receipts, switch and budget as every other call (`ai.xSearch`).
 */
export const xSearchPurposes = {
  /** How widely X is discussing a daily story (daily heat, docs/specs/daily.md「传播指数」). */
  reach: 'grok-4.20-non-reasoning',
} as const

export const embeddingPurposes = {
  /** Vectors for grouping similar reports (pgvector). */
  embed: 'openai/text-embedding-3-small',
} as const

/**
 * Purposes whose model comes with each call instead of from this file: the model arena's
 * contestants (src/modules/rankings), which the site owner lists in the back office. Business
 * code passes the contestant's OpenRouter ID from that list (`ai.contest`), never a model name of
 * its own, and the call goes through the same receipts, switch and budget as every other.
 */
export const contestPurposes = ['arena'] as const

export type TextPurpose = keyof typeof textPurposes
export type XSearchPurpose = keyof typeof xSearchPurposes
export type EmbeddingPurpose = keyof typeof embeddingPurposes
export type ContestPurpose = (typeof contestPurposes)[number]
export type Purpose = TextPurpose | XSearchPurpose | EmbeddingPurpose

/**
 * Vector size of the default embedding model. The vector columns are created with this size,
 * so changing AI_MODEL_EMBED to a model with another size needs a migration.
 */
export const EMBEDDING_DIMENSIONS = 1536

const defaults: Record<Purpose, string> = { ...textPurposes, ...xSearchPurposes, ...embeddingPurposes }

export const purposes = Object.keys(defaults) as Purpose[]

export function isPurpose(value: string): value is Purpose {
  return Object.hasOwn(defaults, value)
}

/** The model for a purpose: AI_MODEL_<PURPOSE> if set, otherwise the default above. */
export function modelFor(purpose: Purpose, env: Record<string, string | undefined> = process.env): string {
  return env[`AI_MODEL_${purpose.toUpperCase()}`]?.trim() || defaults[purpose]
}
