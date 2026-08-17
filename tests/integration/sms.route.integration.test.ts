// =====================================================================
// The other eight Annex 19 elements, through the real routes.
//
// These are the elements /coverage has said for months the product can
// score and cannot do. What is asserted here is not that the CRUD
// works — it is the handful of properties that are the whole point of
// each element, and that a generic CRUD factory would have silently
// dropped:
//
//   1.1  only the accountable executive can sign, and a new draft
//        supersedes rather than overwrites
//   1.3  appointing a successor ends the incumbent's appointment
//   3.3  a finding cannot be verified until it is closed
//   4.1  a frontline reporter sees their own record and nobody else's
//   4.2  feedback is refused against an anonymous report
//
// Plus the property every one of them shares and none of them states:
// a second tenant cannot see any of it.
// =====================================================================
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import type { FastifyInstance } from "fastify";
import { prisma, reset, migrate, disconnect, hasDatabase } from "./db.setup";
import {
  CURRICULUM_VERIFIED_AGAINST_PRIMARY, CURRICULUM_INSTRUMENT,
} from "../../packages/shared/src/curriculum";

const JWT_SECRET = "integration-test-secret-not-a-real-one";
process.env["JWT_SECRET"] = JWT_SECRET;
process.env["DEIDENT_SALT"] = "integration-test-salt";
process.env["LOG_LEVEL"] = "silent";

let app: FastifyInstance;
let orgId: string;
let otherOrgId: string;
let managerId: string;
let execId: string;
let frontlineId: string;
let otherManagerId: string;
let keyManagerId: string;

const tokenFor = (sub: string, org: string, role: string): string =>
  jwt.sign({ sub, org, role, typ: "access" }, JWT_SECRET, {
    algorithm: "HS256", expiresIn: "15m", issuer: "usalamasms",
  });

