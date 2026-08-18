// =====================================================================
// UsalamaSMS Web — Offline-First Sync Infrastructure
// Dexie (IndexedDB) local store + outbox queue + background sync.
//
// Design goal, unchanged and worth restating because every decision
// below serves it: a ramp agent at a remote strip submits a hazard
// report with zero connectivity, and it syncs untouched when signal
// returns. Nothing about that person's day should involve knowing what
// a sync queue is.
// =====================================================================
import Dexie, { type Table } from "dexie";
import { CreateReportSchema, type CreateReportInput } from "@usalamasms/shared";
// @ts-expect-error session.js is untyped JS, like the rest of apps/web
import { authFetch, isSignedIn } from "./session.js";

// ----------------------------- Local DB ------------------------------
export interface LocalReport extends CreateReportInput {
  localId?: number;
  syncState: "pending" | "syncing" | "synced" | "conflict" | "error";
  serverUpdatedAt?: string; // baseVersion for optimistic concurrency
  lastError?: string;
  createdAtLocal: string;
}

export interface OutboxItem {
  localId?: number;
  clientId: string;          // UUID — server idempotency key
  entityType: "safetyReport" | "hazard" | "riskAssessment";
  op: "CREATE" | "UPDATE" | "DELETE";
  payload: unknown;
  clientUpdatedAt: string;
  baseVersion?: string;
  attempts: number;
  nextAttemptAt: number;     // epoch ms — exponential backoff
}

export interface PinnedDocument {
  id: string; title: string; category: string; version: string;
  blob: Blob; syncedAt: string;
}

class UsalamaDb extends Dexie {
  reports!: Table<LocalReport, number>;
  outbox!: Table<OutboxItem, number>;
  documents!: Table<PinnedDocument, string>;

  constructor() {
    super("usalamasms");
    this.version(1).stores({
      // clientId is UNIQUE (&) on both tables. Without it, a double-tap
      // on Submit — which is what happens on a slow handset when nothing
      // visibly changes — wrote two local reports and two outbox rows
      // for one event. The server deduplicates by clientId, so the
      // operator's own device was the only place the duplicate lived,
      // and it lived there forever showing an unsynced report.
      reports: "++localId, &clientId, syncState, type",
      outbox: "++localId, &clientId, nextAttemptAt, entityType",
      documents: "id, category",
    });
  }
}
export const db = new UsalamaDb();

// ------------------------- Leaving the device -------------------------
/**
 * Everything this device holds about reports, gone.
 *
 * WHY SIGN-OUT HAS TO DO THIS. A crew-room tablet is a supported
 * deployment, and until now signing out cleared the session and the
 * worker's cached API reads and left `db.reports` untouched. The next
 * person to sign in opened Triage and read the previous person's
 * narratives — including, before the fix above, anonymous ones.
 *
 * WHAT IS DELETED AND WHAT IS NOT. Synced reports go: the organisation
 * has them, and this device holding a second copy after its user has
 * left is a liability with no compensating use. UNSENT reports STAY,
 * with their outbox rows, because deleting those would lose an
 * occurrence that has reached nobody — the one thing this whole module
 * exists to prevent. The sync strip already says how many are waiting,
 * and it keeps saying so to whoever signs in next, which is the
 * behaviour that gets them sent.
 *
 * Returns what it did, so the account screen can say it plainly rather
 * than implying more than happened.
 */
export async function clearSyncedReports(): Promise<{ removed: number; kept: number }> {
  try {
    return await db.transaction("rw", db.reports, async () => {
      const all = await db.reports.toArray();
      const leaving = all.filter((r) => r.syncState === "synced");
      const staying = all.length - leaving.length;
      await db.reports.where("syncState").equals("synced").delete();
      return { removed: leaving.length, kept: staying };
    });
  } catch {
    /* A store this device cannot read is a store it cannot leak from
       either, and reporting a failure here would tell somebody signing
       out that their sign-out failed, which it did not. */
    return { removed: 0, kept: 0 };
  }
}

