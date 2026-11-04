# Quality pass — 2026-11

Scope: accessibility (keyboard, focus, ARIA, contrast, reduced motion), mobile layout of the reader and sidebar, and performance on large documents. The changes are kept small and contained. No public URLs, storage keys (`zhupi.*`), deep-link format (`?pr=<n>`) or UI string values changed. No new runtime dependencies.

## Baseline

| Layer | Before | After |
|---|---|---|
| Unit (`node --test test/*.test.js`) | 405 / 405 pass ¹ | **413 / 413** pass (+4 perf guards, +4 anchor unit tests) |
| Browser (`test/run-browser.sh`: dom 38, smoke 136, deep, fail-injection, mobile 33, rail 10, mermaid 4) | all green, exit 0 (~8.4 min) | all green, exit 0 |

¹ In this session's **shallow clone**, `prepush.test.js › 纯文档 push 仍走快速通道` failed with `git rev-parse 952eedb`: unknown revision. The test pins two historical SHAs on purpose. This came from the environment, not the code: `git fetch --unshallow` made it pass. GitHub CI on `main` is green, so it doesn't affect CI. It only matters for local or agent checkouts with limited history.

## Performance

### Method

`test/perf/bench.mjs` (new, not part of the test glob) runs the **unmodified `src/` functions** in node on top of the existing `test/golden/minidom.mjs`. This is the same technique the golden export uses. The input is a synthetic long review document from `test/perf/fixtures.mjs`: 300 KB of source, 9,042 lines, 6,451 `[data-line]` blocks, 161 headings, 120 30-row tables, 30 mermaid fences and 20 diff fences. The numbers are medians of 7 runs on the session container. Use them for before/after comparison only, not as real-device timings.

```
node test/perf/bench.mjs
```

### Hot paths found

Two functions ran **on every App render**, not once per document. Every keystroke, selection change or draft edit re-renders `App`, so these costs were paid constantly:

1. **`reanchorByQuote`** (`src/ui.js`, outdated-thread loop). For each outdated review thread it rescanned every block's `textContent` and collapsed whitespace. It also ran for threads on *other* files, whose result was thrown away right after (those threads go to `otherThreads` regardless).
2. **`sectionOf`** (`DraftCard`). For each draft card it re-ran `querySelectorAll('h1,h2,h3')` and read every heading's `textContent`.

### Fix

- `anchor.js` gains `blockTextIndex(doc)` and `headingIndex(doc)`. These are snapshots, rebuilt only when the document changes. `reanchorByQuote(doc, quote, index?)` and `sectionOf(doc, line, heads?)` take an optional snapshot. Without one they behave exactly as before, so existing call sites and the DOM tests are unchanged.
- `ui.js` memoizes both snapshots on `[docTick, docPath]`. That is the same invalidation as `blockTops` and `outlineItems`, and `docTick` also bumps after mermaid hydration. The block-text snapshot is built lazily, so a document without outdated threads (the common case) never pays for it. Reanchoring is skipped for threads on other files.
- `outline.js` scroll-spy: the heading `querySelectorAll` moved out of the per-frame callback into the effect, which already remounts on every document change.

### Numbers (median ms, synthetic 300 KB document)

| Path | Before | After |
|---|---:|---:|
| `reanchorByQuote` × 20 outdated threads, **per App render** | 214–257 | **1.4** (+ 14.7 once per document to build the snapshot, only if needed) |
| `sectionOf` × 40 draft cards, **per App render** | 86–88 | **0.01** (+ 2.0 once per document) |
| `extractOutline` | 2.1 | 2.1 (unchanged) |
| `renderMarkdown` (whole document) | 44–50 | unchanged (markdown-it bound) |
| `searchIndex`, 30 PRs × 190 KB, common / rare term | 7.4 / 13.3 | unchanged (runs on Enter only; see below) |
| `lineOfIndex` × 5 at end of a 190 KB file | 1.1 | unchanged |

### Guard

`test/perf.test.js` counts operations instead of timing them, because clock-based tests are flaky in CI:

- With a snapshot passed in, `reanchorByQuote` and `sectionOf` must not touch the DOM at all. The test passes a `Proxy` doc that throws on any property read, so the old implementations fail this test by construction.
- `blockTextIndex` reads each block's `textContent` exactly once, and several quotes share one snapshot.
- The snapshot path and the live-DOM path return identical results across the long synthetic document: about 36 quotes, including nested table/row hits, misses and too-short quotes, and about 80 heading lookups.

## Accessibility and mobile

### Fixed