describe.skipIf(!hasDatabase)("the rest of Annex 19, through the real routes", () => {
  beforeAll(async () => {
    migrate();
    const { build } = await import("../../apps/api/src/server");
    app = await build();
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
    await disconnect();
  });

  beforeEach(async () => {
    await reset();
    const org = await prisma().org.create({ data: { name: "Design Partner AOC" } });
    const other = await prisma().org.create({ data: { name: "Competitor" } });
    orgId = org.id;
    otherOrgId = other.id;
    const mk = async (oid: string, role: string, name: string) =>
      (await prisma().user.create({
        data: {
          orgId: oid, email: `${role}.${oid}@example.test`, passwordHash: "unused",
          name, role: role as never,
        },
      })).id;
    managerId = await mk(orgId, "SAFETY_MANAGER", "Safety Manager");
    execId = await mk(orgId, "ACCOUNTABLE_EXECUTIVE", "Accountable Executive");
    frontlineId = await mk(orgId, "FRONTLINE", "Ramp Agent");
    keyManagerId = await mk(orgId, "KEY_MANAGEMENT", "Head of Flight Operations");
    otherManagerId = await mk(otherOrgId, "SAFETY_MANAGER", "Rival Safety Manager");
  });

  const call = (method: "GET" | "POST", url: string, token: string, payload?: unknown) =>
    app.inject({ method, url, headers: { authorization: `Bearer ${token}` }, ...(payload ? { payload } : {}) });

  const manager = () => tokenFor(managerId, orgId, "SAFETY_MANAGER");
  const exec = () => tokenFor(execId, orgId, "ACCOUNTABLE_EXECUTIVE");
  const frontline = () => tokenFor(frontlineId, orgId, "FRONTLINE");
  const keyManager = () => tokenFor(keyManagerId, orgId, "KEY_MANAGEMENT");

  const STATEMENT =
    "This operator commits to the resources and the accountability required to run a " +
    "safety management system, and to a reporting culture in which no person is " +
    "disadvantaged for raising a safety concern in good faith.";

  /* ------------------------- 1.1 safety policy ------------------------- */

  it("1.1 — ONLY THE ACCOUNTABLE EXECUTIVE CAN SIGN THE POLICY", async () => {
    // The element is not "there is a policy". It is that the person who
    // can move money and schedule has put their name to it. A safety
    // manager signing on their behalf is the finding, not the evidence.
    const drafted = await call("POST", "/api/v1/sms/policy", manager(), { statement: STATEMENT });
    expect(drafted.statusCode).toBe(201);
    const policyId = drafted.json().policy.id;

    const bySafetyManager = await call("POST", `/api/v1/sms/policy/${policyId}/sign`, manager());
    expect(bySafetyManager.statusCode).toBe(403);
    expect(bySafetyManager.json().detail).toMatch(/accountable executive/i);

    const byExec = await call("POST", `/api/v1/sms/policy/${policyId}/sign`, exec());
    expect(byExec.statusCode).toBe(200);
    expect(byExec.json().policy.signedById).toBe(execId);
    expect(byExec.json().policy.signedOn).not.toBeNull();
  });

  it("1.1 — a new draft SUPERSEDES rather than overwriting the signed one", async () => {
    // The question an auditor asks is what the policy said when the
    // decision was taken. A policy edited in place cannot answer it.
    const first = await call("POST", "/api/v1/sms/policy", manager(), { statement: STATEMENT });
    await call("POST", `/api/v1/sms/policy/${first.json().policy.id}/sign`, exec());
    await call("POST", "/api/v1/sms/policy", manager(), { statement: `${STATEMENT} Revised.` });

    const list = (await call("GET", "/api/v1/sms/policy", manager())).json().policies;
    expect(list).toHaveLength(2);
    const v1 = list.find((p: { version: number }) => p.version === 1);
    const v2 = list.find((p: { version: number }) => p.version === 2);
    expect(v1.supersededOn, "the superseded version lost its history").not.toBeNull();
    expect(v1.signedOn, "superseding erased the earlier signature").not.toBeNull();
    expect(v2.supersededOn).toBeNull();
    expect(v2.signedOn, "a new draft arrived already signed").toBeNull();
  });

  it("1.1 — records who has read it, once per person", async () => {
    const p = await call("POST", "/api/v1/sms/policy", manager(), { statement: STATEMENT });
    const id = p.json().policy.id;
    expect((await call("POST", `/api/v1/sms/policy/${id}/read`, frontline())).statusCode).toBe(200);
    // Twice is not two readers.
    expect((await call("POST", `/api/v1/sms/policy/${id}/read`, frontline())).statusCode).toBe(200);
    const list = (await call("GET", "/api/v1/sms/policy", manager())).json().policies;
    expect(list[0]._count.reads).toBe(1);
  });

  /* --------------------- 1.3 key safety personnel ---------------------- */

  it("1.3 — APPOINTING A SUCCESSOR ENDS THE INCUMBENT'S APPOINTMENT", async () => {
    // Two people accountable for one post is the ambiguity this element
    // exists to remove, and it is what a naive insert produces.
    const post = "Safety Manager";
    const first = await call("POST", "/api/v1/sms/appointments", manager(), {
      post, userId: managerId, appointedOn: "2026-01-05T00:00:00.000Z", letterRef: "APP/2026/01",
    });
    expect(first.statusCode).toBe(201);

    const second = await call("POST", "/api/v1/sms/appointments", manager(), {
      post, userId: frontlineId, appointedOn: "2026-08-01T00:00:00.000Z",
    });
    expect(second.statusCode).toBe(201);

    const held = await prisma().appointment.findMany({ where: { orgId, post } });
    const current = held.filter((a) => a.endedOn === null);
    expect(current, "two people hold one post at once").toHaveLength(1);
    expect(current[0]!.userId).toBe(frontlineId);
  });

  it("1.3 — cannot appoint somebody from another operator", async () => {
    const res = await call("POST", "/api/v1/sms/appointments", manager(), {
      post: "Safety Manager", userId: otherManagerId, appointedOn: "2026-08-01T00:00:00.000Z",
    });
    expect(res.statusCode).toBe(404);
    expect(await prisma().appointment.count()).toBe(0);
  });

  /* -------------------- 3.3 findings and corrective action ------------- */

  it("3.3 — A FINDING CANNOT BE VERIFIED UNTIL IT IS CLOSED", async () => {
    // Closing says the action was taken; verifying says somebody went
    // back and found it worked. Conflating them produces a closed
    // finding that never worked, which is how an internal audit
    // programme becomes paperwork.
    const raised = await call("POST", "/api/v1/sms/findings", manager(), {
      auditRef: "IA-2026-03", elementId: "2.1", severity: "NONCONFORMITY",
      finding: "Hazard reports from the ramp are not reaching the safety office within the cycle.",
      ownerPost: "Safety Manager", dueBy: "2026-10-01T00:00:00.000Z",
    });
    expect(raised.statusCode).toBe(201);
    const id = raised.json().finding.id;

    const early = await call("POST", `/api/v1/sms/findings/${id}/verify`, keyManager());
    expect(early.statusCode).toBe(409);
    expect(early.json().detail).toMatch(/instead of it/i);

    const closed = await call("POST", `/api/v1/sms/findings/${id}/close`, manager(), {
      correctiveAction: "Collection moved to the crew room and a weekly sweep added to the roster.",
    });
    expect(closed.statusCode).toBe(200);

    /* AND THE POST THAT RAN THE AUDIT CANNOT VERIFY ITS OWN CORRECTIVE
       ACTION. Whoever conducted the audit saying their own fix worked is
       the weakest evidence an assurance programme can produce, so
       `sms.audit.conduct` and `sms.audit.verify` are held by different
       roles by construction rather than by convention. */
    const bySameHand = await call("POST", `/api/v1/sms/findings/${id}/verify`, manager());
    expect(
      bySameHand.statusCode,
      "the post that closed the finding was allowed to verify its own corrective action",
    ).toBe(403);

    const verified = await call("POST", `/api/v1/sms/findings/${id}/verify`, keyManager());
    expect(verified.statusCode).toBe(200);
    expect(verified.json().finding.verifiedById).toBe(keyManagerId);
  });

  it("3.3 — refuses to close a finding with no corrective action", async () => {
    const raised = await call("POST", "/api/v1/sms/findings", manager(), {
      auditRef: "IA-2026-04",
      finding: "The emergency response plan has not been exercised in the current cycle.",
      ownerPost: "Accountable Executive",
    });
    const res = await call("POST", `/api/v1/sms/findings/${raised.json().finding.id}/close`, manager(), {});
    expect(res.statusCode).toBe(400);
  });

  /* --------------------------- 4.1 training ---------------------------- */

  it("4.1 — a frontline reporter sees THEIR OWN record and nobody else's", async () => {
    await call("POST", "/api/v1/sms/training", manager(), {
      userId: frontlineId, course: "SMS awareness", completedOn: "2026-02-01T00:00:00.000Z",
      expiresOn: "2028-02-01T00:00:00.000Z",
    });
    await call("POST", "/api/v1/sms/training", manager(), {
      userId: managerId, course: "Safety manager course", completedOn: "2026-03-01T00:00:00.000Z",
    });

    const own = await call("GET", "/api/v1/sms/training", frontline());
    expect(own.statusCode).toBe(200);
    expect(own.json().scope).toBe("own");
    expect(own.json().training).toHaveLength(1);
    expect(own.json().training[0].userId).toBe(frontlineId);

    const matrix = await call("GET", "/api/v1/sms/training", manager());
    expect(matrix.json().scope).toBe("org");
    expect(matrix.json().training).toHaveLength(2);
  });

  /* ------------------------------------------------------------------
     THE QUESTION THE RECORDS CANNOT ANSWER.

     currency.ts reports whose certificate has RUN OUT — a person who
     was trained, visible as a dated row. A GAP is a person who was
     never trained in something their role requires, and it has no row
     to be visible in: a matrix built only from records shows a clean
     sheet for somebody who has had no training at all.

     The curriculum module has held Doc 9859's six initial topics,
     unit-tested, since it was written, and was imported by nothing but
     its own test. These assert it reaches an operator.
     ------------------------------------------------------------------ */
  it("4.1 — reports training a role requires and no record covers", async () => {
    const matrix = await call("GET", "/api/v1/sms/training", manager());
    expect(matrix.statusCode).toBe(200);

    const reporter = matrix
      .json()
      .curriculum.find((p: { userId: string }) => p.userId === frontlineId);
    expect(reporter).toBeTruthy();
    /* Nothing has been filed for this person, so every topic their role
       requires is a gap — the clean sheet the records alone would show. */
    expect(reporter.gaps.length).toBe(reporter.required.length);
    expect(reporter.gaps.length).toBeGreaterThan(0);
  });

  /* A record filed under a name the curriculum does not know must NOT
     silently satisfy a requirement, and must NOT be silently dropped
     either — every record predating the curriculum carries free text,
     and swallowing them tells an operator their certificates do not
     exist. */
  it("4.1 — an unrecognised course name is reported, not counted and not discarded", async () => {
    await call("POST", "/api/v1/sms/training", manager(), {
      userId: frontlineId, course: "SMS refresher", completedOn: "2026-02-01T00:00:00.000Z",
    });

    const matrix = await call("GET", "/api/v1/sms/training", manager());
    const reporter = matrix
      .json()
      .curriculum.find((p: { userId: string }) => p.userId === frontlineId);

    expect(reporter.unrecognised).toContain("SMS refresher");
    /* It satisfied nothing: the gap count is unchanged by a name the
       build cannot map. */
    expect(reporter.gaps.length).toBe(reporter.required.length);
  });

  /* A list of who has not been trained is a personnel matter, and the
     scope this route already draws is the right boundary for it. */
  it("4.1 — a frontline reporter's own view carries their gaps and nobody else's", async () => {
    const own = await call("GET", "/api/v1/sms/training", frontline());
    expect(own.json().scope).toBe("own");
    expect(own.json().curriculum).toHaveLength(1);
    expect(own.json().curriculum[0].userId).toBe(frontlineId);
  });

  /* Charter rule 7, in the payload: a consumer is entitled to know
     whether the syllabus it is holding was read from the instrument
     or from a search index's rendering of one.

     THIS TEST USED TO PIN THE LITERAL `false`, and it went red the
     day somebody read CAA-AC-SMS011 and the flag became true. That is
     the wrong assertion to have written twice, because the fact it
     pins is a fact this product is supposed to be able to IMPROVE —
     pinning the other literal now would just arm the same trap for
     whoever adds a second jurisdiction.

     So what is asserted is the property that cannot legitimately
     change: the route DISCLOSES its provenance, and discloses it by
     WIRING THE SHARED CONSTANT THROUGH rather than by writing a value
     of its own. A route that hardcodes `true` beside a curriculum
     nobody read is exactly the failure this disclosure exists to
     prevent, and it is the only way this payload can lie. */
  it("4.1 — DISCLOSES the curriculum's provenance from the shared module, not its own", async () => {
    const matrix = await call("GET", "/api/v1/sms/training", manager());
    const body = matrix.json();
    expect(body.curriculumVerifiedAgainstPrimary).toBe(CURRICULUM_VERIFIED_AGAINST_PRIMARY);
    /* And says against WHAT. A bare boolean tells a consumer that
       something was checked without telling them what it was checked
       against, which is not a provenance. */
    expect(body.curriculumInstrument).toBe(CURRICULUM_INSTRUMENT.reference);
    expect(body.curriculumInstrument).toBeTruthy();
  });

  it("4.1 — a frontline reporter cannot write a training record", async () => {
    const res = await call("POST", "/api/v1/sms/training", frontline(), {
      userId: frontlineId, course: "Self-awarded", completedOn: "2026-02-01T00:00:00.000Z",
    });
    expect(res.statusCode).toBe(403);
  });

  /* ----------------------- 4.2 safety communication -------------------- */

  it("4.2 — REFUSES FEEDBACK AGAINST AN ANONYMOUS REPORT", async () => {
    // Element 4.2 asks whether people who file hear what happened. For
    // an anonymous report there is nobody to tell — and a row joining
    // feedback to it, written by a named manager at a known time, is
    // the re-identification the sync path was fixed to prevent,
    // arriving through a different door.
    const anonymous = await prisma().safetyReport.create({
      data: {
        orgId, clientId: "anon-1", type: "VCR", title: "Pressure to accept",
        narrative: "The duty manager pressured the crew to accept the aircraft.",
        awareAt: new Date(), jurisdiction: "KE", isAnonymous: true,
      },
    });
    const named = await prisma().safetyReport.create({
      data: {
        orgId, clientId: "named-1", type: "HAZARD", title: "Bird activity",
        narrative: "A flock crossed the approach for a third morning.",
        awareAt: new Date(), jurisdiction: "KE", isAnonymous: false, reporterId: frontlineId,
      },
    });

    const refused = await call("POST", "/api/v1/sms/communications", manager(), {
      title: "What happened about your report",
      body: "Thank you — the roster has been changed and the duty manager has been spoken to.",
      reportId: anonymous.id,
    });
    expect(refused.statusCode).toBe(422);
    expect(refused.json().detail).toMatch(/identify its reporter/i);
    expect(await prisma().safetyCommunication.count()).toBe(0);

    // And the bulletin — the instrument that IS right there — works.
    const bulletin = await call("POST", "/api/v1/sms/communications", manager(), {
      title: "Rostering changed after a confidential report",
      body: "A change has been made to the acceptance procedure following a report received.",
    });
    expect(bulletin.statusCode).toBe(201);

    // And feedback on a NAMED report is exactly what the element wants.
    const feedback = await call("POST", "/api/v1/sms/communications", manager(), {
      title: "What happened about your report",
      body: "The approach lighting has been reported to the aerodrome and a NOTAM requested.",
      reportId: named.id,
    });
    expect(feedback.statusCode).toBe(201);
    expect(feedback.json().communication.reportId).toBe(named.id);
  });

  /* ------------------------------ tenancy ------------------------------ */

  it("SHOWS A SECOND OPERATOR NONE OF IT", async () => {
    // One assertion per surface, because eight new tables is eight new
    // chances to forget the orgId — and the one that gets forgotten is
    // the one nobody wrote a test for.
    await call("POST", "/api/v1/sms/policy", manager(), { statement: STATEMENT });
    await call("POST", "/api/v1/sms/accountabilities", manager(), {
      post: "Chief Pilot", responsibility: "Operational risk acceptance within the tolerable band.",
    });
    await call("POST", "/api/v1/sms/exercises", manager(), {
      scenario: "Runway excursion with injuries at the home base.",
      heldOn: "2026-05-02T00:00:00.000Z", participants: "Aerodrome fire service, duty office",
      findings: "The contact directory was eleven months out of date.", planUpdated: true,
    });
    await call("POST", "/api/v1/sms/documents", manager(), {
      title: "SMS Manual", reference: "SMS-001", version: "3.0",
    });
    await call("POST", "/api/v1/sms/findings", manager(), {
      auditRef: "IA-2026-05", finding: "Training records for two ramp agents have lapsed.",
      ownerPost: "Safety Manager",
    });
    await call("POST", "/api/v1/sms/training", manager(), {
      userId: frontlineId, course: "SMS awareness", completedOn: "2026-02-01T00:00:00.000Z",
    });
    await call("POST", "/api/v1/sms/communications", manager(), {
      title: "Safety bulletin", body: "The wet-season crosswind limit has been reduced.",
    });

    const rival = tokenFor(otherManagerId, otherOrgId, "SAFETY_MANAGER");
    const surfaces: Array<[string, string]> = [
      ["/api/v1/sms/policy", "policies"],
      ["/api/v1/sms/accountabilities", "accountabilities"],
      ["/api/v1/sms/exercises", "exercises"],
      ["/api/v1/sms/documents", "documents"],
      ["/api/v1/sms/findings", "findings"],
      ["/api/v1/sms/training", "training"],
      ["/api/v1/sms/communications", "communications"],
    ];
    for (const [url, key] of surfaces) {
      const res = await call("GET", url, rival);
      expect(res.statusCode, `${url} refused a legitimate caller`).toBe(200);
      expect(res.json()[key], `${url} leaked another operator's records`).toHaveLength(0);
    }

    // And our own operator sees all of it, so the assertion above is not
    // passing because nothing was written.
    for (const [url, key] of surfaces) {
      expect((await call("GET", url, manager())).json()[key].length, `${url} stored nothing`)
        .toBeGreaterThan(0);
    }
  });

  it("WRITES EVERY ONE OF THEM INTO THE AUDIT CHAIN", async () => {
    const { verifyAuditChain } = await import("../../apps/api/src/core");
    await call("POST", "/api/v1/sms/policy", manager(), { statement: STATEMENT });
    await call("POST", "/api/v1/sms/documents", manager(), {
      title: "SMS Manual", reference: "SMS-001", version: "3.0",
    });
    await call("POST", "/api/v1/sms/training", manager(), {
      userId: frontlineId, course: "SMS awareness", completedOn: "2026-02-01T00:00:00.000Z",
    });

    const entries = await prisma().auditLog.findMany({ where: { orgId }, orderBy: { seq: "asc" } });
    expect(entries.map((e) => e.action)).toEqual([
      "policy.draft", "document.approve", "training.record",
    ]);
    const verdict = await verifyAuditChain(orgId);
    expect(verdict.ok, "the chain did not verify after the new routes wrote to it").toBe(true);
  });

  /* ---------------- 1.3 / 4.1 — the roster the forms need -------------- */

  it("1.3 — OFFERS THE ROSTER TO AN OPERATOR THAT HAS APPOINTED NOBODY YET", async () => {
    /* The deadlock this fixes, found by driving the screen rather than
       by reading it: the appointment form's person dropdown was built
       from the appointments already recorded. With none recorded there
       was nobody to choose, so the FIRST appointment could not be made
       — and because the training form draws on the same list, no
       training could be recorded either. Two of the eight elements were
       unreachable from the state every new operator starts in.

       Asserted against an org with users and zero appointments, which
       is exactly that state. A roster derived from appointments returns
       an empty array here and the test goes red. */
    expect(await prisma().appointment.count({ where: { orgId } })).toBe(0);

    const res = await call("GET", "/api/v1/sms/accountabilities", manager());
    expect(res.statusCode).toBe(200);
    const people = res.json().people as Array<{ id: string; name: string }>;
    expect(people.length, "nobody could be appointed to the first post").toBeGreaterThan(0);
    expect(people.map((p) => p.id)).toContain(frontlineId);

    // And it is usable: the id offered is one the appointment route takes.
    const made = await call("POST", "/api/v1/sms/appointments", manager(), {
      post: "Safety Manager", userId: people[0]!.id, appointedOn: "2026-01-05T00:00:00.000Z",
    });
    expect(made.statusCode, "the roster offered a person the route then refused").toBe(201);
  });

  it("1.3 — the roster carries no email, and no password hash", async () => {
    // A staff list is not a safety narrative, but it is also not a
    // reason to hand out contact details and credential material to
    // every screen that needs a name against a post.
    const people = (await call("GET", "/api/v1/sms/accountabilities", manager())).json().people;
    for (const p of people as Array<Record<string, unknown>>) {
      expect(Object.keys(p).sort()).toEqual(["id", "name", "role"]);
    }
  });

  it("1.3 — WITHHOLDS THE ROSTER FROM A ROLE THAT APPOINTS AND TRAINS NOBODY", async () => {
    // A frontline reporter reads this screen and holds neither
    // appointment.manage nor training.manage. They get the matrix,
    // which is published, and not the staff list.
    const res = await call("GET", "/api/v1/sms/accountabilities", frontline());
    expect(res.statusCode).toBe(200);
    expect(res.json().people, "the staff list went to a role with no use for it").toHaveLength(0);
  });

  it("1.3 — the roster stops at the operator's own boundary", async () => {
    const res = await call("GET", "/api/v1/sms/accountabilities", manager());
    const ids = (res.json().people as Array<{ id: string }>).map((p) => p.id);
    expect(ids, "another operator's people were offered as appointees").not.toContain(otherManagerId);
  });

  it("1.3 — the roster does not offer a deactivated person", async () => {
    // An appointment is a live post. Offering a leaver as the appointee
    // is how a stale accountability matrix gets made, one plausible
    // dropdown choice at a time.
    await prisma().user.update({ where: { id: frontlineId }, data: { active: false } });
    const ids = ((await call("GET", "/api/v1/sms/accountabilities", manager())).json().people as
      Array<{ id: string }>).map((p) => p.id);
    expect(ids).not.toContain(frontlineId);
    expect(ids).toContain(managerId);
  });

  it("refuses every one of them without a token", async () => {
    for (const url of [
      "/api/v1/sms/policy", "/api/v1/sms/accountabilities", "/api/v1/sms/exercises",
      "/api/v1/sms/documents", "/api/v1/sms/findings", "/api/v1/sms/training",
      "/api/v1/sms/communications",
    ]) {
      expect((await app.inject({ method: "GET", url })).statusCode, `${url} is open`).toBe(401);
    }
  });
});
