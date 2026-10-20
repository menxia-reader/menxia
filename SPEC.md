**English** · [中文](SPEC.zh-CN.md)

# menxia v0 spec — a reading and annotation desk

In one sentence: the AI (臣, the minister) submits a long document as a **敕草** (a draft edict); you (御, the sovereign) **select a sentence and write a 涂归** (strike-and-return, the Chancellery's mark on a draft) on the rendered text; you submit the batch in one tap, the agent replies to every comment and produces the next revision; when you're satisfied, **画可** (merge = final). The data, the versions and the review loop all stay in GitHub — this app is just a lens you can take off at any time.

Revised per comments (v2): added design renders (§1), renamed to 朱批 (§2; legacy term, changed 7/31), plain-language v1→v2 comparison view (§7), tech stack comparison table (§8), plain-language anchoring (§9), glossary (§12), references (§13). v2.2 (verbal input 7/26): switched to **desktop web first**, mobile moved to v1 (§1 / §4 / §6 / §10). v2.3–2.4: diff-document concept render + split view (§10 / §1).

**v2.5 (2026-07-26): all three open questions decided — ② no comparison view ③ tech stack A (zero-build) ④ loose anchoring accepted; added §8.1, the quantified architecture switch gate. Spec finalized, M1 begins.**

## Contents

- §1 Design renders
- §2 Name and vocabulary
- §3 Goals / non-goals
- §4 Form factor
- §5 Data and authentication
- §6 Pages and interactions
- §7 Open question ②: the v1→v2 comparison view (in plain language)
- §8 Open question ③: tech stack comparison
- §9 Open question ④: comment anchoring (in plain language)
- §10 Milestones
- §11 Risks and fallbacks
- §12 Glossary
- §13 References

## §1 Design renders

Design language: rice-paper ground + ink type + cinnabar red reserved exclusively for the act of annotating; the background carries a very faint 朱丝栏 (the vertical ruling of memorial paper) texture; headings and buttons set in a Song serif (the sovereign's voice), body text in PingFang (modern reading).

**① Desktop main view (the v0 battleground)** — document list on the left, rendered text in the middle, comment rail on the right: comments sit permanently alongside the text (Docs-style margin comments), and each card shows the 御批 → 臣回 (sovereign comments → minister replies) loop. 画可 sits top right:

![Desktop main view](assets/mockups/4-desktop.png)

The three below are mobile designs (v1; kept here as drafts):

**② List page, "documents awaiting comment"** — one card per document, a cinnabar spine on the left = waiting on you; a square seal marks the status:

![List page](assets/mockups/1-list.png)

**③ Reading page** — rendered body text, annotated sentences carry a cinnabar brush stroke, "submit 涂归 · n" is pinned to the bottom:

![Reading page](assets/mockups/2-read.png)

**④ Comment entry (mobile)** — after selecting, a comment sheet rises from the bottom: the quotation (with its source line number) + an input + save/discard:

![Comment entry](assets/mockups/3-annotate.png)

(Mockup sources are in `assets/mockups/src/`; real development adjusts against these.)

## §2 Name and vocabulary

Named **门下** (menxia, the Tang-dynasty Chancellery): repo `menxia`, site `menxia-reader.github.io/menxia` (moved 2026-10-19 from `charliezong18.github.io/menxia` to its own org for origin isolation — see Q10; the old address forwards), PWA home-screen name 门下. Edicts issued from the Secretariat passed through the Chancellery, which read and struck them (涂归) and then either marked them permitted (画可) or sent them back — which is exactly what this product does.

*History (renamed 2026-07-31, original text preserved): "Named **朱批** per your direction (full product name 御笔朱批): repo `zhupi`, site `charliezong18.github.io/zhupi`, PWA home-screen name 朱批. Alternatives considered: 批红 (the Ming-dynasty practice of the eunuch directorate annotating on the emperor's behalf — dropped, too much "ghost-written by a eunuch"), 奏对, 御览 — 朱批 is the most precise: the action *is* the thing you do." Those are legacy terms, changed 7/31: 朱批 is a Qing-dynasty word that clashed with the rest of the Tang-dynasty naming, so the whole set was replaced (glossary finalized in review #50). The old address `…github.io/zhupi/` survives as a forwarding shell (since 2026-10-19 it forwards straight to `menxia-reader.github.io/menxia/`), so historical deep links keep working.*

The mapping from interface vocabulary to what happens underneath (one vocabulary across the whole app; learn it once):

| Interface term | Underlying action |
|---|---|
| 敕草 (draft edict) | a document in one open PR in the review repo |
| 涂归 (strike-and-return) | an inline review comment, anchored to a specific sentence |
| 判 (a ruling on the whole draft) | a conversation comment on the whole document — e.g. your numbered lists of feedback |
| 提交涂归 (submit) | submit the accumulated comments as one review |
| 画可 (writing 可, "permitted") | squash merge; final |
| 作罢 (let it go) | discard this half-written comment |

判 is a first-class citizen newly proposed in v2: across two live trials you spontaneously used "numbered list of opinions" general comments both times. That habit goes straight into the product rather than being treated as a fallback.

## §3 Goals / non-goals

Goals (all of v0):

- Read AI-authored markdown comfortably on a phone — rendered, not diff source
- Annotate sentence by sentence as you read, write a general comment at any point, hand the whole batch back in one tap
- A 画可 button you can actually press
- Kill the known PAINs one by one:

| PAIN (from the pilot) | The menxia fix |
|---|---|
| `approve` blocked by "author cannot approve" | ships its own 画可 = merge |
| comment entry isn't discoverable | select text → comment. The one main interaction |
| markdown diff doesn't render | renders the document, only |
| external links drop you into a logged-out 404 | renders in place + PWA, never links out |

Non-goals (frozen for v0 — not built even if requested): feed ranking / unread management / push notifications (the rejected attention inbox); multi-repo browsing and code diff (not in v0, but listed as the v1 north star, see §10); AI integration (the review-loop skill owns the agent side entirely; menxia doesn't know AI exists); editing documents (read + annotate only).

## §4 Form factor

- A purely static single-page app hosted on GitHub Pages: a new public repo, `menxia`
- Code public, content private: the page contains no data and no secrets; documents are fetched live by the browser with your token
- **Desktop web first** (v0): a wide two-column layout (document list + reading area) + a right-hand comment rail; keyboard shortcuts like ⌘Enter to submit
- Mobile + PWA moved to v1 (the phone designs are ready — see §1, figures ②③④)

## §5 Data and authentication

- One data source: a single review repository (on my machine, `charliezong18/review`, private); the browser talks to `api.github.com` directly (CORS is officially enabled). **As of 2026-07-26 the repo is entered on the settings page and stored in localStorage rather than hardcoded** — otherwise people who fork it would have to edit code, and the README's fork SOP wouldn't hold.
- Authentication in plain language: generate a key in the GitHub backend that is **valid for the review repo only** (a fine-grained PAT with three permissions ticked: Contents and Pull requests as Read and write, plus Actions as Read-only so the app can read the house-style check status. ⚠️ Not Checks: **fine-grained PATs have no Checks permission** — the line in GitHub's endpoint docs is boilerplate from the GitHub App permission model — so the status is read from workflow runs rather than check runs), paste it once the first time you open the app, and it lives in the phone browser's localStorage. The key passes through no server and is sent to nobody; if you lose the phone, revoke it on GitHub in one click.
- No backend, no third-party requests, no analytics.

## §6 Pages and interactions

**List page**: a list of open PRs (title / submission time / comment count / status seal); manual pull-to-refresh (no backend, no push — acceptable in v0).

**Reading page**: fetch `docs/*.md` from the PR's head branch and render with markdown-it (tables, code blocks, task lists all supported); reading typography = 17px body, a maximum line width, 1.8 line height, dark mode following the system; 画可 at the top, "submit 涂归 · n" at the bottom.

**Annotating**: select text → a card lands in the right-hand comment rail (§1 figure ①, alongside the text; mobile v1 uses the bottom comment sheet, figure ④); comments are accumulated as local drafts first (localStorage, so a half-written comment can't be lost), and annotated sentences get a pale cinnabar highlight; "submit 门下" writes the whole batch back as inline comments on that PR; the 判 entry point is permanently in the top bar.

**Closing the loop**: the reading page shows existing comment threads plus the agent's point-by-point replies (so when v2 comes back you can read how each one was handled); 画可 pops one confirmation and then squash merges, and the document disappears from the list.

## §7 Open question ②: the v1→v2 comparison view (in plain language)

The scenario: you left 10 comments on v1, I revise and submit v2. When you re-read v2, there are two postures —

- **A. No comparison view (the v0 plan)**: you simply re-read the rendered version; under each 涂归 is my reply ("done, section 3 rewritten"), and you locate the changes via the comment threads. Cost = you re-read, or skim by following the replies.
- **B. Build a comparison view**: paragraphs in v2 that changed relative to v1 are highlighted automatically (like Word's track changes). Lovely, but it means paragraph-level diffing on rendered output plus the UI — the single most expensive piece in v0.

The question is exactly: **is A enough for you?** My recommendation: use A in v0, and add B in v0.5 if it genuinely feels missing — by then there's real usage data showing how you actually hunt for changes on a re-read.

**✅ Decided (2026-07-26): v0 uses A (no comparison view)**, with B held for later, on demand, after real usage.

## §8 Open question ③: tech stack comparison

| | A. Zero-build: vanilla JS + markdown-it (recommended) | B. Preact + Vite | C. React + Next |
|---|---|---|---|
| What it is | No framework; a few hand-written JS files, with the render library vendored into the repo | Mini React (3KB) + a modern bundler | The full kitchen sink |
| Development speed | Medium (interactions hand-written, but v0 has very little state) | Fast (componentization is convenient) | Fast, but a cannon for a mosquito |
| Maintenance cost | **Lowest: zero dependency chain; open it in two years and it still runs** | Medium: dependencies need version upkeep | High |
| Deployment | Push is deploy (Pages serves the source directly) | Needs a build step (run in Actions) | Needs a build, and it's heavy |
| Fit for this project | v0 has three pages and almost no state — a good match | If v1 grows complex interactions, migrating then is soon enough | Rejected |

The core case for A: this is a **small tool you personally use for ten years**, not an engineering project that needs to onboard people — fewer dependencies means never hitting the "npm install won't install two years later" graveyard. The cost: interaction code is a bit more verbose than componentized code, and the extra time is mine, not yours.

**✅ Decided (2026-07-26): A. B/C are retained as future options, triggered by the breakpoints below.**

**🔔 Tripped and executed (the same night, 2026-07-26)**: the M2 ledger put #3 over the line, and the guards added after review put #8 over the line → the two-indicator gate was live, so per the rule we migrated to B. **The executed form deliberately departs from the literal B in one place**: htm/preact standalone (a single vendored 13KB file) rather than Preact+Vite — what the gate is treating is the mental load of "hand-written DOM sync + async timing" (both bugs the review caught live in that layer), so what's needed is a reactive view layer, not a bundler; going build-free preserves A's most valuable property (push is deploy, zero dependency chain, still runs in ten years). If JSX/TS is ever needed, Vite goes in then — and that counts as changing toolchains, not architecture. The migration record and post-migration measurements are in MIGRATION-WATCH.md.

### §8.1 Architecture switch breakpoints (the quantified gate)

A zero-build approach fails with clear warning signs. Tripping **any two** means A has run out of road: feature work pauses and the A→B (Preact + Vite) migration happens first. Tripping only one means record the observation and leave the architecture alone. Check against this table at the end of each development session and write anything over threshold into `MIGRATION-WATCH.md`.

| # | Indicator | Threshold | Why this number |
|---|---|---|---|
| ~~1~~ | ~~Largest single file~~ | **Demoted to a descriptive stat, 2026-07-28** | Splitting into components lowers complexity while raising line count — the metric points the opposite way from the goal. And across the whole record, line-count metrics never once predicted a bug. Still printed by pre-push as a trend; no longer a trigger. |
| ~~2~~ | ~~Total application lines~~ | **Same demotion, 2026-07-28** | Same as #1. It first "fired" on the very day the component split landed — a gate that punishes the right behaviour isn't a gate. |
| 3 | Hand-written DOM update sites | > 25 `innerHTML` / `appendChild` / attribute-sync sites on one page | The most direct signal of "time for a reactive framework" |
| 4 | Number of state sources | > 6 independent states needing cross-page sync | Hand-written subscriptions start costing more thought than a framework |
| 5 | Repeat render bugs | the same class of "the view didn't keep up with the data" bug fixed ≥ 3 times | A symptom-level signal, harder evidence than code volume |
| 6 | Blast radius of one change | adding one small feature touches ≥ 4 files **and total source files > 8** | Indicates missing component boundaries (without the second clause, a 4-file repo false-positives daily) |
| 7 | ~~First paint > 1.5s~~ | **Deleted (2026-07-26)** | A zero-dependency static page can't reach this line, and the actual causes of slow loading (content, images) aren't cured by a framework — it isn't measuring "should we adopt a framework" |
| 8 | **Async race guards** | > 3 sites needing hand-written "discard stale response / cancel" | What actually forces you onto a framework is concurrent writes, not line count (openPR consumed site #1 that same day) |
| 9 | **Optimistic-update rollback** | > 2 operations needing a rollback path | M2's comment drafts + submit-failure rollback are the first of these |

The counting rule for indicator 3 has to be honest: `innerHTML` / `appendChild` / attribute sync, **all three categories combined**, not innerHTML alone (the first entry undercounted; corrected in MIGRATION-WATCH).

**Cost estimate for a triggered migration**: the anchoring algorithm, the GitHub API wrapper and all the styling port over unchanged (those three are the bulk of the code); only the view layer is rewritten. The original "half a day to a day" estimate was optimistic — the genuinely expensive part is prying state out of the event closures it's scattered across. Which is why **the hedge worth doing whether or not you migrate** is: a single state object + an explicit `render()` + generation-counter guards (a poor man's one-way data flow, about 50 lines).

**C (React + Next) has its own separate trigger**: only consider it when menxia needs a **server** (push notifications, multi-person collaboration, a non-GitHub data source) — at which point the product's form has changed, not the architecture's capacity. Not evaluated within v0/v1.

### §8.2 Backend trigger conditions (when zero-backend stops being right)

§8.1 governs "does the view layer need a framework". This one governs "does this thing need something alive". The most valuable property today is that **there is no living dependency** — no server to keep fed, no key to rotate, no "it's down so I can't read my documents". A static site still opens in ten years; a service needs someone alive forever.

There is exactly one test question: **is this structurally impossible in a browser?** "It's annoying to build" doesn't count; "needs a long-running process", "needs a hosted secret", "needs to receive external events" do.

Re-evaluate adding a backend only when **any one** of these fires (full evaluation lives in the review repo at `docs/zhupi-thin-backend-eval.md`):

| # | Trigger | What counts as evidence |
|---|---|---|
| S1 | Live Q&A is genuinely needed | ≥5 occurrences over two consecutive weeks of "wanted to ask mid-read but had to go elsewhere", where the answer depends on the current document's context |
| S2 | GitHub stops working as the store | A class of data that **must persist but cannot fit into a PR / comment / file** appears (drafts, sign-offs, comments and revisions all fit — verified one by one) |
| S3 | Latency actually hurts | GitHub Actions' minute-scale delay causes ≥3 real misses (not "feels slow") |
| S4 | A second real user exists | Not "someone might use it later" — someone is using it and has hit something a single static site can't solve |

**While none of these hold, any "should we add a backend" discussion is closed by citing this section.** First evaluation, 2026-07-28: of four candidate capabilities (push notifications / cross-device drafts / multi-person sign-off / in-app live Q&A), three are solvable in the pure-static tier and the fourth is an unvalidated need → **don't build it**.

If that day comes, the shape is decided in advance: a stateless Worker (Cloudflare first choice), **never touching the GitHub token** (the user's PAT stays in the browser, always), no user system (identity is always GitHub), graceful degradation to pure-static when the function is down, and a separate repo and deployment so the static site can always survive alone.

### §8.3 Leave-GitHub gates (M1–M3) (review #129 → #145 approved, folded in 2026-08-18)

§8.1 governs the view layer, §8.2 governs adding a layer; this section governs **replacing the root**. GitHub currently does six jobs (frontend hosting / document storage via git / folders & annotations via PR·comments / identity via PAT / permissions via collaborators / free + zero maintenance); this section governs when the first five get replaced. **Migration is ordered by gates, not version numbers** (#145 D2): with only our own people using it, the current stack runs for ten years; the day strangers use it, it changes on day one — no gradient in between.

| Gate | Trigger | What counts as evidence | Tier it opens |
|---|---|---|---|
| **M1** | Universal Links fail on `github.io` | iOS M1 measurement: AASA in place yet developer-mode direct fetch fails, or production-mode Apple CDN rejects `application/octet-stream` | V2 (own domain — nameplate only) |
| **M2** | ≥1 non-GitHub user appears who must **read and write** folders | A real person needs to read and annotate, and has no GitHub account or can't be granted private-repo access. Not "someday someone might" | V3 (storage abstraction — zero data moved) |
| **M3** | Productization verdict = serve strangers | An explicit product decision, not a technical signal. This gate is live (productization restarted 2026-08) | V4 (own infra — **a living dependency from then on**, deliberately trading §8.2's opening property for "others can use it") |

Three riders (also settled in #145):

1. **V3 (storage abstraction) does not wait for M2 — do it early** (D3): the Adapter pays for itself (tests can run on fake data), is reversible and moves no data, and downgrades V4 from "rewrite" to "add a driver." **Abstract only the hosting/identity/permission layers; never git storage or the PR/comment model** — abstraction tax for a day that most likely never comes.
2. **M1's fallback is the `menxia://` custom scheme first** (D4) — works in a day, but only for links emitted by our own agents; the own domain waits until truly needed (it is V2's nameplate, not an M1 prerequisite).
3. While no gate rings, any "should we migrate" discussion **cites this section and closes** (same convention as §8.2). Criteria must be falsifiable; "it's annoying" doesn't count.

The `MIGRATION-WATCH` measurement table is **not extended** — M1–M3 are event gates, not measurement gates; there is no "measure after every dev session" here.

## §9 Open question ④: comment anchoring (in plain language)

First, an extension of §8: **can A (zero-build) do sentence-level annotation?** It can — every capability sentence annotation needs (selecting text, getting the selection's position, injecting a highlight, positioning the rail cards) comes from the browser's **native** Selection API and DOM operations; a framework doesn't provide that layer. Hypothesis, the benchmark product, implements its annotation layer with native DOM injection. What a framework helps with is "automatic view refresh under complex state", and menxia's state is one list of drafts. The genuinely hard part is the anchoring algorithm below — and that code is word-for-word identical under A or B.

"Anchoring" = you select a sentence on the rendered page, and the system has to work out **which line** of the source markdown file it corresponds to, in order to write it as a GitHub inline comment (GitHub pins comments to line numbers).

An example of the flow: you select "the lens can be taken off at any time" → the system searches the source file for that sentence → the unique match is on line 3 → the comment is pinned to line 3.

Two failure modes and their fallbacks:

1. The sentence appears twice in the document → pin to whichever occurrence is nearest your reading position.
2. It can't be located at all (e.g. the selection spans several elements) → pin to the nearest heading line for that section.

**Whether or not the pin is accurate, the comment body always carries "> the sentence you selected"** — even if the line number lands wrong, both you and the agent can see which sentence is being discussed. The meaning is never lost. That's what "loose anchoring + quoted-sentence fallback" means. The question: **is that precision acceptable?** (Pixel-perfect accuracy is far heavier and isn't worth it in v0.)

**✅ Decided (2026-07-26): accepted.**

### §9.1 Anchoring implementation correction (2026-07-26, after the dual-track review)

The original approach — "search the source file for the selected text to get the line number" — has a flaw that **fails on the main path first**: rendered text differs from source. `**bold**`, `` `code` ``, `[link](url)` can't be found by searching what you selected, and nearly every paragraph in this project's documents has inline formatting. Corrected to:

1. **Primary anchor = DOM line number**: read the line number directly from the selection node's `closest('[data-line]')` — no search, unaffected by formatting. The renderer already stamps `data-line` and `data-line-end` onto paragraph / heading / list_item / table / **tr (table row)** / blockquote / fence / code_block (`tr_open` and `code_block` carrying a map has been verified locally).
2. **Text search demoted to verification**: check the quotation against the vicinity of that line; a hit confirms it, a miss still defers to the DOM line number.
3. **Quoted fallback unchanged**: the comment body always carries `> the original sentence`.
4. Exact line inside a fence = the fence's `data-line` + the newline count of the text preceding the selection.

**Three hard constraints on the GitHub side (not discussed in the original spec; M2 must handle them)**:

- **Only lines that appear in the PR diff can carry an inline comment**, otherwise 422. This works today because documents are files newly added by the PR (the whole file is in the diff) — an implicit premise. The north star's code PRs (which modify existing files) will hit this wall on day one.
- **Submitting a review is atomic**: if any single comment in `POST /pulls/{n}/reviews` has an invalid line number, the entire batch dies. So the batch must be validated locally before submitting — parse the hunks from the `patch` field returned by `listPRFiles` and you know which lines are commentable; invalid ones automatically degrade to a 判.
- **Draft PRs can't be merged**, so 画可 needs them marked ready first; REST can't change the draft field, that requires GraphQL, and **fine-grained PAT support for GraphQL needs testing**. If it doesn't work, the cheapest fix is to abandon draft in the convention (draft never bought anything in a private single-person repo). **✅ Handled (2026-07-26): the review-loop convention abandons draft (new documents are always ordinary PRs); for pre-existing draft documents the app tries GraphQL markReady before merging, and on failure hands you fallback wording to take back to Happy.**

## §10 Milestones (each step ships a playable link)

1. **M1 skeleton** ✅: token settings page + desktop two-column layout (document list + reading area) + rendered reading — make *reading* comfortable first
2. **M2 涂归** ✅: select → accumulate comments in the right-hand rail → hand the batch back in one tap (including 判)
3. **M3 the loop** ✅ (2026-07-26): comment threads and replies displayed, 画可 (already shipped in M2.5), and **rev switching** (F4 tier 1: list versions from PR commits + a version dropdown on the reading page; read-only, no comparison). Implementation notes: threads attach to the current document via `line ?? original_line`, outdated ones are marked 旧, threads for other documents collapse into an "other N threads" group; switching to an old rev is read-only (no floating comment button, no draft highlights, 画可/submit disabled, a subtle notice at the top). All 5 `?demo=1&auto=1` smoke checks green. The migration structurally eliminated DOM update sites — M3's new features tripped no gate indicator at all (details in MIGRATION-WATCH)

**v1: mobile + PWA** (input 2026-07-26: the main review battleground is the computer, so desktop goes first; the phone designs in §1 figures ②③④ stay as drafts).

**North star (scheduled after v1): diff documents** — real code PRs enter the same list, with the same 涂归/判/画可 semantics. This is the complete form of "design and diff share one entry point and one format" (the main ask added in a verbal 判 on 2026-07-26); make the markdown-document half solid first. Concept render (the same right-hand comment rail landing on code lines; colour rule: **cinnabar belongs to the sovereign's annotations only**, added lines use tea-green, deleted lines use an ink strike, so nothing competes with the comments for red):

![diff document · unified view (north star concept)](assets/mockups/5-diff.png)

**Split view is the desktop default**, with a one-tap "unified / split" toggle in the top bar (input 2026-07-26: Charlie prefers side-by-side when reading diffs). Old on the left, new on the right; deleted lines struck in ink, added lines in tea-green, placeholder blocks hatched to mean "no corresponding line on this side"; 门下 still lands on lines on the **new side** (GitHub's inline comments only recognize new-file line numbers), and the right-hand comment rail is unchanged:

![diff document · split view](assets/mockups/6-diff-split.png)

Narrow screens (<1280px) fall back to unified automatically — split view squeezing two columns of code plus a comment rail compresses the code past readability. That's why v1 mobile naturally has unified view only.

## §11 Risks and fallbacks

- Anchoring precision is the biggest technical risk → §9's loose anchoring + quoted fallback
- The PAT in localStorage → lose the phone, revoke on GitHub in one click; blast radius = one private repo
- API quota: 5000 requests/hour once authenticated — no pressure at personal reading volume
- menxia itself goes down → fall back to the GitHub web UI, zero data loss

## §12 Glossary

| Term | Meaning |
|---|---|
| PAT | Personal Access Token, GitHub's personal key; fine-grained = the granular version scoped to a single repo |
| CORS | The browser's cross-origin permission mechanism; GitHub's API enables it, which is what lets page JS connect directly |
| localStorage | The browser's built-in local store; data lives only in this browser on this device |
| PWA | A web page that can be "added to the home screen" and used as an app |
| markdown-it | The JS library that renders markdown text into HTML, compatible with GitHub's syntax (GFM) |
| vanilla JS | "Plain JS", no framework |
| Preact / Vite | Mini React / a modern frontend bundler |
| squash merge | Compress all of a PR's commits into one and merge into main |
| inline comment | A GitHub comment pinned to one specific line |
| anchoring | The process of converting the sentence you selected into a source line number (§9) |

## §13 References

- GitHub REST API: [PR comments](https://docs.github.com/en/rest/pulls/comments) / [PR reviews](https://docs.github.com/en/rest/pulls/reviews)
- [GitHub Pages docs](https://docs.github.com/en/pages)
- [markdown-it](https://github.com/markdown-it/markdown-it) (the render library)
- [Hypothesis: Fuzzy Anchoring](https://web.hypothes.is/blog/fuzzy-anchoring/) — the classic precedent for web annotation anchoring; the source of §9's approach
- [W3C Web Annotation Data Model](https://www.w3.org/TR/annotation-model/) — the standard shape for annotation data; v0 borrows the concepts without adopting it wholesale
- [MDN Selection API](https://developer.mozilla.org/en-US/docs/Web/API/Selection) — the native browser capability behind "select text"
- [Preact](https://preactjs.com) / [Vite](https://vitejs.dev) (option B in §8)
