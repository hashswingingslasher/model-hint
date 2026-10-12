import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Suggestion } from '../types'
import { classify, isSkippable, type Bias } from './classify'
import { satisfies, tierOf } from './model'

const COMMAND = 'model-hint'

const suggestion = atom({ plugin: 'model-hint', key: 'suggestion' } as const, null)
const isEnabled = atom({ plugin: 'model-hint', key: 'isEnabled' } as const, true)
const isDismissed = atom({ plugin: 'model-hint', key: 'isDismissed' } as const, false)

const BIASES: readonly Bias[] = ['balanced', 'cost', 'quality']
const SHOWS = ['when-different', 'always'] as const
type Show = (typeof SHOWS)[number]

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

function sameSuggestion(a: Suggestion | null, b: Suggestion | null): boolean {
  if (a === null || b === null) return a === b
  return a.tier === b.tier && a.reasons.join('|') === b.reasons.join('|')
}

/**
 * Re-classifies the draft and writes the hint only when it changed, so typing
 * inside a stable classification does not redraw the band on every keystroke.
 * A changed hint, or an emptied box, also clears a Hide the person pressed.
 */
async function refresh($: EngineInterface, draft: string, bias: Bias): Promise<void> {
  const next = classify(draft, bias)
  let changed = false
  await update($, suggestion, prev => {
    changed = !sameSuggestion(prev, next)
    return changed ? next : prev
  })
  if (changed || isSkippable(draft)) await update($, isDismissed, () => false)
}

export const register: Register = (on, options) => {
  const bias = pick(options.bias, BIASES, 'balanced')
  const show = pick<Show>(options.show, SHOWS, 'when-different')

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
    await refresh($, box.text, bias)
    return box
  })

  // A plugin's fill replaces the draft without a prompt.edit, so re-read it.
  on('prompt.fill', async ($, e, next) => {
    const filled = await next(e)
    if (filled.isFilled) {
      const box = await $.prompt.read()
      await refresh($, box.text, bias)
    }
    return filled
  })

  // A failure here must never hold a prompt back: let it through untouched.
  on('prompt.submit', async ($, e, next) => {
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
    if (covered && show === 'when-different') return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const tier = hint.tier

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
        </Text>
        {!covered && <Button key="switch" label={`Switch to ${tier}`} hotkey="s" onPress={switchTo} />}
        <Button key="hide" label="Hide" hotkey="h" onPress={() => update($, isDismissed, () => true)} />
      </Box>
    )
  })
}
