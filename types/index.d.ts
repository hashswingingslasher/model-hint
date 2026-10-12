/** The three tiers the hint picks between. */
export type Tier = 'haiku' | 'sonnet' | 'opus'

/** What produced a suggestion: the instant word rules, or the small model that reads the draft after a pause. */
export type Source = 'rules' | 'model'

/** What the classifier concluded about the current draft. */
export type Suggestion = {
  tier: Tier
  /** Short, human-readable grounds for the pick, e.g. "typo fix, one line". */
  reasons: string[]
  /** The rules' net score: negative leans haiku, positive leans opus. 0 for a model verdict. */
  score: number
  source: Source
}

declare module 'claude-code' {
  interface PluginState {
    'model-hint': {
      /** The hint for the draft as it stands; null while the box is empty or the draft is a command. */
      suggestion: Suggestion | null
      /** Session toggle, flipped by /model-hint. */
      isEnabled: boolean
      /** True once the person hides the band for the current draft; reset when the draft is submitted or emptied. */
      isDismissed: boolean
      /** Why the last model pass gave no verdict, shown in the band in place of "(reading...)"; null while none failed. */
      judgeNote: string | null
    }
  }
}
