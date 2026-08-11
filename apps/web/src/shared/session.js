/* ============================================================
   The session — and the seam that was missing.

   THE DEFECT THIS FILE CLOSES. flushOutbox() posted to
   /api/v1/sync/batch with a content-type header and nothing else. That
   route's preHandler is [authenticate]. So every sync a real device
   attempted returned 401, and offline.ts answered:

       if (res.status === 401) return empty; // auth refresh handled elsewhere

   It was not handled elsewhere. There was no login screen, no token
   store and no Authorization header anywhere in apps/web. A report was
   written to IndexedDB, the strip said "1 report waiting to send", and
   that was permanent — no backoff recorded, no error state, nothing
   surfaced to the person holding the phone.

   That is the worst available failure for this product. A report that
   cannot be sent and SAYS so is a person who knows to walk to the
   office. A report that cannot be sent and reports itself as pending is
   a hazard nobody ever hears about, and the handset is telling its
   owner it has been dealt with.

   It survived because both halves of the Phase 1 gate were tested and
   the seam between them was not: the smoke suite drove the browser and
   read IndexedDB back; the integration suite posted a batch with a
   token it minted itself. Nothing exercised browser -> API, because the
   browser could not produce a session.

   ------------------------------------------------------------
   WHERE THE TOKENS LIVE, AND WHAT THAT COSTS.

   The access token is held in memory only. The refresh token is in
   localStorage, which is readable by any script that runs on this
   origin — so this is XSS-exposed, and saying otherwise would be a
   worse decision than making it.

   The alternative that is genuinely better is an httpOnly cookie: the
   API is same-origin (/api/* on this host), so it would work, and it
   would need CSRF protection and a cookie-parsing path the API does not
   have. That is the right destination and it is not free, so it is
   recorded as a switch rather than pretended away.

   What holds the line meanwhile: a strict CSP with no third-party
   script origins, html.js escaping every interpolation by default, and
   a thirty-day refresh token whose reuse revokes every session for that
   user — so a stolen token that is ever replayed alongside the real
   client's takes the attacker's session down with it.
   ============================================================ */

const ACCESS_KEY = 'usalamasms.session';   // metadata only, never the access token
const REFRESH_KEY = 'usalamasms.refresh';

/* In memory, deliberately. An access token in localStorage survives a
   tab close, which is exactly the property you do not want on a shared
   crew-room handset. Fifteen minutes of validity is short enough that
   re-deriving it from the refresh token on load costs one request. */
let accessToken = null;

/** A single in-flight refresh, so ten queued requests do not burn ten
    refresh tokens — and, worse, trip the reuse detector, which revokes
    every session for the user and logs them out of every device. */
let refreshInFlight = null;

export function getSession() {
  try {
    const raw = localStorage.getItem(ACCESS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function isSignedIn() {
  return Boolean(getSession() && localStorage.getItem(REFRESH_KEY));
}

function store({ accessToken: access, refreshToken, role, orgId }) {
  accessToken = access ?? null;
  if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
  if (role || orgId) {
    localStorage.setItem(ACCESS_KEY, JSON.stringify({ role, orgId }));
  }
}

export function clearSession() {
  accessToken = null;
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

/**
 * Sign in.
 *
 * Returns { ok } or { ok: false, reason }. The reason is what the screen
 * shows, and it deliberately never distinguishes "no such account" from
 * "wrong password" — the server refuses to, for good reason (an
 * operator's user list is its staff roster), and a client that guessed
 * would hand back the oracle the server just closed.
 */
export async function signIn(email, password, fetcher = fetch) {
  let res;
  try {
    res = await fetcher('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
  } catch {
    return { ok: false, reason: 'offline' };
  }

  if (res.status === 429) return { ok: false, reason: 'throttled' };
  if (!res.ok) return { ok: false, reason: 'invalid' };

  const body = await res.json();
  store(body);
  return { ok: true, role: body.role };
}

export async function signOut(fetcher = fetch) {
  // Best-effort: tell the server so every refresh token dies, then clear
  // locally regardless. A logout that fails because the radio is off
  // must still log the person out of this handset — that is the whole
  // reason they pressed it.
  try {
    if (accessToken) {
      await fetcher('/api/v1/auth/logout', {
        method: 'POST',
        headers: { authorization: `Bearer ${accessToken}` }
      });
    }
  } catch {
    /* offline; local clear below is what matters */
  }
  clearSession();
}

/**
 * Exchange the refresh token for a new access token.
 *
 * Coalesced: concurrent callers await the same promise. Without that,
 * a flush of fifty outbox items that all 401 would present the same
 * refresh token fifty times, and the server — correctly — reads the
 * second presentation of an already-burnt token as theft and revokes
 * every session the user has.
 */
async function refresh(fetcher) {
  if (refreshInFlight) return refreshInFlight;

  const token = localStorage.getItem(REFRESH_KEY);
  if (!token) return false;

  refreshInFlight = (async () => {
    try {
      const res = await fetcher('/api/v1/auth/refresh', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken: token })
      });
      if (!res.ok) {
        // 401 here means the token is expired, revoked, or burnt. All
        // three end the session — and clearing it is what makes the UI
        // able to say so, rather than retrying forever in silence.
        if (res.status === 401) clearSession();
        return false;
      }
      store(await res.json());
      return true;
    } catch {
      // A network failure is NOT an invalid session. Keep the refresh
      // token; the device is offline and will try again. Clearing here
      // would log out every user who walks into a hangar.
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

/**
 * fetch(), with the session attached and one refresh-and-retry on 401.
 *
 * This is what offline.ts uses. It is the entire fix: without it the
 * sync route rejects every request the device has ever made.
 */
export async function authFetch(input, init = {}, fetcher = fetch) {
  const send = () =>
    fetcher(input, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {})
      }
    });

  let res = await send();
  if (res.status !== 401) return res;

  // ONE retry. A loop here is a device hammering an API it will never
  // satisfy, on a metered connection, on behalf of someone who needs to
  // be told to sign in again instead.
  const refreshed = await refresh(fetcher);
  if (!refreshed) return res;

  res = await send();
  return res;
}

/**
 * Restore a usable access token at startup, if the refresh token is
 * still good. Failure is silent and expected — offline, or expired.
 */
export async function resumeSession(fetcher = fetch) {
  if (!localStorage.getItem(REFRESH_KEY)) return false;
  if (accessToken) return true;
  return refresh(fetcher);
}

/** Test seam. Nothing in the app should reach for this. */
export const __testing = {
  setAccessToken: (t) => { accessToken = t; },
  getAccessToken: () => accessToken
};
