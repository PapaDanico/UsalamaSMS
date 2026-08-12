/* ============================================================
   The implementation plan is a regulatory artefact, so the things it
   must not do matter more than the things it does.

   It must not invent a phasing that looks like ICAO's, it must not put
   work in front of somebody for an element they never assessed, and it
   must not tell an operator to take something from nothing to
   excellence in one step — a plan made of wishes is not a plan.
   ============================================================ */

import { describe, it, expect } from 'vitest';
import { SMS_ELEMENTS } from '../packages/shared/src/maturity';
import { implementationPlan } from '../packages/shared/src/plan';

const all = (level: number) =>
  Object.fromEntries(SMS_ELEMENTS.map((e) => [e.id, level]));

describe('the implementation plan', () => {
  it('PUTS EVERYTHING UNDOCUMENTED FIRST, because nothing counts before it is written down', () => {
    /* SM ICG's prerequisite rule, read from CASA Form 1591: an item
       cannot be Operating or Effective if it is not Present, and cannot
       be Present if it is not documented. So an element at Absent
       cannot be worked on in parallel with polishing one at Measured —
       it has to come first, and the plan has to say so. */
    const answers = { ...all(3), '1.4': 0, '2.2': 0 };
    const plan = implementationPlan(answers);

    expect(plan.phases[0]!.order).toBe(1);
    expect(plan.phases[0]!.steps.map((s) => s.element.id)).toEqual(['1.4', '2.2']);
    expect(plan.phases[0]!.purpose).toMatch(/documented/i);
  });

  it('MOVES ONE RUNG AT A TIME, never to the top of the scale', () => {
    // "Get element 1.4 from Absent to Improving" is a wish. The next
    // rung is a piece of work somebody can finish and re-answer.
    const plan = implementationPlan(all(0));
    for (const step of plan.phases.flatMap((p) => p.steps)) {
      expect(step.to.value - step.from.value, `${step.element.id} skipped a rung`).toBe(1);
    }
  });

  it('says nothing about an element that was never answered', () => {
    // The plan describes work on a position. There is no position until
    // the question is answered, and inventing one puts a task in front
    // of somebody for an element they never assessed.
    const plan = implementationPlan({ '1.1': 0 });
    const ids = plan.phases.flatMap((p) => p.steps).map((s) => s.element.id);
    expect(ids).toEqual(['1.1']);
    expect(plan.complete).toBe(false);
  });

  it('names what is already finished rather than dropping it', () => {
    const plan = implementationPlan({ ...all(1), '3.3': 4 });
    expect(plan.settled.map((e) => e.id)).toEqual(['3.3']);
    expect(plan.phases.flatMap((p) => p.steps).map((s) => s.element.id)).not.toContain('3.3');
  });

  it('produces no phases at all when every element is at the top', () => {
    const plan = implementationPlan(all(4));
    expect(plan.phases).toHaveLength(0);
    expect(plan.settled).toHaveLength(SMS_ELEMENTS.length);
    expect(plan.complete).toBe(true);
  });

  it('emits no empty phase', () => {
    // A phase with no work in it is a heading that makes a plan look
    // longer than it is.
    const plan = implementationPlan(all(2));
    expect(plan.phases.length).toBeGreaterThan(0);
    for (const phase of plan.phases) expect(phase.steps.length).toBeGreaterThan(0);
  });

  it('orders phases weakest-first, matching how the assessment is positioned', () => {
    const plan = implementationPlan({ ...all(3), '1.1': 0, '1.2': 1, '1.3': 2 });
    expect(plan.phases.map((p) => p.order)).toEqual([1, 2, 3, 4]);
    expect(plan.phases[0]!.steps.map((s) => s.element.id)).toEqual(['1.1']);
    expect(plan.phases[1]!.steps.map((s) => s.element.id)).toEqual(['1.2']);
    expect(plan.phases[2]!.steps.map((s) => s.element.id)).toEqual(['1.3']);
  });

  it("uses the element's own evidence descriptor only for the top step", () => {
    /* The element descriptor describes what level 4 looks like. Using
       it on a step from Absent to Documented would tell an operator
       that writing a page down means the evidence changes decisions —
       overstating the step by three rungs. */
    const top = implementationPlan(all(3)).phases[0]!.steps[0]!;
    expect(top.evidence).toBe(top.element.evidence);

    const bottom = implementationPlan(all(0)).phases[0]!.steps[0]!;
    expect(bottom.evidence).not.toBe(bottom.element.evidence);
    expect(bottom.evidence).toMatch(/document/i);
  });

  it('carries right-sizing separately from advancement', () => {
    // An unsuitable element may be well developed. Advancing it is the
    // wrong instruction; it belongs in its own list.
    const plan = implementationPlan(all(3), { suitability: { '1.5': 'NOT_SUITABLE' } });
    expect(plan.rightSize.map((e) => e.id)).toEqual(['1.5']);
    // and it still appears as a step, because it is still at rung 3 —
    // the two facts are independent and both true.
    expect(plan.phases.flatMap((p) => p.steps).map((s) => s.element.id)).toContain('1.5');
  });

  it('carries the operator scale when one was given, and omits it otherwise', () => {
    expect(implementationPlan(all(1)).scale).toBeUndefined();
    expect(implementationPlan(all(1), { scale: 'SMALL_NON_COMPLEX' }).scale).toBe(
      'SMALL_NON_COMPLEX'
    );
  });

  it('gives every step an action and an evidence line', () => {
    // A step with no "done" test is a task somebody argues about.
    for (const step of implementationPlan(all(0)).phases.flatMap((p) => p.steps)) {
      expect(step.action.length).toBeGreaterThan(40);
      expect(step.evidence.length).toBeGreaterThan(20);
    }
  });
});

