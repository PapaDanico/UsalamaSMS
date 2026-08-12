#!/usr/bin/env node
/* ============================================================
   Set the three variables the API cannot boot without.

   WHY THIS FILE EXISTS. `docs/06-DEPLOYMENT.md` calls setting
   `DATABASE_URL` "the one step that cannot be automated", and that is
   true of the PASSWORD and only of the password: Supabase does not
   expose it through its management API, so no agent and no CI job can
   fetch it. What it is not true of is everything around the password —
   the scheme check, the pooler port, the two secrets that are ours,
   and the read-back that proves the write landed. Each of those was a
   manual step that could be got wrong quietly, and each has been.

   So this does not remove the human from the loop. It shortens the
   part they are in to a single paste, and then checks their work the
   way the API will check it at boot — locally, in two seconds, rather
   than on a deploy that has just been told it is correctly connected.

   THREE THINGS FOUND BY RUNNING THIS AGAINST THE REAL PROJECT:

     · `netlify env:set` exits 0 and prints NOTHING when the CLI
       session has expired. It writes nothing. A zero exit from that
       command is not evidence that a variable was set, and a setup
       script that trusts it reports success on a project it never
       touched. Hence verify(): every write is read back, and the
       read-back is what decides the exit code.

     · Secret values are refused in the development context — the CLI
       demands an explicit non-development --context. A first attempt
       without one fails with a message that reads like a bug in the
       flags rather than a rule about secrets.

     · The Supabase "Connect" panel offers the direct connection first,
       and it is the wrong one here. This ships as a Netlify Function,
       so each warm Lambda holds its own pool and enough concurrency
       exhausts Supabase's connection limit — presenting as random
       timeouts that look like a network fault. Port 5432 is a warning
       rather than an error, because it becomes correct again if the
       API ever moves to a container host.

   WHAT THIS NEVER DOES: print a value, write a value to disk, or pass
   one through a shell. The URI is read with terminal echo off so it
   does not reach the scrollback, and the two secrets are generated
   here and never held anywhere but argv and Netlify.

   The argv caveat, stated rather than hidden: `netlify env:set` takes
   the value as a command-line argument, so for the moment the child
   process runs, that value is visible to `ps` for other users of the
   same machine. On an operator's own laptop that is acceptable. On a
   shared box it is not, and the Netlify UI is the right route there.

   Usage:
     node scripts/setup-env.mjs             # set all three
     node scripts/setup-env.mjs --dry-run   # validate the URI, write nothing
   ============================================================ */

import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const DRY_RUN = process.argv.includes('--dry-run');

/* Secrets are refused in the development context, so the contexts are
   named explicitly. Previews and branch deploys get the SAME values as
   production because they run against the same database — a preview
   signing tokens with a different key would mint sessions production
   rejects, which presents as a login that silently fails. */
const CONTEXTS = ['production', 'deploy-preview', 'branch-deploy'];

const NETLIFY = 'netlify';

// ------------------------------ Output -------------------------------

const say = (s) => process.stdout.write(`${s}\n`);
const warn = (s) => process.stdout.write(`  ! ${s}\n`);
const ok = (s) => process.stdout.write(`  + ${s}\n`);

function fatal(message) {
  process.stderr.write(`\nFATAL: ${message}\n`);
  process.exit(1);
}

// --------------------------- Reading input ---------------------------

const CTRL_C = 3;
const BACKSPACE = 8;
const LF = 10;
const CR = 13;
const DEL = 127;

/**
 * Read one line without echoing it.
 *
 * Synchronous on purpose: the prompt must block. A connection string
 * arriving through a promise while the next line of main() has already
 * run is a class of bug not worth inviting into a script this small.
 *
 * Falls back to a plain read when stdin is not a terminal, which is
 * what makes --dry-run testable from a pipe. That fallback announces
 * itself rather than staying quiet: someone piping a real connection
 * string in should know it was not hidden from anything.
 */
