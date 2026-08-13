/* ============================================================
   Rotating a demo password had no mechanism, and that is why it kept
   not happening.

   Two demo credentials went through a chat log during development. The
   instruction that followed — "rotate the demo passwords" — had nowhere
   to land: `seed:demo` is idempotent by email and skips accounts that
   already exist, so re-running it printed "Every demo account already
   exists. No passwords to show." The only routes left were deleting the
   users, which orphans the reporterId on every report they filed, or
   hand-writing an argon2 hash into production. Neither is a thing
   somebody does at the end of a long day, so the credential stays live.

   A security instruction with no one-line way to carry it out is a
   security instruction that does not get carried out. `--rotate` is
   that line.

   THIS SUITE READS THE SCRIPT AS SOURCE rather than running it, because
   running it needs a database. What it holds are the properties that
   make the flag safe:

     · rotation is OFF by default, or a routine seed silently locks
       people out and stops being run at all;
     · rotation REVOKES the account's live sessions, because a rotated
       password that leaves a session alive has ended nothing — the
       session outlives the credential it was minted from, which is the
       exact thing rotation was being asked for;
     · the new password is printed, never stored;
     · the row is UPDATED, not recreated, so reports keep their
       reporter.
   ============================================================ */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const seed = readFileSync(resolve(__dirname, '../scripts/seed-demo.mjs'), 'utf8');

describe('seed:demo --rotate', () => {
  it('is reachable at all', () => {
    // A flag nobody can type is the same as no flag.
    expect(seed).toMatch(/process\.argv\.includes\("--rotate"\)/);
  });

  it('IS OFF BY DEFAULT, so a routine seed cannot lock anyone out', () => {
    /* The guard that keeps this script safe to run. Without the
       `!ROTATE`, every seed run would invalidate every demo password —
       and a seed that does that is one people stop running, which
       costs more than it saves. */
    expect(seed).toMatch(/if \(already && !ROTATE\)/);
    expect(seed).toMatch(/user exists, left alone/);
  });

  it('REVOKES LIVE SESSIONS WHEN IT ROTATES, or it has ended nothing', () => {
    /* The half that is easy to leave out and makes the rest
       decorative. A refresh token minted before the rotation still
       mints access tokens after it; whoever holds the old password
       also holds a session that outlives it. */
    expect(seed).toMatch(/refreshToken\.updateMany/);
    const rotateBlock = /if \(already\) \{[\s\S]*?\n    \}/.exec(seed)?.[0] ?? '';
    expect(rotateBlock, 'the rotate branch was not found').toMatch(/passwordHash/);
    expect(
      rotateBlock,
      'rotation does not revoke the sessions held under the old password',
    ).toMatch(/revokedAt/);
  });

  it('UPDATES THE ROW RATHER THAN REPLACING IT, so reports keep their reporter', () => {
    /* Deleting and recreating would give the account a new id, and
       SafetyReport.reporterId points at the old one. The reports would
       survive with a dangling reporter, or the delete would fail — and
       either way a password rotation would have damaged the record it
       exists to protect. */
    expect(seed).toMatch(/prisma\.user\.update\(\{\s*where: \{ id: already\.id \}/);
    expect(seed).not.toMatch(/prisma\.user\.delete/);
  });

  it('prints the new password and stores it nowhere', () => {
    expect(seed).toMatch(/SHOWN ONCE, STORED NOWHERE/);
    // Pushed onto the same list a first run prints from, so there is
    // one printing path rather than two that can disagree.
    expect(seed).toMatch(/created\.push\(\{ email, password, role: rotated\.role/);
  });

  it('tells somebody how to rotate at the moment they find they cannot', () => {
    /* The message that used to be a dead end. Somebody re-running the
       seed to get a password is exactly the person who needs to know
       the flag exists, and the line they are reading is where they
       are. */
    const deadEnd = seed.indexOf('Every demo account already exists');
    expect(deadEnd).toBeGreaterThan(-1);
    expect(seed.slice(deadEnd, deadEnd + 220)).toMatch(/--rotate/);
  });
});
