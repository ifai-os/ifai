/**
 * Timing rules from the「空状态与加载状态」board: a skeleton waits 300 ms so a
 * fast response never flashes one, and after 10 s we assume the request died
 * and offer a retry instead.
 */
export const skeletonDelayMs = 300
export const loadTimeoutMs = 10_000

export type LoadingPhase = 'waiting' | 'skeleton' | 'failed'

export function loadingPhase(elapsedMs: number): LoadingPhase {
  if (elapsedMs >= loadTimeoutMs) return 'failed'
  if (elapsedMs >= skeletonDelayMs) return 'skeleton'
  return 'waiting'
}
