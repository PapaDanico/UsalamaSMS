/* =====================================================================
   THE ADVISORY CIRCULAR REGISTER, held to the rules it states.

   A file whose whole purpose is citation is the file where a fabricated
   detail does the most damage, and this one was nearly the proof: two
   issue dates in the first draft were inferred from FILENAMES rather
   than read off the covers, and both were wrong — CAA-AC-SMS002A by two
   years, CAA-AC-SMS010 by fifteen months. Nothing in the file would
   have caught that, because a plausible date looks exactly like a
   correct one.

   So the checks below are the ones that can be made mechanical. The
   one that cannot — "somebody opened the document" — is the reason
   `CIRCULARS_VERIFIED_AGAINST_PRIMARY` exists as a deliberate,
   argued-for constant rather than a default.
   ===================================================================== */
import { describe, it, expect } from "vitest";
import {
  CIRCULARS,
  CIRCULARS_VERIFIED_AGAINST_PRIMARY,
  CIRCULARS_CAVEAT,
  CIRCULARS_THAT_CHANGED_AN_ANSWER,
  KCAA_SERVICES,
  KCAA_SAFETY_MAILBOX,
  SERVICE_PROVENANCE,
  VRS_NAME,
  VRS_CHARACTER,
  VRS_VERIFIED_AGAINST_PRIMARY
} from "../packages/shared/src/circulars";
import { SMS_COMPONENTS } from "../packages/shared/src/maturity";

