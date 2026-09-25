/* =====================================================================
   ABANDONED MANUAL UPLOADS, SWEPT DAILY.

   A manual in transit is held in DocumentUpload for an hour. Starting a
   new upload clears that operator's expired ones, but an operator who
   abandons an upload and never starts another would leave up to 25 MB
   sitting in the database indefinitely. The daily digest job calls this
   across every operator, so nothing outlives its hour by more than a day.

   Here rather than in the Netlify function so it is tested: nothing in
   the suites runs the functions themselves.
   ===================================================================== */
import type { PrismaClient } from "@prisma/client";

export async function sweepExpiredUploads(
  db: Pick<PrismaClient, "documentUpload">,
  now: Date = new Date(),
): Promise<number> {
  const { count } = await db.documentUpload.deleteMany({ where: { expiresAt: { lt: now } } });
  return count;
}
