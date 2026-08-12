/**
 * Type surface for `scripts/setup-env.mjs`.
 *
 * The script is plain JavaScript, like everything else under scripts/,
 * because it runs from a shell before anything is built. Its one pure
 * function is worth testing from the TypeScript suite, and a strict
 * tsc will not import an untyped .mjs — hence this file, which
 * declares only the export the tests use.
 */

export declare function normalizeDatabaseUrl(raw: unknown): {
  /** The connection string, with pooling parameters appended if needed. */
  url: string;
  /** Advisory warnings. Non-empty does not mean rejected. */
  notes: string[];
  /** Port as written, defaulting to "5432" when the URI omits it. */
  port: string;
};