/* ============================================================
   OWNER AND DUE DATE.

   CASA's gap-analysis and implementation-planning tool records, for
   every element found partially or not present, the responsible
   individual and a set due date. The plan produced everything except
   those two, which is the difference between a work list and a
   submittable plan — and this module's own header already calls a step
   with neither a wish.

   The assignments are the ONE part of this module that is not derived.
   So the tests here are mostly about what happens when the input is
   junk, which is the state a hand-editable browser store is routinely
   in.
   ============================================================ */
describe('implementationPlan — who, and by when', () => {
  it('threads an owner and a date onto the step they belong to', () => {
    const plan = implementationPlan(all(0), {
      assignments: { '1.1': { owner: 'A. Mwangi', due: '2026-11-26' } }
    });
    const steps = plan.phases.flatMap((p) => p.steps);
    const mine = steps.find((s) => s.element.id === '1.1')!;
    expect(mine.owner).toBe('A. Mwangi');
    expect(mine.due).toBe('2026-11-26');
    // and nothing else picked them up
    expect(steps.filter((s) => s.owner).length).toBe(1);
  });

  it('COUNTS A STEP AS UNASSIGNED UNTIL IT HAS BOTH', () => {
    // The failure this guards: reporting a plan as assigned because
    // somebody typed a name, with no date anywhere in it. A regulator
    // asks both questions.
    const owned = implementationPlan(all(0), { assignments: { '1.1': { owner: 'A. Mwangi' } } });
    expect(owned.unassigned.map((s) => s.element.id)).toContain('1.1');

    const dated = implementationPlan(all(0), { assignments: { '1.1': { due: '2026-11-26' } } });
    expect(dated.unassigned.map((s) => s.element.id)).toContain('1.1');

    const both = implementationPlan(all(0), {
      assignments: { '1.1': { owner: 'A. Mwangi', due: '2026-11-26' } }
    });
    expect(both.unassigned.map((s) => s.element.id)).not.toContain('1.1');
  });

  it('treats a blank or whitespace owner as nobody', () => {
    // What a text box holds after somebody clears it. Carrying it
    // through would let a plan report itself assigned to "".
    const plan = implementationPlan(all(0), {
      assignments: { '1.1': { owner: '   ', due: '2026-11-26' } }
    });
    const mine = plan.phases.flatMap((p) => p.steps).find((s) => s.element.id === '1.1')!;
    expect(mine.owner).toBeUndefined();
    expect(plan.unassigned.map((s) => s.element.id)).toContain('1.1');
  });

  it('reports every step unassigned when nothing has been assigned at all', () => {
    const plan = implementationPlan(all(0));
    const total = plan.phases.reduce((n, p) => n + p.steps.length, 0);
    expect(total).toBeGreaterThan(0);
    expect(plan.unassigned.length).toBe(total);
  });

  it('REPORTS THE STEPS THEMSELVES, NOT A PARALLEL LIST OF THEM', () => {
    /* The line on screen says "N of M steps", and the list under it is
       the phases. If `unassigned` were rebuilt from the element list
       rather than read back off the phases, the two could disagree
       while both looked right — a count that describes a plan the
       reader is not looking at. Identity, not equality, is what makes
       that impossible.

       An assignment against an element that produced no step (1.1 is
       settled at rung 4 here) has nowhere to land, and this is what
       says so. */
    const answers = { ...all(0), '1.1': 4 };
    const plan = implementationPlan(answers, {
      assignments: { '1.1': { owner: 'A. Mwangi', due: '2026-11-26' } }
    });
    const steps = plan.phases.flatMap((p) => p.steps);
    expect(plan.unassigned.length).toBeGreaterThan(0);
    for (const entry of plan.unassigned) {
      expect(steps, `${entry.element.id} is not one of the steps on the page`).toContain(entry);
    }
    expect(steps.map((s) => s.element.id)).not.toContain('1.1');
    expect(plan.unassigned.map((s) => s.element.id)).not.toContain('1.1');
  });

  it('leaves owner and due absent rather than empty when unassigned', () => {
    // `'owner' in step` is how the print path decides whether to render
    // a name; a present-but-empty key would print an empty name.
    const step = implementationPlan(all(0)).phases[0]!.steps[0]!;
    expect('owner' in step).toBe(false);
    expect('due' in step).toBe(false);
  });
});

