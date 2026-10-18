import type { Suggestion, Tier } from '../types'

/**
 * Scores a draft prompt and picks a tier. Pure: no engine, no model call, so it
 * runs on every keystroke without cost and is unit-tested in isolation.
 *
 * The score is a sum of signals. Negative leans haiku, positive leans opus,
 * the middle is sonnet. `bias` shifts the two thresholds so a cost-conscious
 * person needs more evidence before being pushed up a tier, and vice versa.
 */

export type Bias = 'balanced' | 'cost' | 'quality'

type Signal = {
  /** Shown to the person as the reason for the pick; keep it short. */
  label: string
  weight: number
  test: (draft: string, lower: string) => boolean
}

const words = (list: string[]) => new RegExp(`\\b(?:${list.join('|')})\\b`, 'i')

const HEAVY_VERBS = words([
  'architect', 'design', 'redesign', 'rearchitect', 'restructure', 'migrate', 'migration',
  'refactor', 'rewrite', 'port', 'overhaul', 'modernize', 'modernise', 'decompose',
  'modulari[sz]e', 'made modular', 'make .{1,30} modular', 'decouple', 'untangle', 'separat(?:e|ed|ing)',
  'split (?:up|out|into|apart)', 'break (?:up|apart|out)', 'extract (?:into|out|a|the)', 'consolidate',
])
const HARD_PROBLEMS = words([
  'race condition', 'deadlock', 'memory leak', 'flaky', 'intermittent', 'heisenbug',
  'root cause', 'regression', 'data loss', 'corrupt(?:ed|ion)?', 'nondeterministic',
  'performance', 'latency', 'throughput', 'scal(?:e|ing|ability)', 'concurren(?:cy|t)',
])
const JUDGMENT = words([
  'trade-?offs?', 'strategy', 'approach', 'options?', 'compare', 'evaluate', 'assess',
  'recommend', 'should (?:we|i)', 'pros and cons', 'which is better', 'critique', 'review',
  'audit', 'security', 'threat model', 'plan', 'roadmap', 'spec', 'rfc', 'proposal',
])
const WIDE_SCOPE = words([
  'across', 'entire', 'whole', 'all (?:the )?(?:files|modules|packages|services|tests)',
  'codebase', 'monorepo', 'end[- ]to[- ]end', 'every', 'throughout', 'system[- ]wide',
  '(?:multiple|several|many) (?:features|modules|files|services|components|packages|places)',
])
const DEBUG = words(['debug(?:ging|ged)?', 'investigate', 'troubleshoot(?:ing)?', 'diagnose', 'figure out', 'why (?:does|is|do|did|are|was|were)', "doesn't work", 'not working', 'broken', 'crash(?:es|ing)?'])

const TRIVIAL = words([
  'typo', 'rename', 'spelling', 'capitali[sz]e', 'lowercase', 'uppercase', 'indent',
  'reformat', 'prettier', 'lint', 'alphabeti[sz]e', 'reorder',
  'add a comment', 'remove (?:the )?comment', 'bump (?:the )?version', 'changelog',
  'git (?:status|log|diff|add|commit|push|pull|stash|branch)', 'commit this', 'commit message',
  'run (?:the )?tests?', 'run (?:the )?build', 'run (?:the )?linter', 'npm (?:run|test|install)',
  'what does .{1,40} (?:do|mean|return)', 'what is .{1,40}\\?', 'where is', 'where are', 'which file',
  'list (?:the|all)', 'show me', 'how many',
  'translate', 'convert .{1,30} to (?:json|yaml|csv|markdown|md)', 'one[- ]liner', 'quick question',
])
const SMALL_SCOPE = words(['this line', 'this function', 'this file', 'one line', 'single line', 'tiny', 'minor', 'quick'])

/** Past this length a draft is a brief, not a mechanical edit, whatever words it uses. */
const MECHANICAL_MAX = 140

const SIGNALS: Signal[] = [
  { label: 'architecture or large refactor', weight: 3, test: (_, l) => HEAVY_VERBS.test(l) },
  { label: 'hard bug class', weight: 3, test: (_, l) => HARD_PROBLEMS.test(l) },
  { label: 'needs judgment', weight: 3, test: (_, l) => JUDGMENT.test(l) },
  { label: 'wide scope', weight: 2, test: (_, l) => WIDE_SCOPE.test(l) },
  { label: 'debugging', weight: 2, test: (_, l) => DEBUG.test(l) },
  { label: 'multi-step', weight: 3, test: d => countSteps(d) >= 3 },
  { label: 'long brief', weight: 2, test: d => d.length >= 600 },
  { label: 'detailed brief', weight: 1, test: d => d.length >= 250 && d.length < 600 },
  { label: 'mechanical edit', weight: -3, test: (d, l) => d.length < MECHANICAL_MAX && TRIVIAL.test(l) },
  { label: 'small scope', weight: -1, test: (_, l) => SMALL_SCOPE.test(l) },
  { label: 'short ask', weight: -1, test: d => d.trim().length < 40 },
]

/**
 * The rules read at most this much of a draft. Past it the shape of a request
 * is clear, and every keystroke stays cheap however much is pasted.
 */
export const READ_LIMIT = 8000

/** Numbered items, bullets, or "then"/"after that" chains count as steps. */
export function countSteps(draft: string): number {
  // [ \t] rather than \s: a \s* that can cross newlines goes quadratic on blank lines.
  const listed = (draft.match(/^[ \t]*(?:\d+[.)]|[-*•])[ \t]+\S/gm) ?? []).length
  const chained = (draft.match(/\b(?:then|after that|next|finally|afterwards|once that)\b/gi) ?? []).length
  return Math.max(listed, chained + 1)
}

/** Drafts the model never sees: slash commands, shell escapes, memory notes, nothing typed. */
export function isSkippable(draft: string): boolean {
  const t = draft.trimStart()
  return t.length === 0 || t.startsWith('/') || t.startsWith('!') || t.startsWith('#')
}

const THRESHOLDS: Record<Bias, { up: number; down: number }> = {
  balanced: { up: 3, down: -2 },
  cost: { up: 5, down: -1 },
  quality: { up: 2, down: -3 },
}

export function classify(whole: string, bias: Bias = 'balanced'): Suggestion | null {
  if (isSkippable(whole)) return null
  // Length still counts as a signal past the limit, so the brief keeps its weight.
  const draft = whole.length > READ_LIMIT ? whole.slice(0, READ_LIMIT) : whole

  const lower = draft.toLowerCase()
  const hits = SIGNALS.filter(s => s.test(draft, lower))
  const score = hits.reduce((sum, s) => sum + s.weight, 0)
  const { up, down } = THRESHOLDS[bias]

  const tier: Tier = score >= up ? 'opus' : score <= down ? 'haiku' : 'sonnet'

  // Explain the pick with the signals that pulled in its direction, strongest first.
  const towards = hits
    .filter(s => (tier === 'opus' ? s.weight > 0 : tier === 'haiku' ? s.weight < 0 : true))
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
    .map(s => s.label)
  const reasons = towards.length > 0 ? towards.slice(0, 2) : ['ordinary coding task']

  return { tier, reasons, score, source: 'rules' }
}
