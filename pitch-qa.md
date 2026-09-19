# Pitch script + Q&A prep

Everything finalized so far — the pitch itself, then the Q&A answers
worked out during prep. Update both sections as the pitch develops.

---

## The pitch

### Part 1 — the problem, and how detection & test generation work

Imagine you're a founder who just shipped your first product. The
website's live, the product works, your first few users are already
poking around — and there's exactly one thing left undone: security.

It's not that the problems are exotic or hard to find. The most common
ways products get broken into are old, well-documented, well-understood
— the same handful of mistakes, year after year. The problem is nobody on
a two-person team's job is to catch them. Researching what to look for,
understanding how each one actually gets exploited, writing the correct
fix — that takes real time, and real background most early founders
don't have. And a dedicated security team isn't even on the table
financially.

That's the gap we built for.

Under the hood, scanning runs on Semgrep — a static analysis engine
trusted industry-wide for catching known attack patterns fast and
reliably. It checks your code against a focused rule set, one for each
attack category you choose to test.

But finding the issue is only half the job. For every finding, we
automatically write a real test — one that fires an actual attack payload
at the exact vulnerable function. If the exploit succeeds, that's not a
guess. That's proof.

And right alongside it, a second test pulls real data from your own app
and confirms normal use still works — so whatever fix comes next can
never be one that quietly breaks your product just to close a hole.
Every test is built this way: from your actual code, your actual data —
building specific unique tests suited for your company.

### Part 2 — findings, and the automated fixing loop

After scanning, you don't get a vague warning — you get the exact issue,
tied to the exact line of code responsible. Then we move to fixing.

Fixing is automated too — though automated doesn't mean unsupervised.
Every fix still gets your review before anything ships. Nothing merges on
its own.

Generating the fix itself runs through a direct call to Claude — because
for a well-understood attack like this one, the correct fix is a known,
established pattern, not something to improvise fresh each time. That's
actually the more reliable approach: certainty over guesswork.

Instead of giving you a suggestion on the spot like most agents do, our
product runs its attempts on its own — exploring how a change would
affect the files connected to it, until it finds a fix that holds up, or
decides to back out and try a different approach. After finding a fix, it
tests it, and only after all the testing does it present it to you. In
the meantime, you can see visually, or in the terminal, exactly what your
agent is trying, and after a while it's going to give you a tested fix.

### Closing

Go back to that founder from the beginning. The one with a live product,
real users, and no security team.

They don't need to become a security expert. They don't need to find
room in a budget that doesn't exist. They need the tedious, unglamorous,
easy-to-skip part of shipping software handled — correctly, verified,
without anyone having to babysit it.

That's what we built. Not a scanner that hands you a list and walks away.
Not a suggestion you have to trust blindly. A system that finds the
problem, proves it's real, fixes it, proves the fix holds — and only then
hands it to you.

The founder from the beginning doesn't need to become us. They just need
to have us.

---

## Q&A prep

Answers worked out and verified during pitch prep, kept here so they
don't get lost in chat scroll. Add to this section as more come up.

---

### Q: "How are you actually building unique tests for each product?"

**Short answer for the room:** Every test is built from two real things —
your actual code and your actual data — not a template with the names
swapped in.

**What makes it genuinely unique, specifically:**
1. The function's real signature is discovered by parsing your actual
   code (AST-level, not assumed), so the same generator correctly builds
   a test whether the vulnerable function takes one parameter or three.
2. The example data used in the test is pulled from *your* real database
   — preferring a real value with a tricky character in it, so the test
   also catches a fix that's too aggressive and breaks legitimate input.
3. Even *which table and column* to pull that data from is inferred from
   your actual query, not hardcoded to one shape.

**Proof, if pressed on whether this is really dynamic or just looks like
it:** verified live against a brand-new function the generator had never
seen before, on a different table with a different schema. That test run
surfaced two real bugs — one where the wrong table's data would have been
used, one where the actual security fix itself mishandled a quote pattern
it hadn't been tested against — both found and fixed on the spot. That's
the honest proof it's real adaptation, not a canned demo: it broke on
something new, and got fixed because of it.

**The honest boundary, only needed if someone pushes further:** the
underlying attack technique per category (the actual exploit payload) is
a proven, standard one — not reinvented per company. That's intentional,
not a shortcut: for a well-known vulnerability class, a canonical
technique is more reliable than an improvised one. What's unique per
product is the target, not the technique. There's also a narrower known
edge case: a function filtering on two independent real values (not one
value used two ways) isn't perfectly handled yet — worth having ready,
not worth volunteering unprompted.

---

### Q: "What happens if the agent can't find a fix?"

**Short answer for the room:** It doesn't force one, and it doesn't fake
success. It tells you exactly what it tried, why each attempt didn't
work, and hands you back a clear starting point instead of a black box.

**What's actually built and proven, precisely:** when every attempt is
exhausted, the system reports which approaches it tried, at which point
each one failed (its own tests, or a downstream file), and stops there —
verified with a real test that confirms the file is left untouched (fully
reverted, not left half-changed) and the failure reason is reported
accurately rather than silently swallowed.

**One honest nuance:** right now that output is a precise technical log
of attempts and failures — genuinely useful for a developer to pick up
from, but closer to "here's the evidence" than a polished plain-language
"here's what you should do" suggestion. Fine to describe it in the pitch
as guidance, since a developer reading it can act on it directly — just
worth knowing the exact shape if asked to demo it live.

---

### Q: "How far into the codebase does it actually search?"

**Short answer for the room:** It checks the files directly connected to
the one being fixed, in both directions — proven with a real test where a
connected file's own test genuinely regressed and the system caught it.

**Honest boundary:** currently one hop out. Going further — the connected
files of those connected files — is the natural next step and the
mechanism already generalizes to it; it just hasn't been built yet. If
asked directly, say that plainly rather than implying it already goes
further than it does.
