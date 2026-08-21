/* ============================================================
   THE MONITOR THAT CAN ACTUALLY RUN.

   `.github/workflows/deploy-watchdog.yml` and
   `production-readiness.yml` were written to do this job and neither
   has ever executed a step. Every Actions run in this repository
   completes in three to six seconds with `runner_id: 0` — 28 failures,
   2 cancelled, zero successes since 19 August 2026, and firing
   `rerun_failed_jobs` reproduces it exactly. Whatever that is, it is
   upstream of this repository, so a monitor built on it is a monitor
   that does not exist.

   This runs on Netlify's scheduler instead, which is the same mechanism
   that already delivers `digest.mts`, and — crucially — from
   infrastructure that can REACH the site. An agent in the Claude
   container cannot: `usalamasms.com` answers 403 at the egress proxy,
   so a deploy has never been confirmable by fetching it from there.

   ------------------------------------------------------------
   WHY EVERY TEN MINUTES AND NOT EVERY DAY. The digest is a daily
   summary of the operator's record; this is an alarm. The last outage
   ran for twenty-four hours with zero successful database connections
   and was found when the OWNER could not sign in. The one before it ran
   ninety minutes and was found because somebody happened to be reading
   a pull request. Ten minutes is the difference between "we saw it
   before the customer did" and both of those.

   ------------------------------------------------------------
   THE DECISION IS NOT IN THIS FILE, and that is deliberate. Netlify
   functions are not covered by the unit suite, so logic that lives here
   is logic nothing tests — this repository has that scar twice over,
   most recently a validator that was perfect in a route which never
   called it. `verdictFrom` and the two-probe rule live in
   `apps/api/src/watchdog.ts` with `tests/watchdog.test.ts` over them,
   and this file only wires them up.
   ============================================================ */
import type { Config } from "@netlify/functions";
import { probeReadiness, verdictFrom, isWorthSending } from "../../apps/api/src/watchdog.js";
import { sendWatchdogAlert, mailConfigFromEnv } from "../../apps/api/src/mail.js";

/** Long enough for a cold start or a function swap to finish. */
const REPROBE_DELAY_MS = 15_000;

export default async function handler(): Promise<Response> {
  const config = mailConfigFromEnv();
  const baseUrl = config.baseUrl;

  const first = await probeReadiness(baseUrl);

  /* THE SECOND PROBE IS ONLY TAKEN WHEN THE FIRST FAILED. Probing twice
     every run would double the load for no information: a healthy first
     answer already settles it. */
  let second = null;
  if (!first.ok) {
    await new Promise((resolve) => setTimeout(resolve, REPROBE_DELAY_MS));
    second = await probeReadiness(baseUrl);
  }

  const verdict = verdictFrom(first, second);

  if (!isWorthSending(verdict)) {
    /* REPORTED RATHER THAN SILENT, including the recovered case.
       Charter rule 8. A FLAPPED run is the interesting near-miss: it
       means the site failed a probe and came back, and a run of those
       is a fault building up to the one that does not recover. */
    return Response.json({
      ok: true,
      verdict: verdict.kind,
      ...(verdict.kind === "FLAPPED"
        ? { recoveredFrom: { status: verdict.first.status, detail: verdict.first.detail } }
        : {}),
    });
  }

  const outcome = await sendWatchdogAlert(
    baseUrl,
    { status: verdict.first.status, detail: verdict.first.detail },
    { status: verdict.second.status, detail: verdict.second.detail },
    config,
  );

  /* `ok: false` on the RESPONSE, because the site is down. A scheduled
     function that returns 200 while reporting an outage puts the fact
     only in a body nobody reads; Netlify's own run list should show
     this one as failed. */
  return Response.json(
    {
      ok: false,
      verdict: verdict.kind,
      first: { status: verdict.first.status, detail: verdict.first.detail },
      second: { status: verdict.second.status, detail: verdict.second.detail },
      alert: outcome.status,
      ...(outcome.status === "FAILED" ? { alertFailed: outcome.reason } : {}),
      ...(outcome.status === "NOT_CONFIGURED"
        ? { note: "Set RESEND_API_KEY and PLATFORM_NOTICE_EMAIL or this alarm is silent." }
        : {}),
    },
    { status: 503 },
  );
}

export const config: Config = {
  /* Every ten minutes. Not on the hour: a schedule that fires exactly
     when every other cron in the world does is a schedule that measures
     the platform's busiest moment. */
  schedule: "3,13,23,33,43,53 * * * *",
};
