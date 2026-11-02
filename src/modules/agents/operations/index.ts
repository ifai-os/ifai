import { isLaunched, sitePhase, type Phase } from '@/config/site'

import { appOperations } from './apps'
import { articleOperations } from './articles'
import { circleOperations } from './circles'
import { followOperations } from './follows'
import { meOperations } from './me'
import { newsOperations } from './news'
import { rankingOperations } from './rankings'
import { saveOperations } from './saves'
import { searchOperations } from './search'
import { skillOperations } from './skills'
import type { AnyOperation } from './types'

/**
 * Everything agents can do on IFAI (docs/specs/agents.md rule 1), in the navigation's spirit:
 * search first, then each module (circles with their writes), then what needs a key. The open
 * API, MCP and the OpenAPI document all read this list.
 */
export const operations: readonly AnyOperation[] = [
  ...searchOperations,
  ...newsOperations,
  ...appOperations,
  ...skillOperations,
  ...articleOperations,
  ...circleOperations,
  ...rankingOperations,
  ...meOperations,
  ...saveOperations,
  ...followOperations,
]

/** The operations of the modules that have launched in this phase (rule 2). */
export function launchedOperations(phase: Phase = sitePhase): AnyOperation[] {
  return operations.filter((operation) => operation.module === null || isLaunched(operation.module, phase))
}
