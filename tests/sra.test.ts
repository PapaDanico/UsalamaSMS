/* ============================================================
   The Safety Risk Assessment.

   Two properties carry the weight, and both fail in the direction that
   produces a signed document rather than a safe operation:

     · an INTOLERABLE residual risk must block acceptance. Doc 9859's
       red band is not "acceptable with sufficiently senior sign-off",
       it is not acceptable at any level of benefit. A tool that let an
       accountable executive click past it would be helping produce the
       document proving they knew;

     · completeness is COMPUTED from the content, never ticked. A
       checklist somebody ticks is a checklist that gets ticked, and the
       whole value of the five steps is that a step is done when its
       evidence exists.
   ============================================================ */

import { describe, it, expect } from 'vitest';
import {
  SRA_STEPS,
  sraProgress,
  sraVerdict,
  effectiveRisk,
  type Sra,
  type SraHazard
} from '../packages/shared/src/sra';

const hazard = (over: Partial<SraHazard> = {}): SraHazard => ({
  id: 'h1',
  hazard: 'Wet-season crosswind on the unpaved strip',
  consequence: 'Runway excursion on landing roll',
  severity: 'C_MAJOR',
  likelihood: 'REMOTE',
  controls: '',
  owner: 'Chief Pilot',
  controlReviewed: false,
  ...over
});

const sra = (over: Partial<Sra> = {}): Sra => ({
  id: 's1',
  title: 'New scheduled service to an unpaved northern strip',
  system:
    'Twice-weekly F50 service into an unpaved strip with no published instrument ' +
    'approach, operated by crews currently flying only paved destinations.',
  hazards: [hazard(), hazard({ id: 'h2', hazard: 'No published approach' })],
  status: 'DRAFT',
  acceptedBy: '',
  acceptedOn: '',
  createdAt: '2026-08-12T00:00:00.000Z',
  ...over
});

describe('the five steps are ICAO\'s', () => {
  it('is five steps in Doc 9859 order', () => {
    expect(SRA_STEPS).toHaveLength(5);
    expect(SRA_STEPS.map((s) => s.id)).toEqual([
      'system',
      'hazards',
      'analyse',
      'assess',
      'control'
    ]);
    expect(SRA_STEPS.map((s) => s.ordinal)).toEqual([1, 2, 3, 4, 5]);
  });

  it('gives every step a purpose AND the evidence an auditor looks for', () => {
    // A step with no evidence descriptor is a heading.
    for (const step of SRA_STEPS) {
      expect(step.purpose.length).toBeGreaterThan(40);
      expect(step.evidence.length).toBeGreaterThan(40);
    }
  });

  it('keeps the loop back from control to hazard identification', () => {
    // The step most templates drop. A control changes the system, so it
    // has to be run back through — a mitigation that introduces a new
    // hazard is the commonest way an SRA makes an operation less safe
    // while documenting the opposite.
    expect(SRA_STEPS[4]!.evidence).toMatch(/back through/i);
  });
});

describe('progress is computed from the content', () => {
  it('refuses a system description too thin to act on', () => {
    const thin = sraProgress(sra({ system: 'New route.' }))[0]!;
    expect(thin.complete).toBe(false);
    expect(sraProgress(sra())[0]!.complete).toBe(true);
  });

  it('refuses a single-hazard assessment', () => {
    // Usually one person's first thought written down.
    expect(sraProgress(sra({ hazards: [hazard()] }))[1]!.complete).toBe(false);
    expect(sraProgress(sra())[1]!.complete).toBe(true);
  });

  it('is incomplete while any hazard lacks a severity or likelihood', () => {
    const partial = sra({
      hazards: [hazard(), hazard({ id: 'h2', severity: undefined })]
    });
    expect(sraProgress(partial)[2]!.complete).toBe(false);
    expect(sraProgress(partial)[2]!.missing).toMatch(/1 hazard/);
  });

  it('completes the control step when nothing needs controlling', () => {
    // Everything already acceptable. E_NEGLIGIBLE x EXTREMELY_IMPROBABLE
    // is green, so there is nothing to mitigate and the step is done —
    // rather than stuck open forever waiting for a control that is not
    // required.
    const green = sra({
      hazards: [
        hazard({ severity: 'E_NEGLIGIBLE', likelihood: 'EXTREMELY_IMPROBABLE' }),
        hazard({ id: 'h2', severity: 'E_NEGLIGIBLE', likelihood: 'EXTREMELY_IMPROBABLE' })
      ]
    });
    expect(sraProgress(green)[4]!.complete).toBe(true);
  });

  it('holds the control step open until the control has been reviewed', () => {
    // Mitigated and assessed, but not run back through step 2. The step
    // most templates drop, held open here.
    const mitigated = sra({
      hazards: [
        hazard({
          severity: 'B_HAZARDOUS',
          likelihood: 'OCCASIONAL',
          controls: 'Crosswind limit reduced and a runway inspection before each arrival',
          residualSeverity: 'D_MINOR',
          residualLikelihood: 'IMPROBABLE',
          controlReviewed: false
        }),
        hazard({ id: 'h2', severity: 'E_NEGLIGIBLE', likelihood: 'EXTREMELY_IMPROBABLE' })
      ]
    });
    const step = sraProgress(mitigated)[4]!;
    expect(step.complete).toBe(false);
    expect(step.missing).toMatch(/back through/i);
  });
});

