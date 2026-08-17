/* =====================================================================
   IS THE DATABASE THE ONE THIS CODE WAS WRITTEN FOR?

   WHY THIS EXISTS. `netlify.toml` runs `npm run build` and nothing runs
   `prisma migrate deploy`, so a merged, green, published deploy can be
   serving a Prisma client that SELECTs columns the database does not
   have. That is not hypothetical — production was once found five
   migrations behind, raising "column does not exist" on every read of
   Org and SafetyReport, on a database holding seven real reports, while
   four separate deploys had been confirmed `state: ready`.

   CONFIRMING A DEPLOY IS NOT CONFIRMING THE SYSTEM. This script is the
   thing that confirms the system.

   ---------------------------------------------------------------
   THE FAILURE THAT PROMPTED IT IS NOT THE OBVIOUS ONE, and it is worse.

   Measured against production on 17 August 2026: the schema was
   PERFECT — 315 columns expected from schema.prisma, 315 present, zero
   missing and zero extra. And `_prisma_migrations` held 17 rows against
   30 migrations on disk.

   The thirteen were applied with `mcp__Supabase__apply_migration`,
   which records them in `supabase_migrations.schema_migrations` — a
   DIFFERENT LEDGER. Prisma cannot see it. So Prisma believed thirteen
   migrations were pending against a database that already had them.

   CLAUDE.md offered those two paths as interchangeable. They are not,
   and the consequence was measured rather than reasoned about, by
   rebuilding production's exact state locally:

     first  `prisma migrate deploy`  ->  P3018, 42701
                                         column "cicttCodes" of relation
                                         "SafetyReport" already exists
     every  `prisma migrate deploy`  ->  P3009, blocked entirely
     after                               "migrate found failed migrations
                                          in the target database"

   So one attempt at the documented recovery path leaves the database
   unable to accept ANY migration until somebody runs
   `prisma migrate resolve` by hand. A repair that breaks the repair.

   ---------------------------------------------------------------
   THREE STATES, AND THEY NEED DIFFERENT REMEDIES. Reporting "drift"
   without saying WHICH is how the wrong command gets run:

     BEHIND      ledger behind AND schema behind — genuinely unapplied.
                 Remedy: prisma migrate deploy.
     UNRECORDED  ledger behind, schema CURRENT — applied out of band.
                 Remedy: prisma migrate resolve --applied <name>, which
                 writes the ledger without touching the schema. Running
                 `deploy` here is the trap above.
     BLOCKED     a failed or rolled-back row is present. Nothing can be
                 applied until it is resolved.

   Run it against production with the DIRECT connection string, not the
   pooler — this reads catalogue tables and needs a real session.
   ===================================================================== */
import pg from "pg";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = join(ROOT, "prisma", "migrations");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(
    "\ncheck:db — DATABASE_URL is not set, so this gate would pass by doing nothing.\n" +
      "That is the failure mode this repository treats as worse than having no gate."
  );
  process.exit(1);
}

/* ---- what the code expects -------------------------------------- */

/* Parsed rather than imported, because importing the Prisma client
   would tell us what the client thinks and this gate exists precisely
   for when the client and the database disagree. */
function expectedColumns() {
  const src = readFileSync(join(ROOT, "prisma", "schema.prisma"), "utf8")
    .replace(/\/\/.*/g, "");
  const SCALARS = new Set(
    "String Int Float Boolean DateTime Json Bytes Decimal BigInt".split(" ")
  );
  const enums = new Set([...src.matchAll(/enum\s+(\w+)\s*\{/g)].map((m) => m[1]));
  const out = new Set();
  for (const m of src.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) {
    const model = m[1];
    const body = m[2];
    const renamed = /@@map\("([^"]+)"\)/.exec(body);
    const table = renamed ? renamed[1] : model;
    for (const raw of body.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("@@")) continue;
      const f = /^(\w+)\s+(\w+)(\[\])?(\?)?/.exec(line);
      if (!f) continue;
      const [, field, type] = f;
      /* A relation field names another model and is not a column; the
         foreign key beside it is, and it is declared as a scalar. */
      if (!SCALARS.has(type) && !enums.has(type)) continue;
      const mapped = /@map\("([^"]+)"\)/.exec(line);
      out.add(`${table}.${mapped ? mapped[1] : field}`);
    }
  }
  return out;
}

const onDisk = readdirSync(MIGRATIONS)
  .filter((d) => /^\d{14}_/.test(d))
  .sort();