// --------------------------- Submit offline --------------------------
export async function submitReportOffline(input: CreateReportInput): Promise<void> {
  // Validate locally with the SAME schema the server uses — the report
  // that leaves the device is already server-valid. This is the single
  // most valuable property of the shared package: a report rejected at
  // the server after three days offline is a report nobody can fix,
  // because the person who wrote it has forgotten the detail.
  const parsed = CreateReportSchema.parse(input);
  const now = new Date().toISOString();

  await db.transaction("rw", db.reports, db.outbox, async () => {
    // Idempotent locally too. A retry of this call with the same
    // clientId must not enqueue a second copy.
    const existing = await db.reports.where("clientId").equals(parsed.clientId).first();
    if (existing) return;

    await db.reports.add({ ...parsed, syncState: "pending", createdAtLocal: now });
    await db.outbox.add({
      clientId: parsed.clientId,
      entityType: "safetyReport",
      op: "CREATE",
      payload: parsed,
      clientUpdatedAt: now,
      attempts: 0,
      nextAttemptAt: Date.now(),
    });
  });

  void requestBackgroundSync();
}

// ----------------------------- Sync loop -----------------------------
const MAX_BATCH = 50;
const BASE_BACKOFF_MS = 5_000;
const MAX_BACKOFF_MS = 30 * 60_000;

export interface FlushOutcome {
  sent: number;
  conflicts: number;
  rejected: number;
  /** Items the server returned no verdict for. Retried with backoff. */
  unanswered: number;
  /**
   * Nothing was attempted because there is no session.
   *
   * Distinct from `unanswered`, and the distinction is the whole point:
   * unanswered means the server did not reply and the device should keep
   * trying. This means the device CANNOT succeed until a person signs
   * in, and something has to say so out loud.
   */
  needsSignIn?: boolean;
}

/**
 * `authFetch` by default, not `fetch`.
 *
 * The default used to be bare `fetch`, so every request went out with no
 * Authorization header to a route that requires one. Every sync 401'd,
 * the 401 branch below returned silently, and a device could queue
 * reports forever while reporting them as merely pending.
 */
/**
 * The single in-flight flush.
 *
 * Five things trigger a flush: the online event here, the one in the app
 * shell, the service worker's message, resumeSession at startup, and
 * signing in. Several of those fire together — regaining signal while
 * the app boots is the ordinary case — and two concurrent flushes read
 * the SAME due rows and post them twice. The server deduplicates by
 * clientId so no report is doubled, but both callers then apply backoff
 * to the same items, so one dropped batch is charged twice and the
 * queue's retry schedule is not what the code says it is.
 *
 * Coalesced, so concurrent callers await one flush and get one answer.
 */
let flushInFlight: Promise<FlushOutcome> | null = null;
let flushRequestedAgain = false;

/**
 * Send whatever is due.
 *
 * COALESCED, AND RE-RUN IF ASKED DURING. The first half stops fifty
 * queued items presenting the same refresh token fifty times. The
 * second half is a defect this had:
 *
 *   a flush starts (on resume, say) and reads the outbox;
 *   a report is filed and enqueued a moment later;
 *   requestBackgroundSync calls flushOutbox, which hands back the
 *   IN-FLIGHT promise — a pass that had already chosen its rows;
 *   that promise resolves having never seen the new report.
 *
 * The report then sat until the next online event or reload. It looked
 * like a flake because it depended on whether a flush happened to be
 * running in the fifty milliseconds around a submit — which is exactly
 * when one is most likely to be running, since the app resumes its
 * session on load and a person files soon after.
 *
 * So a request that arrives mid-flight sets a flag, and the flight
 * schedules one more pass when it lands. One extra pass, not one per
 * caller: the flag is a boolean, so ten requests during one flight
 * produce one follow-up.
 */
