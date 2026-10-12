import type { Tier } from '../types'

/**
 * Maps what `/model` shows (an alias, a full id, a Bedrock or Vertex id) to the
 * tier the hint reasons about. Fable sits above opus and satisfies an opus
 * hint; anything unrecognised is null and the hint always shows.
 */
export type Current = Tier | 'fable' | null

export function tierOf(model: string): Current {
  const m = model.toLowerCase()
  if (m.includes('fable')) return 'fable'
  if (m.includes('opus')) return 'opus'
  if (m.includes('sonnet')) return 'sonnet'
  if (m.includes('haiku')) return 'haiku'
  return null
}

/** Whether the session's model already covers the suggested tier. */
export function satisfies(current: Current, suggested: Tier): boolean {
  if (current === null) return false
  if (current === suggested) return true
  return current === 'fable' && suggested === 'opus'
}
