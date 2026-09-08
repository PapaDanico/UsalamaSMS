import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { OCCURRENCE_PRECEDENT } from "../packages/shared/src/sra";

/* A database of accidents cited as though it were an accident report is
   the same category error the CICTT caveat exists to refuse, so the two
   things that keep this reference honest are pinned: what it is, and
   what it is not for. */
describe("the occurrence precedent reference", () => {
  it("is declared SECONDARY, because it compiles from reports rather than being one", () => {
    expect(OCCURRENCE_PRECEDENT.standing).toBe("SECONDARY");
    expect(OCCURRENCE_PRECEDENT.publisher).toMatch(/Flight Safety Foundation/);
  });

  it("REFUSES THE USE THAT WOULD MAKE IT DANGEROUS", () => {
    /* Likelihood is a judgement about THIS operation — the capitals are
       on the field label for the same reason. A reference that did not
       say so would invite a three-aircraft operator to borrow a world
       fleet rate, which is the 72-hours-from-the-EU error wearing a
       different hat. */
    expect(OCCURRENCE_PRECEDENT.notFor).toMatch(/likelihood/i);
    expect(OCCURRENCE_PRECEDENT.useFor).toMatch(/before/i);
    expect(OCCURRENCE_PRECEDENT.notFor.length).toBeGreaterThan(30);
  });

  it("IS ONLY EVER A LINK — the screen must not fetch it", () => {
    /* connect-src 'self' would refuse the request and check:third-party
       fails the build on an external resource load, but both are one
       edit away and neither names this URL. The screen is read here. */
    const screen = readFileSync("apps/web/src/tools/sra/index.js", "utf8");
    expect(screen).toMatch(/OCCURRENCE_PRECEDENT\.url/);
    for (const forbidden of ["fetch(", "XMLHttpRequest", "<img", "<script", "<iframe"]) {
      const near = screen.includes(forbidden) && /aviation-safety/.test(screen);
      /* The URL is only ever in an href, never in a fetch or an embed. */
      if (forbidden === "fetch(") expect(screen).not.toMatch(/fetch\([^)]*aviation-safety/);
      else expect(near && screen.includes(`${forbidden} src="https://aviation-safety`)).toBe(false);
    }
  });

  it("opens away from this page rather than inside it", () => {
    const screen = readFileSync("apps/web/src/tools/sra/index.js", "utf8");
    expect(screen).toMatch(/rel="noopener noreferrer"/);
  });
});
