# Changelog

## 0.5.0, 15 October 2026

- Faster verdicts: the pause before the judge drops from 600 ms to 300 ms, and a draft judged once in the session answers instantly from a cache. Live, the verdict now lands 1.2 to 1.9 s after the last keystroke (median about 1.5 s), down from about 2.1 s.
- The debug log times every verdict, split into the pause and the judge call.

## 0.4.1, 14 October 2026

- **Retraction.** 0.4.0 said the VS Code chat panel shows the hint on the status line. It does not: the panel sends no keystroke events to mods, so nothing triggers it. The README now has a "Where it runs" table and a four-step VS Code setup through terminal mode. See [docs/adr/0001](docs/adr/0001-terminal-first-vscode-reach.md).
- Live judge check recorded: 10 of 10 prompts matched the expected tier; a verdict lands about 2.1 s after typing stops.
- Added "Why not just route automatically" to the README.

## 0.4.0, 12 October 2026

- Status-line fallback on surfaces with no band.

## 0.3.0, 12 October 2026

- No tier shown until the model has read the draft; the verdict always shows, with Switch only when the session's model does not cover it.
- A failed model pass is named in the band and logged.

## 0.2.0, 12 October 2026

- Model pass: a small model reads the draft after a 600 ms pause.

## 0.1.0, 12 October 2026

- First release: word-rule hint in a band above the prompt.
