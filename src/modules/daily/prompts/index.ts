/**
 * The daily module's prompts (docs/specs/daily.md「流程」). Each one carries its content
 * hash as `version`; the pipeline stores the versions it used on each analysis.
 */
export { groupPrompt, type GroupReport, type GroupResult } from './group'
export { materialText, type Material } from './material'
export { prefilterPrompt, type PrefilterResult } from './prefilter'
export { scorePrompt, type ScoreResult } from './score'
export { structurePrompt, type Structure } from './structure'
export { excerpt, promptVersion } from './version'
export { writePrompt, writtenLocales, type WriteReport, type WriteResult, type WrittenText } from './write'
