import { describe, expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, PromptEditInput, PromptEditResult } from 'claude-code'

const SURFACES = ['terminal', 'desktop'] as const

const bandProps = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 6,
  bodyColumns: 100,
  scroll: { offset: 0, bodyRows: 6 },
  view: {},
}

/** Answers the engine calls the mod makes beneath the test: the box after an edit, and the session's model. */
function world(on: On, model: string) {
  on('prompt.edit', (_$, e) => {
    const text = e.text.slice(0, e.start) + e.inputText + e.text.slice(e.end)
    return { text, cursor: e.start + e.inputText.length }
  })
  on('session.model', () => ({ value: model }))
  on('ui.render', () => ({ type: 'engine', ref: 0 }))
}

/**
 * Types `text` into an empty box the way the composer raises it: one edit,
 * inserted at 0. The kit's `$` types only the events a plugin can call, and
 * `prompt.edit` is the composer's alone, so it is reached by name here.
 */
function type($: Engine, text: string) {
  const raise = ($.prompt as unknown as { edit: (e: PromptEditInput) => Promise<PromptEditResult> }).edit
  return raise({ origin: { kind: 'composer' }, text: '', cursor: 0, start: 0, end: 0, inputText: text })
}

async function mount($: Engine, surface: (typeof SURFACES)[number]) {
  return $.ui.mount({ plugin: 'model-hint', surface, component: 'AbovePrompt', props: bandProps })
}

describe('band', () => {
  for (const surface of SURFACES) {
    test(`${surface}: draws the hint when the task wants another tier`, async ($, on) => {
      world(on, 'claude-opus-5-5')
      const ui = await mount($, surface)
      await type($, 'fix the typo in the README')

      expect((await ui.find({ type: 'Text', text: 'haiku' }))?.text).toBe('haiku')
      expect((await ui.find({ type: 'Text', text: /mechanical/ }))?.text).toContain('mechanical edit')
      expect(await ui.find({ key: 'switch' })).toBeDefined()
      expect(await ui.find({ key: 'hide' })).toBeDefined()
    })

    test(`${surface}: stays quiet while the session's model already covers the task`, async ($, on) => {
      world(on, 'claude-haiku-5-5')
      const ui = await mount($, surface)
      await type($, 'fix the typo in the README')

      expect(await ui.find({ type: 'Text', text: 'haiku' })).toBeUndefined()
    })

    test(`${surface}: fable covers an opus-grade task`, async ($, on) => {
      world(on, 'claude-fable-5-1')
      const ui = await mount($, surface)
      await type($, 'there is a race condition in the job queue, find the root cause')

      expect(await ui.find({ type: 'Text', text: 'opus' })).toBeUndefined()
    })

    test(`${surface}: Hide removes the band until the hint changes`, async ($, on) => {
      world(on, 'claude-haiku-5-5')
      const ui = await mount($, surface)
      await type($, 'add a --verbose flag to the CLI and log the resolved config when it is set')
      expect(await ui.find({ type: 'Text', text: 'sonnet' })).toBeDefined()
      await ui.press({ key: 'hide' })
      expect(await ui.find({ type: 'Text', text: 'sonnet' })).toBeUndefined()

      // Same tier and reasons: still hidden.
      await type($, 'add a --verbose flag to the CLI and log the resolved config when it is set please')
      expect(await ui.find({ type: 'Text', text: 'sonnet' })).toBeUndefined()

      // A different hint comes back.
      await type($, 'refactor the auth module across the whole codebase to use the new session store')
      expect((await ui.find({ type: 'Text', text: 'opus' }))?.text).toBe('opus')
      expect((await ui.find({ type: 'Text', text: /refactor/ }))?.text).toContain('refactor')
    })

    test(`${surface}: submitting clears the hint`, async ($, on) => {
      world(on, 'claude-opus-5-5')
      on('prompt.submit', (_$, e) => ({ text: e.text }))
      const ui = await mount($, surface)
      await type($, 'fix the typo in the README')
      expect(await ui.find({ type: 'Text', text: 'haiku' })).toBeDefined()

      await $.prompt.submit({ text: 'fix the typo in the README', wait: false, origin: { kind: 'composer' } })
      expect(await ui.find({ type: 'Text', text: 'haiku' })).toBeUndefined()
    })

    test(`${surface}: a slash command draws nothing`, async ($, on) => {
      world(on, 'claude-opus-5-5')
      const ui = await mount($, surface)
      await type($, '/model haiku')

      expect(await ui.findAll({ type: 'Button' })).toHaveLength(0)
    })
  }

  test('show: always draws the hint even when covered', { options: { show: 'always' } }, async ($, on) => {
    world(on, 'claude-haiku-5-5')
    const ui = await mount($, 'terminal')
    await type($, 'fix the typo in the README')

    expect((await ui.find({ type: 'Text', text: 'haiku' }))?.text).toBe('haiku')
    expect(await ui.find({ key: 'switch' })).toBeUndefined()
  })

  test('bias: cost holds a borderline ask on sonnet', { options: { bias: 'cost' } }, async ($, on) => {
    world(on, 'claude-opus-5-5')
    const ui = await mount($, 'terminal')
    await type($, 'investigate why the nightly build is broken')

    expect((await ui.find({ type: 'Text', text: 'sonnet' }))?.text).toBe('sonnet')
  })
})
