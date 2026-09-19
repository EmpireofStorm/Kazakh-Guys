# CLAUDE.md — Orbit (Coding Environment Module)

This file is the working reference for anyone — human or Claude — picking up
this project. It covers the developer-facing "coding environment" module
specifically: the Security scanner and the Graph Dev / Orbit map, and how
they connect. It's one module inside a larger company-world vision that also
includes Precedent (onboarding) and PolicyPulse (regulatory compliance) —
those are referenced for context but are separate modules with their own
specs.

Working name for this module: **Orbit**. Rename freely — nothing in the
code should hard-depend on the name.

---

## 1. Vision

**In one sentence: this product automates security debugging.** Not "finds
bugs" and not "suggests a fix" as two separate, disconnected steps — the
actual thing being automated is the debugging loop itself: try a fix, check
if it breaks anything, if it does try a different fix, repeat until one
works, then stop. That loop, done by a person, is what security remediation
actually looks like day to day. Automating it means automating the trying,
not just the finding.

Most "AI dev tools" either write code or find problems. Almost none of them
close the loop between the two: tell you a vulnerability exists, and then
let you fix it *without breaking something else you can't see*. Orbit is
built specifically to close that loop, visualized as a live 3D universe of
the company's codebase rather than a dashboard, because the actual value
here — "here's what this change touches, before you make it" — is
inherently spatial and relational, and a graph rendered in 3D communicates
that faster than a table ever will.

Guiding principle for every feature decision: **automate the diagnosis and
the drafting, never the deploy.** A human always approves the thing that
actually ships. This isn't a hedge — it's the design that makes the tool
trustworthy enough to actually use on a real codebase, and it's also
demonstrably how the strongest comparable product in this space (Gitdefender,
2026 GitLab AI Hackathon Grand Prize winner: finds a bug, writes the fix,
opens the code review — no auto-merge) is built.

Second principle, learned the hard way while building the demo (see §5.2.3):
**prefer deterministic fixes over LLM-generated ones wherever a vulnerability
class is well-understood enough to allow it.** The LLM's job shrinks to
where it's actually needed — proposing a fix when no known-good pattern
applies, and deciding how to react to a failed attempt — not generating
every patch from scratch.

---

## 2. Current status (as of this doc)

Everything below is one consolidated, self-contained page —
**`orbit-platform.html`** — not separate demo files. It has three views (Hub,
Security, Graph Dev / Orbit) sharing one header and one live 3D scene.

**The example company the demo runs against is "Tallybird"** — a fictional
small B2B project-management SaaS startup, chosen deliberately to match this
product's actual target customer (small startups with no dedicated security
team), not a large regulated enterprise. Tallybird's architecture is 18
modules with 28 real dependency edges: a web app and mobile gateway, a
central API gateway, core services (auth, users, tasks, billing,
notifications, file uploads, search, webhooks), a background job worker, an
admin dashboard, an analytics service, two databases, a cache, and a CI/CD
pipeline. Eight findings are seeded, one per attack category, spread across
genuinely different modules — and every blast radius shown for every fix
candidate is derived from Tallybird's *actual* graph edges, not
hand-picked to look plausible. This matters: when a candidate fix's ripple
touches a second or third file, that's because those files are really
connected in the data, which is what makes the exploration visualization
mean something.

Built and working:
- **Hub** — landing view, two portals (Security / Graph Dev), each showing a
  live stat pulled from the dataset.
- **Security** — attack-category picker, a per-category test visualization
  (queued → testing → found N / clear, run sequentially by choice, not by
  requirement — see §3.4), and a findings list with live status per finding.
- **Orbit / Graph Dev** — the 3D scene (18 bodies, 28 lanes), click-to-select,
  a manual blast-radius "Run Scan," and a full **Fix Explorer** mode (see
  §3.3) that takes over the screen when resolving a finding.
