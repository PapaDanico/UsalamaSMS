// =====================================================================
// Integration harness — a REAL Postgres, not a mock.
//
// Everything in tests/*.test.ts either calls a pure function or reads
// source. That was the honest thing to build with no database, and it
// has a ceiling: source-level guards prove a branch EXISTS. They cannot
// prove it behaves, and three of the four defects this project fixed
// were behavioural — a chain that forked under concurrency, a verifier
// that accepted edited rows, a join that re-identified reporters. Not
// one of those is visible to a regex.
//
// These tests skip themselves when DATABASE_URL is unset, so the suite
// still runs on a laptop with nothing installed. CI provides Postgres,
// so the skip is a local convenience and never a silent pass there —
// see the guard in tests/integration/guard.test.ts, which FAILS if the
// integration suite was skipped in an environment that promised a
// database (charter rule 11).
// =====================================================================
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { execSync } from "node:child_process";

export const DATABASE_URL = process.env["DATABASE_URL"];
export const hasDatabase = Boolean(DATABASE_URL);

let client: PrismaClient | undefined;

export function prisma(): PrismaClient {
  if (!client) {
    // Prisma 7 removed `datasources` from the constructor: a direct
    // connection now goes through a driver adapter. Discovered here
    // rather than in review, because a client that is never asked to
    // connect never complains.
    client = new PrismaClient({ adapter: new PrismaPg({ connectionString: DATABASE_URL }) });
  }
  return client;
}

/** Apply migrations once per run. */
export function migrate(): void {
  execSync("npx prisma migrate deploy", {
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL },
  });
}

/**
 * Wipe every tenant table between tests.
 *
 * TRUNCATE ... CASCADE rather than deleteMany in dependency order: the
 * order is a thing that goes stale every time a relation is added, and
 * a truncate that silently missed a table would leave rows behind and
 * make the next test's assertions about counts wrong in a way that
 * looks like a product bug.
 */
export async function reset(): Promise<void> {
  await prisma().$executeRawUnsafe(
    `TRUNCATE TABLE "AuditLog", "SyncReceipt", "RiskAssessment", "Hazard",
     "SafetyReport", "RefreshToken", "Spi", "User", "Org" RESTART IDENTITY CASCADE`,
  );
}

export async function disconnect(): Promise<void> {
  await client?.$disconnect();
  client = undefined;
}

/** A minimal org + user, for tests that need somewhere to hang a report. */
export async function seedOrg(name = "Test Operator"): Promise<{
  orgId: string;
  userId: string;
  otherOrgId: string;
}> {
  const org = await prisma().org.create({ data: { name, jurisdiction: "KE" } });
  const other = await prisma().org.create({ data: { name: `${name} (competitor)` } });
  const user = await prisma().user.create({
    data: {
      orgId: org.id,
      email: `frontline+${org.id}@example.test`,
      // Not a real argon2 hash; no test here verifies a password.
      passwordHash: "not-a-real-hash",
      name: "Frontline",
      role: "FRONTLINE",
    },
  });
  return { orgId: org.id, userId: user.id, otherOrgId: other.id };
}
