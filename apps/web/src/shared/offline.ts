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
}

export async function flushOutbox(fetcher: typeof fetch = fetch): Promise<FlushOutcome> {
  const empty: FlushOutcome = { sent: 0, conflicts: 0, rejected: 0, unanswered: 0 };
  if (!navigator.onLine) return empty;

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

  if (res.status === 401) return empty; // auth refresh handled elsewhere
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
          await db.reports.where("clientId").equals(r.clientId)
            .modify({ syncState: "synced", serverUpdatedAt: r.serverUpdatedAt });
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
              lastError: r.status === "forbidden"
                ? "your role cannot submit this report type"
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
  state: "synced" | "pending" | "error" | "offline";
  pending: number;
  errored: number;
}> {
  const [pending, errored] = await Promise.all([
    db.outbox.count(),
    db.reports.where("syncState").equals("error").count(),
  ]);
  if (errored > 0) return { state: "error", pending, errored };
  if (!navigator.onLine) return { state: "offline", pending, errored };
  if (pending > 0) return { state: "pending", pending, errored };
  return { state: "synced", pending, errored };
}

// ------------------------ Background sync API ------------------------
export async function requestBackgroundSync(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.ready;
    // @ts-expect-error Background Sync API not yet in all TS lib.dom versions
    await reg.sync?.register("usalamasms-outbox");
  } catch {
    // Fallback: immediate attempt + online listener (registered in app shell)
    void flushOutbox();
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => void flushOutbox());
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
