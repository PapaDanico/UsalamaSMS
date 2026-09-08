/* ============================================================
   THE SECURITY GATE THAT CAN ACTUALLY RUN.

   `tests/integration/rls.integration.test.ts` asserts the
   deny-by-default posture over seven properties. It needs a real
   Postgres, so it is not in `npm run check`, so it does not run in the
   Netlify build, so its only home was GitHub Actions — where every run
   since 19 August 2026 completes in three to six seconds with
   `runner_id: 0`, and still did on 8 September, twenty days and 821
   runs later.

   ON 7 SEPTEMBER THAT COST SOMETHING REAL. The SET-I migration reached
   `main` with a header claiming "RLS follows the existing direct-API,
   deny-by-default posture" and SQL that enabled row security and
   stopped. The assertion that catches it exists and has not executed
   since August.

   AND THIS IS STRICTLY STRONGER THAN THE VERSION THAT DIED, which is
   the part worth understanding rather than treating this as a
   consolation prize. That suite runs against a bare Postgres with no
   Supabase roles at all, and says so at line 32: its grant assertion
   asserts nothing. `anon`, `authenticated` and `service_role` exist
   only in production, and the control this repository calls "the
   actual control" — that all three hold ZERO privileges in schema
   public — has never once been checked where it is true. It is now,
   every day, against the database holding the reports.

   ------------------------------------------------------------
   DAILY, NOT EVERY TEN MINUTES. The watchdog is an alarm for an outage
   a customer is living through; this is a gate against drift. The two
   ways the posture actually moves are a migration and somebody using
   the Supabase table editor, and neither happens between breakfast and
   lunch without a person knowing they did it. A ten-minute posture
   check would be 144 connections a day to assert a fact that changes
   monthly.

   05:40 UTC: after the digest at 05:00 rather than beside it, so two
   scheduled functions are not opening pooled connections in the same
   minute — and not on the hour, for the reason watchdog.mts gives.

   ------------------------------------------------------------
   THE DECISION IS NOT IN THIS FILE. `postureFrom` and every failure
   sentence live in `apps/api/src/posture.ts` under
   `tests/posture.test.ts`; this file runs one query and wires them up.
   Netlify functions are not covered by the unit suite, and this
   repository has the scar twice over.
   ============================================================ */
import type { Config } from "@netlify/functions";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  POSTURE_SQL,
  postureFrom,
  isBroken,
  type PostureFacts,
} from "../../apps/api/src/posture.js";
import { sendPostureAlert, mailConfigFromEnv } from "../../apps/api/src/mail.js";

let client: PrismaClient | null = null;

function connect(): PrismaClient {
  /* No managed-database fallback, for the reason core.ts gives: coming
     up against an empty Neon instance because DATABASE_URL is unset
     would report a perfect posture over no tables. The subject guard in
     postureFrom catches that too, and neither is the only line. */
  if (client) return client;
  const url = process.env["DATABASE_URL"] ?? process.env["SUPABASE_DATABASE_URL"];
  if (!url) throw new Error("no DATABASE_URL or SUPABASE_DATABASE_URL");
  client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  return client;
}

/** The catalogue rows, mapped onto the shape the decision reads. */
interface Row {
  tables: number;
  rls_disabled: string[];
  without_deny_all: string[];
  permissive: string[];
  forced: string[];
  not_owned: string[];
  data_api_grants: number;
  roles_present: string[];
  connected_as: string;
}

export default async function handler(): Promise<Response> {
  const config = mailConfigFromEnv();

  let facts: PostureFacts | null = null;
  try {
    const rows = await connect().$queryRawUnsafe<Row[]>(POSTURE_SQL);
    const r = rows[0];
    if (r) {
      facts = {
        tables: Number(r.tables),
        rlsDisabled: r.rls_disabled ?? [],
        withoutDenyAll: r.without_deny_all ?? [],
        permissivePolicies: r.permissive ?? [],
        forced: r.forced ?? [],
        notOwnedByApi: r.not_owned ?? [],
        dataApiGrants: Number(r.data_api_grants),
        supabaseRolesPresent: r.roles_present ?? [],
        connectedAs: r.connected_as,
      };
    }
  } catch (error) {
    /* A database that cannot be reached is the WATCHDOG'S alarm, not
       this one. Two alarms for one outage is how both get muted. */
    return Response.json(
      {
        ok: false,
        posture: "UNKNOWN",
        detail: error instanceof Error ? error.message : "the posture query failed",
        note: "unreachable database is the watchdog's alarm, not this one — no mail sent",
      },
      { status: 200 },
    );
  }

  const verdict = postureFrom(facts);

  if (!isBroken(verdict)) {
    /* REPORTED RATHER THAN SILENT, charter rule 8. UNKNOWN is worth
       seeing in the log: it means the check ran and could not decide,
       which is a different thing from holding. */
    return Response.json({
      ok: true,
      posture: verdict.kind,
      ...(verdict.kind === "HOLDS" ? { tables: verdict.tables } : { detail: verdict.detail }),
    });
  }

  const outcome = await sendPostureAlert(verdict, config);
  return Response.json(
    {
      ok: false,
      posture: "BROKEN",
      tables: verdict.tables,
      failures: verdict.failures,
      alert: outcome.status,
      ...(outcome.status === "FAILED" ? { alertFailed: outcome.reason } : {}),
      ...(outcome.status === "NOT_CONFIGURED"
        ? { note: "Set RESEND_API_KEY and PLATFORM_NOTICE_EMAIL or this gate is silent." }
        : {}),
    },
    { status: 503 },
  );
}

export const config: Config = {
  schedule: "40 5 * * *",
};