if (onDisk.length < 5) {
  /* Charter rule 11 from the other side: a discovery that finds almost
     nothing passes this gate instantly and means nothing. */
  console.error(
    `\ncheck:db — only ${onDisk.length} migration(s) found on disk. This gate compares ` +
      "the directory against the database and cannot do that from an empty directory."
  );
  process.exit(1);
}

/* ---- what the database has -------------------------------------- */

const client = new pg.Client({ connectionString: url });
await client.connect();

let ledger = [];
let failed = [];
let actual = new Set();
try {
  const hasLedger = await client.query(
    `select to_regclass('public._prisma_migrations') is not null as present`
  );
  if (hasLedger.rows[0].present) {
    const r = await client.query(
      `select migration_name, finished_at, rolled_back_at from _prisma_migrations`
    );
    ledger = r.rows.map((x) => x.migration_name);
    failed = r.rows
      .filter((x) => x.finished_at === null || x.rolled_back_at !== null)
      .map((x) => x.migration_name);
  }
  const cols = await client.query(
    `select table_name || '.' || column_name as col
       from information_schema.columns
      where table_schema = 'public'`
  );
  actual = new Set(cols.rows.map((r) => r.col));
} finally {
  await client.end();
}

/* ---- compare ----------------------------------------------------- */

const expected = expectedColumns();
const missingColumns = [...expected].filter((c) => !actual.has(c)).sort();
const unrecorded = onDisk.filter((m) => !ledger.includes(m));

const lines = [];
let bad = false;

console.log(
  `check:db — ${onDisk.length} migrations on disk, ${ledger.length} in the Prisma ledger, ` +
    `${expected.size} columns expected\n`
);

if (failed.length) {
  bad = true;
  lines.push(
    `  BLOCKED    ${failed.length} migration(s) recorded as failed or rolled back:\n` +
      failed.map((m) => `               ${m}`).join("\n") +
      `\n             Nothing can be applied until this is resolved. Prisma answers\n` +
      `             P3009 to every further deploy.\n` +
      `             Remedy: prisma migrate resolve --rolled-back <name>`
  );
}

if (missingColumns.length) {
  bad = true;
  lines.push(
    `  BEHIND     ${missingColumns.length} column(s) the code SELECTs are not in the database:\n` +
      missingColumns.slice(0, 20).map((c) => `               ${c}`).join("\n") +
      (missingColumns.length > 20 ? `\n               … and ${missingColumns.length - 20} more` : "") +
      `\n             Every read of these models raises "column does not exist".\n` +
      `             Remedy: prisma migrate deploy, against a DIRECT connection.`
  );
}

if (unrecorded.length && !missingColumns.length) {
  bad = true;
  lines.push(
    `  UNRECORDED ${unrecorded.length} migration(s) are applied but not in Prisma's ledger:\n` +
      unrecorded.map((m) => `               ${m}`).join("\n") +
      `\n             The SCHEMA IS CORRECT — these were applied out of band, most\n` +
      `             likely with Supabase's own migration tool, which records them\n` +
      `             in supabase_migrations.schema_migrations where Prisma cannot\n` +
      `             see them.\n` +
      `             DO NOT run prisma migrate deploy: it will try to re-apply them,\n` +
      `             fail on the first column that already exists, and leave the\n` +
      `             database BLOCKED for every future migration.\n` +
      `             Remedy, once per migration:\n` +
      unrecorded.map((m) => `               prisma migrate resolve --applied ${m}`).join("\n")
  );
} else if (unrecorded.length) {
  lines.push(
    `  note       ${unrecorded.length} migration(s) also missing from the ledger; deploy will record them.`
  );
}

const extra = [...actual]
  .filter((c) => !expected.has(c) && !c.startsWith("_prisma_migrations."))
  .sort();
if (extra.length) {
  lines.push(
    `  note       ${extra.length} column(s) in the database that schema.prisma does not declare:\n` +
      extra.slice(0, 10).map((c) => `               ${c}`).join("\n") +
      `\n             Not a failure — a dropped column needs a migration, not a gate —\n` +
      `             but a surprise here usually means a hand-edited database.`
  );
}

for (const l of lines) console.log(l + "\n");

if (bad) {
  console.error("check:db FAILED — the database is not the one this code was written for.\n");
  process.exit(1);
}

console.log(
  `  db ok            schema matches schema.prisma and the ledger matches the directory`
);