function readHidden(prompt) {
  process.stdout.write(prompt);

  const buf = Buffer.alloc(1);
  const out = [];
  const isTty = Boolean(process.stdin.isTTY);

  if (isTty) {
    process.stdin.setRawMode(true);
  } else {
    process.stdout.write('\n');
    warn('stdin is not a terminal; input was NOT hidden.');
  }

  try {
    for (;;) {
      let n = 0;
      try {
        n = readSync(0, buf, 0, 1, null);
      } catch {
        break; // EAGAIN on a drained pipe, or the fd went away.
      }
      if (n === 0) break; // EOF.

      const code = buf[0];
      if (code === LF || code === CR) break;

      if (isTty && code === CTRL_C) {
        process.stdin.setRawMode(false);
        process.stdout.write('\n');
        fatal('cancelled. Nothing was written.');
      }
      if (isTty && (code === BACKSPACE || code === DEL)) {
        out.pop();
        continue;
      }
      out.push(buf.toString('utf8'));
    }
  } finally {
    if (isTty) {
      process.stdin.setRawMode(false);
      process.stdout.write('\n');
    }
  }

  return out.join('').trim();
}

// ------------------------ Validating the URI -------------------------

/**
 * The same check `core.ts` and `netlify/functions/api.mts` make, run
 * before the deploy rather than after it.
 *
 * Returns { url, notes, port }. Notes are advisory. A refusal throws,
 * and the three refusals here are the three ways this has actually
 * gone wrong: the REST base pasted instead of the connection string,
 * the password placeholder left in, and an empty paste.
 */
