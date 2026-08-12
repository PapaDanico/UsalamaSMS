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

/* ============================================================
   Coverage: the answer to an audit that could not see the source.

   The arithmetic here produces the sentence the About page states —
   "substantially covers one and a half of twelve" — so if the two ever
   disagree, one of them is lying to an operator about its regulatory
   position. That is the sentence with the highest consequence in the
   product.
   ============================================================ */

import { COVERAGE, coverageSummary } from '../packages/shared/src/maturity';

describe('coverage', () => {
  it('declares a state for every element in the framework, and no others', () => {
    expect(COVERAGE).toHaveLength(SMS_ELEMENTS.length);
    const declared = COVERAGE.map((c) => c.id).sort();
    const framework = SMS_ELEMENTS.map((e) => e.id).sort();
    expect(declared).toEqual(framework);
  });

  it('says what is missing for EVERY element, including the built ones', () => {
    // A built element with nothing missing is a claim that one twelfth
    // of an SMS is finished. Even reporting has gaps — proactive and
    // predictive identification — and the page has to say so.
    for (const entry of COVERAGE) {
      expect(entry.missing.length).toBeGreaterThan(20);
    }
  });

  it('gives every non-empty state something to point at or something it has', () => {
    for (const entry of COVERAGE) {
      if (entry.state === 'NOT_BUILT') expect(entry.has).toBe('');
      else expect(entry.has.length).toBeGreaterThan(10);
    }
  });

  it('counts PARTIAL as a half and ASSESSED_ONLY as nothing', () => {
    // The whole point: being able to MEASURE an element is not covering
    // it. Conflating the two is the overclaim in miniature.
    const s = coverageSummary();
    expect(s.elementsCovered).toBe(s.built + s.partial / 2);
    expect(s.built + s.partial + s.assessedOnly + s.notBuilt).toBe(s.total);
  });

  it('produces the one-and-a-half figure the About page states', () => {
    const s = coverageSummary();
    expect(s.total).toBe(12);
    expect(s.elementsCovered).toBe(1.5);
  });
});

/* ============================================================
   The register's health.

   OVERDUE is the number an inspector goes to first, and it is entirely
   a boundary — so `today` is a parameter rather than a clock read, and
   the boundary is tested on both sides.
   ============================================================ */

import { registerHealth, type RiskEntry } from '../packages/shared/src/maturity';

const entry = (over: Partial<RiskEntry> = {}): RiskEntry => ({
  id: 'r1',
  hazard: 'Bird activity on approach',
  consequence: 'Engine ingestion on short final',
  severity: 'B_HAZARDOUS',
  likelihood: 'OCCASIONAL',
  controls: '',
  owner: 'Safety manager',
  reviewBy: '2026-12-01',
  status: 'OPEN',
  createdAt: '2026-08-12T00:00:00.000Z',
  ...over
});

describe('register health', () => {
  const today = new Date('2026-08-12T09:00:00Z');

  it('counts nothing when the register is empty', () => {
    const h = registerHealth([], today);
    expect(h.total).toBe(0);
    expect(h.overdue).toBe(0);
  });

  it('treats a review date BEFORE today as overdue, and today as not', () => {
    expect(registerHealth([entry({ reviewBy: '2026-08-11' })], today).overdue).toBe(1);
    expect(registerHealth([entry({ reviewBy: '2026-08-12' })], today).overdue).toBe(0);
  });

  it('does not count a CLOSED entry as overdue or open', () => {
    const h = registerHealth([entry({ reviewBy: '2020-01-01', status: 'CLOSED' })], today);
    expect(h.overdue).toBe(0);
    expect(h.open).toBe(0);
    expect(h.total).toBe(1);
  });

  it('counts an entry nobody owns', () => {
    expect(registerHealth([entry({ owner: '   ' })], today).unowned).toBe(1);
  });

  it('uses RESIDUAL risk where controls exist, and initial where they do not', () => {
    // A_CATASTROPHIC x FREQUENT is intolerable; E_NEGLIGIBLE x
    // EXTREMELY_IMPROBABLE is not. An entry whose controls bring it
    // down must stop counting as intolerable — and an entry with no
    // controls must keep counting, because rounding an unmitigated
    // hazard down is the flattering direction.
    const unmitigated = entry({ severity: 'A_CATASTROPHIC', likelihood: 'FREQUENT' });
    expect(registerHealth([unmitigated], today).intolerableOpen).toBe(1);

    const mitigated = entry({
      severity: 'A_CATASTROPHIC',
      likelihood: 'FREQUENT',
      controls: 'Bird patrol before every departure',
      residualSeverity: 'E_NEGLIGIBLE',
      residualLikelihood: 'EXTREMELY_IMPROBABLE'
    });
    expect(registerHealth([mitigated], today).intolerableOpen).toBe(0);
  });

  it('stops counting an intolerable risk once it is formally ACCEPTED', () => {
    // Accepted is a decision somebody made and signed. It is still on
    // the register and still visible; it is no longer an open question.
    const accepted = entry({
      severity: 'A_CATASTROPHIC',
      likelihood: 'FREQUENT',
      status: 'ACCEPTED',
      acceptedBy: 'Accountable executive'
    });
    const h = registerHealth([accepted], today);
    expect(h.intolerableOpen).toBe(0);
    expect(h.accepted).toBe(1);
  });

  it('survives a malformed scale value rather than throwing into the UI', () => {
    const bad = entry({ severity: 'NOT_A_SEVERITY', likelihood: 'FREQUENT' });
    expect(() => registerHealth([bad], today)).not.toThrow();
    expect(registerHealth([bad], today).intolerableOpen).toBe(0);
  });
});
