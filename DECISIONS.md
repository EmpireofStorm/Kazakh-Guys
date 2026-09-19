# SlopGuard — Locked decisions (single source of truth)

Hackathon: General Learning (RevisionDojo) Hacks  
Repo: https://github.com/EmpireofStorm/Kazakh-Guys.git  
Branch: `security_orchestration_dk`

---

## Final open-question locks

| # | Decision | Lock |
|---|----------|------|
| 1 | Primary demo coding agent | **OpenAI Codex** (not Cursor). Trigger: Codex hooks / app-server / stop events if available; otherwise CLI `slopguard run` + mocked “agent finished” for demo reliability. Cursor hooks = future adapter. |
| 2 | Orchestrator language | **Python** |
| 3 | Demo app | **Python FastAPI** with easy SQLi / auth seeds + Docker |
| 4 | Sandbox | **Docker Red Team** with offline harness backup |
| 5 | Team (ideal 4) | orchestrator · scanners/catalog/fixture · graph/sandbox · Lead/Fixer/Teacher/pitch |
| 6 | Product name | **SlopGuard** |
| 7 | LLM provider | **OpenAI** (Lead / Fixer / Teacher / Red Team *plan*) |
| 8 | Repo / branch | Kazakh-Guys → `security_orchestration_dk` |
| 9 | GraphDev | Irrelevant for MVP (not using). Use **graphify** if a graph is needed; import-graph fallback OK |
| 10 | Learning in video | Not emphasized for now; Teacher only as last-mile if time |

---

## Product & track

| Decision | Lock |
|----------|------|
| **Problem** | Coding agents ship insecure code faster than seniors can review |
| **Track** | Track 2 (jobs/internships), with a thin learning frame for EdTech judges |
| **Not claiming** | Better than human design review; better Semgrep; all AI code is insecure |
| **Wedge vs Guardian** | Blast radius + exploit proof + Teacher + (later) verifier-grounded evolution — not scan-on-write UX |
| **Learning** | Thin only: Teacher card from real artifacts + one quiz Q. No fog-of-war / study product. Video lean: last-mile only |
| **Threat catalog** | **No self-updating crawler for MVP.** Versioned static `threats.yaml` only |

---

## Architecture

| Decision | Lock |
|----------|------|
| **Surface** | Hybrid: coding-agent sensors (Codex first) + local Python orchestrator as brain. No desktop computer-use core |
| **Orchestration** | Specialists wrap **non-agentic** tools; LLM for Lead / Fixer / Teacher / Red Team *plan* only |
| **Graph** | graphify (or import-graph fallback). **Not GraphDev** for MVP |
| **Catalog** | Three threats only: SQLi, missing auth, secrets → Semgrep / Semgrep / gitleaks |
| **Proof** | Sandbox exploit harness; fix only counts if re-scan + re-exploit (+ tests) pass |
| **UI** | Evidence-first; thin Office skin optional (P1). Rooms-as-permissions = nice demo, not P0 |
| **Evolution / research agent** | Slide / post-MVP — not in critical path |

---

## P0 ship list

1. Trigger (Codex adapter if available, else `slopguard run` + mocked agent-finished)
2. Lead (LLM)
3. Scanner (Semgrep) + Secrets (gitleaks)
4. Graph blast radius (graphify)
5. Red Team sandbox PoC (Docker + offline harness backup)
6. Fixer + ReVerify
7. Teacher (last-mile if time)
8. Seeded vulnerable FastAPI demo app
9. Static `threats.yaml`

---

## Explicit cuts

- Live / self-updating threat crawler
- Auto-evolving Semgrep rules in the demo critical path
- GraphDev dependency
- Multi-room ACL Office / 3D office
- Marketplace packaging
- Multi-IDE day one (Cursor hooks = later adapter)
- Unsupervised rule promotion

---

## Demo-ready bar

Trigger → detect → radius (≥2 nodes) → **saved exploit evidence** → fix → re-verify → (optional) teach — in ≤90s, catalog-only tools, backup recording ready.

---

## Safety

Exploits run **only** against the team’s own sandboxed demo app (Docker). Never against third-party targets.