export function flushOutbox(fetcher: typeof fetch = authFetch): Promise<FlushOutcome> {
  if (flushInFlight) {
    flushRequestedAgain = true;
    return flushInFlight;
  }

  flushInFlight = runFlush(fetcher)
    .then((outcome) => {
      announce(outcome);
      return outcome;
    })
    .finally(() => {
      flushInFlight = null;
      if (flushRequestedAgain) {
        flushRequestedAgain = false;
        // Not awaited by the original caller — that call has its answer.
        // This is the pass for the rows that arrived while it was busy,
        // and it announces itself like any other.
        void flushOutbox(fetcher);
      }
    });

  return flushInFlight;
}

/* ============================================================
   THE FLUSH ANNOUNCES ITSELF. Here, once, rather than at each call
   site.

   THE DEFECT THIS CLOSES, found by driving the running app against
   the running API rather than against a mock. File a report while
   online — the ordinary case, the one that happens every time — and:

     1. the form dispatches `report-filed`;
     2. the shell repaints the strip, reading an outbox that still
        contains the report, and prints "1 report waiting to send";
     3. requestBackgroundSync() flushes it; the server answers 200 and
        the row leaves the outbox;
     4. nothing tells the shell.

   The strip then says "1 report waiting to send" for a report that
   arrived seventy milliseconds ago, and goes on saying it. Verified
   against a real Fastify and a real Postgres: outbox empty, row in
   the database, audit chain extended, strip still claiming the report
   is queued.

   That is the same class of lie the strip exists to prevent, pointing
   the other way. "Sent when it was not" sends a hazard nobody hears
   about; "not sent when it was" sends a person back to the safety
   office to re-file, and teaches them the one indicator this product
   hangs on cannot be believed. The second is not the safer failure.
   It is the one that costs the strip its authority.

   Why it survived: `usalamasms:sync-changed` was dispatched by the
   `online` listener and by one other caller, and the file-a-report
   path goes through neither. Every test that covered the strip either
   cut the network (so the flush genuinely did not finish) or drove
   the flush through a mocked fetch on the online listener's path.

   Fixing it at each call site would leave the next caller to
   remember. The flush is what changes the queue, so the flush is what
   says so — and the announcement is skipped when nothing moved, so a
   heartbeat flush over an empty outbox does not repaint anything.
   ============================================================ */
function announce(outcome: FlushOutcome): void {
  if (typeof window === "undefined") return;
  const changed =
    outcome.sent > 0 ||
    outcome.conflicts > 0 ||
    outcome.rejected > 0 ||
    outcome.needsSignIn === true;
  if (!changed) return;
  window.dispatchEvent(new CustomEvent("usalamasms:sync-changed", { detail: outcome }));
}

