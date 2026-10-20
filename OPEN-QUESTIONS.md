**English** · [中文](OPEN-QUESTIONS.zh-CN.md)

# Open questions

**Rule: nothing here blocks.** Every question ships with my default answer, and I proceed on that default. Charlie sweeps the list whenever he has time and only speaks up about the ones he wants changed — no line-by-line oral exam. Answered questions move down to *Settled*.

## Open (proceeding on the default)

| # | Question | My default | Cost if you change your mind |
|---|---|---|---|
| Q1 | File the happy-doctor issue against slopus/happy? | Sitting on it, waiting for a "send it" | No cost, can file any time |
| Q2 | When do F1–F3 (summary / draft comments / one-tap accept) get scheduled? | After the M2/M3 loop is closed | Pulling F1 forward delays M2 by half a day |
| Q3 | F2's anchoring-bias mitigation | Draft comments collapse to a one-line title by default; you expand them only after your own read-through | Switching to a "blindfold first" toggle needs one more piece of state |
| Q4 | How "accept" lands in F3 | Reposted as a new comment under your name (the agent only recognizes real 涂归) | Stamping an "approved" marker instead is easier to build but the agent has to learn a second shape |
| Q5 | F1 summary structure | Two parts: "what this document says" + "what it needs you to decide" | One part is cheaper, but the decisions get buried |
| Q6 | Contents of `background.md` (used by F2) | Export a draft from memory → you edit it down | Without it, F2 can't be built |
| Q7 | M1 reading experience (type size, leading, tables, code blocks) | Current state is the default; waiting for you to use it and name what feels wrong | Style tweaks are cheap |
| Q8 | The 8/8 pilot reckoning verdict | Self-built version shipped → reckoning becomes "measure actual M1–M3 usage frequency" | — |
| Q9 | How public is the menxia repo? | Code public, content private (status quo) | Making the code private too means Pages needs a paid plan or different hosting |
| **Q10** | **The PAT and same-origin sharing (highest-severity item from the dual-track review)**: every Pages site under `charliezong18.github.io` shares one localStorage, so an XSS or supply-chain hit on the Happy fork *or* happy-beta can read menxia's token (read+write on the private review repo). M2's comment drafts have the same exposure. | **Create a free GitHub organization and move menxia there** (`<org>.github.io/menxia`) — origin fully isolated, zero cost, no code changes. A meta CSP is already in place as a stopgap. **Done 2026-10-19:** repo transferred to `menxia-reader/menxia`, site now `https://menxia-reader.github.io/menxia/`; the old address forwards (query/hash kept). | Not moving = accepting the risk, which needs to be recorded in writing. A custom domain fixes it just as thoroughly but costs a domain. |

## Settled

| Question | Verdict | Date |
|---|---|---|
| Product positioning | A review desk (render + annotate loop), not an attention inbox | 07-25 |
| Substrate | Ride GitHub free first to validate the loop → confirm the pain → build zhupi | 07-25/26 |
| Name | 御笔朱批 / zhupi | 07-26 |
| Name (revised) | 门下 / menxia — unified on Tang-dynasty terms, retiring 御笔朱批 | 07-31 |
| Platform priority | Desktop web first; mobile + PWA in v1 | 07-26 |
| Diff view | Split view is the desktop default, unified is one tap away | 07-26 |
| Tech stack | A, zero-build vanilla JS; B/C held in reserve behind the §8.1 breakpoints | 07-26 |
| v1→v2 comparison view | Not in v0 | 07-26 |
| Comment anchoring | Loose anchoring + quoted-sentence fallback | 07-26 |
| Architectural boundary for smart features | Computed offline on the agent side; zhupi only renders | 07-26 |
| Revision support | Tier 1 (rev switching) goes into M3; tiers 2/3 (diff between revs) stay in BACKLOG F4 behind trigger conditions | 07-26 |


*"朱批 / 御笔朱批 / zhupi" in the table above are legacy terms, changed to "门下 / menxia" on 7/31; the original wording is kept to preserve the record as decided.*