/* ============================================================
   WHERE IS IT WRITTEN DOWN?

   CASA's gap analysis carries a Document reference column against
   every indicator, and instructs: "If you have identified an element
   is already present, you should identify where this is already
   documented within your current organisational documents."

   This closes a hole that was open in this codebase from the start.
   maturity.ts and plan.ts both state SM ICG's prerequisite rule —
   nothing counts as present before it is documented — and neither ever
   asked which document. An element placed at Documented or above IS a
   claim that one exists.
   ============================================================ */
describe('implementationPlan — the document behind the claim', () => {
  it('finds nothing to report when no element is answered', () => {
    expect(implementationPlan({}).undocumented).toEqual([]);
  });

  it('does not ask an ABSENT element to name a document', () => {
    // Rung 0 is the operator saying there is nothing. Demanding a
    // reference for it would be asking them to document the absence.
    expect(implementationPlan(all(0)).undocumented).toEqual([]);
  });

  it('REPORTS EVERY ELEMENT AT DOCUMENTED OR ABOVE THAT NAMES NOTHING', () => {
    const plan = implementationPlan(all(1));
    expect(plan.undocumented.length).toBe(12);
  });

  it('LOOKS AT THE SETTLED ELEMENTS TOO, NOT ONLY THE ONES WITH STEPS', () => {
    /* The defect this is written against: computing the finding from
       the plan's steps, which would exempt exactly the elements making
       the strongest claim — an element at the top of the scale
       produces no step at all. */
    const plan = implementationPlan(all(4));
    expect(plan.phases.flatMap((p) => p.steps)).toEqual([]);
    expect(plan.undocumented.length).toBe(12);
  });

  it('clears an element once a reference is named', () => {
    const plan = implementationPlan(all(2), { references: { '1.1': 'Ops Manual s.3.2 rev 7' } });
    expect(plan.undocumented.map((e) => e.id)).not.toContain('1.1');
    expect(plan.undocumented.length).toBe(11);
  });

  it('does not accept whitespace as a document reference', () => {
    // The same defect as a whitespace owner, in the place where it
    // would silently retire a finding rather than create one.
    const plan = implementationPlan(all(2), { references: { '1.1': '   ' } });
    expect(plan.undocumented.map((e) => e.id)).toContain('1.1');
  });

  it('carries resources onto the step, trimmed, and omits an empty one', () => {
    const plan = implementationPlan(all(0), {
      assignments: {
        '1.1': { resources: '  Four hours of the chief pilot  ' },
        '1.2': { resources: '  ' }
      }
    });
    const steps = plan.phases.flatMap((p) => p.steps);
    expect(steps.find((s) => s.element.id === '1.1')!.resources).toBe(
      'Four hours of the chief pilot'
    );
    expect('resources' in steps.find((s) => s.element.id === '1.2')!).toBe(false);
  });

  it('DOES NOT LET RESOURCES ALONE COUNT AS ASSIGNED', () => {
    // Who and by when are the two questions. A resource note is not an
    // answer to either, and must not retire the unassigned finding.
    const plan = implementationPlan(all(0), { assignments: { '1.1': { resources: 'Nothing new' } } });
    expect(plan.unassigned.map((s) => s.element.id)).toContain('1.1');
  });
});
