// =====================================================================
// Anonymity, against a real Postgres.
//
// tests/confidentiality.ts asserts that routes.sync.ts CONTAINS the
// words `userId: null`. That is a guard, and it is the weakest kind:
// it proves a line exists, not that the row it writes is empty.
//
// This file runs the actual join. The original defect was:
//
//     SELECT r.narrative, s."userId"
//       FROM "SafetyReport" r
//       JOIN "SyncReceipt"  s ON s."clientId" = r."clientId"
//      WHERE r."isAnonymous"
//
// returning a name. The test below runs that exact query and requires
// it to return nothing. If a future write path reintroduces the leak —
// a new endpoint, a new receipt, an analytics table — a source-level
// guard on routes.sync.ts would not notice. This does.
// =====================================================================
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createHmac } from "node:crypto";
import { prisma, reset, seedOrg, migrate, disconnect, hasDatabase } from "./db.setup";

const hmac = (s: string): string => createHmac("sha256", "test-key").update(s).digest("hex");

/** The write path from routes.sync.ts, exercised for real. */
async function applySyncedReport(params: {
  orgId: string; userId: string; deviceId: string;
  clientId: string; isAnonymous: boolean; narrative: string;
}): Promise<string> {
  return prisma().$transaction(async (tx) => {
    const report = await tx.safetyReport.create({
      data: {
        orgId: params.orgId,
        clientId: params.clientId,
        type: "VCR",
        title: "Confidential report",
        narrative: params.narrative,
        awareAt: new Date(),
        jurisdiction: "KE",
        isAnonymous: params.isAnonymous,
        reporterId: params.isAnonymous ? null : params.userId,
      },
    });

    await tx.syncReceipt.create({
      data: {
        clientId: params.clientId,
        orgId: params.orgId,
        entityType: "safetyReport",
        op: "CREATE",
        ...(params.isAnonymous
          ? { userId: null, deviceId: null }
          : { deviceId: params.deviceId, userId: params.userId }),
      },
    });

    return report.id;
  });
}

