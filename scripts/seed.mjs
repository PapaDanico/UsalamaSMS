#!/usr/bin/env node
/* ============================================================
   Seed one organisation and its first users.

   A safety platform with no accounts cannot be logged into, and an
   empty database is where every deployment stalls. This is the smallest
   thing that turns a migrated schema into something a design partner
   can open.

   IT PRINTS PASSWORDS ONCE AND STORES NONE. Passwords are generated
   here, hashed with argon2id before they touch the database, and
   written to stdout for whoever is running this to put in a password
   manager. There is no recovery path — that is the point. A seed script
   with a hardcoded `password123` is how a demo account becomes a
   production account with a known password.

   Idempotent by email: running it twice does not create a second org or
   reset anybody's password.
   ============================================================ */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import argon2 from "argon2";
import { randomBytes } from "node:crypto";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error(
    "FATAL: DATABASE_URL is not set.\n" +
      "  Local:  eval $(bash scripts/local-db.sh)\n" +
      "  Hosted: take the connection string from Supabase → Connect → URI.\n" +
      "          Do not paste it into a file the repository tracks."
  );
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DATABASE_URL }) });

/**
 * A password worth the name.
 *
 * LoginSchema demands at least 12 characters. This produces ~26 of
 * base64url entropy, because the alternative — a memorable phrase the
 * script invents — is one somebody keeps.
 */
function generatePassword() {
  return randomBytes(20).toString("base64url");
}

const ORG_NAME = process.env.SEED_ORG_NAME ?? "Design Partner AOC";
const EMAIL_DOMAIN = process.env.SEED_EMAIL_DOMAIN ?? "example.test";

/* One account per role that the MVP actually exercises. Not all eight:
   a seeded account nobody uses is an unused credential with a known
   creation date, and the roles below are the ones the report form and
   the triage queue need to demonstrate anything. */
const PEOPLE = [
  { role: "ACCOUNTABLE_EXECUTIVE", name: "Accountable Executive", local: "ae" },
  { role: "SAFETY_MANAGER", name: "Safety Manager", local: "safety" },
  { role: "FRONTLINE", name: "Ramp Agent", local: "ramp" },
];

async function main() {
  const existing = await prisma.org.findFirst({ where: { name: ORG_NAME } });
  const org =
    existing ??
    (await prisma.org.create({ data: { name: ORG_NAME, jurisdiction: "KE" } }));

  console.log(existing ? `org exists: ${org.name}` : `created org: ${org.name}`);
  console.log(`  id: ${org.id}\n`);

  const created = [];

  for (const person of PEOPLE) {
    const email = `${person.local}@${EMAIL_DOMAIN}`;
    const already = await prisma.user.findUnique({ where: { email } });

    if (already) {
      console.log(`  user exists, left alone: ${email} (${already.role})`);
      continue;
    }

    const password = generatePassword();
    const user = await prisma.user.create({
      data: {
        orgId: org.id,
        email,
        // argon2id, the same verifier the login route uses. Hashed here
        // so the plaintext exists only in this process and in the
        // operator's clipboard.
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
        name: person.name,
        role: person.role,
      },
    });
    created.push({ email, password, role: user.role });
  }

  if (created.length === 0) {
    console.log("\nNothing to create. Every seeded account already exists.");
    return;
  }

  console.log("\n" + "=".repeat(66));
  console.log("  PASSWORDS — SHOWN ONCE, STORED NOWHERE");
  console.log("  Put them in a password manager now. There is no recovery");
  console.log("  path: the database holds only argon2id hashes.");
  console.log("=".repeat(66));
  for (const c of created) {
    console.log(`\n  ${c.role}`);
    console.log(`    email:    ${c.email}`);
    console.log(`    password: ${c.password}`);
  }
  console.log("\n" + "=".repeat(66));
  console.log("  Change these before anyone real uses this deployment.");
  console.log("=".repeat(66) + "\n");
}

main()
  .catch((err) => {
    console.error("seed failed:", err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
