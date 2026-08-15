/* ============================================================
   THE OFFER AND THE SCREEN SAY THE SAME FOUR THINGS.

   Signed out, /picture now lists what it puts on one screen —
   Reporting, the register, indicators, what needs attention — because
   the screen used to be a heading, two sentences and a button on a
   page stretched to the full viewport, and it told somebody evaluating
   this product nothing about what signing in would give them.

   THAT LIST IS A SECOND COPY, and second copies go stale in one
   direction: the offer keeps advertising a section the screen has
   dropped or renamed. Nobody would notice, because the two are only
   ever seen by different people — a signed-out visitor reads the
   offer, and only a signed-in user reads the sections.

   Nothing else in the build compares a marketing list to the thing it
   describes. The claims gate checks NUMBERS against code; this checks
   a set of names against the headings that render them.

   Asserted at SOURCE rather than by rendering, deliberately: the
   signed-in half of this screen needs a session and a server, so a
   rendered check would only ever see the signed-out half — the copy
   that cannot disagree with itself. Reading the module gets both.
   ============================================================ */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SOURCE = readFileSync(
  resolve(__dirname, "../apps/web/src/tools/picture/index.js"),
  "utf8",
);

/** The titles declared in LOCKED_SECTIONS. */
function offeredTitles(): string[] {
  const block = /const LOCKED_SECTIONS = Object\.freeze\(\[([\s\S]*?)\]\);/.exec(SOURCE);
  if (!block) {
    throw new Error(
      "LOCKED_SECTIONS not found in tools/picture/index.js. If it was renamed, " +
        "rename it here; do not delete this test — it is the only thing comparing " +
        "the signed-out offer to the sections it advertises.",
    );
  }
  return [...block[1]!.matchAll(/title:\s*'([^']+)'/g)].map((m) => m[1]!);
}

/** The <h2> headings the signed-in screen renders. */
function renderedHeadings(): string[] {
  return [...SOURCE.matchAll(/<h2>([^<${]+)<\/h2>/g)].map((m) => m[1]!.trim());
}

describe("the signed-out offer matches the screen", () => {
  it("declares four sections", () => {
    expect(offeredTitles()).toHaveLength(4);
  });

  it("finds the headings it is compared against", () => {
    /* If the headings stop being plain <h2> text — interpolated, moved
       to a component — this test would silently compare against an
       empty set and pass. Charter rule 11: it fails instead. */
    expect(
      renderedHeadings().length,
      "no plain <h2> headings found in picture/index.js, so there is nothing " +
        "to compare the offer against and this check has stopped checking",
    ).toBeGreaterThanOrEqual(4);
  });

  /* THE DIRECTION THAT LIES TO A VISITOR: the offer names something
     the screen does not have. */
  it("offers nothing the screen does not render", () => {
    const headings = renderedHeadings();
    for (const title of offeredTitles()) {
      expect(
        headings,
        `the signed-out screen offers "${title}", which no <h2> on the signed-in ` +
          `screen renders — either the section was renamed or it is gone, and the ` +
          `offer is still advertising it`,
      ).toContain(title);
    }
  });

  /* AND THE OTHER DIRECTION: a section exists that the offer never
     mentions, so somebody deciding whether to sign in is told less
     than the product does. Same defect as an unreachable capability,
     and just as quiet. */
  it("mentions every section the screen renders", () => {
    const offered = offeredTitles();
    for (const heading of renderedHeadings()) {
      expect(
        offered,
        `the signed-in screen renders "${heading}" and the signed-out offer does ` +
          `not mention it — a capability nobody evaluating this product is told about`,
      ).toContain(heading);
    }
  });
});
