#!/usr/bin/env node
/* ============================================================
   A demo AOC, with people in it and something on the queue.

   WHY THIS IS SEPARATE FROM scripts/seed.mjs. That one creates the
   smallest thing a real design partner needs: one org, three accounts,
   no data. This one creates something to LOOK at — a mid-tier Kenyan
   operator with a mixed fleet, eight people across the roles an SMS
   actually distributes work between, and a queue with reports already
   on it in several states.

   The distinction matters because the two must never be confused. A
   demo org carries invented occurrences; a design partner's org carries
   theirs. So this one is named with DEMO in it, its AOC number says
   DEMO, its aircraft are in a registration block no Kenyan operator
   holds, and every seeded narrative is written to be obviously
   illustrative. Nobody should be able to open the triage queue and
   wonder whether what they are reading happened.

   PASSWORDS ARE STILL SHOWN ONCE AND STORED NOWHERE. A demo account on
   a reachable deployment is a real credential — "it is only the demo"
   is how a known password ends up on something that is not.

   Idempotent by email, like its sibling. Running it twice does not
   duplicate the org, the people or the reports.

     DATABASE_URL=... node scripts/seed-demo.mjs
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

const generatePassword = () => randomBytes(20).toString("base64url");

const ORG_NAME = process.env.DEMO_ORG_NAME ?? "Rift Valley Air — DEMO";
const EMAIL_DOMAIN = process.env.DEMO_EMAIL_DOMAIN ?? "demo.usalamasms.test";

/* ------------------------------------------------------------------
   THE OPERATOR.

   A mid-tier Kenyan AOC of the shape this product was built for: too
   large to run its SMS on one spreadsheet, too small to buy a $3,000/mo
   incumbent. Mixed fleet, because that is what makes an SMS hard —
   turboprops on regional sectors out of Wilson and the coast, jets on
   the trunk routes, and one safety office covering both.

   The registrations are 5Y-D**, chosen because it is a plausible
   Kenyan format and a block that reads as a demo at a glance. They are
   in the seeded narratives, which also proves something worth proving:
   the de-identification pipeline redacts them.
   ------------------------------------------------------------------ */
const FLEET = [
  { reg: "5Y-DMA", type: "F50", role: "Regional turboprop" },
  { reg: "5Y-DMB", type: "F50", role: "Regional turboprop" },
  { reg: "5Y-DMC", type: "DH8D", role: "Regional turboprop" },
  { reg: "5Y-DMD", type: "DH8D", role: "Regional turboprop" },
  { reg: "5Y-DME", type: "F70", role: "Trunk jet" },
  { reg: "5Y-DMF", type: "F70", role: "Trunk jet" },
  { reg: "5Y-DMG", type: "B738", role: "Trunk jet" },
];

/* ------------------------------------------------------------------
   THE PEOPLE.

   Eight, one per role, and unlike the design-partner seed this one does
   populate all of them — the point of a demo is to show how work moves
   between roles, which cannot be shown from three accounts.

   REGULATOR_INSPECTOR is included deliberately and is the one to look
   at hardest: it exists to demonstrate that an inspector sees a
   de-identified view, not the reporter. A demo that quietly gave the
   inspector everything would be demonstrating the opposite of the
   product's central claim.
   ------------------------------------------------------------------ */
const PEOPLE = [
  { role: "ACCOUNTABLE_EXECUTIVE", name: "Amina Wanjiru", local: "amina", title: "Accountable Executive" },
  { role: "SAFETY_MANAGER", name: "Daniel Kiptoo", local: "daniel", title: "Safety Manager" },
  { role: "SAFETY_OFFICER", name: "Grace Achieng", local: "grace", title: "Safety Officer" },
  { role: "INVESTIGATOR", name: "Peter Mwangi", local: "peter", title: "Investigator" },
  { role: "KEY_MANAGEMENT", name: "Fatuma Hassan", local: "fatuma", title: "Head of Flight Operations" },
  { role: "FRONTLINE", name: "Joseph Otieno", local: "joseph", title: "First Officer" },
  { role: "FRONTLINE", name: "Mercy Njeri", local: "mercy", title: "Ramp Agent" },
  { role: "REGULATOR_INSPECTOR", name: "KCAA Inspector", local: "inspector", title: "Regulator (de-identified view)" },
];

/* ------------------------------------------------------------------
   THE QUEUE.

   Seven occurrences, chosen so the triage queue demonstrates the things
   that are hard rather than the things that are easy:

     · one that is OVERDUE against the Kenyan 24-hour clock, because an
       empty queue never shows what the deadline engine is for;
     · one ANONYMOUS, so the queue can be inspected for what it does
       NOT hold about the reporter;
     · one filed days after the occurrence, which is the case the
       awareness clock exists for and the case an occurrence-anchored
       clock got wrong;
     · registrations and names in the narratives, so the de-identifier
       has something real to remove.

   `daysAgo` and `awareDaysAgo` are offsets rather than fixed dates: a
   demo seeded with 2026 dates looks abandoned by 2027.
   ------------------------------------------------------------------ */
