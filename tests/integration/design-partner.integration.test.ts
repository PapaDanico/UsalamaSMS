/* =====================================================================
   PHASE 1'S GATE, WALKED END TO END.

   docs/02-STRATEGY.md sets the gate behaviourally — "a frontline user
   files a report offline and it arrives" — and marks Phase 1 "met in
   code, open on the customer". It then says the thing worth acting on:

     "So the sequencing constraint is now a customer, not a feature.
      What Phase 2 needs is not more of Tier 2; it is one design partner
      filing real reports."

   EVERY PART OF THAT WALK IS ALREADY TESTED AND THE WALK IS NOT.
   Signup has its own suite — validation, fleet types, the refusal to
   accept an injected role or orgId. Sync has one. The queue has one.
   What nothing asserted is that they compose: that a stranger with an
   email address ends up, without anybody's help, as an operator whose
   first report is in its own queue.

   That is the sequence a design partner performs on day one, and it is
   the one this product has never had a test for. A defect in the joins
   between these routes would not show up in any of the suites above —
   which is exactly the class of failure this repository keeps meeting,
   most recently when the app had no login screen and every sync
   returned 401 while both halves passed their own tests.

   IT IS ALSO NOT A SUBSTITUTE FOR THE CUSTOMER. CI is not a frontline
   user, and the gate stays open until a real one files a real report.
   What this closes is the narrower question of whether the product
   would be in their way.
   ===================================================================== */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma, reset, migrate, disconnect, hasDatabase } from "./db.setup";
import { establishment, nextStep } from "../../packages/shared/src/today";

const JWT_SECRET = "integration-test-secret-not-a-real-one";
process.env["JWT_SECRET"] = JWT_SECRET;
process.env["DEIDENT_SALT"] = "integration-test-salt";
process.env["LOG_LEVEL"] = "silent";

let app: FastifyInstance;

/* A real-shaped operator. Values that read like an operator rather than
   like a fixture, because a signup that only works for "Test Test" is a
   signup nobody has watched a person use. */
const PARTNER = {
  orgName: "Rift Valley Air Charter",
  aocNumber: "KE-AOC-114",
  jurisdiction: "KE",
  fleet: 6,
  name: "Amina Odhiambo",
  email: "amina@riftvalley.test",
  password: "a-sufficiently-long-password",
};

/* The idempotency key is generated on the handset and the schema
   demands a UUID. */
const CLIENT_ID = "33333333-3333-4333-8333-333333333333";

/* A fresh address per call: the route allows five an hour, correctly,
   because it is the only unauthenticated route that writes. */
