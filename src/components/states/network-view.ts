/** What the network pill shows, derived from the browser's online flag and a short-lived local phase. */
export type NetworkPhase = 'idle' | 'reconnecting' | 'restored'
export type NetworkView = 'hidden' | 'offline' | 'reconnecting' | 'restored'

/** How long「已恢复」stays on screen, and how long a manual retry spins before it is judged. */
export const restoredVisibleMs = 3000
export const retrySpinMs = 1400

export function networkView(online: boolean, phase: NetworkPhase): NetworkView {
  if (phase === 'reconnecting') return 'reconnecting'
  if (phase === 'restored') return 'restored'
  return online ? 'hidden' : 'offline'
}
