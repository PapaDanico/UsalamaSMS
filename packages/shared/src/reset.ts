/* =====================================================================
   GETTING BACK INTO AN ACCOUNT NOBODY ELSE CAN OPEN.

   -------------------------------------------------------------
   THE ADMINISTRATIVE RESET WAS THE ANSWER, AND IT IS UNREACHABLE.

   `POST /api/v1/auth/admin/reset-password` exists, is audited, is
   tenant-scoped, and was written deliberately in preference to a mail
   link — the note above it argues the case, and the argument is sound
   for an operator with fifteen staff and a person who does this.

   Measured against what the product actually creates, that person does
   not exist:

     · `POST /api/v1/auth/signup` creates ONE user, and the server sets
       its role to ACCOUNTABLE_EXECUTIVE;
     · `user.create` appears exactly once in the whole API, so there is
       no route that ever makes a second one;
     · ACCOUNTABLE_EXECUTIVE does not hold `user.manage` — only
       SYSTEM_ADMIN does, and no signup produces one.

   So every operator that has ever signed up has exactly one account,
   held by a role that cannot call the reset route, in an organisation
   containing nobody who can call it for them. The signup route's own
   duplicate-address message ends "your administrator can reset it",
   addressed to an operator that has no administrator.

   One forgotten password locks a customer out of its own safety record
   permanently. That is not an edge case on a product sold to operators
   who sign up unattended; it is the first support ticket.

   -------------------------------------------------------------
   WHICH MAKES THE MAIL PATH THE ONLY WAY BACK IN.

   The objection to it stands and is answered rather than waved away:

     · "another delivery path that fails quietly" — it does not. The
       route reports NOT_CONFIGURED, DELIVERED or FAILED as three
       different facts, the same discipline mail.ts already applies to
       the digest, and the screen prints which one it got. Charter
       rule 8: a refused write is reported.
     · "a link in an inbox leaves no audit entry" — this one does.
       Requesting and consuming are both appended to the tenant's audit
       chain, naming the account and never the credential.

   -------------------------------------------------------------
   WHY THE VALIDATORS LIVE HERE RATHER THAN IN THE ROUTE.

   The same reason SignupSchema does, and the same reason it is NOT
   re-exported from the barrel: the report form imports
   "@usalamasms/shared", so anything the barrel carries is downloaded by
   a ramp agent at a remote strip before they can file. The minimum
   password length has to agree between the sign-up form, the login
   validator and this, and a number typed in three places is a number
   that will disagree in two of them — so it is stated once, here, and
   imported by path.
   ===================================================================== */
import { z } from "zod";

/**
 * HOW LONG A RESET LINK LIVES, in minutes.
 *
 * One hour, and short on purpose. A live reset link sitting in an inbox
 * is a credential for the account — the whole account, including every
 * report filed in confidence to it — held somewhere the operator does
 * not control and cannot revoke. Long enough that somebody who requests
 * one, walks to their desk and finds the mail can use it; not long
 * enough to be worth anything to whoever reads that mailbox next year.
 *
 * It is a constant rather than a literal because the API enforces it,
 * the email states it and the screen repeats it. Three copies of "one
 * hour" is two chances to be lying to the person reading the screen.
 */
export const RESET_TTL_MINUTES = 60;

/** The same floor LoginSchema and SignupSchema use. Stated once. */
export const MIN_PASSWORD_LENGTH = 12;

/**
 * ASKING FOR A LINK. An address, and nothing else.
 *
 * There is no `orgId` and no "which account" — a person who has
 * forgotten their password does not know an organisation id, and a
 * field that let a caller name a tenant would let them ask which
 * tenants exist.
 */
export const ForgotSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
});

/**
 * SPENDING IT. The token from the link, and the password to set.
 *
 * The token is bounded at both ends: below because a short string is
 * not a token this server ever issued, above so an attacker cannot make
 * the server hash a megabyte per request. The password floor is the
 * shared one — a reset route with a weaker minimum than the sign-up
 * form is a downgrade dressed as a recovery.
 */
export const ResetSchema = z.object({
  token: z.string().trim().min(32).max(256),
  newPassword: z.string().min(MIN_PASSWORD_LENGTH),
});

/**
 * THE ONE ANSWER `POST /auth/forgot` GIVES, whatever it found.
 *
 * The login route goes to real trouble not to be an account-enumeration
 * oracle — a generic failure, and a dummy argon2 hash so the clock does
 * not answer the question the message refuses to. A forgot-password
 * route that says "no account with that address" hands back the oracle
 * login closed, and on this product the user list of a tenant is the
 * staff roster of an operator: knowing who holds an account tells you
 * who files safety reports.
 *
 * So the answer is identical for an address that exists, an address
 * that does not, and an account that has been deactivated. It is
 * phrased as what the SERVER did rather than as what the reader should
 * expect to happen, because the alternative — "check your inbox" — is a
 * sentence that is false two times in three and teaches people the
 * product lies to them.
 */
export const RESET_REQUESTED_ANSWER =
  "If that address belongs to an account here, a link to set a new password is on " +
  `its way to it. The link lasts ${RESET_TTL_MINUTES} minutes and can be used once. ` +
  "Nothing about your account has changed yet.";

/**
 * AND THE ONE ANSWER A BAD TOKEN GETS, for the same reason in reverse.
 *
 * Expired, already spent, never issued and belonging-to-a-deactivated-
 * account are four different facts, and telling them apart tells
 * somebody holding a stolen link which kind of stolen link they hold.
 */
export const RESET_REFUSED_ANSWER =
  "That link cannot be used. It may have expired, or already been used, or been " +
  "replaced by a newer one. Ask for another and use the most recent email.";
