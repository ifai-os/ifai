/**
 * The daily module's prompts (docs/specs/daily.md「流程」). Each one carries its content
 * hash as `version`; the pipeline stores the versions it used on each analysis.
 */
export { assistPrompt, assistKinds, cleanSuggestion, type AssistKind } from './assist'
export { groupPrompt, type GroupReport, type GroupResult } from './group'
export { materialText, type Material } from './material'
export { prefilterPrompt, type PrefilterResult } from './prefilter'
export { scorePrompt, type ScoreResult } from './score'
export { structurePrompt, type Structure } from './structure'
export { rewritePrompt, rewriteLocaleNames, type RewriteInput } from './rewrite'
export { excerpt, promptVersion } from './version'
export { localeSchema, reportsText, writePrompt, writtenLocales, type WriteReport, type WriteResult, type WrittenText } from './write'
export { reachPrompt, type ReachInput, type ReachResult } from './reach'
