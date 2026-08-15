/* ============================================================
   THE EXPORT NEVER READS MORE THAN IT WILL CARRY.

   THIS TEST EXISTS BECAUSE THE INTEGRATION SUITE BESIDE IT COULD NOT
   FAIL FOR THE THING IT WAS WRITTEN TO GUARD, and that was found by
   mutation-checking rather than by reading.

   export.limit.integration.test.ts asserts that an over-large record is
   REFUSED rather than truncated. It is a good suite and it catches the
   refusal being removed, the off-by-one on the probe, and a partial
   payload shipped beside a 413. Then the caps themselves — `take:
   PROBE` on all twenty-three collections — were deleted, and every one
   of its seven assertions stayed green.

   OF COURSE THEY DID. The refusal counts rows in the arrays it was
   handed. With no cap, an over-large collection loads in full and is
   still over the limit, so the route still answers 413 and every
   observable property holds. The response is identical. What differs is
   that the function has already pulled the entire table into a
   gigabyte of memory to discover it should not have — which is the
   out-of-memory the cap exists to prevent, and the only failure mode
   that actually matters.

   A RUNTIME TEST CANNOT SEE THIS. The property is not in the answer, it
   is in the work done before the answer, and nothing the route returns
   distinguishes the two. So it is checked where it IS visible — in the
   source — the same way check-retraction.mjs asserts that every read of
   SafetyReport declares its position on retracted rows.

   WHEN THIS FAILS, the fix is to add `take: PROBE` to the new
   collection. It is not to relax the check: an uncapped read here is
   the one that takes the export down on the largest operator, which is
   the customer whose record matters most and the one who will not be
   able to produce it for an audit.
   ============================================================ */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(
  resolve(__dirname, "..", "apps/api/src/routes.export.ts"),
  "utf8",
);

/** The handler's Promise.all block — the reads that build the payload. */
function payloadBlock(): string {
  const open = source.indexOf("] = await Promise.all([");
  const close = source.indexOf("\n      ]);", open);
  expect(open, "the export's payload block was not found — this gate has gone blind").toBeGreaterThan(-1);
  expect(close, "the export's payload block did not close where expected").toBeGreaterThan(open);
  return source.slice(open, close);
}

describe("the export reads no more than it will carry", () => {
  /* CHARTER RULE 11, and this gate reads another file for its subject,
     which is exactly the kind that stops checking without saying so. If
     the block cannot be located the count goes to zero and the
     assertions below pass vacuously — so the count is asserted first. */
  it("finds the reads at all", () => {
    const block = payloadBlock();
    expect(
      (block.match(/findMany\(/g) ?? []).length,
      "no findMany calls were read out of the export — the gate is blind",
    ).toBeGreaterThan(15);
  });

  /* THE ASSERTION. Twenty-three collections, and the one that gets
     added without a cap is the one nobody notices until an operator
     with a real record cannot produce it. */
  it("caps every collection it loads", () => {
    const block = payloadBlock();
    const calls = (block.match(/findMany\(/g) ?? []).length;
    const capped = (block.match(/take: PROBE/g) ?? []).length;

    expect(
      capped,
      `${calls - capped} collection(s) in the export load without take: PROBE — ` +
        "an uncapped read here is the out-of-memory that takes the export down on " +
        "the largest operator, and the refusal cannot catch it because the rows are " +
        "already in memory by the time it counts them",
    ).toBe(calls);
  });

  /* The probe reads ONE PAST the limit, which is what makes "exactly at
     the limit" distinguishable from "over it". Asserted here as well as
     in the integration suite because this is where somebody editing the
     constant is looking. */
  it("probes one row past the limit rather than at it", () => {
    expect(source).toMatch(/const PROBE = EXPORT_LIMIT \+ 1;/);
  });

  /* A configurable limit is a foot-gun without a floor: a deploy that
     sets it to 0 or to nonsense would refuse every export, on the route
     an operator needs when an authority is asking. */
  it("clamps the configured limit rather than trusting it", () => {
    expect(source).toMatch(/Math\.max\(\s*1,/);
  });

  /* It must refuse rather than truncate. A shortened export looks
     exactly like a complete one to whoever is handed it. */
  it("refuses rather than shipping what it managed to read", () => {
    expect(source).toContain('error: "too_large"');
    expect(source).toMatch(/reply\.code\(413\)/);
  });
});