- **Fix Explorer** — camera-driven, multi-hop graph exploration with
  backtracking, a post-fix **test verification phase** (including a
  scripted retry-on-failure case, so the demo shows a test genuinely
  failing and the system adjusting before it passes), and a **terminal /
  code-style view** toggle that mirrors the same event stream as plain
  text for people who'd rather read it than watch it.
- **In-graph code viewer/editor** — open any module's source, see it
  syntax-highlighted, edit and save it directly from Orbit.

Not built: any real backend. Detection, test generation, fix generation, and
verification are all currently scripted/mocked data — see §5.2 for the full
design of what a real version looks like, worked out in detail for SQL
injection as the first attack category.

Sibling modules, still separate: **PolicyPulse** (`policypulse-demo.html`,
regulatory change monitoring) and **Precedent** (onboarding built from
predecessor mistakes) — both share the same "detect → map impact → suggest
fix → human reviews" shape as Orbit but are not part of this module's code.

---

## 3. The two rooms

### 3.1 Security (diagnose)

- User selects one or more attack categories to test against Tallybird's
  codebase. Category list (naming only — no exploit content lives in this
  repo or this doc): SQL injection, cross-site scripting, broken access
  control / IDOR, authentication bypass, server-side request forgery,
  insecure deserialization, known-CVE dependency scanning, hardcoded-secret
  exposure.
- Agent runs the selected tests (hackathon stage: mocked; real stage: see
  §5.2.1) and returns findings, each tagged to a specific module/file, with
  severity.
- Each finding has one action: **Auto-resolve** — opens the Fix Explorer
  (§3.3) with that module and finding loaded. There is no more direct
  "here's a suggested fix" shortcut; everything routes through the explorer
  so the fix is always shown as something that got searched for and
  verified, not asserted.