async function runFlush(fetcher: typeof fetch): Promise<FlushOutcome> {
  const empty: FlushOutcome = { sent: 0, conflicts: 0, rejected: 0, unanswered: 0 };
  if (!navigator.onLine) return empty;

  // Checked before the request rather than inferred from its 401, so the
  // reason is known rather than guessed — and so a signed-out device
  // does not spend a radio wakeup finding out.
  if (!isSignedIn()) {
    const waiting = await db.outbox.count();
    return waiting > 0 ? { ...empty, needsSignIn: true } : empty;
  }

  const due = await db.outbox
    .where("nextAttemptAt").belowOrEqual(Date.now())
    .limit(MAX_BATCH).toArray();
  if (due.length === 0) return empty;

  let res: Response;
  try {
    res = await fetcher("/api/v1/sync/batch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deviceId: await getDeviceId(), items: due.map(stripLocal) }),
    });
  } catch {
    // A thrown fetch — DNS failure, captive portal, radio dropped
    // mid-request — used to escape this function entirely. The caller is
    // an event listener and a service worker; neither had a catch, so
    // the queue simply stopped being flushed until the next event, with
    // no backoff recorded and nothing shown to the user.
    await backoffAll(due);
    return empty;
  }

  // A 401 that survives authFetch's refresh-and-retry means the session
  // is genuinely over. Say so; do not back off into silence. The old
  // comment here read "auth refresh handled elsewhere" and there was no
  // elsewhere.
  if (res.status === 401) return { ...empty, needsSignIn: true };
  if (!res.ok) { await backoffAll(due); return empty; }

  let body: {
    results: Array<{
      clientId: string;
      status: "applied" | "duplicate" | "conflict" | "rejected" | "forbidden";
      serverUpdatedAt?: string;
    }>;
  };
  try {
    body = await res.json();
  } catch {
    await backoffAll(due);
    return empty;
  }

  const answered = new Set(body.results.map((r) => r.clientId));
  const outcome: FlushOutcome = { sent: 0, conflicts: 0, rejected: 0, unanswered: 0 };

  await db.transaction("rw", db.reports, db.outbox, async () => {
    for (const r of body.results) {
      const item = due.find((d) => d.clientId === r.clientId);
      if (!item?.localId) continue;

      switch (r.status) {
        case "applied":
        case "duplicate": // idempotent — server already has it
          await db.outbox.delete(item.localId);

          // ==========================================================
          // A RETRACTION THAT LANDED TAKES THE LOCAL ROW WITH IT, and
          // this is the one case where the server wins.
          //
          // /triage merges the device store with the org queue keyed on
          // clientId and deliberately never assigns one over the other,
          // because assignment destroys unsent work. A retraction is the
          // exception: the reporter asked for this row to stop existing,
          // the server has recorded that it did, and leaving the local
          // copy would show the withdrawn report on the device for ever
          // while the safety office no longer sees it.
          //
          // GETTING THIS BACKWARDS DELETES A REPORT THAT WAS NEVER SENT,
          // which is why it is keyed on the OUTBOX ITEM'S op rather than
          // on anything about the row. Only a DELETE this device queued
          // and the server acknowledged removes anything.
          // ==========================================================
          if (item.op === "DELETE") {
            await db.reports.where("clientId").equals(r.clientId).delete();
            outcome.sent++;
            break;
          }
          // ==========================================================
          // AN ACKNOWLEDGED ANONYMOUS REPORT LEAVES THE DEVICE.
          //
          // The report form goes to real lengths to keep an anonymous
          // DRAFT off the disk. Then this wrote the whole report —
          // title, narrative, recommendation, local timestamp — into
          // IndexedDB and, once the server had it, only marked it
          // synced. It stayed there. signOut() cleared the session and
          // the worker's cached reads and never touched this table.
          //
          // On a crew-room tablet that is the whole promise gone: the
          // next person to sign in opens Triage and reads a narrative
          // filed anonymously about their supervisor, with a
          // PROTECTED / Anonymous badge advertising that it was filed
          // from this handset, ordered by a local timestamp that pins
          // it to a shift. The sign-in screen's own words are "an
          // anonymous report stores no identifier at all".
          //
          // So: once the server has confirmed it, the anonymous copy
          // goes. The reporter loses the ability to re-read their own
          // report on this device, and that is the correct trade — it
          // is the same property that makes the report anonymous.
          // A NAMED report stays, because its author can be shown it
          // and because Triage is where they follow it.
          // ==========================================================
          //
          // Read from the STORED row rather than from the outbox
          // payload: the payload is `unknown` by design, and the row is
          // the thing being deleted, so it is the honest authority on
          // whether it is anonymous.
          {
            const stored = await db.reports.where("clientId").equals(r.clientId).first();
            if (stored?.isAnonymous) {
              await db.reports.where("clientId").equals(r.clientId).delete();
            } else {
              await db.reports.where("clientId").equals(r.clientId)
                .modify({ syncState: "synced", serverUpdatedAt: r.serverUpdatedAt });
            }
          }
          outcome.sent++;
          break;

        case "conflict":
          // Safety reports are append-heavy; policy: server wins, client
          // copy is preserved locally and flagged for the user to
          // review/merge. Nothing the reporter typed is ever discarded
          // by the sync layer — a lost narrative is a lost occurrence.
          await db.outbox.delete(item.localId);
          await db.reports.where("clientId").equals(r.clientId)
            .modify({ syncState: "conflict" });
          outcome.conflicts++;
          break;

        case "rejected":
        case "forbidden":
          await db.outbox.delete(item.localId);
          await db.reports.where("clientId").equals(r.clientId)
            .modify({
              syncState: "error",
              /* NOT ABOUT THE TYPE, and saying so sent people round a
                 loop. `forbidden` means the signed-in role does not
                 hold report.create at all, so trying a different kind
                 of report — which is what "this report type" invites —
                 fails identically. Found when an accountable executive,
                 the only account a new operator has, filed and was told
                 to try another type. */
              lastError: r.status === "forbidden"
                ? "the account you are signed in as may not file reports — " +
                  "sign in as someone who can, and this report will send"
                : "rejected by server validation",
            });
          outcome.rejected++;
          break;
      }
    }

    // ITEMS THE SERVER DID NOT ANSWER.
    //
    // Previously these were left exactly as they were: attempts not
    // incremented, nextAttemptAt already in the past. So every flush
    // re-sent them immediately, forever — a hot loop against the API
    // from a device on a metered connection, and an item that never
    // resolved and never surfaced. Now they back off like any other
    // failure, which also means their attempt count grows and the UI
    // can eventually tell someone.
    for (const item of due) {
      if (answered.has(item.clientId) || !item.localId) continue;
      outcome.unanswered++;
      await backoffOne(item);
    }
  });

  return outcome;
}

