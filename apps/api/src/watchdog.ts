/* =====================================================================
   SOMETHING HAS TO NOTICE, AND IT CANNOT BE A PERSON.

   On 21 August 2026 production served every request against a database
   it could not authenticate to. `DATABASE_URL` held a stale password,
   supavisor refused thirteen handshakes in a row, and there were zero
   successful connections in twenty-four hours. Nothing reported it. The
   detector was the OWNER being unable to sign in, hours later, and
   saying so.

   `.github/workflows/deploy-watchdog.yml` exists for exactly this and
   has never run: every GitHub Actions run in this repository completes
   in three to six seconds with `runner_id: 0` and no step executed —
   28 failures, 2 cancelled, zero successes, measured, and a re-run
   reproduces it. That is upstream of anything here, so a monitor that
   depends on it is a monitor that does not exist.

   A Netlify SCHEDULED FUNCTION does not depend on it. It runs on
   Netlify's infrastructure, which can reach the site — this container
   cannot, `usalamasms.com` answers 403 at the egress proxy — and the
   same mechanism already delivers the daily digest.

   ---------------------------------------------------------------------
   IT PROBES TWICE BEFORE IT SPEAKS, and that is the whole noise budget.

   A single failed request is not an outage. A cold start, a redeploy
   swapping functions, one dropped connection — all produce one bad
   response and recover immediately. Alerting on the first is how a
   monitor teaches people to ignore it, which is the failure mode
   `digest.ts` already argues at length: "a daily message that usually
   says nothing to report is a message people stop opening, and the day
   it matters it is skimmed with the rest."

   So a failure is re-probed, and only a SECOND failure is an outage.
   That needs no stored state, which matters: state means a blob store,
   a dependency, and a second thing that can be wrong. The cost is that
   a genuine outage sends one mail per run rather than one per outage —
   the right way round, because the previous outage went unnoticed for a
   day and the one before that for ninety minutes.

   ---------------------------------------------------------------------
   IT ASKS `/api/ready`, NOT `/`. The site is static files on a CDN and
   answers 200 with the database on fire — that is what atomic deploys
   are for and it is why "the site is up" was believed for hours while
   nothing worked. `/api/ready` runs the readiness probe: it reaches
   Postgres, and since 21 August it also checks for missing ENUM VALUES,
   which the previous version was blind to because an enum value is not
   a relation and `to_regclass` cannot see one.
   ===================================================================== */

/* =====================================================================
   FRESHNESS IS A SECOND QUESTION, AND ASKING ONLY THE FIRST COST
   SEVENTEEN DAYS.

   Between 21 August and 7 September 2026 production published nothing.
   Six pull requests merged and `currentDeploy.commit_ref` never moved.
   This watchdog reported healthy every ten minutes throughout, and it
   was RIGHT to: `/api/ready` answered `{"ok":true}` because the old
   deploy was serving perfectly. The site was up. It was just not the
   site anybody had merged.

   A readiness probe cannot tell "the current version works" from "the
   current version is a fortnight old". On a platform whose whole design
   is that a failed build leaves the last good deploy up, that is the
   failure mode the platform is BUILT to hide — so it is the one thing
   most worth watching, and the one nothing was watching.

   `deploy-watchdog.yml` was written for exactly this and has never
   executed a step. This is that check, somewhere it can actually run.

   HOW IT AVOIDS CRYING ON EVERY MERGE. For the two minutes between a
   merge and its published build, the served commit legitimately differs
   from `main`. So a mismatch alone is not staleness: the HEAD commit
   must ALSO be older than STALE_AFTER_MS. That is the debounce, and it
   needs no stored state — the same reasoning as the two-probe rule
   below, which is why neither of them needs a blob store.
   ===================================================================== */

/** Long enough for any legitimate build to finish and publish. */
export const STALE_AFTER_MS = 45 * 60 * 1000;

export type Freshness =
  /** The served commit is what main points at. */
  | { readonly kind: "CURRENT"; readonly sha: string }
  /** They differ, but main moved recently — a build is probably running. */
  | { readonly kind: "BUILDING"; readonly served: string; readonly head: string }
  /** They differ and main has been ahead for too long. Publishing is stuck. */
  | { readonly kind: "STALE"; readonly served: string; readonly head: string; readonly behindMs: number }
  /** Something could not be read. Never an alarm on its own. */
  | { readonly kind: "UNKNOWN"; readonly detail: string };