- A finding's status tracks through: `open → testing candidates →
  verified-safe → resolved` (a manual save in the code editor can also reach
  `resolved` directly). Nothing reaches `resolved` by assertion — either a
  human saved an edit, or the verification-tests phase actually passed.

### 3.2 Orbit / Graph Dev (treat)

- Every module is a body in a 3D scene; every dependency is a lane. Click
  any body to select it and either run a manual blast-radius scan or open
  its source in the code viewer/editor.
- **Fix Explorer mode**: entered via Security's Auto-resolve, or reachable
  from any finding. The side panel collapses, the graph becomes the full
  screen, `OrbitControls` is disabled so a scripted camera can move without
  fighting the user's mouse, and the camera flies between whichever bodies
  are currently relevant — see §3.3 for exactly what "relevant" means and
  §4 for the camera-framing rule that keeps the whole graph visible instead
  of zooming in tight.
- **Apply still never means deploy.** In this demo, "apply" means save the
  file locally. The real-product equivalent (§5.2.6) is opening a pull
  request, not merging one.

### 3.3 The integration loop — the Fix Explorer

Three real bugs surfaced while building this, and all three are fixed now.
They're worth keeping here, not just in a commit message, because someone
extending this code could easily reintroduce any of them without knowing
why the current design avoids them.

**Bug 1 — exhaustive testing instead of stopping at success.** The first cut
tested every candidate regardless of outcome, even after one was already
verified safe. Fixed: the sequencer breaks the loop the instant a candidate
comes back `safe`, and marks any remaining untested candidates `skipped`
rather than silently dropping them — the point is to show the search
stopped on purpose, not to hide what it didn't need to try. Candidate order
is deliberately varied per finding (some succeed on attempt 1, some take all
3) so this is actually visible rather than looking identical every time.

**Bug 2 — Orbit's manual "Run Scan" contradicted the Explorer's verdict.**
The Explorer's per-candidate test and Orbit's manual blast-radius scan were
two unrelated computations, so the Explorer could say "0 modules affected"
and then manually scanning that same module straight after would show
red/amber neighbors anyway — a different question ("what's structurally
adjacent") being mistaken for the one the user actually cared about ("did
the verified fix hold"). Fixed with `verifiedImpact[moduleId]`: once a
module is verified safe, Orbit's Scan button checks this first and reports
the *verified* result instead of re-running the raw structural BFS as if
nothing had happened. Before verification, Scan still shows the honest
full structural baseline. The two mechanisms can no longer disagree.

**Bug 3 — no camera framing, and no confirmation that a fix actually
worked (both fixed together, see below and §4).** Two separate pieces of
feedback led to a materially better loop, described next.

**The current loop, in full:**

1. User runs a Security scan → gets findings.
2. User picks a finding → **Auto-resolve** → Fix Explorer opens, full
   screen, camera centered on the origin module.
3. **Search phase**, one candidate at a time, not in parallel and not
   exhaustively:
   - Camera flies to the origin. Candidate strategy is tested. If it
     affects zero modules, it's adopted immediately (see step 4).
   - If it affects a connected module, the camera flies *there*, a bright
     trail line is drawn along the path taken, and the Explorer attempts a
     **compensating patch in that second file** — this is the multi-hop
     part: the search doesn't just reject a strategy because it touches
     something else, it tries to fix the something-else too, up to a
     bounded depth (currently 2 hops: origin → connected file → that
     file's own neighbor, then stop regardless of outcome).
   - If the compensating patch resolves cleanly, the whole two-file
     strategy is kept as a **fallback** and the search keeps going, still
     hunting for something that touches only one file.
   - If it doesn't resolve — if the compensating patch would itself
     cascade into a third file — that third node flashes too, and then the
     path visibly **backtracks**: nodes reset, the trail clears, camera
     returns to the origin, and a different top-level strategy is tried.
4. The moment a strategy is verified with zero modules affected, the search
   stops. If none ever clears zero-impact, the best verified fallback is
   used instead; if nothing verifies at all, the Explorer says so plainly
   and leaves it for a person.
5. **Verification-tests phase (new — this did not exist in the first cut,
   and its absence was the actual gap in the original design).** Finding a
   fix does not end the process. The adopted candidate moves into "Running
   verification tests against the fix..." — a short suite of named tests
   specific to that module, revealed one at a time. One finding is
   deliberately scripted so a test **fails on the first pass**, triggers
   "adjusting the fix," and passes on retry — the point being to actually
   show the retry loop, not just claim it exists. Only after every test
   passes does the finding reach `verified-safe` and the "View verified
   fix" action appear.
6. **Two ways to watch all of this, same underlying event stream.** A
   compact HUD panel narrates the search in plain language; a toggleable
   **terminal panel** mirrors the exact same events as verbose, code-styled
   text (`$ testing strategy: ...`, conflict lines, abandon/backtrack
   lines, the test run). Both update continuously regardless of which one
   is open, so switching to the terminal mid-run shows full history, not
   just what happens after opening it.

Implementation note: the search reuses `setNodeColor`, `ping3D`, and the
existing node/edge data directly, driven by a sequencer and a camera-flight
interpolator, rather than being a second, separate visualization system.
Keep it that way — a parallel graph implementation is what caused Bug 2.

### 3.4 The security scan itself — same principle, different shape

Attack categories are independent of each other, so there's no "stop early"
logic here the way there is in the Fix Explorer — every selected category
gets checked, not just the first one that finds something. What the UI shows
instead is per-category visibility: each selected category gets its own
card (queued → testing → found N / clear), run in sequence *by choice* — a
real scanner would likely rate-limit concurrent scans, not because the
checks have to be sequential. Worth saying plainly in a pitch: nothing here
assumes sequential execution is required architecturally.

---

## 4. Visual system — the universe

- **Metaphor mapping**: module = celestial body; dependency = lane between
  bodies; running a scan = an expanding pulse from the origin body; a
  multi-hop fix search = a camera that actually travels between bodies with
  a visible trail, not just a color change.
- **Camera framing rule — learned from a real regression, keep this
  invariant.** The camera must never zoom in tight on an individual body
  during exploration. The first cut flew to a close offset from each active
  node and lost the rest of the graph in the process, which defeats the
  entire point of a graph visualization ("watch it move through the whole
  system"). The fix: keep a wide, roughly constant viewing distance at all
  times (currently ~480 units, matched between the resting camera and every
  scripted fly-to), and only shift the *look-at point* partway toward
  whatever's active. Any future camera work should preserve "the whole
  graph stays visible" as a hard constraint, not a nice-to-have.
- **Label sizing** — module-name sprites are deliberately small (current
  font size 26px, scale factor 0.24) after an earlier pass made them
  dominate the scene. Labels should read as labels, not headlines.
- **Two presentation modes, one event stream**: the cinematic 3D view and
  the plain-text terminal view are not separate features with separate
  logic — every step of the search calls both a HUD-narration function and
  a terminal-log function. Don't let these drift apart; if a future change
  adds a new kind of event, it needs a line in both.
- **Engine**: Three.js, `OrbitControls` for manual rotate/pan/zoom
  (disabled during a scripted Fix Explorer run, restored after),
  raycasting for click-to-select.
- **Palette**: background `#050709`, cyan `#4FD6FF` (idle/neutral/safe),
  red `#FF4B4B` (will break), amber `#FFB84D` (needs review), slate
  `#3A4B5C` (unaffected/dim), violet `#C77DFF` (Security's own accent, kept
  visually distinct from Orbit's blast-radius colors so a vulnerability
  marker is never confused with a scan result).
