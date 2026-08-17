/* =====================================================================
   THE VENDOR'S OWN ACCOUNT, WHICH NOTHING COULD CREATE.

   THE CONSOLE SHIPPED LIVE AND REACHABLE BY NOBODY. `PLATFORM_ADMIN` is
   in the Role enum, the migration adding it is applied to production,
   `/admin` renders, and `routes.admin.ts` answers — and no user in the
   database holds the role, so every one of those answers 403 to
   everybody alive. A capability with no reachable surface, one layer up
   from the one `check:claims` catches: not a module nothing imports, a
   ROLE NOTHING CAN HOLD.

   It could not be created from inside the product either, and that is
   deliberate rather than an oversight: `/api/v1/admin/operators` mints
   operators, never platform administrators, because a tenant that could
   mint a platform administrator would be a tenant that could read the
   others. The web signup form does not offer the role, and the role
   picker in the console does not list it.

   So it is created here, out of band, by somebody with the database
   connection string — the same shape `seed:demo` has, and for the same
   reason.

   ---------------------------------------------------------------
   IT PRINTS THE PASSWORD ONCE, INTO THE TERMINAL OF WHOEVER RAN IT.

   Never logged, never emailed, never stored in plaintext, never
   returned again. The same discipline the provisioning route follows,
   and it is the reason this is a script rather than something an agent
   runs on somebody's behalf: a generated credential that passes through
   a chat transcript is a live credential in a log that outlives the
   session.

   `--rotate` re-issues for an account that already exists and REVOKES
   EVERY LIVE REFRESH TOKEN IT HOLDS, because a refresh token minted
   before a rotation still mints access tokens after it — a rotation
   that leaves one alive has ended nothing. That lesson is recorded in
   CLAUDE.md against the demo seed; this is the same trap.

   ---------------------------------------------------------------
   THE ORG IT BELONGS TO IS NOT AN OPERATOR.

   A `PLATFORM_ADMIN` still needs an `orgId` — every user does, and the
   column is not nullable. So this creates a vendor organisation to hang
   it on, and that organisation deliberately holds NO safety record:
   no reports, no hazards, no indicators. It exists to satisfy a foreign
   key, not to run a safety management system.

   That matters for one reason worth stating: `/api/v1/admin/upgrade-requests`
   is the single route in this API that reads across tenancy, and it
   returns every operator's requests to whoever holds
   `platform.entitlement.manage`. The vendor org being empty is what
   makes "the vendor sees everybody" safe to reason about — there is no
   operator whose record the vendor is also inside.

   Usage:
     DATABASE_URL=<direct, port 5432> node scripts/seed-platform-admin.mjs \
       --email you@example.com [--name "Your Name"] [--rotate]
   ===================================================================== */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import argon2 from "argon2";
import { randomBytes } from "node:crypto";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error(
    "FATAL: DATABASE_URL is not set.\n" +
      "  Local:  eval $(bash scripts/local-db.sh)\n" +
      "  Hosted: take the DIRECT connection string from Supabase, port 5432.\n" +
      "          Do not paste it into a file the repository tracks."
  );
  process.exit(1);
}

/* REFUSED AGAINST A POOLER, and checked BEFORE the client is built —
   the first version constructed Prisma first and died on a driver-adapter
   error, so the pooler guard below never ran and the message a person
   would have acted on never printed. */
if (DATABASE_URL.includes("pgbouncer=true") || DATABASE_URL.includes(":6543")) {
  console.error(
    "That looks like the transaction pooler. Use the direct or session " +
      "connection on port 5432 — see CLAUDE.md."
  );
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DATABASE_URL }) });

/* Same alphabet and shape the provisioning route issues, so a
   credential from either path reads the same to whoever receives it. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const issuePassword = () => {
  const bytes = randomBytes(20);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return `${out.slice(0, 5)}-${out.slice(5, 10)}-${out.slice(10, 15)}-${out.slice(15, 20)}`;
};

const arg = (flag) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? null : process.argv[i + 1] ?? null;
};

const ROTATE = process.argv.includes("--rotate");
const EMAIL = (arg("--email") ?? "").trim().toLowerCase();
const NAME = arg("--name") ?? "Platform administrator";
const VENDOR_ORG = "UsalamaSMS (vendor)";

async function main() {
  if (!EMAIL || !EMAIL.includes("@")) {
    console.error("Give an address:  node scripts/seed-platform-admin.mjs --email you@example.com");
    process.exitCode = 1;
    return;
  }

  const org =
    (await prisma.org.findFirst({ where: { name: VENDOR_ORG }, select: { id: true, name: true } })) ??
    (await prisma.org.create({
      data: {
        name: VENDOR_ORG,
        jurisdiction: "KE",
        /* NO TRIAL AND NO PAID-THROUGH. The vendor org is not a
           customer, and giving it an entitlement would put a row in the
           subscription model that means nothing. Every capability the
           console needs sits behind a permission, not behind a
           subscription. */
      },
      select: { id: true, name: true },
    }));

  const existing = await prisma.user.findFirst({
    where: { email: EMAIL },
    select: { id: true, role: true, orgId: true },
  });

  if (existing && !ROTATE) {
    console.log(`\n  ${EMAIL} already exists (${existing.role}). Nothing changed.`);
    console.log("  To re-issue a password and sign out every device it holds:");
    console.log("    node scripts/seed-platform-admin.mjs --email " + EMAIL + " --rotate\n");
    return;
  }

  const password = issuePassword();
  const passwordHash = await argon2.hash(password);

  if (existing) {
    /* REVOKING THE SESSIONS IS NOT OPTIONAL — see the header. */
    const revoked = await prisma.refreshToken.deleteMany({ where: { userId: existing.id } });
    await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash, role: "PLATFORM_ADMIN" },
    });
    console.log(`\n  rotated: ${EMAIL}`);
    console.log(`  refresh tokens revoked: ${revoked.count}`);
  } else {
    await prisma.user.create({
      data: { orgId: org.id, email: EMAIL, name: NAME, role: "PLATFORM_ADMIN", passwordHash },
    });
    console.log(`\n  created: ${EMAIL}`);
    console.log(`  vendor org: ${org.name} (${org.id})`);
  }

  console.log(`\n  password: ${password}`);
  console.log("\n  Shown once. It is not stored in any form this can read back.");
  console.log("  Sign in and open /admin — it is deliberately absent from the menu.\n");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
