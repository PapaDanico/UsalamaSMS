// =====================================================================
// What the rate limiter counts against.
//
// A separate, dependency-free module for the reason audit-material.ts
// and deident.ts are: it is safety-critical, it is pure, and it must be
// testable without a database, a Prisma client or an environment.
// Importing server.ts to reach it would drag in core.ts, which validates
// env at import time and exits — so the test would have to run in the
// integration suite, behind a Postgres, to check arithmetic that needs
// neither.
//
// THE DEFECT THIS EXISTS FOR. The limiter keyed on `req.ip`, and with
// Fastify's `trustProxy: true` that resolves to the LEFTMOST
// X-Forwarded-For entry — a value the caller writes:
//
//   trustProxy: true   XFF "FORGED, 9.9.9.9, 8.8.8.8" -> FORGED
//   trustProxy: 1      XFF "FORGED, 9.9.9.9, 8.8.8.8" -> 8.8.8.8
//
// So a rotating header bought a fresh ten-per-fifteen-minutes bucket on
// every request, against the endpoint the server file itself calls the
// one worth brute-forcing. The comment above the setting asserted the
// opposite. The integration suite had been using exactly that trick to
// give each test a clean bucket, which means the exploit was committed
// as a test helper and read as configuration.
// =====================================================================

/** The header Netlify's edge sets from the socket it terminated. */
const EDGE_HEADER = "x-nf-client-connection-ip";

/**
 * The bucket a request counts towards.
 *
 * The edge header wins outright where it exists. A client cannot
 * influence it — a copy sent with the request is replaced by the
 * platform, not appended to — so it is the only honest answer to "who
 * is calling" on the deployed path.
 *
 * Off Netlify it is absent and the fallback is the connection address
 * under a one-hop trust, which narrows forgery to whatever the immediate
 * proxy allows through rather than eliminating it. An operator behind a
 * different edge has to set the hop count for their own topology; that
 * is a deployment fact this file cannot know, and pretending otherwise
 * is how the previous comment came to be wrong.
 *
 * The `edge:` / `ip:` prefixes keep the two sources in separate
 * namespaces. Without them a caller whose fallback address happened to
 * equal another caller's edge address would share — or exhaust — their
 * bucket.
 *
 * A blank header falls through to the address rather than becoming one
 * shared key, because a single key for everyone is a denial of service
 * anybody can trigger.
 */
export function rateLimitKey(
  headers: Record<string, string | string[] | undefined>,
  fallbackIp: string,
): string {
  const platform = headers[EDGE_HEADER];
  const value = Array.isArray(platform) ? platform[0] : platform;
  const trimmed = value?.trim();
  return trimmed ? `edge:${trimmed}` : `ip:${fallbackIp}`;
}