const REPORTS = [
  {
    type: "MOR",
    title: "Bird activity on short final, runway 06",
    narrative:
      "On approach to runway 06 the crew of 5Y-DMC reported a flock of large birds " +
      "crossing left to right at approximately 300 feet. A go-around was flown. No " +
      "ingestion and no damage on inspection. Third similar report at this aerodrome " +
      "this month. Joseph Otieno was pilot flying.",
    reporterRecommendation:
      "Ask the aerodrome for the bird control log for the last 30 days and put this " +
      "on the agenda of the next safety action group.",
    aircraftType: "DH8D",
    location: "HKJK",
    phase: "APPROACH",
    hrcTags: ["BWI"],
    daysAgo: 1,
    awareDaysAgo: 1,
    isAnonymous: false,
    reporter: "joseph",
  },
  {
    type: "MOR",
    title: "Rejected take-off, master caution at 60 knots",
    narrative:
      "5Y-DME rejected take-off at approximately 60 knots following a master caution " +
      "for a hydraulic low-pressure indication. Low-speed reject, normal braking, taxied " +
      "clear under own power. Passengers disembarked at stand. Engineering found a " +
      "chafed line.",
    reporterRecommendation: "Fleet-wide inspection of the same line run on the other F70.",
    aircraftType: "F70",
    location: "HKJK",
    phase: "TAKEOFF",
    hrcTags: [],
    // Filed late on purpose: 40 hours against a 24-hour Kenyan window.
    daysAgo: 2,
    awareDaysAgo: 2,
    isAnonymous: false,
    reporter: "daniel",
  },
  {
    type: "HAZARD",
    title: "Apron lighting out on stand 12 after last light",
    narrative:
      "Two of the four apron floodlights covering stand 12 have been unserviceable for " +
      "at least a week. Turnrounds after last light are being worked with torches. Risk " +
      "of a missed damage check or a ground handling injury.",
    reporterRecommendation: "Report to the aerodrome operator and stop night turnrounds on 12 until fixed.",
    aircraftType: "",
    location: "HKMO",
    phase: "GROUND_HANDLING",
    hrcTags: [],
    daysAgo: 4,
    awareDaysAgo: 4,
    isAnonymous: false,
    reporter: "mercy",
  },
  {
    /* The one this product exists for. Anonymous, and about a person
       with more authority than the reporter — which is exactly the
       report that does not get filed on a form with a name box. */
    type: "VCR",
    title: "Pressure to depart with a deferred defect",
    narrative:
      "I was asked to accept an aircraft with a deferred item that I was not comfortable " +
      "with, and told the schedule could not take another delay. I signed for it. I would " +
      "not do that again and I do not think I should have been asked.",
    reporterRecommendation:
      "A clear statement from management that a commander's refusal is supported, and no " +
      "conversation about the schedule at the point of acceptance.",
    aircraftType: "F50",
    location: "HKJK",
    phase: "GROUND_HANDLING",
    hrcTags: [],
    daysAgo: 6,
    awareDaysAgo: 6,
    isAnonymous: true,
    reporter: null,
  },
  {
    /* Discovered nine days after it happened. Under the occurrence-
       anchored clock this module used to use, its deadline had passed
       eight days before anyone knew there was anything to report. */
    type: "MOR",
    title: "Ground damage found at daily check — scrape on lower fuselage",
    narrative:
      "A scrape approximately 400mm long was found on the lower fuselage of 5Y-DMG at " +
      "the daily check. Not present at the last recorded inspection nine days earlier. No " +
      "ground damage report was raised at the time by any handler. Under investigation.",
    reporterRecommendation:
      "Walk the CCTV back across all stands used in that window before it is overwritten.",
    aircraftType: "B738",
    location: "HKJK",
    phase: "GROUND_HANDLING",
    hrcTags: [],
    daysAgo: 9,
    awareDaysAgo: 0,
    isAnonymous: false,
    reporter: "peter",
  },
  {
    type: "HAZARD",
    title: "Unstable approach criteria not called by either pilot",
    narrative:
      "Flight data review shows an approach into HKMO continuing below 500 feet with a " +
      "rate of descent outside the stable criteria, with no call from either seat. Crew " +
      "reported high workload and a late runway change.",
    reporterRecommendation: "Include in the next recurrent simulator detail as a discussion item.",
    aircraftType: "F50",
    location: "HKMO",
    phase: "APPROACH",
    hrcTags: [],
    daysAgo: 12,
    awareDaysAgo: 11,
    isAnonymous: false,
    reporter: "grace",
  },
  {
    type: "FATIGUE",
    title: "Fatigue on the third early start in a row",
    narrative:
      "Third consecutive 0400 report. I was slow on the checklist and missed a call on " +
      "the descent. Legal under the scheme but I did not feel fit for the last sector.",
    reporterRecommendation: "Look at how often the same crew are rostered three early starts running.",
    aircraftType: "DH8D",
    location: "HKJK",
    phase: "CRUISE",
    hrcTags: [],
    daysAgo: 15,
    awareDaysAgo: 15,
    isAnonymous: true,
    reporter: null,
  },
];

