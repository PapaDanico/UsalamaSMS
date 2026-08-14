/* ============================================================
   The Duty Holder escalation, borrowed from RA 1210.

   Doc 9859 tells an operator what a risk IS and is close to silent on
   who may carry it. In a three-aircraft operator that silence resolves
   the wrong way by default: whoever assessed the hazard writes their
   own name in the owner box, an amber risk ends up owned by the person
   least able to spend money on it, and the register reads as managed
   while nothing about it is.

   The checks below hold two things. That authority is ORDERED — the
   question is "senior enough", not "this exact post" — and that an
   unrecognised post is reported as unknown rather than rejected,
   because a small operator's real titles are not this product's enum.
   ============================================================ */

import { describe, it, expect } from "vitest";
import {
  requiredHolder,
  meetsRequirement,
  AUTHORITY_ORDER,
} from "../packages/shared/src/holder";

describe("who may own a risk", () => {
  it("ESCALATES WITH THE BAND, which is the whole borrowed idea", () => {
    /* RA 1210: high and medium risks are managed by the Operating Duty
       Holder, low risks by the Delivery Duty Holder. The principle
       transfers even though the job titles do not. */
    const green = AUTHORITY_ORDER.indexOf(requiredHolder("ACCEPTABLE").minimum);
    const amber = AUTHORITY_ORDER.indexOf(requiredHolder("TOLERABLE").minimum);
    const red = AUTHORITY_ORDER.indexOf(requiredHolder("INTOLERABLE").minimum);

    expect(amber).toBeGreaterThan(green);
    expect(red).toBeGreaterThanOrEqual(amber);
  });

  it("puts a TOLERABLE risk with the post that can spend money", () => {
    /* An ALARP judgement is a judgement about cost against safety.
       Leaving it with the safety manager asks somebody to decide that
       further reduction is not reasonably practicable when they cannot
       authorise the spending that would reduce it. */
    expect(requiredHolder("TOLERABLE").minimum).toBe("ACCOUNTABLE_EXECUTIVE");
    expect(requiredHolder("TOLERABLE").because).toMatch(/spend|cost/i);
  });

  it("does not escalate an ACCEPTABLE risk out of the safety office", () => {
    // Escalating everything is the same failure as escalating nothing:
    // if the accountable executive owns every green risk, the signal
    // that an amber one has reached them is gone.
    expect(requiredHolder("ACCEPTABLE").minimum).toBe("SAFETY_MANAGER");
  });

  it("ACCEPTS A MORE SENIOR OWNER, because the rule is a floor not a slot", () => {
    /* An unordered check could only ask "is it this exact post", which
       would reject an accountable executive owning a low risk. That is
       not an escalation rule, it is a straitjacket, and it would be
       wrong in the direction that looks rigorous. */
    expect(meetsRequirement("ACCEPTABLE", "ACCOUNTABLE_EXECUTIVE")).toBe("meets");
    expect(meetsRequirement("ACCEPTABLE", "SAFETY_MANAGER")).toBe("meets");
  });

  it("REPORTS A TOO-JUNIOR OWNER as below, not as invalid", () => {
    expect(meetsRequirement("TOLERABLE", "SAFETY_MANAGER")).toBe("below");
    expect(meetsRequirement("TOLERABLE", "SAFETY_OFFICER")).toBe("below");
    expect(meetsRequirement("INTOLERABLE", "SAFETY_MANAGER")).toBe("below");
  });

  it("SAYS UNKNOWN FOR A POST IT DOES NOT RECOGNISE, and that is deliberate", () => {
    /* The owner field has a free-text escape because a small operator's
       real titles are not this enum — "the Director" may genuinely be
       the accountable executive. Refusing an unrecognised string would
       make the product argue with an operator about its own org chart
       and push the answer into a name box, which is how a register
       stops recording who owns anything. */
    expect(meetsRequirement("TOLERABLE", "The Director")).toBe("unknown");
    expect(meetsRequirement("TOLERABLE", "")).toBe("unknown");
    expect(meetsRequirement("TOLERABLE", undefined)).toBe("unknown");
    expect(meetsRequirement("TOLERABLE", null)).toBe("unknown");
  });

  it("gives every band a reason an operator could put in their own manual", () => {
    // RA 1210 requires the ownership and referral protocol to be
    // WRITTEN INTO the safety management system rather than left to
    // custom. A rule with no stated reason cannot be written down.
    for (const band of ["INTOLERABLE", "TOLERABLE", "ACCEPTABLE"] as const) {
      const r = requiredHolder(band);
      expect(AUTHORITY_ORDER).toContain(r.minimum);
      expect(r.because.trim().length, `${band} has no reason`).toBeGreaterThan(40);
      expect(r.because, `${band}'s reason is not a sentence`).toMatch(/\.$/);
    }
  });

  it("keeps the authority order ascending, or every comparison inverts", () => {
    expect(AUTHORITY_ORDER[0]).toBe("SAFETY_OFFICER");
    expect(AUTHORITY_ORDER[AUTHORITY_ORDER.length - 1]).toBe("ACCOUNTABLE_EXECUTIVE");
    expect(new Set(AUTHORITY_ORDER).size).toBe(AUTHORITY_ORDER.length);
  });
});
