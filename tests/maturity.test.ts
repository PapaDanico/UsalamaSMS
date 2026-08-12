/* ============================================================
   The maturity score is arithmetic somebody will put in a board paper.

   Two properties matter more than the rest and both are easy to get
   wrong in the direction that flatters the operator:

     · an UNANSWERED element must not count as zero, or a half-finished
       assessment reports a number about the form rather than about the
       SMS — and it reports it LOW, which is the direction that gets
       argued with rather than acted on;
     · the level label must FLOOR. A component at 2.9 is not
       "Measured". Rounding up is how a maturity claim ends up one
       level better than the evidence behind it.
   ============================================================ */

import { describe, it, expect } from 'vitest';
import {
  SMS_COMPONENTS,
  SMS_ELEMENTS,
  MATURITY_LEVELS,
  MATURITY_SOURCE,
  scoreAssessment,
  levelFor
} from '../packages/shared/src/maturity';

const answerAll = (level: number) =>
  Object.fromEntries(SMS_ELEMENTS.map((e) => [e.id, level]));

describe('the framework itself', () => {
  it('is four components and twelve elements', () => {
    expect(SMS_COMPONENTS).toHaveLength(4);
    expect(SMS_ELEMENTS).toHaveLength(12);
  });

  it('numbers every element under its own component', () => {
    for (const component of SMS_COMPONENTS) {
      for (const element of component.elements) {
        expect(element.id.split('.')[0]).toBe(component.id);
      }
    }
  });

  it('gives every element a question and a piece of evidence', () => {
    // An element with no evidence descriptor is one where level 4 is a
    // mood rather than a claim.
    for (const element of SMS_ELEMENTS) {
      expect(element.question.length).toBeGreaterThan(20);
      expect(element.evidence.length).toBeGreaterThan(20);
    }
  });

  it('declares itself provisional until read against the primary document', () => {
    // The same discipline as the three provisional jurisdictions. If
    // somebody reads Doc 9859 and confirms the element list, they flip
    // this and this test tells them to.
    expect(MATURITY_SOURCE.provisional).toBe(true);
    expect(MATURITY_SOURCE.scale).toMatch(/not published by ICAO/i);
  });

  it('offers a scale that starts at absent', () => {
    expect(MATURITY_LEVELS[0]!.value).toBe(0);
    expect(MATURITY_LEVELS).toHaveLength(5);
  });
});

describe('scoring', () => {
  it('is undefined before anything is answered', () => {
    const result = scoreAssessment({});
    expect(result.mean).toBeUndefined();
    expect(result.answered).toBe(0);
    expect(result.complete).toBe(false);
  });

  it('EXCLUDES unanswered elements rather than counting them as zero', () => {
    // One element at 4, eleven unanswered. The mean of what is known is
    // 4. Counting the rest as zero would report 0.33 — a number about
    // the form, not about the operator.
    const result = scoreAssessment({ '1.1': 4 });
    expect(result.mean).toBe(4);
    expect(result.answered).toBe(1);
    expect(result.complete).toBe(false);
  });

  it('means each component over its own answered elements', () => {
    const result = scoreAssessment({ '2.1': 4, '2.2': 2 });
    const srm = result.components.find((c) => c.component.id === '2')!;
    expect(srm.mean).toBe(3);
    expect(srm.answered).toBe(2);
    expect(srm.total).toBe(2);

    const policy = result.components.find((c) => c.component.id === '1')!;
    expect(policy.answered).toBe(0);
  });

  it('reports complete only when every element is answered', () => {
    expect(scoreAssessment(answerAll(2)).complete).toBe(true);
    expect(scoreAssessment(answerAll(2)).mean).toBe(2);
  });

  it('lists the gaps weakest first, and only the answered ones', () => {
    const result = scoreAssessment({ '1.1': 0, '1.2': 1, '1.3': 4, '2.1': 1 });
    expect(result.gaps.map((g) => g.element.id)).toEqual(['1.1', '1.2', '2.1']);
    expect(result.gaps[0]!.level).toBe(0);
  });

  it('takes the gap threshold from the caller', () => {
    const answers = { '1.1': 0, '1.2': 2, '1.3': 3 };
    expect(scoreAssessment(answers, 1).gaps).toHaveLength(1);
    expect(scoreAssessment(answers, 2).gaps).toHaveLength(2);
  });
});

describe('level labelling', () => {
  it('FLOORS rather than rounds — 2.9 is not Measured', () => {
    expect(levelFor(2.9).label).toBe(MATURITY_LEVELS[2]!.label);
    expect(levelFor(3).label).toBe(MATURITY_LEVELS[3]!.label);
  });

  it('clamps outside the scale rather than returning undefined', () => {
    expect(levelFor(-5).value).toBe(0);
    expect(levelFor(99).value).toBe(4);
  });
});