const daysAgo = (n) => new Date(Date.now() - n * 24 * 3600 * 1000);

async function main() {
  const existing = await prisma.org.findFirst({ where: { name: ORG_NAME } });
  const org =
    existing ??
    (await prisma.org.create({
      data: { name: ORG_NAME, jurisdiction: "KE", aocNumber: "KE-AOC-DEMO-001" },
    }));

  console.log(existing ? `demo org exists: ${org.name}` : `created demo org: ${org.name}`);
  console.log(`  id:  ${org.id}`);
  console.log(`  AOC: ${org.aocNumber}`);
  console.log(`\n  fleet described in the seeded reports:`);
  for (const a of FLEET) console.log(`    ${a.reg}  ${a.type.padEnd(5)} ${a.role}`);
  console.log();

  const created = [];
  const byLocal = new Map();

  for (const person of PEOPLE) {
    const email = `${person.local}@${EMAIL_DOMAIN}`;
    const already = await prisma.user.findUnique({ where: { email } });

    if (already) {
      byLocal.set(person.local, already);
      console.log(`  user exists, left alone: ${email} (${already.role})`);
      continue;
    }

    const password = generatePassword();
    const user = await prisma.user.create({
      data: {
        orgId: org.id,
        email,
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
        name: person.name,
        role: person.role,
      },
    });
    byLocal.set(person.local, user);
    created.push({ email, password, role: user.role, title: person.title });
  }

  /* Reports are keyed on a stable clientId so a second run updates
     nothing and duplicates nothing — the same idempotency the sync
     route relies on, exercised here rather than described. */
  let reportsCreated = 0;
  for (const [index, r] of REPORTS.entries()) {
    const clientId = `demo-seed-${index}`;
    const already = await prisma.safetyReport.findFirst({ where: { clientId } });
    if (already) continue;

    await prisma.safetyReport.create({
      data: {
        clientId,
        orgId: org.id,
        type: r.type,
        title: r.title,
        narrative: r.narrative,
        reporterRecommendation: r.reporterRecommendation,
        occurredAt: daysAgo(r.daysAgo),
        awareAt: daysAgo(r.awareDaysAgo),
        jurisdiction: "KE",
        location: r.location,
        aircraftType: r.aircraftType,
        phase: r.phase,
        hrcTags: r.hrcTags,
        isAnonymous: r.isAnonymous,
        // The whole confidentiality claim, in one ternary: an anonymous
        // report stores NO reporter, rather than storing one and hiding
        // it behind a flag a later query can drop.
        reporterId: r.isAnonymous ? null : (byLocal.get(r.reporter)?.id ?? null),
      },
    });
    reportsCreated++;
  }

  console.log(
    `\n  ${reportsCreated} report(s) created${
      reportsCreated < REPORTS.length ? `, ${REPORTS.length - reportsCreated} already present` : ""
    }` +
      `\n  of ${REPORTS.length} total: ${REPORTS.filter((r) => r.isAnonymous).length} anonymous, ` +
      `1 overdue against the 24-hour KCAA window, 1 discovered nine days after the event`
  );

  if (created.length === 0) {
    console.log("\nEvery demo account already exists. No passwords to show.");
    return;
  }

  console.log("\n" + "=".repeat(66));
  console.log("  PASSWORDS — SHOWN ONCE, STORED NOWHERE");
  console.log("  A demo account on a reachable deployment is a real");
  console.log("  credential. Put these in a password manager now.");
  console.log("=".repeat(66));
  for (const c of created) {
    console.log(`\n  ${c.title}  [${c.role}]`);
    console.log(`    email:    ${c.email}`);
    console.log(`    password: ${c.password}`);
  }
  console.log("\n" + "=".repeat(66));
  console.log("  This org is named DEMO on purpose. Do not file a real");
  console.log("  occurrence into it, and do not point a customer at it");
  console.log("  as if the data were theirs.");
  console.log("=".repeat(66) + "\n");
}

main()
  .catch((err) => {
    console.error("demo seed failed:", err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
