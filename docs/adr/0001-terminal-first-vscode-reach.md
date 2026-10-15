# 0001. Reach VS Code users through terminal mode, not a panel companion

## Status

Accepted, 14 October 2026.

## Context

model-hint reads the draft prompt on every keystroke through `prompt.edit`, scores it with word rules (`hooks/classify.ts`), asks a small model after a 600 ms pause (`hooks/judge.ts`), and draws a band above the prompt with a Switch button (`hooks/register.tsx`). The question was how it should reach people who use Claude Code in the VS Code graphical chat panel.

What was verified:

- **The panel gives mods nothing to work with.** In a panel session on extension 2.1.296 the mod loads, but `$.session.surfaces()` returns `[]` and no `prompt.edit` fires while typing (trace captured 12 October). The extension's `extension.js` and `webview/index.js` contain no `ui_render` handling.
- **The engine declares a `vscode` surface the panel does not implement.** The upstream bug is open as [#99045](https://github.com/anthropics/claude-code/issues/99045), with the feature request [#99401](https://github.com/anthropics/claude-code/issues/99401). Earlier status-line requests [#11165](https://github.com/anthropics/claude-code/issues/11165), [#21265](https://github.com/anthropics/claude-code/issues/21265) and [#70497](https://github.com/anthropics/claude-code/issues/70497) are closed; [#77829](https://github.com/anthropics/claude-code/issues/77829) is open.
- **v0.4.0 claimed a status-line fallback in the panel that never runs.** `mirror()` is called only from hooks that do not fire there.
- **Terminal mode depends on the `claude` found on PATH.** `claudeCode.useTerminal` types a bare `claude` into a new shell on macOS and Linux. The extension does not install one. On the maintainer's machine PATH held 2.1.197, too old for mods, until it was upgraded to 2.1.299.
- **A separate VS Code extension cannot read the panel's draft**, cannot call `$.model.complete`, and its only hand-off (`vscode://anthropic.claude-code/open?prompt=`) replaces the draft and cannot set the model.
- **The differentiator is a reasoned suggestion before send.** Tools that route automatically do it silently.

## Decision

Do not build a VS Code companion extension. Reach VS Code users through terminal mode, say plainly that the graphical panel is not supported and why, and track upstream.

1. v0.4.1 removes the panel claim, adds a "Where it runs" table with the four-step VS Code setup, and corrects the `mirror()` comment. `mirror()` stays until mobile is checked.
2. Terminal mode was verified on the PATH CLI after the upgrade: the band drew and the haiku verdict landed (14 October, 2.1.299).
3. The judge was measured live before any demo: 10 prompts labelled beforehand (3 haiku, 4 sonnet, 3 opus). Result: 10 of 10 matched; each call took 1.3 to 1.6 s, so a verdict lands about 2.1 s after typing stops. The 1.5 s target was missed at first; 0.5.0 cut the pause to 300 ms and caches verdicts, bringing the live median to about 1.5 s (range 1.2 to 1.9 s, mostly network time in the judge call).

Not built: a status-bar companion that updates after send, a companion with its own input box, a file bridge between the mod and an extension, API-key handling, Marketplace publishing.

**Reopen if:** terminal mode cannot draw the band on a 2.1.296+ CLI; most inbound asks are for panel support; a cheap channel into the panel appears (for example `$.prompt.fill` reaching its composer); a maintainer rules out the `vscode` surface; or Anthropic ships `ui_render` and `prompt.edit` for the panel.

## Consequences

Good:

- The public repo stops overclaiming.
- The one feature that sets model-hint apart, a live reasoned hint before send, is shown where it works.
- One package, no publisher accounts, no API keys to manage.
- One install covers the terminal, VS Code terminal mode, and, expected but unseen, JetBrains and Desktop.

Bad:

- People who stay in the VS Code graphical panel, probably the largest group, get nothing until Anthropic implements the surface.
- The VS Code path costs four steps and gives up plan review, @-mention chips and click-to-rewind.
- Mods are early access; an engine update can break the band.
- The verdict depends on a network call: 1.2 to 1.9 s after typing stops, median about 1.5 s.

## Alternatives considered

- **Pre-send or nothing.** Same core, stronger positioning. Rejected as the base because its "panel-ready" test passed only on a faked `prompt.edit`, and it removed `mirror()` before mobile was checked. Its live check and its "Why not just route automatically" section were adopted.
- **Advisor core with host adapters.** Four to five days of abstractions, each with one implementation, that still give the panel nothing.
- **Status-bar companion fed after send.** The hint arrives after the choice stops mattering.
- **Companion with its own input box.** Single-line, needs an API key, and cannot switch the panel's model. Kept as the reopen path.

Decided with a structured review: three independent research sweeps, three proposals under different mandates, an adversarial review of each, and verification of the surviving claims.