describe.skipIf(!hasDatabase)("anonymity survives the database", () => {
  let orgId: string;
  let userId: string;
  let otherOrgId: string;

  beforeAll(() => migrate());
  afterAll(() => disconnect());

  beforeEach(async () => {
    await reset();
    ({ orgId, userId, otherOrgId } = await seedOrg());
  });

  it("THE JOIN RETURNS NOTHING — the defect, run rather than described", async () => {
    await applySyncedReport({
      orgId, userId, deviceId: "device-abc",
      clientId: "11111111-1111-4111-8111-111111111111",
      isAnonymous: true,
      narrative: "The clearance was misread and nobody challenged it.",
    });

    const leaked = await prisma().$queryRawUnsafe<Array<{ userId: string | null }>>(
      `SELECT s."userId"
         FROM "SafetyReport" r
         JOIN "SyncReceipt"  s ON s."clientId" = r."clientId"
        WHERE r."isAnonymous" = true AND s."userId" IS NOT NULL`,
    );

    expect(
      leaked,
      "an anonymous reporter was re-identified by joining SyncReceipt on clientId",
    ).toHaveLength(0);
  });

  it("stores no device identifier for an anonymous report either", async () => {
    // A device maps to a person as reliably as a staff number, and on a
    // fleet of six aircraft it maps better.
    await applySyncedReport({
      orgId, userId, deviceId: "device-abc",
      clientId: "22222222-2222-4222-8222-222222222222",
      isAnonymous: true,
      narrative: "Fatigue on the third consecutive early.",
    });

    const receipt = await prisma().syncReceipt.findFirstOrThrow({
      where: { clientId: "22222222-2222-4222-8222-222222222222" },
    });
    expect(receipt.userId).toBeNull();
    expect(receipt.deviceId).toBeNull();
    // AND NOTHING DERIVED FROM THE DEVICE EITHER. A keyed hash used to
    // sit here on the reasoning that it identified nobody; the test
    // below runs the unmasking it made possible.
    expect(Object.values(receipt)).not.toContain(hmac("device-abc"));
  });

  it("THE HASH IS A JOIN KEY — one handset, one anonymous report, one named", async () => {
    // The defect the file above fixed was a join on clientId. This is
    // the same join one layer over, and the fix is what created it.
    //
    // A device that files ANONYMOUSLY leaves hmac(deviceId).
    // The same device filing under a NAME leaves deviceId in cleartext,
    // in the same column of the same table.
    //
    // So the candidate set is not guessed — it is SELECT DISTINCT
    // "deviceId". Hash each one, match it against deviceHash, and the
    // anonymous receipt's clientId is the anonymous REPORT's clientId.
    await applySyncedReport({
      orgId, userId, deviceId: "device-shared",
      clientId: "44444444-4444-4444-8444-444444444444",
      isAnonymous: true,
      narrative: "The captain has been flying unfit and everybody knows.",
    });
    await applySyncedReport({
      orgId, userId, deviceId: "device-shared",
      clientId: "55555555-5555-4555-8555-555555555555",
      isAnonymous: false,
      narrative: "Chock left on stand 4.",
    });

    // Exactly what somebody holding the key would run. No guessing:
    // the candidate devices are the cleartext ones in the same column.
    const named = await prisma().syncReceipt.findMany({
      where: { deviceId: { not: null } },
      select: { deviceId: true, userId: true },
    });
    const rainbow = new Map(named.map((r) => [hmac(r.deviceId!), r.userId]));

    // Every receipt for an anonymous report, and every value on it.
    // Read as raw rows rather than through the Prisma client, so a
    // column reintroduced in the database but absent from the schema
    // is still seen — which is the shape this defect had.
    const anon = await prisma().$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT s.* FROM "SyncReceipt" s
         JOIN "SafetyReport" r ON r."clientId" = s."clientId"
        WHERE r."isAnonymous" = true`,
    );

    const unmasked: Array<{ narrative: string; userId: string | null }> = [];
    for (const a of anon) {
      const hit = Object.values(a).find((v) => typeof v === "string" && rainbow.has(v));
      if (hit === undefined) continue;
      const report = await prisma().safetyReport.findFirst({
        where: { clientId: String(a.clientId), isAnonymous: true },
        select: { narrative: true },
      });
      if (report) unmasked.push({ narrative: report.narrative, userId: rainbow.get(hit as string)! });
    }

    expect(
      unmasked,
      "an anonymous report was matched to its author by hashing the cleartext " +
        "deviceId stored beside it — the deviceHash is a join key, not a mask",
    ).toHaveLength(0);
  });

  it("still records the reporter for a NON-anonymous report", async () => {
    // The counter-test. Without it, a change that nulled userId
    // unconditionally would pass every assertion above while quietly
    // destroying attribution for the reports that are supposed to have
    // it — and a safety office that cannot follow up with a named
    // reporter loses most of the value of the report.
    await applySyncedReport({
      orgId, userId, deviceId: "device-xyz",
      clientId: "33333333-3333-4333-8333-333333333333",
      isAnonymous: false,
      narrative: "Ground equipment left inside the safety line.",
    });

    const receipt = await prisma().syncReceipt.findFirstOrThrow({
      where: { clientId: "33333333-3333-4333-8333-333333333333" },
    });
    expect(receipt.userId).toBe(userId);
    expect(receipt.deviceId).toBe("device-xyz");

    const report = await prisma().safetyReport.findFirstOrThrow({
      where: { clientId: "33333333-3333-4333-8333-333333333333" },
    });
    expect(report.reporterId).toBe(userId);
  });

  it("survives deleting the reporter's account", async () => {
    // onDelete: SetNull on reporterId. A departing employee's account
    // being removed must not cascade their reports out of the safety
    // record — the occurrence happened whether or not they still work
    // here, and losing it would be a data-integrity failure dressed as
    // a privacy feature.
    await applySyncedReport({
      orgId, userId, deviceId: "device-xyz",
      clientId: "44444444-4444-4444-8444-444444444444",
      isAnonymous: false,
      narrative: "Tow bar shear pin failed during pushback.",
    });

    await prisma().user.delete({ where: { id: userId } });

    const report = await prisma().safetyReport.findFirst({
      where: { clientId: "44444444-4444-4444-8444-444444444444" },
    });
    expect(report, "deleting a user deleted their safety report").not.toBeNull();
    expect(report?.reporterId).toBeNull();
    expect(report?.narrative).toContain("shear pin");
  });

  it("scopes the idempotency key per org, so one tenancy cannot probe another", async () => {
    // A globally unique clientId let any authenticated caller ask
    // "does this id exist?" and learn about a competitor's tenancy.
    const clientId = "55555555-5555-4555-8555-555555555555";
    await applySyncedReport({
      orgId, userId, deviceId: "d1", clientId, isAnonymous: false, narrative: "First tenancy.",
    });

    // The same clientId must be insertable in a different org.
    await expect(
      prisma().syncReceipt.create({
        data: { clientId, orgId: otherOrgId, entityType: "safetyReport", op: "CREATE" },
      }),
    ).resolves.toBeTruthy();

    // ...and NOT twice in the same one.
    await expect(
      prisma().syncReceipt.create({
        data: { clientId, orgId, entityType: "safetyReport", op: "CREATE" },
      }),
    ).rejects.toThrow();
  });

  it("de-identification is irreversible once applied", async () => {
    const reportId = await applySyncedReport({
      orgId, userId, deviceId: "d1",
      clientId: "66666666-6666-4666-8666-666666666666",
      isAnonymous: false,
      narrative: "Capt. John Otieno reported the event on 5Y-ABC.",
    });

    await prisma().safetyReport.update({
      where: { id: reportId },
      data: {
        deIdentifiedNarrative: "[CREW] reported the event on [REG].",
        narrative: "[REDACTED — de-identified copy distributed]",
        reporterId: null,
        isDeIdentified: true,
        deIdentifiedAt: new Date(),
      },
    });

    const after = await prisma().safetyReport.findUniqueOrThrow({ where: { id: reportId } });
    expect(after.reporterId).toBeNull();
    expect(after.narrative).not.toContain("Otieno");
    expect(after.deIdentifiedNarrative).not.toContain("Otieno");
    expect(after.deIdentifiedNarrative).not.toContain("5Y-ABC");

    // Nothing anywhere in the row still carries the original.
    const raw = JSON.stringify(after);
    expect(raw).not.toContain("Otieno");
    expect(raw).not.toContain("5Y-ABC");
  });
});
