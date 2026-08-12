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

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  SMS_COMPONENTS,
  SMS_ELEMENTS,
  MATURITY_LEVELS,
  MATURITY_SOURCE,
  scoreAssessment,
  OPERATOR_SCALES,
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

  it('POSITIONS AN SMS AT ITS WEAKEST ELEMENT, NOT AT ITS AVERAGE', () => {
    /* The compensatory-scoring defect, stated as arithmetic: eleven
       elements at Improving and one at Absent averages 3.67, which
       labels as "Measured" and reads as a healthy SMS while a twelfth
       of it does not exist. An auditor does not average — they find the
       element that is missing and write it up.

       SM ICG, whose evaluation tool CASA has adopted as Form 1591,
       expects ALL elements to reach at least operating and
       effectiveness in ALL of them. A framework whose pass condition is
       universal cannot be reported by a mean. */
    const answers: Record<string, number> = {};
    for (const e of SMS_ELEMENTS) answers[e.id] = 4;
    answers['1.4'] = 0;

    const result = scoreAssessment(answers);
    expect(result.complete).toBe(true);
    expect(result.mean).toBeCloseTo(44 / 12, 5);
    expect(result.position, 'an absent element was averaged away').toBe(0);
    expect(result.limitedBy.map((e) => e.id)).toEqual(['1.4']);
  });

  it('names EVERY element holding the position, because they are the only work that moves it', () => {
    const answers: Record<string, number> = {};
    for (const e of SMS_ELEMENTS) answers[e.id] = 3;
    answers['2.2'] = 1;
    answers['4.1'] = 1;

    const result = scoreAssessment(answers);
    expect(result.position).toBe(1);
    expect(result.limitedBy.map((e) => e.id).sort()).toEqual(['2.2', '4.1']);
  });

  it('withholds a position until every element is answered', () => {
    // The weakest of four answers is not the weakest of twelve, and
    // reporting it as though it were is the same overclaim inverted.
    const partial = scoreAssessment({ '1.1': 0, '1.2': 4 });
    expect(partial.complete).toBe(false);
    expect(partial.position).toBeUndefined();
    expect(partial.limitedBy).toHaveLength(0);
  });

  it('SEPARATES SUITABILITY FROM MATURITY, because they come apart both ways', () => {
    /* SM ICG grades Suitable against "the size, nature, and complexity
       of the organisation and the inherent risk in its activity" — not
       against a fixed bar. That makes it a different question from how
       far an element has been taken, and the two genuinely diverge.

       The case a maturity ladder cannot express, and the reason this is
       not just another rung: an element taken a long way and still
       wrong for the operator. A six-aircraft charter running an
       airline's procedure set scores well and is followed by nobody. */
    const answers: Record<string, number> = {};
    for (const e of SMS_ELEMENTS) answers[e.id] = 3;

    const result = scoreAssessment(answers, 1, { '1.5': 'NOT_SUITABLE' });
    expect(result.unsuitable.map((u) => u.element.id)).toEqual(['1.5']);
    expect(result.unsuitable[0]!.overBuilt, 'a well-developed unsuitable element was not flagged as over-built').toBe(true);

    // And it is NOT a gap: gaps are elements that are behind, which
    // this one is not. Merging the two loses the finding.
    expect(result.gaps.map((g) => g.element.id)).not.toContain('1.5');
  });

  it('does not let suitability move the score, in either direction', () => {
    // Scoring it would collapse the distinction the split exists to
    // make — and SM ICG advises this evaluation not be scored at all.
    const answers: Record<string, number> = {};
    for (const e of SMS_ELEMENTS) answers[e.id] = 3;

    const clean = scoreAssessment(answers);
    const judged = scoreAssessment(answers, 1, { '1.5': 'NOT_SUITABLE', '2.1': 'SUITABLE' });
    expect(judged.mean).toBe(clean.mean);
    expect(judged.position).toBe(clean.position);
    expect(judged.limitedBy.map((e) => e.id)).toEqual(clean.limitedBy.map((e) => e.id));
  });

  it('treats an unanswered suitability question as unanswered, not as suitable', () => {
    // It is the question most operators have never been asked. A
    // default in either direction invents an answer they did not give.
    const answers: Record<string, number> = {};
    for (const e of SMS_ELEMENTS) answers[e.id] = 3;
    expect(scoreAssessment(answers).unsuitable).toHaveLength(0);
    expect(scoreAssessment(answers, 1, { '1.5': undefined }).unsuitable).toHaveLength(0);
  });

  it('names an unsuitable element that is also barely started, without calling it over-built', () => {
    const answers: Record<string, number> = {};
    for (const e of SMS_ELEMENTS) answers[e.id] = 3;
    answers['1.4'] = 1;
    const r = scoreAssessment(answers, 1, { '1.4': 'NOT_SUITABLE' });
    expect(r.unsuitable.map((u) => u.element.id)).toEqual(['1.4']);
    expect(r.unsuitable[0]!.overBuilt).toBe(false);
  });

  it('offers an operator scale to judge suitability against', () => {
    // Asking whether an SMS is suitable without asking who it belongs
    // to is asking half the question. CASA's Book 7 puts the small,
    // non-complex band at ten or fewer people — this product's market.
    expect(OPERATOR_SCALES.length).toBeGreaterThanOrEqual(3);
    const ids = OPERATOR_SCALES.map((s) => s.id);
    expect(new Set(ids).size, 'operator scale ids are not unique').toBe(ids.length);
    expect(ids).toContain('SMALL_NON_COMPLEX');
    for (const s of OPERATOR_SCALES) expect(s.meaning.length).toBeGreaterThan(30);
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

   The arithmetic here produces the figure /coverage renders and the
   README states in prose. If the two ever disagree, one of them is
   lying to an operator about their regulatory position — the sentence
   with the highest consequence in the product.

   It has moved twice: from one and a half when /toolkits/sra took
   element 3.2 from NOT_BUILT to PARTIAL, and again when /toolkits/spi
   did the same to 3.1. Holding the prose to it is `check:claims`,
   which derives the figure from COVERAGE rather than believing a
   literal typed in two files. What these tests hold is the shape of
   the arithmetic itself.
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

  it('never lets the figure exceed what the table actually claims', () => {
    /* This used to assert the figure as a LITERAL — 1.5, then 2 — which
       made the README's sentence and this file two typed copies of one
       number, and moving an element meant editing both. The literal has
       gone: `npm run check:claims` now derives the figure from COVERAGE
       and fails when the README's prose disagrees with it, which is the
       comparison that was actually wanted.

       What is left here is the ceiling. Half credit for PARTIAL is a
       generous rule and it is this product's own; the figure it produces
       must never exceed the count of elements with anything at all
       behind them, or the arithmetic has started flattering the operator
       about their regulatory position. */
    const s = coverageSummary();
    expect(s.elementsCovered).toBeLessThanOrEqual(s.built + s.partial);
    expect(s.elementsCovered).toBeLessThan(s.total);
  });
});

