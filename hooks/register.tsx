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

const BIASES: readonly Bias[] = ['balanced', 'cost', 'quality']
const SHOWS = ['when-different', 'always'] as const
const ENGINES = ['model', 'rules'] as const
type Show = (typeof SHOWS)[number]
type Engine = (typeof ENGINES)[number]

/** How long the person must pause before the model reads the draft. */
export const PAUSE_MS = 600

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

  const rules = classify(draft, settings.bias)
  const held = await read($, suggestion)
  const keepModelVerdict = held?.source === 'model' && rules !== null
  if (!keepModelVerdict) await publish($, rules, isSkippable(draft))

  if (settings.engine !== 'model' || rules === null || draft.trim().length < judge.MIN_LENGTH) return
  pending = $.clock.after(PAUSE_MS, () => {
    void ask($, draft, mine, settings)
  })
}

/** The model pass. A verdict lands only while it is still the latest and the draft has not moved on. */
async function ask($: EngineInterface, draft: string, mine: number, settings: Settings): Promise<void> {
  const stop = new AbortController()
  inflight = stop
  let reply
  try {
    reply = await $.model.complete(judge.request(draft, settings.judgeModel), { signal: stop.signal })
  } catch {
    return
  }
  if (mine !== generation || !reply.isAnswered) return

  const verdict = judge.parse(reply.text)
  if (verdict === null) return
  const box = await $.prompt.read()
  if (box.text !== draft) return
  await publish($, verdict, false)
}

export const register: Register = (on, options) => {
  const settings: Settings = {
    bias: pick(options.bias, BIASES, 'balanced'),
    show: pick<Show>(options.show, SHOWS, 'when-different'),
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
    return { text: enabled ? 'Model hint on.' : 'Model hint off for this session.' }
  }).catch(() => ({ text: 'Model hint: could not toggle, see the debug log.' }))

  // Fires on each edit the composer makes; `next(e)` resolves the box after it.
  on('prompt.edit', async ($, e, next) => {
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
    await update($, suggestion, () => null)
    await update($, isDismissed, () => false)
    return next(e)
  }).catch((_$, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const [hint, enabled, dismissed] = await Promise.all([
      read($, suggestion),
      read($, isEnabled),
      read($, isDismissed),
    ])
    if (hint === null || !enabled || dismissed) return next(e)

    const current = tierOf(await $.session.model())
    const covered = satisfies(current, hint.tier)
    if (covered && settings.show === 'when-different') return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const tier = hint.tier
    const provisional = hint.source === 'rules' && settings.engine === 'model'

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

    return (
      <Box gap={1}>
        <Text color={covered ? 'success' : 'suggestion'} bold>
          {tier}
        </Text>
        <Text dimColor wrap="truncate-end">
          {hint.reasons.join(', ')}
          {provisional ? ' (reading...)' : ''}
        </Text>
        {!covered && <Button key="switch" label={`Switch to ${tier}`} hotkey="s" onPress={switchTo} />}
        <Button key="hide" label="Hide" hotkey="h" onPress={() => update($, isDismissed, () => true)} />
      </Box>
    )
  })
}