export function normalizeDatabaseUrl(raw) {
  const notes = [];
  const url = String(raw ?? '').trim();

  if (!url) {
    throw new Error('no connection string given.');
  }

  /* THE SCHEME DECIDES, NOT THE NAME. The Netlify Supabase extension
     sets SUPABASE_DATABASE_URL to `https://<ref>.supabase.co`, which is
     the project's REST API base and the value createClient() wants.
     This architecture does not use createClient(). Prisma cannot open a
     Postgres connection to an https:// URL, and the error it raises
     reads like a Prisma bug rather than a misconfiguration. */
  if (!/^postgres(ql)?:\/\//.test(url)) {
    const scheme = url.includes(':') ? url.slice(0, url.indexOf(':') + 3) : url.slice(0, 12);
    throw new Error(
      `that is not a Postgres connection string — it begins "${scheme}".\n` +
        '  If it begins "https://" it is the REST API base, which is what the\n' +
        '  Netlify Supabase extension injects as SUPABASE_DATABASE_URL. That\n' +
        '  is not a connection string. Supabase -> Connect -> Transaction pooler.'
    );
  }

  if (/\[?YOUR[-_]PASSWORD\]?/i.test(url)) {
    throw new Error(
      'the password placeholder is still in the string. Replace\n' +
        '  [YOUR-PASSWORD] with the database password before pasting.'
    );
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('that is not a parseable URL.');
  }

  /* A scheme alone satisfies both the regex above and the WHATWG URL
     parser: `new URL("postgresql://")` throws nothing and yields an
     empty hostname. So a paste truncated at the scheme — a real
     outcome of a copy that clipped, or of a terminal that ate the
     rest of the line — would have been accepted and written to the
     project, and the failure would have surfaced as a Prisma
     connection error on the next deploy. Found by testing the guard
     rather than by trusting it. */
  if (!parsed.hostname) {
    throw new Error(
      'that connection string has no host — it is a scheme and nothing\n' +
        '  else. The paste was probably truncated; copy it again.'
    );
  }

  if (!parsed.password) {
    notes.push(
      'there is no password in the connection string. If the database ' +
        'requires one, the deploy will fail to connect.'
    );
  }

  /* Port 6543 is the transaction pooler and is correct for a function.
     Port 5432 is the direct connection: right for a long-lived container
     process, wrong here, and wrong for TWO independent reasons — the
     second of which bites first and is the less obvious.

     1. IPv6. Supabase direct connections resolve to IPv6 by default,
        and Netlify Functions run on Lambda, which egresses IPv4-only.
        The connection does not degrade under load; it never opens, and
        the error names a hostname rather than a configuration choice.
        Supabase sells an IPv4 add-on to work around this. The pooler
        does not need it.
     2. Pool exhaustion. Each warm Lambda holds its own pool, and enough
        concurrency exhausts the Supabase connection limit — presenting
        as random timeouts that look like a network fault.

     A warning rather than a refusal, because both reasons are about
     Lambda, and 5432 becomes correct again on a container host. */
  const port = parsed.port || '5432';
  if (port === '5432') {
    notes.push(
      'this is the DIRECT connection (port 5432). On a Netlify Function it ' +
        'will not connect AT ALL: Supabase direct connections are IPv6 by ' +
        'default and Lambda egresses IPv4-only. It also holds one pool per ' +
        'warm Lambda. Use the transaction pooler (port 6543) unless this API ' +
        'has moved to a container host.'
    );
  }

  /* THERE ARE THREE ENDPOINTS, NOT TWO, and the first version of this
     function knew about two. Found against a real project whose Connect
     panel showed a "Dedicated pooler" on `db.<ref>.supabase.co:6543` —
     a host this code was calling the direct connection, and a port it
     was calling correct, so it emitted a warning that was simply wrong.

       · db.<ref>.supabase.co:5432       direct connection
       · db.<ref>.supabase.co:6543       DEDICATED pooler
       · aws-<n>-<region>.pooler…:6543   SHARED pooler

     The first two share a hostname and, critically, a problem: that
     hostname publishes an AAAA record and NO A record. Measured:

       A     db.<ref>.supabase.co  ENODATA
       AAAA  db.<ref>.supabase.co  2a05:d016:...

     So a dedicated pooler is no more reachable from Lambda than the
     direct connection is. Only the SHARED pooler has an IPv4 address,
     and the way to it is the "Use IPv4 connection" toggle in the
     Connect panel — which switches the panel to the shared endpoint
     and changes both the host and the username. */
  const isSupabaseOwnHost = /^db\..*\.supabase\.co$/i.test(parsed.hostname);
  if (isSupabaseOwnHost && port === '6543') {
    notes.push(
      `${parsed.hostname} on port 6543 is the DEDICATED pooler. It is the ` +
        'right pooling mode, on a host with no IPv4 address — the same ' +
        'AAAA-only hostname as the direct connection — so a Netlify ' +
        'Function still cannot reach it. Turn ON "Use IPv4 connection" in ' +
        'Supabase -> Connect; that switches to the shared pooler, whose ' +
        'host is aws-<n>-<region>.pooler.supabase.com and whose username ' +
        'becomes postgres.<project-ref>. Then re-copy the string.'
    );
  } else if (isSupabaseOwnHost) {
    notes.push(
      `the host ${parsed.hostname} is Supabase's own, which has no IPv4 ` +
        'address. The shared pooler is a different host entirely — ' +
        'aws-<n>-<region>.pooler.supabase.com — and the username changes ' +
        'to postgres.<project-ref>. Changing the port alone is not enough; ' +
        'turn on "Use IPv4 connection" and re-copy from the Transaction ' +
        'pooler tab.'
    );
  }

  /* pgbouncer=true tells Prisma not to use prepared statements, which
     transaction pooling cannot support. Without it the first query under
     load fails with a prepared-statement error that names nothing
     useful. Appended rather than demanded, because it is mechanical. */
  let finalUrl = url;
  if (port === '6543') {
    const added = [];
    if (!parsed.searchParams.has('pgbouncer')) {
      parsed.searchParams.set('pgbouncer', 'true');
      added.push('pgbouncer=true');
    }
    if (!parsed.searchParams.has('connection_limit')) {
      parsed.searchParams.set('connection_limit', '1');
      added.push('connection_limit=1');
    }
    if (added.length > 0) {
      finalUrl = parsed.toString();
      notes.push(`appended ${added.join(' and ')} for transaction pooling.`);
    }
  }

  return { url: finalUrl, notes, port };
}

// --------------------------- Netlify calls ---------------------------

function netlify(args) {
  const res = spawnSync(NETLIFY, args, { encoding: 'utf8', shell: false });

  /* ENOENT here is not a Netlify error, it is a PATH error, and the two
     read identically downstream: spawnSync sets status to null and
     leaves stdout empty, so a caller checking `status !== 0` reports
     "no detail returned" for a CLI that is simply not installed. */
  if (res.error && res.error.code === 'ENOENT') {
    fatal(
      'the `netlify` command was not found on PATH.\n' +
        '  Install it with `npm i -g netlify-cli`, then run `netlify login`\n' +
        '  and `netlify link` in this directory.'
    );
  }
  return res;
}

/**
 * Confirm the CLI can actually write before asking for a password.
 *
 * `netlify env:set` exits 0 having written nothing when the session
 * has expired, so without this the failure surfaces as a
 * successful-looking run against an unchanged project.
 */
