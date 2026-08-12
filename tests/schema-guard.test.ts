/* ============================================================
   The readiness probe's table list is not maintained by hand.

   THE OUTAGE THIS COMES FROM. Pull request #20 merged, the code
   deployed, and the migration creating its nine tables never ran —
   because merging ships code and nothing ships schema. `/api/ready`
   answered {"ok":true} the whole time, since all it asked was
   `SELECT 1`. Every element of /sms showed "This part of the record
   could not be read" — a message written for a lost connection, doing
   duty for a schema that was never applied.

   The fix is only as good as its list, and a hand-kept list of tables
   is the same class of thing as a hand-kept count: it is right on the
   day it is written. So the list is checked against prisma/schema.prisma
   here. Add a model without adding it to EXPECTED_TABLES and this goes
   red — which is precisely the mistake that caused the outage, now
   failing the build instead of production.
   ============================================================ */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { EXPECTED_TABLES } from "../apps/api/src/schema-guard";

/** Model names, read from the schema rather than restated. */
function modelsInSchema(): string[] {
  const schema = readFileSync(resolve(__dirname, "../prisma/schema.prisma"), "utf8");
  return [...schema.matchAll(/^model\s+([A-Za-z][A-Za-z0-9_]*)\s*\{/gm)]
    .map((m) => m[1]!)
    .sort();
}

describe("the readiness probe's table list", () => {
  it("finds models in the schema at all", () => {
    // A gate that reads nothing passes everything. If the regex ever
    // stops matching, this fails rather than silently approving an
    // empty comparison.
    expect(modelsInSchema().length).toBeGreaterThan(10);
  });

  it("NAMES EVERY MODEL THE SCHEMA DECLARES, AND NO OTHERS", () => {
    /* Both directions matter. A model missing from the list is a table
       the probe will not notice is absent — the outage again. A name in
       the list that no model declares is a probe that can never go
       green, which is the same fault wearing the opposite sign. */
    expect([...EXPECTED_TABLES].sort()).toEqual(modelsInSchema());
  });

  it("is sorted, so a new model is a one-line diff", () => {
    expect([...EXPECTED_TABLES]).toEqual([...EXPECTED_TABLES].sort());
  });

  it("carries no duplicates", () => {
    expect(new Set(EXPECTED_TABLES).size).toBe(EXPECTED_TABLES.length);
  });

  it("includes the nine tables the missed migration creates", () => {
    // Named explicitly rather than left to the comparison above: these
    // are the ones that were absent from production while the probe
    // reported ready, and a regression here has a known cost.
    for (const table of [
      "SafetyPolicy", "PolicyAcknowledgement", "Accountability", "Appointment",
      "EmergencyExercise", "ControlledDocument", "AuditFinding", "TrainingRecord",
      "SafetyCommunication",
    ]) {
      expect(EXPECTED_TABLES, `${table} is not guarded`).toContain(table);
    }
  });
});