| Issue | Change |
|---|---|
| **No keyboard focus indicator anywhere.** The site had no `:focus-visible` rule, and the default browser ring is nearly invisible on the dark paper. | A global `:focus-visible` 2px cinnabar outline that shows on keyboard focus only. Inputs keep their existing cinnabar border as the indicator. Programmatically focused dialog panels draw no ring. |
| **Draft note "click to edit" was a `<div onClick>`**, so keyboard users could not reach or edit a saved draft. | `role="button"`, `tabIndex=0`, and Enter/Space trigger edit. No `aria-label`, so screen readers still read the note text; the existing `title` gives the hint. |
| **Dialogs (thread view, image view) lost focus on close.** Focus fell back to `<body>`, so keyboard users had to Tab in again from the top of the page. | Both dialogs remember the element that opened them and restore focus to it on unmount (`preventScroll`). |
| Sidebar search input had a placeholder but no accessible name. | `aria-label` reuses the existing placeholder string (no new strings). |
| The 待审 / 已画可 / 读毕书架 tabs and 签 filters showed their selected state only through a CSS class. | `aria-pressed` on each. |
| Indexing progress ("翻折中 n/m") was not announced. | `role="status"` on that line. |
| Outline did not expose the current heading. | `aria-current="location"` on the active TOC link. |
| **Contrast, light theme:** `--ink-soft` 4.24:1 and `--cinnabar` 4.49:1 on paper (small text; AA requires 4.5). | `#7A7062 → #746A5D` (4.63 / 4.96 on raised) and `#C03F2A` (4.60; paper-on-cinnabar buttons improve too, to 4.93). The color change is barely visible. |
| **Contrast, dark theme:** cinnabar text 4.23 / 3.93:1, and dark text on cinnabar buttons 3.93:1. | `#D2543C → #D76752`. Both directions improve, to 4.96 / 4.61. |
| `.shelf-hint` and `.qian-crumb` hint text at `opacity: .75`, which drops it to about 2.8:1. | Removed the opacity. The text is still `--ink-soft` and still visually secondary. |
| No `prefers-reduced-motion` handling. | Under `reduce`, transitions are disabled, and the search-landing flash becomes a static tint that still clears after 1.6s instead of fading. |

Spot check after the changes (Playwright on `?demo=1` at 1440, 390 and 360 px): no visible control without an accessible name, no pointer-cursor non-button click targets, `scrollWidth − innerWidth = 0` at all three widths, and Tab traversal shows the 2px ring on every stop. The existing mobile suite (33 assertions: three-layer navigation, persistent bottom bar, ≥44px touch targets) still passes.

### Recommended, not done

These were left out because each one is a larger change than this pass allows, or needs a product decision:

1. **Keyboard annotation.** Select → 涂归 works by mouse and touch only (`mouseup` / touch `selectionchange`). Supporting keyboard selection (caret browsing plus Shift+arrows) needs a deliberate trigger, such as a shortcut that opens the float for the current selection.
2. **Focus trap in dialogs.** Focus now moves into the dialog and back out on close, but Tab can still leave an `aria-modal` dialog while it is open.
3. **Images in the article are not keyboard-zoomable.** Zoom is delegated on `click` of `<img>`, which is not focusable.
4. **Sidebar tabs as a real `tablist`** (arrow-key roving and `aria-controls`) instead of `aria-pressed` toggle buttons.
5. **Dimmed groups:** `.shelf-list .pr-item { opacity: .82 }`, `.qian-chip { opacity: .85 }` and `.dash-row.zombie` put secondary meta text at about 3.3–3.5:1. These dim whole cards on purpose, so changing them is a design call.
6. **Non-text contrast:** `--rule` borders on inputs are 1.2:1 (light) and 1.4:1 (dark) against paper. WCAG 1.4.11 asks 3:1 for input boundaries. Focused inputs are fine (cinnabar border).
7. **`.wait-*` status dots** keep their literal colors on purpose: they mirror the GitHub label palette from the writer side (`menxia-mcp`). They are 7px non-text indicators and always appear next to a text label.
8. **`<html lang="zh-CN">`** stays the same when an English document variant is shown. Setting `lang="en"` on the article when an `.md` (not `.zh-CN.md`) variant is active would improve screen-reader pronunciation.
9. **Search:** `buildIndex` fetches PRs and files **sequentially**, and network latency is what dominates the first search. Bounded concurrency (for example 4) would be the real win. CPU-side, `searchIndex` re-lowercases every file on each query and `lineOfIndex` rescans from 0 for each hit. At 5.7 MB that measured 13 ms per Enter, so it was not worth changing.
10. **`renderMarkdown`** takes about 45 ms for 300 KB on the main thread. That is acceptable. If documents grow by another order of magnitude, render in an idle callback or a worker.
11. **`prepush.test.js` and shallow clones:** see note ¹. A clear skip message when the pinned SHAs are missing would make failures in a shallow clone self-explanatory. This is a test-policy call (the test deliberately fails loudly), so it was left as is.
