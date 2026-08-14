/* =====================================================================
   AN OPERATOR CREATING ITS OWN ACCOUNT.

   SPLIT OUT OF THE BARREL, for the reason permissions.ts records: the
   report form imports "@usalamasms/shared" for CreateReportSchema, so
   everything the barrel exports rides in the ENTRY chunk a ramp agent
   downloads at a remote strip before they can file anything. A schema
   describing a form an operator fills in once in its life is the
   clearest case of weight charged to the wrong person, and it put entry
   over its ceiling on the build that introduced it.

   Imported by the API route and by nothing in the browser: the signup
   panel is lazily loaded and posts plain JSON, so the client never
   needs the validator the server enforces.
   ===================================================================== */
import { z } from "zod";
import { JURISDICTIONS } from "./regulations";

/**
 * An operator creating its own account.
 *
 * THE THING THAT MADE THIS PRODUCT UNSELLABLE. Every screen, every
 * element, every gate — and no route that creates an organisation. The
 * only way an operator could exist was `npm run seed`, run by hand
 * against the database by somebody holding the credentials. A product
 * that has to be installed by its author for each customer is a
 * consultancy deliverable, not a product, whatever the feature list
 * says.
 *
 * WHAT IT DELIBERATELY DOES NOT ACCEPT is a role. The first user of a
 * new organisation is its ACCOUNTABLE EXECUTIVE and nothing else, set
 * by the server. That is the one post Annex 19 names as personally
 * answerable, it is the only role that may sign a safety policy, and it
 * is not a thing a signup form gets to choose — a payload that could
 * ask for it is a payload somebody will eventually send.
 *
 * It also cannot join an EXISTING organisation. There is no orgId here,
 * so the mistake is unavailable rather than guarded: joining somebody
 * else's operator is an invitation, issued from inside it, and mixing
 * the two is how one operator's safety officer ends up reading
 * another's reports.
 */
export const SignupSchema = z.object({
  /* The operator, as it appears on the certificate. Not "the company
     name": an AOC holder's legal name is what an inspector matches
     against, and the printed record carries it. */
  orgName: z.string().trim().min(2).max(160),
  /* Optional because a new operator in certification does not have one
     yet, and refusing them an account until they do would exclude the
     customer who needs the SMS EARLIEST — the whole point of the
     certification pathway is that the SMS exists before the AOC. */
  aocNumber: z.string().trim().max(60).optional(),
  jurisdiction: z.enum(JURISDICTIONS).default("KE"),
  /** How many aircraft, which decides the pricing band and nothing else. */
  fleet: z.number().int().min(1).max(2000).optional(),
  name: z.string().trim().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(12),
});
export type SignupInput = z.infer<typeof SignupSchema>;