describe('acceptance', () => {
  const mitigated = (over: Partial<SraHazard> = {}) =>
    hazard({
      severity: 'B_HAZARDOUS',
      likelihood: 'OCCASIONAL',
      controls: 'Crosswind limit reduced, runway inspection before each arrival',
      residualSeverity: 'D_MINOR',
      residualLikelihood: 'IMPROBABLE',
      controlReviewed: true,
      ...over
    });

  it('is ready when every step is complete and nothing is left intolerable', () => {
    const v = sraVerdict(sra({ hazards: [mitigated(), mitigated({ id: 'h2' })] }));
    expect(v.stepsComplete).toBe(v.stepsTotal);
    expect(v.intolerableRemaining).toBe(0);
    expect(v.readyToAccept).toBe(true);
    expect(v.blocker).toBe('');
  });

  it('BLOCKS acceptance while a residual risk is intolerable', () => {
    // The assertion this file exists for. A_CATASTROPHIC x FREQUENT is
    // red after controls as well as before. Doc 9859 does not offer a
    // sign-off that makes red acceptable, so neither does this.
    const stillRed = mitigated({
      residualSeverity: 'A_CATASTROPHIC',
      residualLikelihood: 'FREQUENT'
    });
    const v = sraVerdict(sra({ hazards: [stillRed, mitigated({ id: 'h2' })] }));

    expect(v.intolerableRemaining).toBe(1);
    expect(v.readyToAccept).toBe(false);
    expect(v.blocker).toMatch(/not acceptable at any level of benefit/i);
  });

  it('blocks on an UNMITIGATED intolerable risk too, not only a residual one', () => {
    // No controls at all, so the effective risk is the initial one.
    // Reading only the residual field would let an unmitigated red risk
    // through by leaving the mitigation blank — the flattering
    // direction, and the easy one to get wrong.
    const raw = hazard({ severity: 'A_CATASTROPHIC', likelihood: 'FREQUENT' });
    const v = sraVerdict(sra({ hazards: [raw, mitigated({ id: 'h2' })] }));
    expect(v.intolerableRemaining).toBe(1);
    expect(v.readyToAccept).toBe(false);
  });

  it('reports the FIRST incomplete step as the blocker when nothing is red', () => {
    const v = sraVerdict(sra({ system: 'Thin.', hazards: [mitigated(), mitigated({ id: 'h2' })] }));
    expect(v.readyToAccept).toBe(false);
    expect(v.blocker).toMatch(/Describe the change/);
  });
});

describe('effective risk', () => {
  it('uses the residual where controls exist and the initial where they do not', () => {
    expect(effectiveRisk(hazard({ severity: 'A_CATASTROPHIC', likelihood: 'FREQUENT' }))).toEqual({
      tolerability: 'INTOLERABLE',
      score: 25
    });
    expect(
      effectiveRisk(
        hazard({
          severity: 'A_CATASTROPHIC',
          likelihood: 'FREQUENT',
          residualSeverity: 'E_NEGLIGIBLE',
          residualLikelihood: 'EXTREMELY_IMPROBABLE'
        })
      )
    ).toEqual({ tolerability: 'ACCEPTABLE', score: 1 });
  });

  it('survives a malformed scale value rather than throwing into the UI', () => {
    expect(effectiveRisk(hazard({ severity: 'NOT_A_SEVERITY' }))).toBeNull();
  });
});
