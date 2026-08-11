// =====================================================================
// The bytes an audit row's hash commits to.
//
// A separate, dependency-free module for the same reason deident.ts is
// one: it is safety-critical, it is pure, and it must be testable
// without a database, a Prisma client or an environment. The previous
// version of this logic was written out inline inside appendAudit and
// existed nowhere else — which is precisely why verifyAuditChain could
// be written without it and nobody noticed the verifier was not
// verifying anything.
//
// ONE definition, imported by both the writer and the verifier. If they
// could drift, they eventually would, and the symptom would be a chain
// that reports tampering on untampered data — after which somebody
// "fixes" the verifier and the control is gone.
// =====================================================================

export interface AuditRowMaterial {
  orgId: string;
  userId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  detail?: unknown;
  prevHash: string;
  createdAt: Date;
}

/**
 * Deterministic JSON: object keys sorted, recursively.
 *
 * Without this the hash depends on key insertion order, which depends on
 * the driver, the serialiser and the Postgres jsonb round-trip. A
 * Prisma upgrade that returned `{b, a}` where it once returned `{a, b}`
 * would invalidate every historic row at once — an audit log that
 * spontaneously reports itself tampered with is indistinguishable, to
 * the regulator reading it, from one that was.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => [k, sortKeys((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

/**
 * The canonical material string for one audit row.
 *
 * Every field that carries meaning is in here. If a column is added to
 * AuditLog and not added here, that column is unprotected: it can be
 * edited freely and the chain will still verify. tests/auditchain.test.ts
 * asserts the field list, so adding a column without extending the
 * material fails the build rather than silently widening the gap.
 */
export function auditMaterial(row: AuditRowMaterial): string {
  return [
    row.orgId,
    row.userId ?? "",
    row.action,
    row.entityType,
    row.entityId,
    canonicalJson(row.detail ?? null),
    row.prevHash,
    row.createdAt.toISOString(),
  ].join("|");
}

/** The fields auditMaterial commits to, named so a test can assert them. */
export const AUDIT_MATERIAL_FIELDS = [
  "orgId", "userId", "action", "entityType", "entityId",
  "detail", "prevHash", "createdAt",
] as const;