let n = 0;
const post = (url: string, payload: unknown, token?: string) =>
  app.inject({
    method: "POST", url, payload: payload as never,
    headers: {
      "x-forwarded-for": `198.51.100.${(n += 1) % 250}`,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
const get = (url: string, token: string) =>
  app.inject({ method: "GET", url, headers: { authorization: `Bearer ${token}` } });

describe.skipIf(!hasDatabase)("the walk a design partner makes on day one", () => {
  beforeAll(async () => {
    migrate();
    const { build } = await import("../../apps/api/src/server");
    app = await build();
    await app.ready();
  });
  afterAll(async () => { await app?.close(); await disconnect(); });
  beforeEach(async () => { await reset(); });

  it("SIGNS UP, SIGNS IN, FILES, AND THE REPORT IS IN THEIR OWN QUEUE", async () => {
    /* ---- 1. A stranger with an email address becomes an operator ---- */
    const signed = await post("/api/v1/auth/signup", PARTNER);
    expect(signed.statusCode, signed.body).toBe(201);

    /* ---- 2. And can sign in with what they just chose ----
       The join that has been broken before: an account created by one
       route and refused by the next. */
    const login = await post("/api/v1/auth/login", {
      email: PARTNER.email, password: PARTNER.password,
    });
    expect(login.statusCode, "the account signup created could not sign in").toBe(200);
    const token = login.json().accessToken ?? login.json().access_token;
    expect(token, "login returned no access token").toBeTruthy();

    /* ---- 3. The record is empty, and /today says so rather than
             greeting them with an all-clear ---- */
    const beforeFiling = await get("/api/v1/digest", token);
    expect(beforeFiling.statusCode, beforeFiling.body).toBe(200);
    expect(establishment(beforeFiling.json().scale)).toBe("EMPTY");
    expect(nextStep(beforeFiling.json().scale)?.where).toBe("/report");

    /* ---- 4. They file, the way a handset does ---- */
    const filed = await post("/api/v1/sync/batch", {
      deviceId: "partner-handset-01",
      items: [{
        clientId: CLIENT_ID,
        entityType: "safetyReport",
        op: "CREATE",
        payload: {
          clientId: CLIENT_ID, type: "HAZARD",
          title: "Loose ground handling equipment on stand 4",
          narrative: "Seen on the walk-round before the first rotation.",
          awareAt: new Date().toISOString(), jurisdiction: "KE",
          hrcTags: [], isAnonymous: false,
        },
        clientUpdatedAt: new Date().toISOString(),
      }],
    }, token);
    expect(filed.statusCode, filed.body).toBe(200);
    expect(filed.json().results[0].status, JSON.stringify(filed.json().results[0]))
      .toMatch(/applied|created/);

    /* ---- 5. AND IT ARRIVED. The whole gate, in one assertion. ---- */
    const queue = await get("/api/v1/reports/queue", token);
    expect(queue.statusCode, queue.body).toBe(200);
    const titles = queue.json().reports.map((r: { title: string }) => r.title);
    expect(titles, "the report was accepted and is not in the operator's queue")
      .toContain("Loose ground handling equipment on stand 4");

    /* ---- 6. And the onboarding sequence has moved on, rather than
             still offering the step they just took ---- */
    const after = await get("/api/v1/digest", token);
    expect(establishment(after.json().scale)).toBe("STARTED");
    expect(nextStep(after.json().scale)?.where).toBe("/toolkits/spi");
  });

  it("AND THE OPERATOR IT CREATED IS SEALED FROM EVERY OTHER ONE", async () => {
    /* The first thing a design partner's lawyer asks, and the property
       that has to hold before anybody's real safety record is in here.
       Two operators sign up independently; neither can see the other. */
    const a = await post("/api/v1/auth/signup", PARTNER);
    expect(a.statusCode).toBe(201);
    const b = await post("/api/v1/auth/signup", {
      ...PARTNER, orgName: "Lake Victoria Aviation",
      aocNumber: "KE-AOC-115", email: "joseph@lakevictoria.test",
    });
    expect(b.statusCode).toBe(201);

    const tokenFor = async (email: string) =>
      (await post("/api/v1/auth/login", { email, password: PARTNER.password }))
        .json().accessToken;

    const ta = await tokenFor(PARTNER.email);
    const tb = await tokenFor("joseph@lakevictoria.test");

    await post("/api/v1/sync/batch", {
      deviceId: "a-handset",
      items: [{
        clientId: CLIENT_ID, entityType: "safetyReport", op: "CREATE",
        payload: {
          clientId: CLIENT_ID, type: "HAZARD", title: "Operator A's own hazard",
          narrative: "Belongs to A, and to nobody else.",
          awareAt: new Date().toISOString(), jurisdiction: "KE",
          hrcTags: [], isAnonymous: false,
        },
        clientUpdatedAt: new Date().toISOString(),
      }],
    }, ta);

    const theirs = await get("/api/v1/reports/queue", tb);
    expect(theirs.statusCode).toBe(200);
    expect(
      JSON.stringify(theirs.json().reports),
      "a second operator could read the first one's report",
    ).not.toContain("Operator A's own hazard");

    /* And the record really is two tenants, not one shared bucket. */
    const orgs = await prisma().org.count();
    expect(orgs).toBe(2);
  });

  it("and a second signup on the same email does not hand over the first operator", async () => {
    /* The enumeration-safe refusal is asserted in the auth suite. What
       matters HERE is the consequence: a duplicate must not end up
       inside the existing tenant. */
    expect((await post("/api/v1/auth/signup", PARTNER)).statusCode).toBe(201);
    await post("/api/v1/auth/signup", { ...PARTNER, orgName: "Somebody Else Entirely" });

    expect(await prisma().org.count(), "a duplicate signup created a second org").toBe(1);
    expect(await prisma().user.count({ where: { email: PARTNER.email } })).toBe(1);
  });
});
