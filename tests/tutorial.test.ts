/* ============================================================
   THE TUTORIAL REFERS TO ITS OWN STEPS BY NUMBER.

   Three sentences on that page point at a step by ordinal — "wrong at
   step one invalidates every clock after it", "nothing below requires
   an account until step four", "the countdown at step two". They are
   prose, so nothing checks them, and INSERTING A STEP RENUMBERS
   EVERYTHING AFTER IT.

   That is not hypothetical. The eleventh step — telephoning the
   authority and recording it — went in between "sign in once" and
   "establish who reviews", and it was placed there partly BECAUSE
   putting it earlier would have moved sign-in off step four and made
   the lede's promise false. That reasoning lived in one person's head
   for the length of one edit, which is exactly the kind of knowledge
   this repository turns into a check.

   The step COUNT is computed and cannot drift. The step REFERENCES are
   sentences and can, so they are asserted here by what the step
   actually is rather than by its number — a reference that starts
   pointing at the wrong step fails on the title, which is the thing a
   reader would notice.

   MUTATION-CHECK THIS by moving any step in act one and confirming the
   matching assertion goes red.
   ============================================================ */
import { describe, it, expect } from "vitest";

/* The content modules are plain JS with no declarations, which is why
   every other test that touches apps/web reads them as TEXT. This one
   needs the STRUCTURE — the ordering of steps is the thing under test —
   so it imports and types the boundary here rather than asserting
   against a regex over source, which would pass on a file that no
   longer parses. */
interface Step {
  readonly title: string;
  readonly pitfall?: string;
}
interface Section {
  readonly kind?: string;
  readonly items?: readonly Step[];
}
/* apps/web ships plain JS with no declarations, and adding a .d.ts for one
   content module would be a second declaration of its shape that drifts
   from the first. The shape this test depends on is declared above and
   asserted below — including a guard that fails if the module stops
   producing steps at all, so a structural change is caught here rather
   than passing vacuously. */
const mod = (await import(
  // @ts-expect-error untyped JS content module — see the note above
  "../apps/web/src/content/pages.js"
)) as { TUTORIALS: { readonly sections: readonly Section[] } };
const { TUTORIALS } = mod;

const WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11,
};

/** Every step, in the order a reader meets them, across both acts. */
const steps: readonly Step[] = TUTORIALS.sections
  .filter((s) => s.kind === "steps")
  .flatMap((s) => s.items ?? []);

/** Every "step <word>" the page says about itself. */
const references = [...JSON.stringify(TUTORIALS).matchAll(/step (\w+)/gi)]
  .map((m) => m[1]!.toLowerCase())
  .filter((w) => w in WORDS);

describe("the tutorial's references to its own steps", () => {
  it("has steps to refer to at all", () => {
    /* A guard, not a formality. If the shape of the content module
       changes and this stops finding steps, every assertion below
       passes vacuously — which is the failure mode this repository
       names more often than any other. */
    expect(steps.length).toBeGreaterThan(5);
    expect(references.length).toBeGreaterThan(0);
  });

  it("never points past the end", () => {
    for (const word of references) {
      expect(WORDS[word]!, `"step ${word}" is out of range`).toBeLessThanOrEqual(steps.length);
    }
  });

  /* THE THREE THAT CARRY MEANING, asserted by what the step IS.

     Checking that "step four" resolves to something only proves the
     array is long enough. What the lede actually promises is that
     nothing before signing in needs an account — so the assertion is
     that step four is the SIGN-IN step, and it fails the moment an
     insertion moves it. */
  it("step one is the one that files a report — the report-type claim hangs on it", () => {
    expect(steps[0]?.title.toLowerCase()).toContain("file one real report");
  });

  it("step two is the one that states the deadline — the countdown claim hangs on it", () => {
    expect(steps[1]?.title.toLowerCase()).toContain("deadline");
  });

  it("step four is signing in — the lede promises no account is needed before it", () => {
    expect(steps[3]?.title.toLowerCase()).toContain("sign in");
  });

  /* The step that closes the loop step two opens. Its absence is what
     this test file was written alongside: the tutorial taught a
     regulatory countdown and never taught how to stop it. */
  it("teaches how the reporting obligation is discharged, not only that it exists", () => {
    const notify = steps.find((s) => /authority/i.test(s.title));
    expect(notify, "no step tells a reader to notify the authority").toBeTruthy();
    expect(notify!.title.toLowerCase()).toContain("record");
  });

  /* Every step earns its place by naming the mistake. A step with no
     pitfall is a step that reads as documentation rather than as
     instruction, and the page's own lede promises otherwise. */
  it("gives every step a pitfall, which the lede promises", () => {
    const missing = steps.filter((s) => !s.pitfall).map((s) => s.title);
    expect(missing, `steps with no pitfall: ${missing.join(", ")}`).toHaveLength(0);
  });
});