/**
 * Decide from the served commit and main's HEAD.
 *
 * UNKNOWN RATHER THAN STALE when either side is unreadable. GitHub rate
 * limits unauthenticated calls, and a watchdog that treats its own
 * blindness as an outage is a watchdog people mute — which is how this
 * repository ended up with two monitors that had never run.
 */
export function freshnessFrom(
  served: string | null,
  head: string | null,
  headCommittedAt: number | null,
  now: number = Date.now(),
): Freshness {
  if (!served) return { kind: "UNKNOWN", detail: "build-id.txt could not be read" };
  if (!head || headCommittedAt === null) return { kind: "UNKNOWN", detail: "main's HEAD could not be read" };
  if (served === head) return { kind: "CURRENT", sha: head };

  const behindMs = now - headCommittedAt;
  if (behindMs < STALE_AFTER_MS) return { kind: "BUILDING", served, head };
  return { kind: "STALE", served, head, behindMs };
}

export function isStale(f: Freshness): f is Extract<Freshness, { kind: "STALE" }> {
  return f.kind === "STALE";
}

export function stalenessSubject(baseUrl: string): string {
  return `UsalamaSMS is serving an old build — ${hostOf(baseUrl)}`;
}

export function stalenessBody(baseUrl: string, f: Extract<Freshness, { kind: "STALE" }>): string {
  const hours = Math.floor(f.behindMs / 3_600_000);
  return [
    `${hostOf(baseUrl)} is answering, and it is answering with an old build.`,
    "",
    `  serving   ${f.served}`,
    `  main      ${f.head}`,
    `  behind    ${hours} hour${hours === 1 ? "" : "s"}`,
    "",
    "The site is UP. Readiness passes. Nothing is broken in the way a",
    "health check can see — which is why this is a separate alarm.",
    "",
    "Netlify's atomic deploys leave the last good deploy serving when a",
    "build fails, so a failed build is silent by design. Between 21",
    "August and 7 September 2026 that silence lasted seventeen days and",
    "six merged pull requests.",
    "",
    "Where to look, in order:",
    "",
    "  · the deploy list for a FAILED build on the merge commit;",
    "  · `currentDeploy.commit_ref` against the SHA you merged — nothing",
    "    else in the Netlify response changes when a build fails;",
    "  · whether the build is failing for a reason in the tree, which",
    "    `npm run build` locally will reproduce.",
    "",
    `  ${baseUrl}/build-id.txt`,
  ].join("\n");
}

/** The commit the LIVE SITE is serving, from `dist/build-id.txt`. */
export async function fetchServedBuildId(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
  now: number = Date.now(),
): Promise<string | null> {
  try {
    const res = await fetchImpl(`${baseUrl.replace(/\/+$/, "")}/build-id.txt?t=${now}`, {
      headers: { "cache-control": "no-cache" },
    });
    if (!res.ok) return null;
    const text = (await res.text()).trim();
    /* `stamp-build-id.mjs` writes the literal `unknown` where there is no
       git rather than fabricating a SHA — an id the watchdog can never
       match is honest, and treating it as one would invent an outage. */
    return /^[0-9a-f]{7,40}$/i.test(text) ? text : null;
  } catch {
    return null;
  }
}