async function backoffAll(items: OutboxItem[]): Promise<void> {
  await db.transaction("rw", db.outbox, async () => {
    for (const it of items) await backoffOne(it);
  });
}

async function backoffOne(it: OutboxItem): Promise<void> {
  if (!it.localId) return;
  const attempts = it.attempts + 1;
  const delay = Math.min(BASE_BACKOFF_MS * 2 ** attempts, MAX_BACKOFF_MS);
  // Full jitter. A hangar full of handsets that lost signal together
  // regains it together; without jitter they all retry on the same
  // millisecond and the operator's own fleet is the thundering herd.
  const jittered = Math.floor(delay * (0.5 + Math.random() * 0.5));
  await db.outbox.update(it.localId, { attempts, nextAttemptAt: Date.now() + jittered });
}

function stripLocal(i: OutboxItem): Omit<OutboxItem, "localId" | "attempts" | "nextAttemptAt"> {
  const { localId: _l, attempts: _a, nextAttemptAt: _n, ...rest } = i;
  return rest;
}

/**
 * What to tell the user, right now.
 *
 * Charter rule 8 says a refused storage write is reported to the person
 * while they can still act on it. An unsynced safety report is the same
 * class of problem and gets the same treatment: the sync strip shows a
 * count, because a report that has not reached anyone is a report that
 * has not been made, and only the person holding the phone can carry it
 * to signal.
 */