- Fonts: Space Grotesk (headers/HUD titles), IBM Plex Mono (data, code,
  terminal, log lines) throughout.

---

## 5. Architecture

### 5.1 Hackathon stage (now)

- Static frontend, no real backend. Tallybird's module graph, findings,
  fix candidates, and tests are all hardcoded JS objects in
  `orbit-platform.html`.
- Three.js loaded via pinned CDN UMD builds — no bundler.
- Every user-facing action (scan, search, verify) is a real UI state
  transition on mocked data, never a fake spinner that goes nowhere.
  Anything not wired up is a visibly disabled control with a tooltip, never
  a button that silently does nothing.

### 5.2 Real product — worked out in detail for SQL injection first

The plan below is deliberately scoped to **one attack category first**
(SQL injection), because it forces every architectural decision to be
concrete rather than hand-waved, and because a real, non-obvious finding
(§5.2.3) changes the design for this category specifically in a way that
generalizes to how every other category should be evaluated before being
added.

**5.2.1 Detection.** Use Semgrep in **taint mode**, not plain pattern
matching — injection-class vulnerabilities need an actual traced data path
from a tainted source (user input) to a dangerous sink (a raw query call),
or the false-positive rate is unworkable. Semgrep already ships a
`p/sql-injection` ruleset built this way. This stage is fully deterministic
and needs no LLM.

**5.2.2 Test generation.** Two tests per finding, matching real
Detect-Repair-Verify practice, not just the dependency-graph check:
- A **security/exploit test** — feed the flagged function a canonical SQLi
  payload (`' OR '1'='1' --`, a UNION-based extraction attempt) and assert
  it does *not* behave as an injection would. This is what actually proves
  the vulnerability is closed, as distinct from "nothing else broke."
- A **functional/regression test** — a legitimate but tricky input (an
  apostrophe in a real name, a normal multi-word search) still works. This
  is what catches an overzealous fix that "solves" injection by breaking
  the feature.
Generation should be **template-based**, not freehand LLM writing: extract
the flagged function's real signature via the same static analysis that
found it, then instantiate a small library of canonical OWASP-style SQLi
test patterns against that real signature. SQL injection is well-catalogued
enough that this doesn't need an LLM improvising payloads.

