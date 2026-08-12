// =====================================================================
// The connection-string guard in scripts/setup-env.mjs.
//
// WHY THIS SUITE EXISTS. The script sets the three variables the API
// cannot boot without, and the most valuable thing it does is refuse a
// bad connection string BEFORE the deploy rather than after it. That
// refusal is the only part of the script testable without a Netlify
// session, and it is the part that encodes what has actually gone
// wrong on this project — so it is the part that must not regress.
//
// Every case below is a paste that a person really could make from the
// Supabase Connect panel, not a synthetic input.
//
// The passwords here are obviously fake and belong to no database.
// =====================================================================
import { describe, it, expect } from "vitest";
import { normalizeDatabaseUrl } from "../scripts/setup-env.mjs";

/** The project's own ref, which is public and appears throughout docs. */
const REF = "wbixxhpaswstaphfsowz";

const DIRECT = `postgresql://postgres:pw@db.${REF}.supabase.co:5432/postgres`;
const POOLER = `postgresql://postgres.${REF}:pw@aws-0-eu-west-1.pooler.supabase.com:6543/postgres`;

describe("refusals", () => {
  it("refuses the REST base the Netlify Supabase extension injects", () => {
    // This is the exact value of SUPABASE_DATABASE_URL on this project.
    // Accepting it on the strength of its name is the mistake the whole
    // script exists to prevent, and it is a REFUSAL rather than a
    // warning because Prisma cannot open a connection to it at all.
    expect(() => normalizeDatabaseUrl(`https://${REF}.supabase.co`)).toThrow(
      /not a Postgres connection string/
    );
  });

  it("names https:// in the refusal, so the reason is legible", () => {
    // The scheme is quoted back because "invalid connection string" sends
    // someone to re-read the password; "it begins https://" sends them to
    // the right tab.
    expect(() => normalizeDatabaseUrl(`https://${REF}.supabase.co`)).toThrow(/https:\/\//);
  });

  it("refuses a string with the password placeholder still in it", () => {
    // Supabase renders the URI with [YOUR-PASSWORD] in place. Pasting it
    // unedited produces a connection failure that says nothing useful.
    const raw = `postgresql://postgres:[YOUR-PASSWORD]@db.${REF}.supabase.co:5432/postgres`;
    expect(() => normalizeDatabaseUrl(raw)).toThrow(/placeholder/);
  });

  it("refuses an empty paste rather than treating it as 'no change'", () => {
    expect(() => normalizeDatabaseUrl("")).toThrow(/no connection string/);
    expect(() => normalizeDatabaseUrl("   ")).toThrow(/no connection string/);
  });

  it("refuses a paste truncated to just the scheme", () => {
    // `new URL("postgresql://")` does NOT throw — it parses to an empty
    // hostname — so the scheme regex and the URL parser both pass it.
    // This case was written expecting a refusal, got an acceptance, and
    // the missing host check was added because of it.
    expect(() => normalizeDatabaseUrl("postgresql://")).toThrow(/no host/);
  });
});

describe("the direct connection, which the Connect panel pre-selects", () => {
  it("accepts it — it is correct on a container host — but warns", () => {
    const r = normalizeDatabaseUrl(DIRECT);
    expect(r.port).toBe("5432");
    expect(r.notes.length).toBeGreaterThan(0);
  });

  it("leads the warning with IPv6, which is the failure that bites first", () => {
    // Pool exhaustion is the usually-cited reason and it is real, but it
    // needs load. IPv6 needs nothing: Supabase direct connections are
    // IPv6 by default, Lambda egresses IPv4-only, and the connection
    // simply never opens. If this assertion ever fails, the warning has
    // been softened back into the one that only matters under traffic.
    const notes = normalizeDatabaseUrl(DIRECT).notes.join(" ");
    expect(notes).toMatch(/IPv6/);
    expect(notes).toMatch(/IPv4-only/);
  });

  it("checks the HOST separately from the port, on its own merits", () => {
    // This assertion used to read "flags the direct-connection HOST even
    // when the port says pooler", on the belief that db.<ref> on 6543
    // could only be somebody who had edited the port and left the wrong
    // host behind. That belief was wrong: db.<ref> on 6543 is the
    // DEDICATED pooler, a real endpoint the Connect panel offers.
    //
    // What survives is the reason the host is checked at all — it has no
    // IPv4 address, whatever port follows it — and that is asserted here
    // for 5432 and in the dedicated-pooler section below for 6543. The
    // test was rewritten rather than loosened, because a test that
    // asserts a false premise passes for the wrong reason.
    const notes = normalizeDatabaseUrl(DIRECT).notes.join(" ");
    expect(notes).toMatch(/pooler\.supabase\.com/);
    expect(notes).toMatch(/postgres\.<project-ref>/);
  });

  it("does not flag the shared pooler host as Supabase's own", () => {
    const notes = normalizeDatabaseUrl(POOLER).notes.join(" ");
    expect(notes).not.toMatch(/no IPv4 address/);
  });
});

/* ============================================================
   THE THIRD ENDPOINT, which this guard did not know about.

   Found against the real project. Its Connect panel offered a
   "Dedicated pooler" on db.<ref>.supabase.co:6543 — a host this code
   called the direct connection and a port it called correct, so it
   emitted a warning that was plainly wrong to anyone reading it.

   The dedicated pooler is the right POOLING MODE on the wrong HOST:
   db.<ref>.supabase.co publishes an AAAA record and no A record, so it
   is exactly as unreachable from Lambda as the direct connection is.
   Measured rather than assumed:

     A     db.<ref>.supabase.co  ENODATA
     AAAA  db.<ref>.supabase.co  2a05:d016:...

   Only the shared pooler has an IPv4 address, and the route to it is
   the "Use IPv4 connection" toggle.
   ============================================================ */
const DEDICATED = `postgresql://postgres:pw@db.${REF}.supabase.co:6543/postgres`;

describe("the dedicated pooler, which shares a hostname with the direct connection", () => {
  it("is NOT reported as the direct connection just because of its host", () => {
    // The false positive this section exists for.
    const notes = normalizeDatabaseUrl(DEDICATED).notes.join(" ");
    expect(notes).toMatch(/DEDICATED pooler/);
  });

  it("still warns, because the host has no IPv4 address either", () => {
    // The trap: the port is right, the pooling mode is right, and it
    // cannot connect. Getting the port correct is what makes someone
    // stop looking.
    const notes = normalizeDatabaseUrl(DEDICATED).notes.join(" ");
    expect(notes).toMatch(/no IPv4/);
    expect(notes).toMatch(/Use IPv4 connection/);
  });

  it("does not warn about port 5432 for a string that is on 6543", () => {
    expect(normalizeDatabaseUrl(DEDICATED).notes.join(" ")).not.toMatch(/DIRECT connection/);
  });

  it("still appends the pooling parameters, because 6543 is pooled", () => {
    const r = normalizeDatabaseUrl(DEDICATED);
    expect(r.url).toMatch(/pgbouncer=true/);
    expect(r.url).toMatch(/connection_limit=1/);
  });
});

describe("the transaction pooler, which is the correct endpoint here", () => {
  it("appends pgbouncer and connection_limit when they are absent", () => {
    // Transaction pooling cannot support prepared statements. Without
    // pgbouncer=true the first query under load fails with an error that
    // names nothing useful.
    const r = normalizeDatabaseUrl(POOLER);
    expect(r.url).toMatch(/pgbouncer=true/);
    expect(r.url).toMatch(/connection_limit=1/);
    expect(r.port).toBe("6543");
  });

  it("says so, rather than editing the string silently", () => {
    expect(normalizeDatabaseUrl(POOLER).notes.join(" ")).toMatch(/appended/);
  });

  it("does not duplicate parameters that are already present", () => {
    const already = `${POOLER}?pgbouncer=true&connection_limit=1`;
    const r = normalizeDatabaseUrl(already);
    expect(r.url.match(/pgbouncer=/g)).toHaveLength(1);
    expect(r.url.match(/connection_limit=/g)).toHaveLength(1);
  });

  it("respects a connection_limit the operator chose deliberately", () => {
    // Overwriting a considered value with the default would be the script
    // deciding it knows better than the person running it.
    const chosen = `${POOLER}?connection_limit=5`;
    expect(normalizeDatabaseUrl(chosen).url).toMatch(/connection_limit=5/);
  });

  it("never appends pooling parameters to a direct connection", () => {
    // pgbouncer=true on a 5432 connection disables prepared statements
    // for no reason, which is a quiet performance loss.
    expect(normalizeDatabaseUrl(DIRECT).url).not.toMatch(/pgbouncer/);
  });
});

describe("what it preserves", () => {
  it("returns the string unchanged when there is nothing to add", () => {
    expect(normalizeDatabaseUrl(DIRECT).url).toBe(DIRECT);
  });

  it("trims surrounding whitespace, which a paste often carries", () => {
    expect(normalizeDatabaseUrl(`  ${DIRECT}  `).url).toBe(DIRECT);
  });

  it("accepts the postgres:// scheme as well as postgresql://", () => {
    // Supabase emits postgresql://; other tooling emits postgres://.
    // Both are valid, and the API's own regex accepts both.
    const short = POOLER.replace("postgresql://", "postgres://");
    expect(normalizeDatabaseUrl(short).port).toBe("6543");
  });

  it("notes a missing password rather than assuming one is intended", () => {
    const noPw = `postgresql://postgres@db.${REF}.supabase.co:5432/postgres`;
    expect(normalizeDatabaseUrl(noPw).notes.join(" ")).toMatch(/no password/);
  });

  it("defaults the port to 5432 when the URI omits it, as Postgres does", () => {
    const noPort = `postgresql://postgres:pw@db.${REF}.supabase.co/postgres`;
    expect(normalizeDatabaseUrl(noPort).port).toBe("5432");
  });
});
