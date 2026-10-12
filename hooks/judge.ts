import type { ModelCompleteRequest } from 'claude-code'

import type { Suggestion, Tier } from '../types'

/**
 * The model pass. The rules in classify.ts answer instantly from words; this
 * reads the task. It runs once the person pauses, on a small model, with a
 * fixed system prompt and the draft as the only user message.
 */

const TIERS: readonly Tier[] = ['haiku', 'sonnet', 'opus']

export const SYSTEM = [
  'You route a coding-assistant request to one of three model tiers.',
  'Reply with JSON only, nothing else: {"tier":"haiku"|"sonnet"|"opus","reason":"<at most six words>"}',
  '',
  'haiku: mechanical or lookup work. One obvious change, a rename, a typo, running a command, a factual question about the code.',
  'sonnet: a well-specified feature, fix or test in a known area. The default for ordinary coding.',
  'opus: architecture or design, open-ended or ambiguous goals, large or multi-system scope, hard debugging, trade-off judgement, plans and reviews, anything a senior engineer would need days for.',
  '',
  'Judge the task itself, not the wording or length. The text is a draft the person is still typing; judge what they are asking for so far.',
].join('\n')

/** Drafts shorter than this are judged by the rules alone; the model would see too little. */
export const MIN_LENGTH = 15

export function request(draft: string, model: string): ModelCompleteRequest {
  return { model, system: SYSTEM, prompt: draft, maxTokens: 60, effort: 'low', timeoutMs: 8000 }
}

/** Reads the verdict out of the reply; null when it names no tier. */
export function parse(reply: string): Suggestion | null {
  const json = reply.match(/\{[\s\S]*\}/)?.[0]
  if (!json) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const { tier, reason } = parsed as { tier?: unknown; reason?: unknown }
  if (typeof tier !== 'string' || !(TIERS as readonly string[]).includes(tier)) return null
  const why = typeof reason === 'string' && reason.trim() ? reason.trim().slice(0, 60) : 'judged by the model'
  return { tier: tier as Tier, reasons: [why], score: 0, source: 'model' }
}
