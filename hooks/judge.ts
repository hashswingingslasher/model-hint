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

/**
 * At most this much of a draft is sent. The request is clear from its start, and
 * a pasted log should not be re-sent in full at every pause.
 */
export const SEND_LIMIT = 4000

/** A reply longer than this is not a 60-token verdict; it is not parsed. */
const REPLY_LIMIT = 2000

/**
 * Text that looks like a credential. A draft containing one is never sent; the
 * rules' guess stands in and the band says why.
 */
const SECRET = new RegExp(
  [
    'sk-ant-[A-Za-z0-9_-]{16,}',
    'sk-[A-Za-z0-9]{32,}',
    'gh[pousr]_[A-Za-z0-9]{30,}',
    'github_pat_[A-Za-z0-9_]{40,}',
    'xox[abposr]-[A-Za-z0-9-]{10,}',
    'AKIA[0-9A-Z]{16}',
    'AIza[0-9A-Za-z_-]{35}',
    '-----BEGIN [A-Z ]*PRIVATE KEY-----',
    'eyJ[A-Za-z0-9_-]{10,}\\.eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}',
  ].join('|'),
)

export function looksSecret(draft: string): boolean {
  return SECRET.test(draft)
}

export function request(draft: string, model: string): ModelCompleteRequest {
  const prompt = draft.length > SEND_LIMIT ? draft.slice(0, SEND_LIMIT) : draft
  return { model, system: SYSTEM, prompt, maxTokens: 60, effort: 'low', timeoutMs: 8000 }
}

// C0 and C1 controls, zero-width and bidirectional marks: nothing a reason needs,
// and a terminal may act on them.
const UNPRINTABLE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g

/** Reads the verdict out of the reply; null when it names no tier. */
export function parse(reply: string): Suggestion | null {
  if (reply.length > REPLY_LIMIT) return null
  const open = reply.indexOf('{')
  const close = reply.lastIndexOf('}')
  if (open === -1 || close < open) return null
  const json = reply.slice(open, close + 1)
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const { tier, reason } = parsed as { tier?: unknown; reason?: unknown }
  if (typeof tier !== 'string' || !(TIERS as readonly string[]).includes(tier)) return null
  const clean = typeof reason === 'string' ? reason.replace(UNPRINTABLE, '').trim() : ''
  const why = clean ? clean.slice(0, 60) : 'judged by the model'
  return { tier: tier as Tier, reasons: [why], score: 0, source: 'model' }
}