/* ============================================================
   The register's health.

   OVERDUE is the number an inspector goes to first, and it is entirely
   a boundary — so `today` is a parameter rather than a clock read, and
   the boundary is tested on both sides.
   ============================================================ */

import {
  registerHealth,
  normaliseEntry,
  localDayStamp,
  type RiskEntry
} from '../packages/shared/src/maturity';

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

  it('SURVIVES AN ENTRY WITH NO OWNER FIELD AT ALL', () => {
    // The defect a pre-flight probe found: `owner.trim()` threw on an
    // entry that had never had an owner, the repaint died, and every
    // OTHER entry on the register vanished with it — permanently,
    // because the bad row was saved and crashed the page again on
    // every load. One malformed row must never be able to destroy a
    // register.
    const missing = { ...entry(), owner: undefined } as unknown as RiskEntry;
    expect(() => registerHealth([missing], today)).not.toThrow();
    expect(registerHealth([missing], today).unowned).toBe(1);
  });
});

/* ============================================================
   The register's storage boundary.

   Entries live in a browser's localStorage — a place other tabs, other
   code, a half-finished migration and anyone with the dev tools can
   write to. Whatever comes back is not trusted to have a shape.
   ============================================================ */

describe('normalising an entry that came back from storage', () => {
  it('refuses anything without an id, which is all it truly requires', () => {
    expect(normaliseEntry(null)).toBeNull();
    expect(normaliseEntry('a string')).toBeNull();
    expect(normaliseEntry({})).toBeNull();
    expect(normaliseEntry({ id: '' })).toBeNull();
    expect(normaliseEntry({ id: 'r1' })).not.toBeNull();
  });

  it('fills every field the arithmetic touches, so nothing downstream throws', () => {
    const e = normaliseEntry({ id: 'r1' })!;
    expect(e.owner).toBe('');
    expect(e.hazard).toBe('');
    expect(e.reviewBy).toBe('');
    expect(() => registerHealth([e], new Date('2026-08-12'))).not.toThrow();
  });

  it('keeps a bad entry ON the register rather than dropping it silently', () => {
    // The tempting fix was to discard malformed rows. That is a second
    // silent data loss: an entry somebody typed disappears and nothing
    // says why. It is kept, blank fields and all, and it counts as
    // unowned — which is exactly the column that exists to surface it.
    const e = normaliseEntry({ id: 'r1', hazard: 'Bird strike' })!;
    expect(e.hazard).toBe('Bird strike');
    expect(registerHealth([e], new Date('2026-08-12')).unowned).toBe(1);
  });

  it('falls back to OPEN for an unrecognised status rather than trusting it', () => {
    // An unknown status must not read as CLOSED, because CLOSED is
    // excluded from every health count — the flattering direction.
    expect(normaliseEntry({ id: 'r1', status: 'DEFINITELY_FINE' })!.status).toBe('OPEN');
    expect(normaliseEntry({ id: 'r1', status: 'CLOSED' })!.status).toBe('CLOSED');
  });

  it('drops an empty residual half rather than storing it', () => {
    const e = normaliseEntry({ id: 'r1', residualSeverity: '', residualLikelihood: null })!;
    expect(e.residualSeverity).toBeUndefined();
    expect(e.residualLikelihood).toBeUndefined();
  });
});

