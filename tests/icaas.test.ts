/* =====================================================================
   THE ICAAS HANDOFF, AND THE ONE CLAIM THAT WOULD BE WORSE THAN NOT
   BUILDING IT.

   There is no ICAAS API. The manual describes a portal a person signs
   into. So the single failure this file exists to prevent is the
   product ever saying, or implying, that it has submitted something to
   the Authority.

   An operator who believed a corrective action had reached KCAA
   because this screen said "sent", and then met an inspector who had
   never seen it, would be worse off than one who had never used this
   at all. They would have stopped chasing it.

   The second failure is quieter and just as costly: a pack that fills
   its blanks with something plausible. An invented target date is one
   the operator carries to the Authority under their own signature.
   ===================================================================== */
import { describe, it, expect } from "vitest";
import {
  SUBMITS_TO_AUTHORITY, ICAAS_PORTAL, ICAAS_SOURCE, CAP_STEPS,
  PREREQUISITES, composeCap,
} from "../packages/shared/src/icaas";

const COMPLETE = {
  id: "ca-1",
  action: "Re-brief crews on the displaced threshold at Wilson before night operations.",
  ownerPost: "Safety Manager",
  dueOn: "2026-09-30T00:00:00.000Z",
  finding: { finding: "Crews not briefed on displaced threshold.", auditRef: "CAR-2026-014" },
  attachments: [{ label: "Briefing sheet", sha256: "a".repeat(64) }],
};

describe("what it must never claim", () => {
  it("DOES NOT SUBMIT TO THE AUTHORITY, and says so as a constant", () => {
    /* The assertion the whole file exists for. A screen cannot drift
       into "sent to KCAA" without deleting a line somebody has to
       justify deleting. */
    expect(SUBMITS_TO_AUTHORITY).toBe(false);
  });

  it("says in its own source note that there is no API", () => {
    expect(ICAAS_SOURCE).toMatch(/no published API/i);
    expect(ICAAS_SOURCE).toMatch(/does not submit/i);
  });

  it("describes steps the OPERATOR takes, not steps we take", () => {
    /* Every step is something a person does at the portal. A step
       written in the product's voice would be the claim arriving
       through the instructions instead of through a label. */
    expect(CAP_STEPS.length).toBeGreaterThan(3);
    for (const s of CAP_STEPS) {
      expect(s, s).not.toMatch(/\bwe (will |)(submit|send|upload)\b/i);
      expect(s.length).toBeGreaterThan(20);
    }
    expect(CAP_STEPS.join(" ")).toMatch(/sign in/i);
  });

  it("names the account prerequisites, because they take time", () => {
    /* The manual puts internal account approval at up to an hour on a
       working day. An operator discovering that at the deadline is an
       operator who missed it. */
    expect(PREREQUISITES.length).toBeGreaterThan(1);
    expect(PREREQUISITES.join(" ")).toMatch(/hour/i);
  });

  it("points at the real portal", () => {
    expect(ICAAS_PORTAL).toBe("https://ecitizen.kcaa.or.ke");
  });
});

describe("the pack fills nothing in", () => {
  it("NAMES A MISSING TARGET DATE rather than inventing one", () => {
    const p = composeCap({ ...COMPLETE, dueOn: null });
    expect(p.targetDate).toBeNull();
    expect(p.readyToSubmit).toBe(false);
    expect(p.missing.join(" ")).toMatch(/target date/i);
  });

  it("names a missing owner, and a missing action", () => {
    const noOwner = composeCap({ ...COMPLETE, ownerPost: "  " });
    expect(noOwner.missing.join(" ")).toMatch(/no post is accountable/i);
    const noAction = composeCap({ ...COMPLETE, action: "" });
    expect(noAction.missing.join(" ")).toMatch(/empty/i);
  });

  it("REFUSES A CANCELLED ACTION as an answer to a CAR", () => {
    /* Submitting one would tell the Authority the operator is acting on
       something they have stopped doing. */
    const p = composeCap({ ...COMPLETE, cancelledOn: "2026-08-01T00:00:00.000Z" });
    expect(p.readyToSubmit).toBe(false);
    expect(p.missing.join(" ")).toMatch(/cancelled/i);
  });

  it("says when no CAR is linked, without treating it as fatal to the record", () => {
    /* An operator may raise a corrective action from their own hazard.
       The portal raises a CAP against a CAR, so they will have to pick
       one — which is worth saying before they get there. */
    const p = composeCap({ ...COMPLETE, finding: null });
    expect(p.finding).toBeNull();
    expect(p.missing.join(" ")).toMatch(/pick the matching one yourself/i);
  });

  it("and a COMPLETE action is ready, with nothing missing", () => {
    /* The other direction. A composer that always reported something
       missing would satisfy every assertion above and be useless. */
    const p = composeCap(COMPLETE);
    expect(p.missing).toHaveLength(0);
    expect(p.readyToSubmit).toBe(true);
    expect(p.reference).toBe("CAR-2026-014");
    expect(p.action).toMatch(/displaced threshold/);
    expect(p.ownerPost).toBe("Safety Manager");
  });
});

describe("evidence", () => {
  it("carries the hash, because that is what makes a file the same file", () => {
    const p = composeCap(COMPLETE);
    expect(p.evidence).toHaveLength(1);
    expect(p.evidence[0]!.sha256).toHaveLength(64);
  });

  it("drops attachments with no hash rather than listing them unverifiable", () => {
    const p = composeCap({
      ...COMPLETE,
      attachments: [{ label: "Scan", sha256: undefined }, { label: "Photo", sha256: "b".repeat(64) }],
    });
    expect(p.evidence).toHaveLength(1);
    expect(p.evidence[0]!.label).toBe("Photo");
  });

  it("copes with an action that has no attachments at all", () => {
    const p = composeCap({ ...COMPLETE, attachments: undefined });
    expect(p.evidence).toHaveLength(0);
    /* Evidence is uploaded AFTER the CAP is approved, so its absence
       does not stop the CAP being submitted. */
    expect(p.readyToSubmit).toBe(true);
  });

  it("falls back to the action id when there is no CAR reference", () => {
    const p = composeCap({ ...COMPLETE, finding: { finding: "x", auditRef: "" } });
    expect(p.reference).toBe("ca-1");
  });
});