function preflight() {
  const status = netlify(['status', '--json']);
  if (status.status !== 0) {
    const detail = `${status.stderr || ''}${status.stdout || ''}`.trim();
    fatal(
      'the Netlify CLI is not usable in this shell.\n' +
        `  ${detail.split('\n')[0] || 'no detail returned.'}\n` +
        '  Run `netlify login`, then `netlify link` in this directory, and try\n' +
        '  again. Do NOT skip this: `netlify env:set` exits 0 while writing\n' +
        '  nothing when the session has expired.'
    );
  }
}

function setVar(key, value) {
  const args = ['env:set', key, value, '--secret'];
  for (const c of CONTEXTS) args.push('--context', c);
  const res = netlify(args);
  if (res.status !== 0) {
    const detail = `${res.stderr || ''}${res.stdout || ''}`.trim();
    fatal(`could not set ${key}.\n  ${detail.split('\n')[0] || 'no detail.'}`);
  }
}

/**
 * Read the project back and confirm each key is there.
 *
 * This is the check that makes the script trustworthy, and it exists
 * because the exit code of the write is not.
 */
function verify(keys) {
  const res = netlify(['env:list', '--context', 'production', '--json']);
  if (res.status !== 0) {
    warn('could not read the project back to verify. Check the UI by hand.');
    return false;
  }

  let present;
  try {
    const parsed = JSON.parse(res.stdout);
    present = new Set(
      Array.isArray(parsed) ? parsed.map((e) => e.key) : Object.keys(parsed)
    );
  } catch {
    warn('could not parse the variable list. Check the UI by hand.');
    return false;
  }

  let allThere = true;
  for (const k of keys) {
    if (present.has(k)) {
      ok(`${k} is on the project.`);
    } else {
      warn(`${k} is NOT on the project, despite the write reporting success.`);
      allThere = false;
    }
  }
  return allThere;
}

// ------------------------------- Main --------------------------------

function main() {
  say('');
  say('  Setting DATABASE_URL, JWT_SECRET and DEIDENT_SALT.');
  say('');
  say('  DATABASE_URL comes from Supabase -> Connect -> Transaction pooler.');
  say('  Replace [YOUR-PASSWORD] with the database password first.');
  say('  Nothing pasted here is printed, logged, or written to disk.');
  say('');

  if (!DRY_RUN) preflight();

  const raw = readHidden('  Connection string: ');

  let normalized;
  try {
    normalized = normalizeDatabaseUrl(raw);
  } catch (err) {
    fatal(err.message);
    return;
  }

  say('');
  ok(`connection string accepted (port ${normalized.port}).`);
  for (const n of normalized.notes) warn(n);
  say('');

  if (DRY_RUN) {
    say('  --dry-run: nothing was written. That string would be set as');
    say('  DATABASE_URL, alongside two freshly generated secrets.');
    say('');
    return;
  }

  /* 48 bytes rather than 32: these key HMACs as well as signatures, and
     the cost of the larger secret is zero. */
  const jwtSecret = randomBytes(48).toString('base64');
  const deidentSalt = randomBytes(48).toString('base64');

  setVar('DATABASE_URL', normalized.url);
  setVar('JWT_SECRET', jwtSecret);
  setVar('DEIDENT_SALT', deidentSalt);

  say('  Written. Reading the project back to confirm:');
  const verified = verify(['DATABASE_URL', 'JWT_SECRET', 'DEIDENT_SALT']);
  say('');

  if (!verified) {
    fatal(
      'at least one variable is not on the project. Set the missing ones in\n' +
        '  Netlify -> Project configuration -> Environment variables, as SECRET\n' +
        '  values. See docs/06-DEPLOYMENT.md.'
    );
  }

  say('  All three are set as secret values, so they are write-only in the UI');
  say('  and are not returned by the management API.');
  say('');
  say('  Redeploy, then confirm /api/health and /api/ready both answer.');
  say('');
  say('  NOTE: JWT_SECRET is new, so any session issued before now is void and');
  say('  existing reporterDupToken values become unmatchable. On a first');
  say('  configuration that costs nothing; before a rotation, read the');
  say('  Rotation section of docs/06-DEPLOYMENT.md.');
  say('');
}

/* main() runs only when this file IS the command being run, not when a
   test imports normalizeDatabaseUrl from it.

   Without this guard the export above is decorative: importing the
   module runs main(), which calls preflight(), which calls
   process.exit(1) on a machine that is not logged in. The validation
   logic would have been the one part of this script that could be
   tested cheaply, and it would have been untestable. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