export async function syncStatus(): Promise<{
  state: "synced" | "pending" | "error" | "offline" | "signed_out";
  pending: number;
  errored: number;
}> {
  // CONFLICTS COUNT AS ERRORED, and this is a defect fix rather than a
  // definition. A conflict deletes the outbox item and flags the report
  // — so the queue is empty, nothing is errored by the old count, and
  // the strip said "Up to date, nothing waiting to send" for a device
  // holding an edit the server refused.
  //
  // The comment in the conflict branch above promises the client copy is
  // "preserved locally and flagged for the user to review". It was
  // preserved and flagged, and then nothing ever showed the flag. A
  // silent conflict is a lost edit that reports itself as success, which
  // is the exact failure the sync strip exists to prevent.
  const [pending, errored, conflicted] = await Promise.all([
    db.outbox.count(),
    db.reports.where("syncState").equals("error").count(),
    db.reports.where("syncState").equals("conflict").count(),
  ]);
  const needsAttention = errored + conflicted;
  if (needsAttention > 0) return { state: "error", pending, errored: needsAttention };

  // BEFORE `offline` and before `pending`, because it outranks both.
  // A signed-out device with reports queued is not waiting on signal —
  // it is waiting on a person, and only one of those two messages tells
  // that person to do something. Reports with nothing queued do not
  // nag: someone who has not filed anything yet has nothing at risk.
  if (pending > 0 && !isSignedIn()) return { state: "signed_out", pending, errored };

  if (!navigator.onLine) return { state: "offline", pending, errored };
  if (pending > 0) return { state: "pending", pending, errored };
  return { state: "synced", pending, errored };
}

// ------------------------ Background sync API ------------------------
/* ============================================================
   BOTH, NOT EITHER.

   THE DEFECT: this registered a background sync and, if that
   succeeded, did nothing else. The immediate flush lived in the catch
   block — so it ran only where the Background Sync API is MISSING.
   Where the API is present, which is every current Chromium and
   therefore the mid-range Android this product is designed for,
   filing a report queued it and sent nothing.

   The report then waited for the browser to decide to fire the sync
   event. That can be seconds, or minutes, or never if the tab is
   closed before the worker is woken. Meanwhile the form said "Report
   saved and sending now" and the strip said the queue was pending —
   both to somebody standing there, online, watching nothing happen.

   The two calls answer different questions and neither substitutes
   for the other:

     · the FLUSH is "send it now, while there is a person here and a
       radio that works";
     · the REGISTRATION is "and if this tab is gone before that
       finishes, wake up and try again".

   So both, every time, and the flush is not conditional on the
   registration succeeding or failing. flushOutbox is coalesced and
   returns early when the outbox is empty or the device is offline, so
   calling it here costs nothing when there is nothing to do.
   ============================================================ */
export async function requestBackgroundSync(): Promise<void> {
  // Started first and deliberately not awaited before the registration
  // below: the registration is a backstop and must not wait on a
  // request that may take the length of a bad connection to fail.
  const flushing = flushOutbox();

  try {
    const reg = await navigator.serviceWorker.ready;
    // @ts-expect-error Background Sync API not yet in all TS lib.dom versions
    await reg.sync?.register("usalamasms-outbox");
  } catch {
    // No worker, no Background Sync, or registration refused. The flush
    // above is the whole mechanism in that case, which is what this
    // catch block used to be for.
  }

  await flushing;
}

if (typeof window !== "undefined") {
  // AFTER the flush, not merely alongside it. The app shell listens for
  // the same `online` event to repaint the strip, and it wins the race —
  // so the strip repainted from the pre-flush queue and then never heard
  // again, leaving "waiting to send" on screen for reports that had just
  // arrived. Same defect as the one the sign-in screen had.
  // The dispatch that used to be chained here now lives inside
  // flushOutbox, so this is the plain call. One owner for "the queue
  // changed" — see announce() — because two owners is how the
  // file-a-report path came to have neither.
  window.addEventListener("online", () => {
    void flushOutbox();
  });
}

/**
 * Put a failed report back in the queue.
 *
 * THE MISSING ACTION. The sync strip told people to "open Triage to
 * review" and Triage had nothing to press — a referral to a room with no
 * door. An errored report stayed errored forever, and because the strip
 * reports any errored report, the warning became permanent furniture
 * that everybody learns to read past.
 *
 * A conflict is retried the same way, deliberately: the server's copy
 * won, and re-sending the client's is how the reporter says the thing
 * they typed still matters. Server-wins is a rule about which row is
 * authoritative, not permission to discard what somebody wrote.
 */
