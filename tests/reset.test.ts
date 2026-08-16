/* =====================================================================
   THE RULES A PASSWORD RESET IS HELD TO, stated where they can be
   checked without a database.

   The route behaviour — the enumeration answer, the single-use race,
   the session revocation — is in reset.route.integration.test.ts,
   because only Postgres can answer those. What is here is everything a
   unit test CAN settle: the validators, the two fixed answers, and the
   contents of the email.

   THE EMAIL IS THE PART WORTH GUARDING HARDEST. mail.ts describes the
   confidentiality boundary it holds for the digest — nothing is
   interpolated that did not come from a DigestItem, and a DigestItem
   has no field capable of holding free text. This message has no such
   structural defence: it takes a URL as a parameter. So the assertion
   is made explicitly instead, over the whole rendered body.
   ===================================================================== */
import { describe, it, expect } from "vitest";
import {
  ForgotSchema,
  ResetSchema,
  RESET_TTL_MINUTES,
  MIN_PASSWORD_LENGTH,
  RESET_REQUESTED_ANSWER,
  RESET_REFUSED_ANSWER,
} from "../packages/shared/src/reset";
import { resetSubject, resetBody } from "../apps/api/src/mail";
import { LoginSchema } from "../packages/shared/src/index";

describe("asking for a link", () => {
  it("takes an address and lowercases it, because login looks the account up lowercased", () => {
    const parsed = ForgotSchema.parse({ email: "  Safety@Operator.CO.KE " });
    expect(parsed.email).toBe("safety@operator.co.ke");
  });

  it("refuses something that is not an address at all", () => {
    expect(ForgotSchema.safeParse({ email: "not-an-address" }).success).toBe(false);
  });

  /* A tenant's user list is an operator's staff roster. A field naming
     an organisation would let a caller ask which organisations exist —
     the enumeration login goes to real trouble to refuse. */
  it("has no field naming an organisation", () => {
    const parsed = ForgotSchema.parse({ email: "a@b.com", orgId: "someone-elses" } as never);
    expect(Object.keys(parsed)).toEqual(["email"]);
  });
});

describe("spending it", () => {
  const good = { token: "a".repeat(43), newPassword: "a-long-enough-one" };

  it("takes a token and a password", () => {
    expect(ResetSchema.safeParse(good).success).toBe(true);
  });

  /* THE FLOOR IS THE SHARED ONE, and this is the assertion that keeps
     it shared. A reset route with a weaker minimum than the sign-up
     form is a downgrade dressed as a recovery — and the way that
     happens is somebody typing 8 here because this file and
     LoginSchema were edited on different days. */
  it("demands the same minimum length the login validator does", () => {
    expect(ResetSchema.safeParse({ ...good, newPassword: "x".repeat(MIN_PASSWORD_LENGTH) }).success)
      .toBe(true);
    expect(
      ResetSchema.safeParse({ ...good, newPassword: "x".repeat(MIN_PASSWORD_LENGTH - 1) }).success,
    ).toBe(false);
    expect(LoginSchema.safeParse({ email: "a@b.com", password: "x".repeat(MIN_PASSWORD_LENGTH) }).success)
      .toBe(true);
    expect(
      LoginSchema.safeParse({ email: "a@b.com", password: "x".repeat(MIN_PASSWORD_LENGTH - 1) }).success,
    ).toBe(false);
  });

  /* Bounded above so an attacker cannot make the server hash a
     megabyte of "token" per request, and below because a short string
     is not something this server ever issued. */
  it("refuses a token too short to have been issued, and one absurdly long", () => {
    expect(ResetSchema.safeParse({ ...good, token: "short" }).success).toBe(false);
    expect(ResetSchema.safeParse({ ...good, token: "a".repeat(4096) }).success).toBe(false);
  });
});

describe("the two fixed answers", () => {
  /* The whole point of the requested answer is that it is true for an
     address with an account and for one without. "Check your inbox" is
     false two times in three; "we have sent you an email" is the
     enumeration oracle in a sentence. */
  it("never promises mail has been sent to the reader", () => {
    expect(RESET_REQUESTED_ANSWER).toMatch(/if that address belongs to an account/i);
    expect(RESET_REQUESTED_ANSWER).not.toMatch(/check your (inbox|email)/i);
    expect(RESET_REQUESTED_ANSWER).not.toMatch(/we have sent|has been sent to you/i);
  });

  it("states the lifetime, and states the same number the API enforces", () => {
    expect(RESET_REQUESTED_ANSWER).toContain(String(RESET_TTL_MINUTES));
  });

  /* Expired, spent, never issued and belonging-to-a-deactivated-account
     are four facts, and telling them apart tells somebody holding a
     stolen link which kind they hold. */
  it("does not say which way a link was unusable", () => {
    expect(RESET_REFUSED_ANSWER).toMatch(/may have expired, or already been used/i);
    expect(RESET_REFUSED_ANSWER).not.toMatch(/\bno such\b|not found|does not exist/i);
  });
});

describe("the email", () => {
  const LINK = "https://usalamasms.com/reset?token=WBHVGqk5s4Lm";
  const body = resetBody(LINK, RESET_TTL_MINUTES);

  it("carries the link and the lifetime", () => {
    expect(body).toContain(LINK);
    expect(body).toContain(String(RESET_TTL_MINUTES));
  });

  it("says using it signs every device out, because that is the surprise", () => {
    expect(body).toMatch(/signs out every device/i);
  });

  /* The reader who did NOT ask for this is the one the message has to
     serve. "Ignore this email" tells them to do nothing without telling
     them doing nothing is enough. */
  it("tells an unintended reader that inaction is sufficient", () => {
    expect(body).toMatch(/nothing has happened and nothing will/i);
    expect(body).toMatch(/current password still works/i);
  });

  /* ================================================================
     THE ASSERTION THIS FILE EXISTS FOR.

     A reset mail is delivered to an address the server has just been
     TOLD, by an unauthenticated caller, and the obvious courtesies —
     "Hello Jane", "for your account at Skyward Air" — each confirm to
     whoever reads that mailbox that the address holds an account here.
     That is precisely the fact /auth/forgot refuses to confirm to the
     person who asked, leaking out the side.

     Blunt on purpose, in the manner of the digest's own guard: the
     whole transmitted body is scanned. It cannot be fooled by a field
     added later or by a clever interpolation.
     ================================================================ */
  it("names nobody and no organisation", () => {
    const wholeMessage = `${resetSubject()}\n${body}`.toLowerCase();
    for (const leak of ["hello ", "dear ", "your account at", "operator", "org", "role", "name"]) {
      expect(wholeMessage).not.toContain(leak);
    }
  });

  /* Plain text, no HTML, no tracking — the same reasoning mail.ts gives
     for the digest. A pixel in a reset mail is surveillance of when
     somebody was locked out. */
  it("is plain text with no markup and no image", () => {
    expect(body).not.toMatch(/<[a-z]/i);
    expect(body).not.toMatch(/\.(gif|png)\b/i);
  });

  /* The subject is read on a lock screen, often by somebody standing
     next to a colleague. It says what the mail is for and nothing
     about whose it is. */
  it("has a subject that identifies the product and the purpose only", () => {
    expect(resetSubject()).toBe("UsalamaSMS — set a new password");
  });
});
