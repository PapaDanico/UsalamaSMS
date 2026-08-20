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
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { EXPECTED_TABLES } from "../apps/api/src/schema-guard";
import { JURISDICTIONS } from "../packages/shared/src/regulations";

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

/* ============================================================
   MERGING SHIPS CODE AND NOTHING SHIPS SCHEMA — the enum half.

   The block above catches a MODEL that reached schema.prisma without a
   migration. On 19 August 2026 the same mistake arrived one level down,
   on an enum VALUE, and nothing was watching that axis.

   Jurisdiction gained UG, TZ, RW, BI, SS, CD and SO in schema.prisma.
   regulations.ts gained a PROVISIONAL row for each. The signup panel
   began rendering all nine in a dropdown. No migration added the values
   to Postgres, which still held exactly two.

   Every layer agreed with itself, so every layer passed: Prisma
   generated its client from schema.prisma, Zod validated against
   regulations.ts, 975 unit tests and 495 integration tests were green —
   because not one of them ever created an org outside Kenya.

   The customer found it instead. Choosing Uganda made `org.create`
   raise `invalid input value for enum "Jurisdiction": "UG"` and signup
   answered 500. An operator in the market this product was built for
   could not open an account.

   MUTATION-CHECKED BOTH WAYS, against a real Postgres built from these
   migrations: with the seven values present, Kenya, Uganda and Somalia
   all create; with the enum cut back to ICAO and KE, Kenya creates and
   the other seven fail on that exact message. And deleting the ADD
   VALUE migration reddens this test alone.

   The check is over EVERY enum, not just Jurisdiction. The point of a
   gate is that it covers the next one, which will not be this one.
   ============================================================ */
describe("every enum value in schema.prisma is created by a migration", () => {
  const MIGRATIONS = resolve(__dirname, "../prisma/migrations");

  /** Migration SQL, in the order Prisma applies it — directory name. */
  function migrationsInOrder(): string[] {
    return readdirSync(MIGRATIONS, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()
      .map((name) => {
        try {
          return readFileSync(resolve(MIGRATIONS, name, "migration.sql"), "utf8");
        } catch {
          return "";
        }
      });
  }

  /* The labels an enum ends up with, by replaying the DDL rather than by
     reading the newest statement. This enum has been recreated twice —
     20260812070000 and 20260812074500 both dropped values, which
     Postgres can only do by rename-and-recreate — so "the last CREATE
     TYPE wins, plus every ADD VALUE after it" is the only reading that
     survives that history. */
  function labelsFromMigrations(enumName: string): Set<string> {
    let labels = new Set<string>();
    const created = new RegExp(
      `CREATE\\s+TYPE\\s+"${enumName}"\\s+AS\\s+ENUM\\s*\\(([^)]*)\\)`,
      "gi"
    );
    const added = new RegExp(
      `ALTER\\s+TYPE\\s+"${enumName}"\\s+ADD\\s+VALUE(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+'([^']+)'`,
      "gi"
    );
    for (const sql of migrationsInOrder()) {
      /* Statements are replayed in file order within a migration too, so
         a CREATE and a later ADD VALUE in one file compose correctly. */
      for (const m of sql.matchAll(/[^\n]*(?:CREATE\s+TYPE|ALTER\s+TYPE)[^;]*;/gi)) {
        const stmt = m[0];
        created.lastIndex = 0;
        added.lastIndex = 0;
        const c = created.exec(stmt);
        if (c) {
          labels = new Set(
            c[1]!.split(",").map((s) => s.trim().replace(/^'|'$/g, "")).filter(Boolean)
          );
          continue;
        }
        const a = added.exec(stmt);
        if (a) labels.add(a[1]!);
      }
    }
    return labels;
  }

  /** Enum name -> declared values, from schema.prisma. */
  function enumsInSchema(): Map<string, string[]> {
    const schema = readFileSync(resolve(__dirname, "../prisma/schema.prisma"), "utf8");
    const out = new Map<string, string[]>();
    for (const m of schema.matchAll(/^enum\s+([A-Za-z][A-Za-z0-9_]*)\s*\{([^}]*)\}/gm)) {
      const values = m[2]!
        .split("\n")
        .map((l) => l.replace(/\/\/.*$/, "").trim())
        .filter((l) => /^[A-Za-z][A-Za-z0-9_]*$/.test(l));
      out.set(m[1]!, values);
    }
    return out;
  }

  /* The guard guards its own subject. A regex that quietly stopped
     matching would leave this suite passing over nothing at all, which
     is the failure one layer down from the one being fixed. */
  it("finds the enums and their values at all", () => {
    const enums = enumsInSchema();
    expect(enums.size).toBeGreaterThanOrEqual(5);
    expect(enums.get("Jurisdiction")).toContain("KE");
    expect(labelsFromMigrations("Jurisdiction").size).toBeGreaterThanOrEqual(2);
  });

  for (const [name, values] of enumsInSchema()) {
    it(`${name}: every declared value exists in the migrations`, () => {
      const inDb = labelsFromMigrations(name);
      const missing = values.filter((v) => !inDb.has(v));
      expect(
        missing,
        `${name} declares ${missing.join(", ")} in schema.prisma, and no migration ` +
          `creates ${missing.length === 1 ? "it" : "them"}. Writing the value into ` +
          `Postgres raises "invalid input value for enum". Add a migration with ` +
          `ALTER TYPE "${name}" ADD VALUE IF NOT EXISTS '<value>'.`
      ).toEqual([]);
    });
  }

  /* The registry the signup dropdown is built from and the enum the
     database enforces are two lists that must not drift apart. They are
     written in different files, in different languages, by different
     people — which is exactly the shape that drifts. */
  it("the Jurisdiction enum matches the JURISDICTIONS registry exactly", () => {
    const schemaValues = [...(enumsInSchema().get("Jurisdiction") ?? [])].sort();
    expect([...JURISDICTIONS].sort()).toEqual(schemaValues);
  });
});