/**
 * RETRACT A REPORT THIS DEVICE FILED.
 *
 * A correction to the record, not a way to make an occurrence go away.
 * The row survives on the server as a tombstone, the audit chain records
 * who retracted it and when, and the export an inspector reads still
 * carries it — see scripts/check-retraction.mjs for why that last one is
 * load-bearing rather than an oversight.
 *
 * TWO CASES, AND THE FIRST NEEDS NO SERVER AT ALL.
 *
 * A report still in the outbox has not reached anyone. Withdrawing it is
 * a purely local act: drop the queued item and the row, and nothing was
 * ever made. Queuing a DELETE for a CREATE the server has never seen
 * would ask it to retract a report it does not have, which answers
 * "rejected" and leaves a stuck item on a device nobody can reach.
 *
 * A report the server has acknowledged needs the round trip, and until
 * it lands the local row stays exactly where it is. It is removed when
 * the server says the retraction was recorded — never before, because a
 * device that deletes first and asks later has lost the report if the
 * answer is no.
 */
export async function retractReport(clientId: string, reason?: string): Promise<void> {
  await db.transaction("rw", db.reports, db.outbox, async () => {
    const report = await db.reports.where("clientId").equals(clientId).first();
    if (!report) return;

    const queued = await db.outbox.where("clientId").equals(clientId).first();

    /* NEVER SENT. There is nothing to retract anywhere but here. */
    if (queued?.op === "CREATE" && report.syncState !== "synced") {
      if (queued.localId) await db.outbox.delete(queued.localId);
      await db.reports.where("clientId").equals(clientId).delete();
      return;
    }

    /* Already queued for retraction — asking twice is not two
       retractions, and `add` on a unique clientId would throw into a UI
       handler and look like the button did nothing. */
    if (queued?.op === "DELETE") return;

    await db.outbox.add({
      clientId,
      entityType: "safetyReport",
      op: "DELETE",
      /* The reason and nothing else. The server reads no other field of
         this payload, and a retraction that carried the report back
         would be sending a narrative to say it should stop existing. */
      payload: reason?.trim() ? { reason: reason.trim() } : {},
      clientUpdatedAt: new Date().toISOString(),
      attempts: 0,
      nextAttemptAt: Date.now(),
    });
  });
}

export async function retryReport(clientId: string): Promise<void> {
  await db.transaction("rw", db.reports, db.outbox, async () => {
    const report = await db.reports.where("clientId").equals(clientId).first();
    if (!report) return;

    // clientId is unique on the outbox, so an existing row must be
    // reused rather than added beside — `add` would throw a constraint
    // error into a UI handler and look like the retry did nothing.
    const queued = await db.outbox.where("clientId").equals(clientId).first();
    if (queued?.localId) {
      await db.outbox.update(queued.localId, { attempts: 0, nextAttemptAt: Date.now() });
    } else {
      await db.outbox.add({
        clientId,
        entityType: "safetyReport",
        op: "CREATE",
        payload: stripReport(report),
        clientUpdatedAt: new Date().toISOString(),
        attempts: 0,
        nextAttemptAt: Date.now(),
      });
    }

    await db.reports.where("clientId").equals(clientId)
      .modify({ syncState: "pending", lastError: undefined });
  });

  // flushOutbox announces itself; see announce().
  await flushOutbox();
}

/** The report as the server's schema expects it — local bookkeeping out. */
function stripReport(r: LocalReport): CreateReportInput {
  const {
    localId: _l, syncState: _s, serverUpdatedAt: _v, lastError: _e,
    createdAtLocal: _c, ...rest
  } = r;
  return rest as CreateReportInput;
}

// ---------------------------- Device id ------------------------------
async function getDeviceId(): Promise<string> {
  const KEY = "usalamasms.deviceId";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}
