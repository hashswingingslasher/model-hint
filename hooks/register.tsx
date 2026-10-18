import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Suggestion } from '../types'
import { classify, isSkippable, type Bias } from './classify'
import * as judge from './judge'
import { satisfies, tierOf } from './model'

const COMMAND = 'model-hint'

const suggestion = atom({ plugin: 'model-hint', key: 'suggestion' } as const, null)
const isEnabled = atom({ plugin: 'model-hint', key: 'isEnabled' } as const, true)
const isDismissed = atom({ plugin: 'model-hint', key: 'isDismissed' } as const, false)
const judgeNote = atom({ plugin: 'model-hint', key: 'judgeNote' } as const, null)

const BIASES: readonly Bias[] = ['balanced', 'cost', 'quality']
const SHOWS = ['always', 'when-different'] as const
const ENGINES = ['model', 'rules'] as const
type Show = (typeof SHOWS)[number]
type Engine = (typeof ENGINES)[number]

/**
 * How long the person must pause before the model reads the draft. A judge call
 * measured 0.8 to 1.4 s (median about 0.95 s), so 300 ms keeps the verdict near
 * 1.25 s after typing stops; a stray keystroke only aborts the call in flight.
 */
export const PAUSE_MS = 300

/** Verdicts kept per session, so a draft judged once answers instantly. */
const CACHE_SIZE = 64

/**
 * How often the draft is read on a surface that draws the band but raises no
 * prompt.edit (the VS Code chat panel as of 2.1.301).
 */
export const POLL_MS = 300

type Settings = { bias: Bias; show: Show; engine: Engine; judgeModel: string }

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

function sameSuggestion(a: Suggestion | null, b: Suggestion | null): boolean {
  if (a === null || b === null) return a === b
  return a.tier === b.tier && a.reasons.join('|') === b.reasons.join('|')
}

/** Writes the hint only when it changed, so a stable classification never redraws; a change also clears a Hide. */
async function publish($: EngineInterface, next: Suggestion | null, force: boolean): Promise<void> {
  let changed = false
  await update($, suggestion, prev => {
    changed = !sameSuggestion(prev, next)
    return changed ? next : prev
  })
  if (changed || force) await update($, isDismissed, () => false)
}

// One pending model pass at a time, for the draft as it stood when the person
// paused. Module state: a hot reload drops it, which is the right outcome.
let pending: Timer | undefined
let inflight: AbortController | undefined
let generation = 0

// Verdicts by judge model and trimmed draft, oldest first. Backspacing to a
// draft already judged, or pausing twice on the same text, costs no call.
const verdicts = new Map<string, Suggestion>()

// Wall-clock time of the last edit, for the debug log's latency line only.
let editedAt = 0

// The VS Code chat panel (2.1.301) attaches as a surface and draws the band, but
// never forwards typing as prompt.edit; it does answer $.prompt.read. While such a
// surface is attached the draft is read on a timer instead. The first prompt.edit
// proves the host forwards edits and switches the timer off for the session.
let poller: Timer | undefined
let hearsEdits = false
let lastPolled = ''

function stopPolling(): void {
  poller?.cancel()
  poller = undefined
}

async function poll($: EngineInterface, settings: Settings): Promise<void> {
  if (hearsEdits) {
    stopPolling()
    return
  }
  const box = await $.prompt.read()
  if (box.text === lastPolled) return
  lastPolled = box.text
  await onDraft($, box.text, settings)
}

function cacheKey(settings: Settings, draft: string): string {
  return `${settings.judgeModel}\u0000${draft.trim()}`
}

function remember(key: string, verdict: Suggestion): void {
  verdicts.delete(key)
  verdicts.set(key, verdict)
  if (verdicts.size > CACHE_SIZE) {
    const oldest = verdicts.keys().next().value
    if (oldest !== undefined) verdicts.delete(oldest)
  }
}

// Whether this session draws the band. Learned at the first AbovePrompt render,
// not from the surface's name: until then the status line under the prompt
// carries the hint. That covers surfaces with a status line but no band; it does
// nothing in the VS Code panel, where prompt.edit never fires.
let hasBand = false

