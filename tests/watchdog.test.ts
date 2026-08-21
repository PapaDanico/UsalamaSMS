/* =====================================================================
   THE WATCHDOG'S OWN DECISION, TESTED.

   A monitor is the one component whose failure is INVISIBLE by
   construction: when it is wrong it reports nothing, which is exactly
   what it reports when everything is fine. So the logic lives outside
   the Netlify function — nothing runs those in the unit suite — and
   every branch is driven here.

   The property that matters most is the negative one. A watchdog that
   cries on a single blip gets muted, and a muted watchdog is the state
   this repository was already in for a different reason: two GitHub
   workflows written to do this job, neither of which has ever executed
   a step.
   ===================================================================== */
import { describe, it, expect } from "vitest";
import {
  verdictFrom,
  isWorthSending,
  probeReadiness,
  watchdogSubject,
  watchdogBody,
  type Probe,
} from "../apps/api/src/watchdog";

const healthy: Probe = { ok: true, status: 200, detail: '{"ok":true}' };
const failed: Probe = { ok: false, status: 503, detail: '{"ok":false,"error":"schema_behind_code"}' };
const refused: Probe = { ok: false, status: 0, detail: "fetch failed" };

describe("what the watchdog concludes", () => {
  it("says nothing at all when the first probe passes", () => {
    expect(verdictFrom(healthy, null).kind).toBe("HEALTHY");
    expect(isWorthSending(verdictFrom(healthy, null))).toBe(false);
  });

  it("DOES NOT ALARM ON ONE FAILURE THAT RECOVERS", () => {
    /* The whole noise budget. A cold start, a function swap mid-deploy,
       one dropped connection — each produces exactly this shape, and a
       monitor that mails about it is a monitor people filter. */
    const verdict = verdictFrom(failed, healthy);
    expect(verdict.kind).toBe("FLAPPED");
    expect(isWorthSending(verdict)).toBe(false);
  });

  it("alarms when it fails twice", () => {
    const verdict = verdictFrom(failed, failed);
    expect(verdict.kind).toBe("DOWN");
    expect(isWorthSending(verdict)).toBe(true);
  });

  it("alarms when the connection is refused twice, not only on a bad status", () => {
    /* status 0 is the transport never completing — the shape a dead
       database or a dead function produces. Reading only HTTP codes
       would treat this as unknown rather than as down. */
    expect(isWorthSending(verdictFrom(refused, refused))).toBe(true);
  });

  it("REFUSES TO CALL A SINGLE FAILURE AN OUTAGE when no re-probe was taken", () => {
    /* If a caller ever skips the second probe, the two-probe rule must
       not silently become a one-probe rule. Optional discipline is not
       discipline. */
    const verdict = verdictFrom(failed, null);
    expect(verdict.kind).toBe("FLAPPED");
    expect(isWorthSending(verdict)).toBe(false);
  });
});

describe("reading the readiness endpoint", () => {
  const respond = (body: string, status = 200) =>
    (async () => new Response(body, { status })) as unknown as typeof fetch;

  it("treats a ready answer as healthy", async () => {
    const probe = await probeReadiness("https://usalamasms.com", respond('{"ok":true}'));
    expect(probe.ok).toBe(true);
    expect(probe.status).toBe(200);
  });

  it("DOES NOT TRUST A 200 THAT SAYS ok:false", async () => {
    /* The readiness probe reports a fault in its BODY. Checking the
       status alone would call a database with missing enum values
       healthy — which is the precise failure that let signup answer 500
       in seven of nine jurisdictions while /api/ready answered ok. */
    const probe = await probeReadiness(
      "https://usalamasms.com",
      respond('{"ok":false,"error":"schema_behind_code","missing":["Jurisdiction.UG"]}'),
    );
    expect(probe.ok).toBe(false);
    expect(probe.detail).toContain("Jurisdiction.UG");
  });

  it("treats a 503 as not ready", async () => {
    const probe = await probeReadiness("https://usalamasms.com", respond("upstream down", 503));
    expect(probe.ok).toBe(false);
    expect(probe.status).toBe(503);
  });

  it("NEVER THROWS, because a watchdog that raises looks like silence", async () => {
    const explode = (async () => {
      throw new Error("getaddrinfo ENOTFOUND");
    }) as unknown as typeof fetch;
    const probe = await probeReadiness("https://usalamasms.com", explode);
    expect(probe.ok).toBe(false);
    expect(probe.status).toBe(0);
    expect(probe.detail).toContain("ENOTFOUND");
  });

  it("cache-busts, so a stale response cannot report health that has passed", async () => {
    let seen = "";
    const capture = (async (url: string) => {
      seen = String(url);
      return new Response('{"ok":true}', { status: 200 });
    }) as unknown as typeof fetch;
    await probeReadiness("https://usalamasms.com/", capture, 1_234_567);
    expect(seen).toBe("https://usalamasms.com/api/ready?t=1234567");
  });
});

describe("what the alert actually says", () => {
  it("names the host in the subject, for somebody reading it on a phone", () => {
    expect(watchdogSubject("https://usalamasms.com")).toContain("usalamasms.com");
  });

  it("carries both probes and where to look first", () => {
    const body = watchdogBody("https://usalamasms.com", failed, refused);
    expect(body).toContain("503");
    expect(body).toContain("fetch failed");
    /* The cause that actually happened, named, so the first place
       somebody looks is the one that was right last time. */
    expect(body).toContain("password authentication failed");
    expect(body).toContain("/api/ready");
  });
});