/** What `main` actually points at, and when that commit landed. */
export async function fetchMainHead(
  repo: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ sha: string; committedAt: number } | null> {
  try {
    const res = await fetchImpl(`https://api.github.com/repos/${repo}/commits/main`, {
      headers: { accept: "application/vnd.github+json", "user-agent": "usalamasms-watchdog" },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { sha?: string; commit?: { committer?: { date?: string } } };
    const sha = body.sha;
    const date = body.commit?.committer?.date;
    if (!sha || !date) return null;
    const committedAt = Date.parse(date);
    return Number.isFinite(committedAt) ? { sha, committedAt } : null;
  } catch {
    return null;
  }
}

/** What one request to the readiness endpoint told us. */
export interface Probe {
  /** The endpoint answered, and answered that it is ready. */
  readonly ok: boolean;
  /** HTTP status, or 0 when the request never completed. */
  readonly status: number;
  /** Something a human can act on: the body, or the transport error. */
  readonly detail: string;
}

export type Verdict =
  /** The first probe was fine. Nothing is sent. */
  | { readonly kind: "HEALTHY" }
  /** It failed and then recovered. Real, and not worth waking anybody. */
  | { readonly kind: "FLAPPED"; readonly first: Probe }
  /** It failed twice. This is the one that sends mail. */
  | { readonly kind: "DOWN"; readonly first: Probe; readonly second: Probe };

/**
 * Decide from one or two probes.
 *
 * `second` is null when it was never taken, which happens exactly when
 * the first probe passed. Passing a second probe alongside a healthy
 * first one is a caller bug rather than a state to encode: the first
 * result already settled it.
 */
export function verdictFrom(first: Probe, second: Probe | null): Verdict {
  if (first.ok) return { kind: "HEALTHY" };
  if (second === null) {
    /* A failed first probe with no re-probe cannot be called an outage.
       Treating it as one would make the two-probe rule optional, which
       is the same as not having it. */
    return { kind: "FLAPPED", first };
  }
  if (second.ok) return { kind: "FLAPPED", first };
  return { kind: "DOWN", first, second };
}

/** A verdict that has both probes, because both of them failed. */
export type Outage = Extract<Verdict, { kind: "DOWN" }>;

/**
 * Only a confirmed outage is worth a message.
 *
 * A TYPE PREDICATE RATHER THAN A BOOLEAN, and typecheck is what
 * insisted. Returning `boolean` left `verdict` un-narrowed at the call
 * site, so the Netlify function read `.first` and `.second` off a union
 * where HEALTHY carries neither — eight compile errors that would have
 * been `undefined` interpolated into an alert at 0400. The gate caught
 * it before the branch was pushed, which is the entire argument for
 * `npm run check` running inside the Netlify build.
 */
export function isWorthSending(verdict: Verdict): verdict is Outage {
  return verdict.kind === "DOWN";
}

export function watchdogSubject(baseUrl: string): string {
  /* The host is in the subject because whoever reads this on a phone at
     0400 needs to know which system before they open anything. */
  return `UsalamaSMS is not answering — ${hostOf(baseUrl)}`;
}

export function watchdogBody(baseUrl: string, first: Probe, second: Probe): string {
  return [
    `${hostOf(baseUrl)} failed its readiness check twice.`,
    "",
    `  first probe   HTTP ${first.status || "no response"} — ${first.detail}`,
    `  second probe  HTTP ${second.status || "no response"} — ${second.detail}`,
    "",
    "The endpoint is /api/ready. It reaches Postgres and reports missing",
    "tables and missing enum values, so a failure here is the database or",
    "the connection to it, not the CDN — the static site answers 200",
    "regardless.",
    "",
    "Most likely causes, in the order they have actually happened:",
    "",
    "  · DATABASE_URL wrong or stale — check supavisor logs for",
    "    'password authentication failed'. This took the product down on",
    "    21 August 2026 and nothing reported it for a day.",
    "  · a migration merged but never applied — /api/ready names which",
    "    tables or enum values are missing, in its body.",
    "  · the deploy that published is not the commit you merged — compare",
    "    commit_ref against HEAD.",
    "",
    `  ${baseUrl}/api/ready`,
  ].join("\n");
}

/** `https://usalamasms.com/` -> `usalamasms.com`, and never throws. */
function hostOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
}

/**
 * One request to the readiness endpoint.
 *
 * NEVER THROWS. A watchdog that can raise is a watchdog whose own
 * failure looks like the silence it exists to break — the scheduled run
 * dies, Netlify records an error nobody reads, and the site is reported
 * healthy by omission. Every failure mode becomes a Probe instead.
 *
 * The cache-buster is not decoration: without it a CDN or a runtime
 * fetch cache can answer from a response taken before the fault, which
 * is the same class of mistake as reading `state: ready` off a deploy
 * that describes the PREVIOUS publish.
 */
export async function probeReadiness(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
  now: number = Date.now(),
): Promise<Probe> {
  const url = `${baseUrl.replace(/\/+$/, "")}/api/ready?t=${now}`;
  try {
    const response = await fetchImpl(url, {
      headers: { "cache-control": "no-cache" },
    });
    const text = (await response.text().catch(() => "")).slice(0, 300);
    /* BOTH conditions. A 200 carrying {"ok":false} is the readiness
       probe reporting a fault in the only way it can, and reading the
       status alone would call that healthy. */
    const ok = response.ok && /"ok"\s*:\s*true/.test(text);
    return { ok, status: response.status, detail: text || "(empty body)" };
  } catch (error) {
    return {
      status: 0,
      ok: false,
      detail: error instanceof Error ? error.message : "request failed",
    };
  }
}
