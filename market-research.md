# Market research — why this problem, why now, why us

Every figure below has a real source found by search; where sources disagree, both are given rather than picking the more flattering one.

## 1. The problem is real and large

- Global SMB cybersecurity spending is projected to reach **$109 billion by 2026** (Analysys Mason, 10% CAGR), with other estimates putting the segment at **$124.2 billion by 2030**.
- **47% of businesses with fewer than 50 employees have zero cybersecurity budget** (StrongDM, 2025) — not "a small budget," zero.
- **Fewer than 30% of SMBs manage security in-house** at all — most rely on general IT, not dedicated security staff.
- **61% of small businesses report having experienced a cyber incident.**
- Average cost of an SMB breach: **$3.31 million** — for a company with no dedicated security budget, this is existential, not a line-item risk.
- Only **25% of small businesses carry cyber insurance**, versus 75% of large enterprises — the safety net that exists for enterprises largely doesn't reach this segment.
- The SME segment of the cybersecurity market is projected to grow at the **fastest rate of any segment, ~15.5% CAGR** — this market is not shrinking or stagnant, it's the fastest-growing part of a growing market.
- Structurally, this gap won't close on its own: there is a global shortfall of **3.5–4.8 million cybersecurity professionals**. Even a well-funded startup competing for security talent is competing against every other company doing the same thing, for a role that doesn't exist to be filled.

**What this supports in the pitch:** "can't afford a security team" isn't just a founder's excuse — the tooling and the talent to build one are both genuinely scarce and expensive, independent of whether the founder wants one.

## 2. Why now, specifically: AI-built startups are the fastest-growing part of this exact customer base

- **90% of developers now use an AI coding tool regularly** (as of early 2026), and AI generates **46% of new code on GitHub**, trending toward 60% by year end.
- Multiple independent studies converge on the same range: **40–62% of AI-generated code contains security vulnerabilities.** Specific findings: 45% fails OWASP Top-10 benchmarks outright; AI-generated code shows a **2.74x higher XSS rate** than human-written code; 91.5% of a sampled set of AI-built ("vibe-coded") applications had at least one traceable vulnerability.
- This is not theoretical: **Lovable**, a well-known AI app-builder, had **170 of 1,645 analyzed apps** (303 endpoints) exposed to unauthenticated data access via a row-level-security bypass — a real, disclosed, named incident (CVE-2025-48757), not a hypothetical.
- Georgia Tech's Vibe Security Radar has tracked the CVE count attributable to AI-generated code **roughly doubling every few months** through 2026.

**What this supports in the pitch:** the exact founder in the intro story — someone who built a real product fast, possibly with AI coding tools, and hasn't gotten to security yet — is a real, large, and rapidly growing population, not an edge case. This is the strongest "why now" argument available and it's backed by primary research (Georgia Tech, Stanford, Cloud Security Alliance), not vendor marketing.

## 3. Competitive landscape — read this section before anyone claims uniqueness on stage

### Enterprise-tier automated security testing (confirms the affordability gap, doesn't compete for this customer)

| Product | Pricing | Who it's actually for |
|---|---|---|
| Pentera | $50,000–150,000/year | "Mid-to-large enterprises," 1,200+ enterprise customers, $100M+ ARR |
| Horizon3.ai NodeZero | Quote-based, similar range | "Medium Business and Large Enterprises" |
| XBOW | $4,000–8,000 per assessment | Cheaper, but still a per-engagement cost, and finds/exploits — no evidence it generates verified fixes |

These are genuinely, explicitly not built for a five-person startup. This part of the "can't afford it" claim holds up completely.

### The one competitor that must be addressed directly: **Aikido Security**

This is real, and the pitch will lose credibility fast if it's ignored or if someone in the room already knows it exists. Aikido is a Belgium-based, VC-funded ($17M Series A), **50,000+ organization** platform explicitly positioned for startups and small teams, with a **free tier** (3 users, full SAST + SCA + secrets scanning, forever). It does:
- SAST, DAST, SCA, secrets detection, IaC, container, and cloud posture scanning in one platform.
- **AI AutoFix**: generates a pull request with a proposed remediation, which a developer previews and applies with one click.
- The same "a human approves before it ships" principle already built into this project's own design.

**The honest, defensible difference, stated precisely:** Aikido's public documentation describes AutoFix as generating and previewing a fix — there is no publicly documented evidence it checks whether that fix breaks something *else* in your specific codebase before proposing it. This project's actual, tested backend does exactly that: it runs the fix against the real dependency graph, checks whether it regresses a connected file's own tests, and — proven, not just designed — backtracks to a different approach if it does, before anything is ever shown to a person. The correct claim is **"verified against your codebase's actual dependencies before it's proposed, not generated and handed to you to discover problems with"** — not "nobody else automates fixes for startups," which is false and checkable.

A secondary, softer differentiator: nothing in Aikido's marketing suggests a spatial or graph-based way of seeing *why* a fix is safe or risky — the interactive 3D exploration is a genuine interface difference, worth mentioning, but should be framed as a UX advantage, not a technical moat, since it doesn't change what the backend actually verifies.

### GitHub Advanced Security / Copilot Autofix (worth knowing, not central)
Same general shape as Aikido — detect via CodeQL, suggest a fix via Copilot, human approves the PR. Same honest distinction applies: single-shot suggestion, not a dependency-graph-verified one, as far as public documentation shows.

## 4. The defensible unique claim, stated as it should be said out loud

> "The tools built for startups already do detect-and-suggest. We do detect, verify against your actual codebase before we ever show you anything, and only then suggest — and we can prove that verification loop actually catches conflicts a single-shot suggestion would miss, because we tested it against a real regression, not just designed it on paper."

That is true, checkable against this project's own `sqli-mvp/` code and its passing tests, and it doesn't require anyone in the room to be unaware that Aikido exists.

## 5. Numbers this pitch should NOT use, and why

- Don't say "nobody does this for startups" — Aikido, and to a lesser extent GitHub Advanced Security, both do a version of this. Say what's different instead (§4).
- Don't claim broad multi-category coverage as *tested* — only SQL injection and hardcoded secrets have real, tested backend code as of this session (see CLAUDE.md). The other six categories shown in the demo are frontend-only. If asked "does this really work for XSS," the honest answer is "the mechanism is proven for two categories; extending it to a third is the next step," not a claim that all eight work today.
- Don't overstate "automates security" as replacing expertise entirely — frame it as automating the tedious, mechanical parts (staying current on attack patterns, writing the fix, checking it didn't break anything) so a non-expert founder can ship safely, not as a replacement for ever needing to think about security at all.