describe('the day a review falls due', () => {
  /* This suite runs in UTC, where the local day and the UTC day are
     the same and a test cannot tell a correct implementation from the
     broken one. It is therefore pinned to the timezone of the operator
     this product is designed for. Without the pin, restoring
     `toISOString().slice(0, 10)` passes every assertion below — which
     is a check that cannot fail on the defect it exists for. */
  const TZ = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = 'Africa/Nairobi';
  });
  afterAll(() => {
    process.env.TZ = TZ;
  });

  it('is the operator\'s local calendar day, not UTC', () => {
    // 22:00 UTC is 01:00 the NEXT morning in Nairobi. Read as UTC, a
    // review due on the 13th is not yet due at 01:00 on the 13th —
    // wrong in the direction that reports an overdue review as still
    // in hand, which is the direction that gets an operator through an
    // audit believing it was covered.
    const nairobiEarlyMorning = new Date('2026-08-12T22:00:00Z');
    expect(nairobiEarlyMorning.toISOString().slice(0, 10)).toBe('2026-08-12');
    expect(localDayStamp(nairobiEarlyMorning)).toBe('2026-08-13');
  });

  it('counts a review due yesterday as overdue at one in the morning', () => {
    const nairobiEarlyMorning = new Date('2026-08-12T22:00:00Z');
    const due = entry({ reviewBy: '2026-08-12' });
    expect(registerHealth([due], nairobiEarlyMorning).overdue).toBe(1);
  });

  it('pads a single-digit month and day', () => {
    expect(localDayStamp(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
