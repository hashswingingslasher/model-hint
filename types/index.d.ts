/** The three tiers the hint picks between. */
export type Tier = 'haiku' | 'sonnet' | 'opus'

/** What the classifier concluded about the current draft. */
export type Suggestion = {
  tier: Tier
  /** Short, human-readable grounds for the pick, e.g. "typo fix, one line". */
  reasons: string[]
  /** Net score: negative leans haiku, positive leans opus. Kept for tests and debugging. */
  score: number
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
    }
  }
}
