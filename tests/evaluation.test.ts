import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  EVALUATION_BY_ID,
  EVALUATION_CRITERIA,
  EVALUATION_INSTRUMENT,
  EVALUATION_LEVELS,
  EVALUATION_LEVEL_MEANING,
  EVALUATION_PHASE,
  EVALUATION_SECTIONS,
  EVALUATION_VERIFIED_AGAINST_PRIMARY,
  evaluationProgress,
} from "../packages/shared/src/evaluation";
import * as evaluationModule from "../packages/shared/src/evaluation";

describe("the SMS evaluation criterion registry", () => {
  it("contains each criterion in the supplied tool exactly once", () => {
    expect(EVALUATION_CRITERIA).toHaveLength(48);
    expect(new Set(EVALUATION_CRITERIA.map((criterion) => criterion.id)).size).toBe(48);
  });

  it("includes the criteria that previously had no product evidence workflow", () => {
    for (const id of ["0.1.5", "1.3.3", "5.1.1", "5.1.2", "6.1.3", "6.1.4"]) {
      expect(EVALUATION_BY_ID.get(id)).toBeDefined();
    }
  });

  it("uses the evidence progression rather than an invented maturity score", () => {
    expect(EVALUATION_LEVELS).toEqual(["PRESENT", "SUITABLE", "OPERATING", "EFFECTIVE"]);
  });
});

describe("what the product claims about where these criteria come from", () => {
  /* THE NAME WAS THE DEFECT. "SET-I" shipped as the operator-facing
     name of a UK CAA instrument and could not be found in the CAA's
     publications; the tool it is built from is the SMS Evaluation Tool,
     SRG1776. These assert that the acronym does not come back, because
     a name nobody can source is the same class of claim as a number
     nobody computed. */
  it("names the instrument in a form that can be cited", () => {
    expect(EVALUATION_INSTRUMENT.reference).toBe("SRG1776");
    expect(EVALUATION_INSTRUMENT.authority).toContain("Civil Aviation Authority");
    expect(EVALUATION_INSTRUMENT.title).toBe("SMS Evaluation Tool");
  });

  it("declares that the criterion list has NOT been read against the primary", () => {
    /* Not a preference — it is false because no one in this
       environment can reach caa.co.uk. If somebody flips it, they must
       have reconciled the list, and this test is where they will come
       to say so. */
    expect(EVALUATION_VERIFIED_AGAINST_PRIMARY).toBe(false);
  });

  it("carries the argument for that in the module, not only in a commit message", () => {
    const source = readFileSync(
      resolve(__dirname, "../packages/shared/src/evaluation.ts"),
      "utf8"
    );
    expect(source).toContain("SRG1776");
    /* The reader has to be able to find out why the old name went. */
    expect(source).toMatch(/SET-I/);
  });

  it("no longer exposes the unsourced acronym as an export", () => {
    const acronymed = Object.keys(evaluationModule).filter((key) => key.startsWith("SETI_"));
    expect(acronymed).toEqual([]);
  });
});

describe("the four levels are explained rather than listed", () => {
  it("gives every level a meaning an assessor can decide against", () => {
    for (const level of EVALUATION_LEVELS) {
      expect(EVALUATION_LEVEL_MEANING[level].length).toBeGreaterThan(20);
    }
  });

  it("splits them across the two evaluation phases the CAA runs", () => {
    /* Present and suitable is phase 1; operating and effective is
       phase 2. An operator preparing for a first evaluation is being
       asked two of these four and not the other two. */
    expect(EVALUATION_PHASE.PRESENT).toBe(1);
    expect(EVALUATION_PHASE.SUITABLE).toBe(1);
    expect(EVALUATION_PHASE.OPERATING).toBe(2);
    expect(EVALUATION_PHASE.EFFECTIVE).toBe(2);
  });
});

describe("sections are derived from the criteria, not typed beside them", () => {
  it("groups every criterion exactly once, in order", () => {
    const grouped = EVALUATION_SECTIONS.flatMap((s) => s.criteria);
    expect(grouped).toHaveLength(EVALUATION_CRITERIA.length);
    expect(grouped.map((c) => c.id)).toEqual(EVALUATION_CRITERIA.map((c) => c.id));
  });

  it("produces the seven sections the tool is numbered under", () => {
    expect(EVALUATION_SECTIONS).toHaveLength(7);
    expect(EVALUATION_SECTIONS[0]?.section).toBe("0 Foundations of SMS");
  });

  it("every section carries at least one criterion", () => {
    for (const section of EVALUATION_SECTIONS) {
      expect(section.criteria.length).toBeGreaterThan(0);
    }
  });
});

describe("progress counts what is actually answerable to a regulator", () => {
  const complete = {
    level: "OPERATING",
    evidence: "Quarterly safety committee minutes, 2026 Q1 and Q2.",
    sourceRefs: "SMS Manual rev 4, s.3.2",
    ownerPost: "Safety Manager",
    reviewDueOn: "2027-01-31",
  };

  it("counts nothing on an untouched assessment", () => {
    expect(evaluationProgress([])).toEqual({ total: 48, rated: 0, remaining: 48 });
  });

  it("counts a fully evidenced criterion", () => {
    expect(evaluationProgress([complete]).rated).toBe(1);
  });

  it("REFUSES a rating with no evidence behind it", () => {
    /* The load-bearing one. A level on its own is the thing this
       ledger exists to prevent — a score with nothing behind it — so
       it must not read as progress either. An assessor told they are
       further along than the record is has been told the one lie this
       screen exists to avoid. */
    expect(evaluationProgress([{ level: "OPERATING" }]).rated).toBe(0);
    expect(evaluationProgress([{ ...complete, evidence: null }]).rated).toBe(0);
    expect(evaluationProgress([{ ...complete, sourceRefs: "" }]).rated).toBe(0);
    expect(evaluationProgress([{ ...complete, ownerPost: null }]).rated).toBe(0);
    expect(evaluationProgress([{ ...complete, reviewDueOn: null }]).rated).toBe(0);
  });

  it("refuses a level that is not one of the four", () => {
    expect(evaluationProgress([{ ...complete, level: "GOOD" }]).rated).toBe(0);
  });

  it("totals against the registry rather than a typed 48", () => {
    expect(evaluationProgress([]).total).toBe(EVALUATION_CRITERIA.length);
  });
});