async function mirror($: EngineInterface, settings: Settings): Promise<void> {
  if (hasBand) return
  const [hint, enabled, note] = await Promise.all([read($, suggestion), read($, isEnabled), read($, judgeNote)])
  if (hint === null || !enabled) {
    $.ui.status(undefined)
    return
  }
  if (hint.source === 'rules' && settings.engine === 'model' && note === null) {
    $.ui.status('model-hint: reading the draft...')
    return
  }
  const current = tierOf(await $.session.model())
  const covered = satisfies(current, hint.tier)
  if (covered && settings.show === 'when-different') {
    $.ui.status(undefined)
    return
  }
  const tail = covered && current ? `covered by ${current}` : `/model ${hint.tier} to switch`
  $.ui.status(`model-hint: ${hint.tier} · ${hint.reasons.join(', ')}${note ? ` (${note}, rules' guess)` : ''} · ${tail}`)
}

function cancelPending(): number {
  pending?.cancel()
  inflight?.abort()
  generation += 1
  return generation
}

/**
 * The instant pass. The rules answer at once; a model verdict already on
 * screen is kept while the person keeps typing, so the band does not flip
 * between the two sources on every keystroke. Then the model pass is armed.
 */
async function onDraft($: EngineInterface, draft: string, settings: Settings): Promise<void> {
  const mine = cancelPending()
  editedAt = Date.now()

  const rules = classify(draft, settings.bias)
  await update($, judgeNote, () => null)

  const known = settings.engine === 'model' && rules !== null ? verdicts.get(cacheKey(settings, draft)) : undefined
  if (known) {
    await publish($, known, false)
    await mirror($, settings)
    return
  }

  const held = await read($, suggestion)
  const keepModelVerdict = held?.source === 'model' && rules !== null
  if (!keepModelVerdict) await publish($, rules, isSkippable(draft))
  await mirror($, settings)

  if (settings.engine !== 'model' || rules === null || draft.trim().length < judge.MIN_LENGTH) return
  pending = $.clock.after(PAUSE_MS, () => {
    void ask($, draft, mine, settings)
  })
}

/** The model pass. A verdict lands only while it is still the latest and the draft has not moved on. */
async function ask($: EngineInterface, draft: string, mine: number, settings: Settings): Promise<void> {
  const stop = new AbortController()
  inflight = stop
  const firedAt = Date.now()
  // A failure is shown in the band and logged; it never sits silently on "reading".
  const fail = async (note: string, detail: string) => {
    $.ui.log(`model-hint: ${note}: ${detail}`, { to: 'debug' })
    if (mine !== generation) return
    await update($, judgeNote, () => note)
    await mirror($, settings)
  }
  let reply
  try {
    reply = await $.model.complete(judge.request(draft, settings.judgeModel), { signal: stop.signal })
  } catch (err) {
    await fail('judge call failed', String(err))
    return
  }
  if (mine !== generation) return
  if (!reply.isAnswered) {
    if (reply.reason === 'aborted') return
    const detail = reply.reason === 'api-error' ? `${reply.status ?? ''} ${reply.error}` : reply.reason
    await fail(reply.reason === 'api-error' ? 'judge API error' : 'judge gave no answer', detail)
    return
  }

  const verdict = judge.parse(reply.text)
  if (verdict === null) {
    await fail('judge reply unreadable', reply.text.slice(0, 200))
    return
  }
  const box = await $.prompt.read()
  if (box.text !== draft) {
    $.ui.log(`model-hint: draft moved on before the verdict landed (${box.text.length} vs ${draft.length} chars)`, { to: 'debug' })
    return
  }
  remember(cacheKey(settings, draft), verdict)
  const now = Date.now()
  $.ui.log(
    `model-hint: verdict ${verdict.tier} (${verdict.reasons[0]}) ${now - editedAt} ms after the last edit ` +
      `(timer ${firedAt - editedAt} ms, judge call ${now - firedAt} ms)`,
    { to: 'debug' },
  )
  await publish($, verdict, false)
  await mirror($, settings)
}

export const register: Register = (on, options) => {
  const settings: Settings = {
    bias: pick(options.bias, BIASES, 'balanced'),
    show: pick<Show>(options.show, SHOWS, 'always'),
    engine: pick<Engine>(options.engine, ENGINES, 'model'),
    judgeModel: typeof options.judge === 'string' && options.judge.trim() ? options.judge.trim() : 'haiku',
  }

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: 'Toggle the model hint band above the prompt',
    })
    return next(e)
  })

  on('command.run', { command: COMMAND }, async $ => {
    const enabled = await update($, isEnabled, was => !was)
    await mirror($, settings)
    return { text: enabled ? 'Model hint on.' : 'Model hint off for this session.' }
  }).catch(() => ({ text: 'Model hint: could not toggle, see the debug log.' }))

  on('session.attach', async ($, e, next) => {
    const attached = await next(e)
    if (e.surface !== 'terminal' && !hearsEdits && poller === undefined) {
      poller = $.clock.every(POLL_MS, () => {
        void poll($, settings)
      })
    }
    return attached
  })

  on('session.detach', async ($, e, next) => {
    const detached = await next(e)
    const remote = (await $.session.surfaces()).filter(surface => surface !== 'terminal')
    if (remote.length === 0) stopPolling()
    return detached
  })

  // Fires on each edit the composer makes; `next(e)` resolves the box after it.
  on('prompt.edit', async ($, e, next) => {
    if (!hearsEdits) {
      hearsEdits = true
      stopPolling()
    }
    const box = await next(e)
    await onDraft($, box.text, settings)
    return box
  })

  // A plugin's fill replaces the draft without a prompt.edit, so re-read it.
  on('prompt.fill', async ($, e, next) => {
    const filled = await next(e)
    if (filled.isFilled) {
      const box = await $.prompt.read()
      await onDraft($, box.text, settings)
    }
    return filled
  })

  // A failure here must never hold a prompt back: let it through untouched.
  on('prompt.submit', async ($, e, next) => {
    cancelPending()
    lastPolled = ''
    await update($, suggestion, () => null)
    await update($, isDismissed, () => false)
    await update($, judgeNote, () => null)
    $.ui.status(undefined)
    return next(e)
  }).catch((_$, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!hasBand) {
      hasBand = true
      $.ui.status(undefined)
    }
    if (e.props.hasSurvey) return next(e)

    const [hint, enabled, dismissed, note] = await Promise.all([
      read($, suggestion),
      read($, isEnabled),
      read($, isDismissed),
      read($, judgeNote),
    ])
    if (hint === null || !enabled || dismissed) return next(e)

    const current = tierOf(await $.session.model())
    const covered = satisfies(current, hint.tier)
    if (covered && settings.show === 'when-different') return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const tier = hint.tier
    const hide = <Button key="hide" label="Hide" hotkey="h" onPress={() => update($, isDismissed, () => true)} />

    // The rules' guess is never shown as a tier while the model is still reading.
    if (hint.source === 'rules' && settings.engine === 'model' && note === null) {
      return (
        <Box gap={1}>
          <Text dimColor>reading the draft...</Text>
          {hide}
        </Box>
      )
    }

    const switchTo = async () => {
      const rows = await $.config.list()
      const row = rows.find(r => r.key === 'model')
      if (!row || row.isLocked) {
        $.ui.toast(`Type /model ${tier} to switch`)
        return
      }
      const set = await $.config.set({ key: 'model', value: tier })
      if (set.deny) $.ui.toast(`Could not switch: ${set.deny}. Type /model ${tier}`)
      else await update($, isDismissed, () => true)
    }

    const detail = [
      hint.reasons.join(', '),
      note ? `(${note}, rules' guess)` : '',
      covered && current ? `· covered by ${current}` : '',
    ]
      .filter(Boolean)
      .join(' ')

    return (
      <Box gap={1}>
        <Text color={covered ? 'success' : 'suggestion'} bold>
          {tier}
        </Text>
        <Text dimColor wrap="truncate-end">
          {detail}
        </Text>
        {!covered && <Button key="switch" label={`Switch to ${tier}`} hotkey="s" onPress={switchTo} />}
        {hide}
      </Box>
    )
  })
}
