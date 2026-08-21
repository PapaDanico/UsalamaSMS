/* =====================================================================
   ONE COMMAND TO GET BACK IN, AND TO SAY WHAT WAS WRONG.

   WHY THIS EXISTS. On 21 August 2026 the owner of this product could
   not sign in, and production was refusing signup to seven of its nine
   jurisdictions. Both were one command each — but only if you already
   knew WHICH command, which of two connection strings, and how to read
   `created:` against `rotated:`. None of that is obvious at the moment
   you are locked out, which is exactly the moment nobody wants a
   runbook.

   AN AGENT IN A CONTAINER CANNOT RUN THIS, and that is measured
   rather than assumed: the egress policy permits HTTPS through a proxy
   and nothing else, so `aws-0-eu-north-1.pooler.supabase.com:5432`
   resolves and then refuses. There is no TCP path to Postgres.

   AN AGENT WITH AN AUTHENTICATED SUPABASE MCP CAN DO ALL OF IT, because
   that routes through Anthropic rather than out of the container — and
   on 21 August 2026 it did, which is how both faults above were
   actually fixed. This script is the path for when that is not
   available: a person running one command that needs no decisions and
   explains itself.

   -------------------------------------------------------------------
   IT REPORTS BEFORE IT CHANGES ANYTHING, and that ordering is the
   whole design. "Signup is broken" and "I cannot log in" have several
   possible causes and the remedies differ; a script that silently
   repairs both tells you nothing about which you had. So the state is
   printed first, then the repair, then the state again. The difference
   between the two is the diagnosis.

   IT IS SAFE TO RUN TWICE. `prisma migrate deploy` is a no-op when
   nothing is pending. The admin seed is idempotent by email and only
   issues a new password when asked. Nothing here deletes.

   Usage:
     export DATABASE_URL='<session pooler, port 5432>'
     node scripts/recover.mjs --email you@example.com

     --check-only   report the state and change nothing
     --no-rotate    repair the schema, leave the password alone
   ===================================================================== */

import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
/* The .ts extension is deliberate and works because netlify.toml pins
   NODE_VERSION 22, which strips types natively. Reading the registry
   rather than restating it is the point — a hardcoded jurisdiction list
   here would be wrong the first time somebody adds a State, which is
   exactly the class of drift this script exists to detect. If a future
   Node makes this fail it fails LOUDLY at startup, not silently. */
import { JURISDICTIONS } from "../packages/shared/src/regulations.ts";

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const EMAIL = arg("--email");
const CHECK_ONLY = args.includes("--check-only");
const NO_ROTATE = args.includes("--no-rotate");

const DATABASE_URL = process.env["DATABASE_URL"];

const die = (msg) => {
  console.error(`\n  ✗ ${msg}\n`);
  process.exit(1);
};

if (!DATABASE_URL) {
  die(
    "DATABASE_URL is not set.\n\n" +
      "    Supabase dashboard -> Project Settings -> Database ->\n" +
      "    Connection string -> Session pooler   (port 5432)\n\n" +
      "    export DATABASE_URL='<that string, password filled in>'",
  );
}

/* THE POOLER GUARD, checked before a client is built — the same one
   seed-platform-admin.mjs carries, and for the same reason: DDL and
   advisory locks need a real session, and the transaction pooler
   cannot give one. The SESSION pooler on 5432 is fine and is the
   easiest string to obtain, so only the transaction pooler is
   refused. */
if (DATABASE_URL.includes("pgbouncer=true") || DATABASE_URL.includes(":6543")) {
  die(
    "That is the TRANSACTION pooler, which cannot run migrations.\n\n" +
      "    Use the SESSION pooler or the direct connection — port 5432.\n" +
      "    Same dashboard page, different entry in the dropdown.",
  );
}

if (!CHECK_ONLY && !EMAIL) {
  die("--email is required unless you pass --check-only.");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DATABASE_URL }) });

/** Which Jurisdiction values Postgres actually holds. */
async function enumValues() {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT e.enumlabel AS v FROM pg_type t
       JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE t.typname = 'Jurisdiction' ORDER BY e.enumlabel`,
  );
  return rows.map((r) => r.v);
}

/** Ledger rows against migrations on disk — the three-state question. */
async function ledger() {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT count(*)::int AS applied,
            count(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NULL)::int AS running,
            count(*) FILTER (WHERE rolled_back_at IS NOT NULL)::int AS failed
       FROM _prisma_migrations`,
  );
  return rows[0] ?? { applied: 0, running: 0, failed: 0 };
}

async function report(label) {
  console.log(`\n  ── ${label} ${"─".repeat(Math.max(0, 52 - label.length))}`);

  const have = await enumValues();
  const want = [...JURISDICTIONS].sort();
  const missing = want.filter((j) => !have.includes(j));
  console.log(`  jurisdictions in Postgres : ${have.join(", ") || "(none)"}`);
  if (missing.length) {
    console.log(`  MISSING                   : ${missing.join(", ")}`);
    console.log(`  consequence               : signup answers 500 for ${missing.length} of ${want.length} markets`);
  } else {
    console.log(`  all ${want.length} present            : signup works everywhere it is offered`);
  }

  const l = await ledger();
  console.log(`  migrations recorded       : ${l.applied}${l.failed ? `  (${l.failed} FAILED — resolve before deploying)` : ""}`);

  if (EMAIL) {
    const user = await prisma.user.findUnique({
      where: { email: EMAIL },
      select: { id: true, role: true, orgId: true },
    });
    console.log(
      user
        ? `  ${EMAIL} : EXISTS, role ${user.role}`
        : `  ${EMAIL} : NOT IN THIS DATABASE`,
    );
    if (!user) {
      console.log(
        "  note                      : an account created while the API was\n" +
          "                              pointed at a different database would\n" +
          "                              look exactly like this.",
      );
    }
  }
  return { missing, user: EMAIL ? await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true } }) : null };
}

try {
  console.log("\nrecover — reports the state, repairs it, reports it again.\n");
  console.log(`  target: ${DATABASE_URL.replace(/:\/\/([^:]+):[^@]+@/, "://$1:****@")}`);

  const before = await report("BEFORE");

  if (CHECK_ONLY) {
    console.log("\n  --check-only: nothing was changed.\n");
    await prisma.$disconnect();
    process.exit(0);
  }

  console.log(`\n  ── REPAIRING ${"─".repeat(41)}`);

  if (before.missing.length) {
    console.log("  applying pending migrations...");
    execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL } });
  } else {
    console.log("  schema is current — no migration needed.");
  }

  if (!NO_ROTATE) {
    console.log(`\n  issuing a password for ${EMAIL}...`);
    /* Delegated rather than reimplemented. seed-platform-admin.mjs owns
       the argon2 hashing, the alphabet, and the refresh-token
       revocation that makes a rotation actually end a session. A second
       implementation here would be a second thing to keep correct. */
    const rotateFlag = before.user ? " --rotate" : "";
    execSync(`node scripts/seed-platform-admin.mjs --email ${EMAIL}${rotateFlag}`, {
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL },
    });
  }

  await report("AFTER");

  console.log(`
  ── WHAT THAT MEANS ${"─".repeat(35)}

  The password above is shown ONCE and is not stored in any form this
  or any other tool can read back.

  Confirm from outside: https://usalamasms.com/api/ready should answer
  {"ok":true}. If it answers 503 schema_behind_code it names exactly
  which values are still missing — that probe was blind to enum drift
  until 21 August 2026 and is not any more.
`);
} catch (error) {
  console.error(`\n  ✗ ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
