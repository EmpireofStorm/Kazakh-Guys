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

## 1. Vision

Most "AI dev tools" either write code or find problems. Almost none of them
close the loop between the two: tell you a vulnerability exists, and then
let you fix it without breaking something else you can't see. Orbit is
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

## 2. Current status (as of this doc)

Built as a static frontend (no shared backend). Graph BFS is real over a
hardcoded module graph. Security results and PR creation are simulated and
labeled as such in the UI.

Demo rooms:

- **Hub** (`index.html`) — company-world entry; links Precedent, PolicyPulse, Orbit.
- **Security** (`security.html`) — attack-category picker, findings, Fix in Orbit.
- **Orbit** (`orbit.html`) — Three.js universe, staged patch, blast-radius scan, Apply.
- **PolicyPulse / Precedent** — sibling stubs that carry the same Kazakhstan
  data-localization narrative.

## 3. The two rooms

### 3.1 Security (diagnose)

User selects one or more attack categories to test against the tracked
codebase/service. Category list (naming only — no exploit content lives
in this repo or this doc): SQL injection, cross-site scripting, broken
access control / IDOR, authentication bypass, server-side request forgery,
insecure deserialization, known-CVE dependency scanning, hardcoded-secret
exposure.

Agent runs the selected tests (hackathon stage: mocked/simulated results)
and returns findings, each tagged to a specific module/file, with severity
and a suggested fix.

Each finding has one action: **Fix in Orbit** — deep-links into the 3D
view with that module selected and the suggested patch pre-loaded.

A finding's status tracks through: `open` → `fix-drafted` → `verified-safe`
→ `pr-opened` → `resolved`. Nothing skips straight to resolved without a
human-approved PR.

### 3.2 Orbit (treat)

Every module in the codebase is a node ("body") in a 3D graph; every
dependency is an edge ("orbital lane"). Scan treats the proposed change
(not just "this module") as the origin of the BFS: direct dependents light
up red ("will break"), one hop further amber ("needs review"), everything
else stays dimmed ("outside blast radius").

If the scan comes back clean (or the user explicitly accepts a flagged
risk with a reason), **Apply** becomes available. Apply means: generate
the diff, attach the blast-radius report as context, and open a pull
request. It does not merge, deploy, or touch a running system.

### 3.3 The integration loop

1. User runs a Security scan → gets a list of findings.
2. User picks a finding → Fix in Orbit.
3. Orbit opens with that module pre-selected and the suggested patch staged.
4. User runs (or the system auto-runs) a blast-radius scan treating the patch as the change.
5. Clean scan → Apply opens a PR. Flagged scan → user can inspect the affected modules, adjust the patch, or accept the risk with a note before applying.
6. Control returns to Security; the finding's status updates to `pr-opened`, with a link back to the PR.

This is the whole product in one sentence: Security tells you what's
broken, Orbit tells you what else would break if you fixed it, and a human
signs off before anything ships.

## 4. Visual system — the universe

Metaphor mapping: module = celestial body; dependency = orbital
lane/beam between bodies; a security finding = a visible hazard marker on
a body (pulsing ring); running a scan = an expanding impact pulse from the
origin body (delay → red reveal → amber reveal → readout panel).

Engine: Three.js, OrbitControls, raycasting. Positions are static after
layout; only visual state (color, glow, pulse) is dynamic per scan.

Palette: background `#050709`, cyan `#4FD6FF` (idle/neutral), red `#FF4B4B`
(will break), amber `#FFB84D` (needs review), slate `#3A4B5C` (unaffected/
dim), hazard violet `#C77DFF`.

Fonts: Space Grotesk (headers/HUD titles), IBM Plex Mono (data readouts).

HUD chrome: corner brackets, staged reveal timing, status ticker.

## 5. Architecture

### 5.1 Hackathon stage (now)

Static frontend, no real backend. Module graph and findings live in
`js/data.js`. Three.js via pinned CDN UMD. Run-scan and Apply are real UI
state machines on mocked data. Anything not wired is visibly disabled with
a tooltip.

### 5.2 Real product (after)

1. Static analysis engine for a real graph.
2. Wrap an existing security-scanning API — do not invent a scanner.
3. LLM-drafted patch generation.
4. Real GitHub/GitLab PR creation.
5. Auth + audit logging.

## 6. Data model

```
Module { id, name, filePath[], dependsOn, dependents, criticalityScore, findings }
Finding { id, moduleId, attackCategory, severity, description, suggestedFix, status }
ScanResult { originModuleId, timestamp, affected: [{ moduleId, distance, severity }] }
```

Finding status is persisted in `localStorage` key `orbit-finding-state` so
Security and Orbit stay in sync.

## 7. Roadmap

Hackathon: 3D port of graph+BFS, Security UI, integration loop, shared
Kazakhstan narrative.

Post-hackathon: parse one real codebase, wrap one scanner API, real git,
auth.

## 8. Open decisions

- Final name (Orbit is a placeholder).
- Mocked scanner forever vs wrapped scanner post-hackathon.
- One continuous 3D space vs two rooms (demo uses two rooms, one shared universe data model, hazard markers on the same bodies).
- How "accept the risk with a note" is audited (demo stores the note on the simulated PR).