describe("the register itself", () => {
  it("holds the nine circulars that were supplied and read", () => {
    expect(CIRCULARS).toHaveLength(9);
    expect(CIRCULARS_VERIFIED_AGAINST_PRIMARY).toBe(true);
  });

  it("carries no duplicate reference", () => {
    const refs = CIRCULARS.map((c) => c.reference);
    expect(new Set(refs).size).toBe(refs.length);
  });

  it("names every circular in the Authority's own numbering format", () => {
    for (const c of CIRCULARS) {
      expect(c.reference, `${c.reference} is not a KCAA AC reference`).toMatch(
        /^CAA-AC-SMS\d{3}A?$/,
      );
    }
  });

  /* THE ONE THAT WOULD HAVE CAUGHT THE FABRICATION — not by knowing the
     right date, which no test can, but by refusing a date that is not a
     real one and by pinning the two that were wrong. Those two are
     named explicitly: a count is satisfied by any nine plausible dates;
     these are the evidence that covers were actually opened. */
  it("dates every circular, and holds the two that were first got wrong", () => {
    for (const c of CIRCULARS) {
      expect(c.issued, `${c.reference} has no ISO issue date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(c.issued)), `${c.reference} date is unparseable`).toBe(false);
    }
    const by = (r: string) => CIRCULARS.find((c) => c.reference === r)!;
    // Cover: "CAA-AC-SMS002A  June, 2022". First draft said July 2020.
    expect(by("CAA-AC-SMS002A").issued).toBe("2022-06-01");
    // Cover: "CAA-AC-SMS010  April, 2024". First draft said January 2023.
    expect(by("CAA-AC-SMS010").issued).toBe("2024-04-01");
  });

  /* A published document that disagrees with itself is a fact about the
     document. Recording it is the alternative to choosing silently. */
  it("records the circular whose cover and header disagree", () => {
    const disputed = CIRCULARS.filter((c) => c.issuedDateDisputed);
    expect(disputed.map((c) => c.reference)).toEqual(["CAA-AC-SMS011"]);
    expect(disputed[0]!.issuedDateDisputed).toMatch(/April/);
    expect(disputed[0]!.issuedDateDisputed).toMatch(/March/);
  });

  it("points every element reference at an element that exists", () => {
    const known = new Set(Object.keys(SMS_COMPONENTS).length ? [] : []);
    const ids = new Set(
      (Array.isArray(SMS_COMPONENTS) ? SMS_COMPONENTS : Object.values(SMS_COMPONENTS))
        .flatMap((c: unknown) => {
          const comp = c as { elements?: ReadonlyArray<{ id: string }>; id?: string };
          return comp.elements ? comp.elements.map((e) => e.id) : comp.id ? [comp.id] : [];
        }),
    );
    expect(ids.size, "no element ids were read, so this check would pass by finding nothing")
      .toBeGreaterThanOrEqual(12);
    void known;
    for (const c of CIRCULARS) {
      if (c.elements === "ALL") continue;
      for (const id of c.elements) {
        expect(ids.has(id), `${c.reference} cites element ${id}, which does not exist`).toBe(true);
      }
    }
  });
});

describe("what the register refuses to claim", () => {
  /* templates.ts makes the same rule about its own equivalent field and
     gives the reason: an entry listed with nothing outstanding is a
     claim, and this registry makes none. */
  it("never lists a circular with nothing left for the operator to do", () => {
    for (const c of CIRCULARS) {
      expect(c.youStillNeed.trim().length, `${c.reference} claims nothing is outstanding`)
        .toBeGreaterThan(30);
      expect(c.weHold.trim().length).toBeGreaterThan(30);
    }
  });

  /* The register describes what the PRODUCT does about a circular. A
     sentence saying the product complies with one, or satisfies it, is
     the overclaim this whole file exists to avoid — compliance is the
     operator's and the Authority judges it. */
  it("never says this product complies with or satisfies a circular", () => {
    for (const c of CIRCULARS) {
      const text = `${c.weHold} ${c.purpose}`.toLowerCase();
      for (const claim of ["we comply", "fully compliant", "satisfies this", "meets this circular"]) {
        expect(text, `${c.reference} claims compliance rather than describing a record`)
          .not.toContain(claim);
      }
    }
  });

  it("says these are the operator's own regulator, not another State's templates", () => {
    expect(CIRCULARS_CAVEAT).toMatch(/Kenya Civil Aviation Authority/);
    expect(CIRCULARS_CAVEAT).toMatch(/the circular governs/);
  });
});

describe("the circulars that changed an answer", () => {
  /* The point of reading a primary document is that it can contradict
     you. A register where nothing ever did is a register that was
     skimmed for confirmation. */
  it("records at least two, and names what moved", () => {
    expect(CIRCULARS_THAT_CHANGED_AN_ANSWER.length).toBeGreaterThanOrEqual(2);
    const refs = CIRCULARS_THAT_CHANGED_AN_ANSWER.map((c) => c.reference);
    expect(refs).toContain("CAA-AC-SMS004A");
    expect(refs).toContain("CAA-AC-SMS001A");
  });

  it("keeps the clock-start finding attached to the circular that states it", () => {
    const mor = CIRCULARS.find((c) => c.reference === "CAA-AC-SMS004A")!;
    expect(mor.changedOurAnswer).toMatch(/3\.3\.6\.1/);
    expect(mor.changedOurAnswer).toMatch(/clock/i);
  });
});

describe("the two service addresses", () => {
  /* Quoted from the circulars that print them rather than searched for,
     which is the only reason a URL appears in this file at all. */
  it("are KCAA eServices addresses and nothing else", () => {
    for (const url of Object.values(KCAA_SERVICES)) {
      expect(url).toMatch(/^https:\/\/eservices\.kcaa\.or\.ke/);
    }
  });
});

describe("the safety mailbox and the VRS, supplied and corroborated on 18 August 2026", () => {
  it("the mailbox is an email address and lives OUTSIDE the URL map", () => {
    /* The first draft put it inside KCAA_SERVICES and the assertion
       above caught the category error within a minute. An email is a
       different kind of destination from a portal — no session, no
       form, no receipt — and keeping the kinds apart is what stops a
       screen rendering a mailto: where a filing UI was promised. */
    expect(KCAA_SAFETY_MAILBOX).toMatch(/^[^\s@]+@kcaa\.or\.ke$/);
    expect(Object.values(KCAA_SERVICES)).not.toContain(KCAA_SAFETY_MAILBOX);
  });

  it("its provenance says SUPPLIED, because no circular this product has read prints it", () => {
    /* Charter rule 12 in its smaller form. The two portal addresses
       each quote the paragraph that prints them; the mailbox cannot,
       and pretending otherwise would be a fabricated citation in a
       file whose entire purpose is citation. */
    expect(SERVICE_PROVENANCE.safetyMailbox).toMatch(/supplied by the operator/i);
    expect(SERVICE_PROVENANCE.safetyMailbox).not.toMatch(/CAA-AC/);
    expect(SERVICE_PROVENANCE.mandatoryOccurrence).toMatch(/CAA-AC-SMS004A/);
    expect(SERVICE_PROVENANCE.voluntaryReport).toMatch(/CAA-AC-SMS003A/);
  });

  it("the VRS is named, characterised, and NOT claimed as read", () => {
    /* The sentence that matters to this product: the Authority
       de-identifies before entering data into the VRS database — the
       receiving end of the handover already works the way this
       product's de-identifier does. Corroborated from a search
       rendering; the portal is behind a login, so the flag stays
       false the same way CICTT's does. */
    expect(VRS_NAME).toMatch(/Voluntary Reporting System/);
    expect(VRS_CHARACTER).toMatch(/non-punitive/);
    expect(VRS_CHARACTER).toMatch(/de-identify/);
    expect(VRS_VERIFIED_AGAINST_PRIMARY).toBe(false);
  });
});
