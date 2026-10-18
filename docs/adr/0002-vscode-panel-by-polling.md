# 0002. Support the VS Code chat panel by reading the draft on a timer

## Status

Accepted, 18 October 2026. Amends [0001](0001-terminal-first-vscode-reach.md): its reopen trigger "a cheap channel into the panel appears" fired.

## Context

ADR 0001 sent VS Code users to terminal mode because the chat panel drew no mod UI and raised no `prompt.edit`. On 18 October the installed extension was 2.1.301, and its bundle had changed:

- `extension.js` and `webview/index.js` now send `ui_attach` and `ui_render`, so the panel attaches as the `vscode` surface and draws `AbovePrompt` and `Pane`. Extension 2.1.296 had neither message.
- The panel answers `ui_prompt_read`, so `$.prompt.read()` returns the draft.
- There is still no message that forwards composer edits, so `prompt.edit` never fires there.

## Decision

While a surface other than the terminal is attached and no `prompt.edit` has been seen, read the draft with `$.prompt.read()` every 300 ms and feed changes to the same path `prompt.edit` uses. The first `prompt.edit` switches the timer off for the session, so the terminal and any surface that forwards edits never poll. The band renders in the panel through the existing `ui.render` hook.

Verified live in the VS Code panel on 18 October 2026 (Opus 5.5 session): the band drew `opus ... · covered by opus` above the box for a GTA-sized draft.

## Consequences

- VS Code users no longer need terminal mode on 2.1.301 or later.
- In the panel, a verdict can land up to 300 ms later than in the terminal, and the mod makes one `$.prompt.read()` call every 300 ms while the panel is attached. The call is local and cheap.
- If a later extension forwards `prompt.edit`, the timer switches itself off with no change to model-hint.
- Older extensions still draw nothing; the README says so.