**5.2.3 Fix generation — the load-bearing finding for this whole section.**
A 2026 study stratifying LLM patch reliability by CWE category found fix
success ranges from 0% to 100% depending on category, and the dividing line
is not complexity — it's whether the fix is a **token-level pattern swap**
(an LLM gets these right essentially every time — e.g. `hashlib.md5(x)` →
`hashlib.sha256(x)`) or requires **tracing data flow** (LLMs understand the
*concept* — "use parameterized queries" — but generate a patch that
"rewrites the string formatting but introduces a new concatenation
pattern," i.e. gets the implementation wrong in context). SQL injection
fixes fall on the hard side of that line. This means: **do not generate the
SQLi patch with a freehand LLM call.** Use a deterministic AST/tree-sitter
rewrite instead — find the specific call node building the query
(f-string or concatenation into `cursor.execute(...)`), extract the
interpolated variable, and mechanically emit the parameterized form. This
is a real, existing technique (an open-source tool, `foxguard`, does
exactly this with tree-sitter), and Semgrep's own autofix system already
distinguishes "rule-based autofix" (deterministic) from its separate
AI-assistant autofix for exactly this reason. The LLM's role shrinks to two
things only: deciding whether the deterministic rewriter's pattern actually
applies to this specific code, and handling the fallback when it doesn't
(an unusual query-building pattern) — and that fallback path needs *more*
scrutiny from verification, not less, given the reliability finding above.
**Before adding a second attack category, re-run this same question for
it** — some categories (secrets → env var, dependency version bumps) are
much closer to the "token swap" end and can probably take a freehand LLM
patch with far less risk; categories involving auth/business logic should
be assumed hard until shown otherwise.

**5.2.4 Graph exploration and knowing when to stop.** Split what's actually
hard from what only looks hard:
- **Deterministic, not hard:** which files are one hop away (already-built
  static dependency graph — a language-aware import/call-graph extraction,
  no LLM needed), and whether a candidate patch broke something (run the
  affected file's existing tests before and after — pass/fail, not a
  judgment call).
- **Genuinely a search problem, and this is where a hard depth limit is
  correct engineering, not a hackathon shortcut:** deciding whether it's
  worth continuing to chase a compensating fix in a second or third file
  versus abandoning the whole strategy. A fixed budget — e.g. 2 hops per
  strategy, 3 strategies per finding before escalating to a person — is the
  same idea as "budgets" and "stopping conditions" in standard agentic
  loop-engineering practice, and it bounds real cost (every hop is more LLM
  calls and more test runs). Don't feel obligated to build anything fancier
  than this for the MVP.
- When a strategy is abandoned, the next one generated should be told
  explicitly what the previous attempt failed on, so it doesn't repeat the
  same idea — matches the "learn from the last failed attempt" principle
  behind self-evolving repair agents in current research (EvoRepair).

**5.2.5 Connecting back to testing.** Not a separate code path — a
candidate clearing its dependency checks triggers the same
verification-tests phase already built in the frontend (§3.3 step 5): run
the full suite, specifically re-run the security/exploit test to confirm
the vulnerability is actually closed. Any failure here feeds back into fix
generation as a new piece of failure evidence, looping through §5.2.3–5.2.4
again, bounded by the same attempt budget.

**5.2.6 Orchestration.** LangGraph is the right fit for the actual sequencer
— a directed graph with conditional edges maps directly onto "try →
test → on failure, loop to the next candidate → on success, stop," with
built-in checkpointing if a long search needs to be paused or inspected.
Keep the **executor and verifier architecturally separate** — the agent
that proposes a patch should never also be the one that decides it's safe;
an independent, ideally deterministic process (running the tests) does
that. Since this is already a Claude Code project, the **Claude Agent SDK**
is the natural implementation layer for the LLM-driven pieces specifically
(the fallback patch generation, the compensating-fix generation, the
"propose a different strategy" step) — it's built around the same
gather → act → verify → repeat loop already used throughout this project,
and supports subagents, which map cleanly onto "candidate strategies."
Git/PR integration (real GitHub/GitLab API calls, carrying the
verification results into the PR description) is the real-product
equivalent of "Apply," per the vision's second principle.

**5.2.7 Concrete MVP to actually build first.** A small real Python/Flask
sample app with one genuine SQL-injection endpoint and two or three real
dependents. Semgrep in taint mode for detection. A tree-sitter-based
deterministic rewriter for the patch, with an LLM fallback wired but
expected to be rarely exercised for this category. pytest for both the
generated tests and the existing suite. A LangGraph sequencer with a
2-hop / 3-strategy budget as the hard stop. This is narrow enough to
actually finish and honest enough to defend if someone asks how it really
works under the demo.

**5.2.8 Security scanning beyond SQLi.** Don't build a general-purpose
attack-execution engine from scratch — that market (Pentera, NodeZero,
XBOW) is mature and well-funded, and it isn't the differentiated part of
this product. The realistic path for every category beyond the first is
wrapping or calling an existing scanner/tool and building the graph and
fix-search layer on top, the same way SQLi detection wraps Semgrep rather
than reinventing static analysis.

**5.2.9 Access control.** Before this touches anything beyond a demo
environment: real auth, and audit logging for every automated code change
it proposes or applies.

---

## 6. Data model

```
Module {
  id, name, filePath[],
  dependsOn: Module.id[],
  dependents: Module.id[],      // derived, not stored twice by hand
  criticalityScore,             // derived from graph centrality
  findings: Finding.id[]
}

Finding {
  id, moduleId, attackCategory, severity,
  description, suggestedFix (diff, only set once a candidate is verified),
  status: 'open' | 'testing-candidates' | 'verified-safe' | 'resolved'
}

Candidate {
  findingId, agentName, strategyLabel, hopDepth,
  affected: [{ moduleId, level: 'red'|'amber' }],
  verdict: 'safe' | 'review' | 'rejected' | 'skipped',
  patch (diff, only meaningful when verdict is 'safe'),
  compensatingPatch: { moduleId, resolves: bool, diff } | null
}

TestResult {
  candidateId, testName, kind: 'security' | 'functional',
  outcome: 'pass' | 'fail', attempt: 1 | 2   // attempt 2 only on a retry
}

ScanResult {
  originModuleId, timestamp,
  affected: [{ moduleId, distance, severity: 'red'|'amber'|'dim' }]
}
```

---

## 7. Roadmap

**Hackathon milestones**
- [x] Port Code Room's graph + BFS logic into a Three.js scene
- [x] Build the Security room UI (attack-category picker, per-category test
      visualization, findings list, Auto-resolve action)
- [x] Multi-hop Fix Explorer: camera-driven exploration, backtracking,
      viable-fallback tracking, verified-impact consistency with Orbit's
      manual Scan
- [x] Post-fix verification-tests phase with a scripted retry-on-failure
      case
- [x] Terminal / code-style alternate view of the same event stream
- [x] Editable in-graph code viewer
- [x] Replace the placeholder graph with Tallybird — 18 modules, 28 real
      edges, 8 findings covering all 8 categories, graph-derived (not
      authored) blast radii
- [ ] One coherent demo narrative reusing the existing cross-module story
      (the same event touching PolicyPulse, Precedent, and Orbit)

**Backend MVP milestones (SQL injection first — see §5.2 for the full
reasoning behind each; all built and running in `sqli-mvp/`, shared with
the team)**
- [x] Stand up a small real Python app with genuine SQLi endpoints and a
      real dependent (`app/tasks_search.py`, `app/user_lookup.py` — the
      latter imports from the former, a real dependency edge)
- [x] Wire Semgrep detection for CWE-89 — pattern-mode, not taint-mode as
      originally planned; taint-mode over-fired on safe code in testing,
      pattern-mode gave zero false positives (now a permanent regression
      test: `dev_tests/test_detector_precision.py`)
- [x] Build the template-based test generator (`generate_tests.py`) —
      values pulled from the real target database, not hardcoded, with an
      honest fallback note when no ideal example row exists
- [x] Build the deterministic rewriter (`fix_sqli.py`, AST-based rather
      than tree-sitter — same effect, simpler in a pure-Python sandbox)
      with a real, tested LLM fallback path (`llm_fallback.py`) — direct
      Claude API call, not the full agent SDK, not a third-party tool;
      untested live (no key in the build environment) but structurally
      complete and unit-tested short of the actual network call
- [x] Build the multi-candidate search with dependent-aware backtracking
      — not LangGraph (plain Python state machine; LangGraph is still
      worth it once this needs true parallelism or persistence, not
      before). Real: `search.py` + `dependency_graph.py`, proven both
      against the real sample app and a deliberate synthetic conflict
      scenario (`dev_tests/test_search_backtrack.py`) that confirms an
      actual on-disk revert happens, not a simulated one. Honest scope
      limit: candidate 2 is always the LLM fallback, not a third
      independently-invented strategy — see search.py's docstring for
      why that's the correct shape given these categories, not a
      shortcut. Depth is currently 1 hop, not 2; extending it is
      straightforward given the graph extractor already generalizes
- [x] Wire the verification-tests loop back into fix generation on
      failure — `pipeline.py` re-runs the full test suite after fixing
      and reports the true before/after state, including partial success
- [x] Evaluate a second attack category — Hardcoded Secrets (CWE-798),
      checked the token-swap-vs-data-flow question first (confirmed via
      an existing tool, Autonoma, doing the same deterministic approach),
      built and tested (`fix_secrets.py`)

**Post-MVP**
- [ ] Real git/PR integration
- [ ] Auth + audit logging before pointing this at anything non-demo
- [ ] Evaluate wrapping an existing scanner for categories beyond SQLi
      rather than building detection from scratch each time
- [ ] A real regression suite exists now for the tooling itself
      (`dev_tests/`, 17 tests) — extend it as new categories are added,
      don't let it fall behind the way the original plan had no mention
      of testing the pipeline's own code at all

---

## 8. Open decisions (flag these before building further, don't assume)

- Final name (Orbit is a placeholder).
- **Target stack for the first real backend app** — Python/Flask was used
  throughout §5.2 because it made the discussion concrete, not because it's
  been confirmed as the team's choice. Decide this before writing code.
- **Depth/strategy budget tuning** — 2 hops and 3 strategies were chosen as
  reasonable defaults, not measured. Once real LLM calls and real test runs
  are involved, revisit based on actual cost and success rate.
- **LLM-fallback trigger criteria** — this part is resolved and built: the
  AST rewriter finding no matching call-node shape is the trigger (proven
  empirically — the `.format()` pattern in `sqli-mvp/app/user_lookup.py`
  correctly triggers it, leaving the file untouched rather than mangled).
  **Provider is decided too**: a direct Claude API call
  (`sqli-mvp/llm_fallback.py`), not the full Claude Code agent (this task
  doesn't need multi-step tool use) and not a third-party tool like Cursor
  (avoids a second AI vendor for something the existing stack already
  covers). **Still open**: the live call itself has never been exercised
  end-to-end — no API key exists in the environment it was built in. Needs
  a real key in a real environment, provisioned by whoever controls that
  environment, before "the fallback works" can be said with confidence
  rather than "the fallback is correctly structured."
- Whether Security scanning stays "always wraps an existing tool,
  integration is the product" or a scanning engine ever gets built in
  house (§5.2.8) — a business decision as much as a technical one.
- How "accept the risk with a note" for a `review`-verdict fallback gets
  recorded — an audit-trail decision that matters more once this is real.
