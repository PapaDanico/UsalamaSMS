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
