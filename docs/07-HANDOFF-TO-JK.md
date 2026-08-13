# Hand-off to JK & Associates

**From:** UsalamaSMS · 13 August 2026
**To:** whoever next works on JK & Associates
**Status:** findings, not instructions. Each is a thing that happened
here, with the shape it would take there.

The charter (`DIAGNOSTIC-CHARTER.md`, version 2) covers both products.
This file exists because four defects found here in one day are not
UsalamaSMS defects — they are defects in how the products are built,
and two of them are latent in JK by construction.

JK's promise is *nothing you type leaves the device*, guarded by a CSP
asserted in the build. That promise is stronger than anything here,
and it makes some of the items below irrelevant and one of them more
dangerous rather than less. Both are flagged.

---

## 1. A claim with no mechanism goes stale in HOURS

**What happened.** UsalamaSMS's `/coverage` page states, element by
element, what the product does and does not do — the page an operator
is told to read before adopting anything. One element said the risk
register "lives in one browser… the safety office cannot see it".
That became false the moment the server-backed register shipped, and
stayed false for half a day, in production, with a full gate suite
green.

**Why nothing caught it.** The gate verified that the *count* on the
front page matched the table. It could not ask whether the table
matched the product, because the fields are prose. A computed number
derived from a stale table is a number that is confidently wrong.

**The direction is the lesson.** It was UNDERSTATING. Nobody checks
that direction, because it reads as modesty rather than error — and it
is the direction that loses a lender's confidence rather than
attracting a complaint.

**Where this lands in JK.** The scorecard's forty questions, their
weights, and anything the diagnostic page says about what the index
covers. Ask of each: *what fact, checkable in code, distinguishes this
claim from its neighbour?* Here the answer was "the records are held
on the server", so coverage entries now name the API routes that hold
them and the gate asserts those against the routes actually
registered. JK's answer will be different — `tests/audit.mjs` already
proves the adjusted weight set sums to 100, which is exactly this
shape. The gap is claims about *scope* rather than about arithmetic.

Charter rule 7 says a claim is kept by a mechanism. This was a claim
whose *arithmetic* had one and whose *truth* did not.

---

## 2. Four new instances of "a check that cannot fail" — in one day

The charter records four historical instances. Today added four more,
all in checks written the same afternoon, all found by asking what the
check would still measure rather than by running it. Listed as
mechanisms, because the mechanisms are what generalise:

| Mechanism | How it presented |
|---|---|
| **Service workers bypass `page.route`** | A Playwright stub was never hit; the worker fetched the real path, got the SPA fallback, `res.json()` threw, and the screen's own `.catch()` swallowed it. The check passed against a fully restored defect. Fix: a context with `serviceWorkers: 'block'`, and assert the stub was *called* before asserting anything else. |
| **A probe that samples one specimen** | A gate looked for the single longest sentence of deferred prose in the built bundle. Re-adding a *different* sentence put it back while the probe looked elsewhere. Fix: check every sentence, and refuse to run on fewer than N. |
| **An assertion placed after its own report** | A gate block sat below the line that prints the failure list. It ran, detected the defect, recorded it — into an array already printed. Fix: ordering, plus a mutation test that shows it in seconds. |
| **A pattern that fires on honest text** | A contradiction check contained `does not sync`, which matched inside the corrected entry's own truthful caveat *"Deletion does not synchronise either"*. Fix: narrow the pattern to the actual false claim. |

**The last deserves its own sentence.** A gate that fails accurate
disclosure trains people to word around it, and the wording it drives
them to is vaguer than what they started with. That is worse than no
gate, because it degrades the thing the gate was protecting.

**Where this lands in JK.** `tests/e2e.mjs` asserts that a partial
answer set renders the empty state rather than an index — a check
whose whole value is that it fails when the refusal breaks. Put the
defect back and confirm it goes red. Three of the four above passed a
clean run before the mutation exposed them.

---

## 3. The destructive control that does not ask — sweep this now

Three of four toolkits here confirmed before destroying work. The
fourth — the one that destroyed *most*, an entire twelve-element
assessment plus every owner, date and reference on its plan — did not.

**The inconsistency is the tell.** A product that guards the small
destructive action and not the large one has not decided the large one
is safe; it has simply never looked at them together.

**Where this lands in JK, and why it is worse there.** JK holds a
forty-question scorecard on the device and nothing leaves it. There is
no server copy to restore from, by design. A "clear" or "reset"
control that does not ask is therefore not a recoverable mistake — it
is the only copy. Worth an explicit sweep: list every control that
deletes or resets, and review them as a set rather than one at a time.

---

## 4. Latent, not yet applicable: the day JK gains a server

Not a current defect. Recorded because the moment it becomes one is
the moment it fires for every existing user simultaneously.

A server read here assigned the organisation's list straight over the
device's and persisted it. A signed-in user whose organisation had no
server-side records yet opened the screen and watched an empty list
overwrite their own work — no click, no confirmation, no undo. On the
first load after such a release the server side is empty *by
definition*: a migration that destroys the data it is migrating.

Resolution: union by id, server first, keeping anything the server has
never heard of; adopt the server's id on a successful write so the
same record cannot arrive twice. The remaining gap — deletion does not
synchronise, so a deleted record reappears — is stated in the code
rather than hidden, and is the safe direction: a record that comes
back is visible; one silently deleted is not.

If JK's promise ever changes from *nothing leaves the device*, that is
a charter deviation requiring its own entry, and this is the defect to
design against on the same day.

---

## 5. Two things that are NOT hand-offs

Stated so nobody spends a day on them:

- **Sub-24px tap targets flagged by a geometry sweep.** WCAG 2.2
  SC 2.5.8 exempts targets "in a sentence or block of text". A sweep
  that ignores the exception reports large numbers of false positives
  — 88 in one pass here, all correct as built. Only navigation lists
  with no sentence around them are genuine, and that is a much smaller
  set.
- **Bundle weight in the entry chunk.** Chasing it here produced ~650
  bytes and one useful measurement: the entry chunk holds the screens
  the product's central promise depends on, so anything materially
  larger costs that promise. Measure what is in yours before
  optimising; the answer may be "this is the product".

---

## Changing this file

It is a log, not a standard. Add to it when something here is found
where it also applies, and say where. If a finding turns out not to
generalise, say that too — a hand-off only ever added to becomes a
document nobody reads.
