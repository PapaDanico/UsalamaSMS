/* =====================================================================
   THE SCHEDULED FUNCTION, ACTUALLY EXECUTED.

   WHY THIS FILE EXISTS, stated plainly because the reason is a defect
   that shipped. netlify/functions/digest.mts was written, typechecked,
   linted, unit-tested, reviewed, merged and DEPLOYED to production
   carrying `new PrismaClient()` with no driver adapter. Prisma 7
   removed the `datasources` option: that constructor is TYPE-VALID and
   throws at construction. Nothing in the repository could see it,
   because nothing ever imported the module.

   core.ts carries a comment about the identical mistake, made once
   before, ending "It took a real Postgres to find." It was made again
   anyway, four lines from a file that says so.

   THE COST OF NOT HAVING THIS CHECK IS PARTICULAR TO A SCHEDULE. Every
   other caller of Prisma sits behind a request: it throws, somebody
   sees a 500, somebody tells somebody. This one runs at 05:00 with no
   session, no screen and no reader. The module would have failed at
   IMPORT, the run would have produced nothing at all, and the first
   evidence would have been a safety manager not being told something —
   which is indistinguishable, from where they sit, from there having
   been nothing to tell.

   SO THE ASSERTION IS THAT IT RUNS. Not that its parts are correct —
   digest.compute.ts, mail.ts and digest.ts are unit- and
   integration-tested elsewhere. This imports the deployed module and
   invokes the handler, which is the one thing none of those do.
   ===================================================================== */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { prisma, reset, migrate, disconnect, hasDatabase, DATABASE_URL } from "./db.setup";

type Handler = () => Promise<Response>;

async function loadHandler(env: Record<string, string | undefined>): Promise<Handler> {
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  /* The module caches its client across invocations — deliberately, it
     is the shape a warm serverless instance wants — so each case gets a
     fresh module. */
  vi.resetModules();
  const mod = await import("../../netlify/functions/digest.mjs");
  return mod.default as Handler;
}

describe.skipIf(!hasDatabase)("the scheduled digest function", () => {
  beforeAll(() => {
    migrate();
  });
  afterAll(async () => {
    await disconnect();
  });
  beforeEach(async () => {
    await reset();
  });

  /* THE ONE THAT WOULD HAVE CAUGHT IT. Importing the module was enough:
     the bare constructor threw before the handler existed. */
  it("imports without throwing, and exports a handler and a schedule", async () => {
    const mod = await import("../../netlify/functions/digest.mjs");
    expect(typeof mod.default).toBe("function");
    expect(mod.config?.schedule).toBe("0 5 * * *");
  });

  /* Charter rule 8. A scheduled job that quietly does nothing because a
     variable is absent appears to work in every environment that has
     never sent an email — which is every environment, until the morning
     one was needed. */
  it("reports a missing key rather than appearing to have run", async () => {
    const handler = await loadHandler({
      DATABASE_URL,
      RESEND_API_KEY: undefined,
    });
    const body = await (await handler()).json();
    expect(body.status).toBe("NOT_CONFIGURED");
    expect(body.detail).toMatch(/RESEND_API_KEY/);
  });

  /* The database path, which the NOT_CONFIGURED branch returns before
     ever reaching — so asserting only the branch above would have left
     the Prisma construction untested a second time. */
  it("opens a real connection and reports what it did", async () => {
    const handler = await loadHandler({
      DATABASE_URL,
      RESEND_API_KEY: "not-a-real-key-this-test-never-sends",
    });
    const body = await (await handler()).json();
    expect(body.status).toBe("OK");
    expect(body.orgs).toBe(0);
    expect(body.truncated).toBe(false);
    expect(body.failures).toEqual([]);
  });

  /* An operator with nothing to say is counted, not mailed. The empty
     record is the ordinary case on any given morning. */
  it("counts an operator with nothing to report and sends nobody anything", async () => {
    await prisma().org.create({ data: { name: "Quiet AOC" } });
    const handler = await loadHandler({
      DATABASE_URL,
      RESEND_API_KEY: "not-a-real-key-this-test-never-sends",
    });
    const body = await (await handler()).json();
    expect(body.orgs).toBe(1);
    expect(body.nothingToSay).toBe(1);
    expect(body.sent).toBe(0);
  });

  /* A missing connection string must be a REPORTED failure, which is
     why the client is built inside the handler. Constructed at module
     scope, this case throws before there is a handler to report it. */
  it("reports a missing connection string instead of failing to import", async () => {
    const handler = await loadHandler({
      DATABASE_URL: undefined,
      SUPABASE_DATABASE_URL: undefined,
      RESEND_API_KEY: "not-a-real-key-this-test-never-sends",
    });
    const body = await (await handler()).json();
    expect(body.status).toBe("FAILED");
    expect(body.detail).toMatch(/DATABASE_URL/);
    process.env["DATABASE_URL"] = DATABASE_URL;
  });
});
