/* =====================================================================
   THE AUDIT PACK, AND THE ONE THING IT MUST NEVER DO.

   A pack that quietly omitted the elements with no evidence would be
   the most dangerous document this product can generate: an operator
   would hand an inspector something that looked complete and find out
   in the room that it was not. So the first and longest assertion here
   is that empty elements APPEAR, named, with the gap said out loud.

   The arithmetic is trivial and is not what these tests are for.
   ===================================================================== */
import { describe, it, expect } from "vitest";
import {
  composePack, PACK_MAP, HOW_TO_VERIFY,
} from "../packages/shared/src/auditpack";
import { SMS_ELEMENTS } from "../packages/shared/src/maturity";

const AT = new Date("2026-08-17T09:00:00.000Z");

const EMPTY = { org: { name: "Wilson Air", jurisdiction: "KE" }, auditLog: [] };

describe("what the pack refuses to hide", () => {
  it("SHOWS EVERY ELEMENT, INCLUDING THE ONES HOLDING NOTHING", () => {
    const pack = composePack(EMPTY, AT);
    expect(pack.sections).toHaveLength(PACK_MAP.length);
    /* All twelve, from an operator with no data at all. */
    expect(pack.sections.every((s) => s.holding === "NOTHING")).toBe(true);
  });

  it("says what is missing rather than leaving a blank", () => {
    const pack = composePack(EMPTY, AT);
    for (const s of pack.sections) {
      expect(s.gap, `${s.elementId} has no gap sentence`).toBeTruthy();
      expect(s.gap!.length, s.elementId).toBeGreaterThan(30);
    }
  });

  it("lists the gaps separately, so they can be worked before the visit", () => {
    expect(composePack(EMPTY, AT).gaps).toHaveLength(PACK_MAP.length);
  });

  it("and a section with records carries NO gap sentence", () => {
    /* The other direction: a pack that always reported a gap would
       satisfy every assertion above and be useless. */
    const pack = composePack(
      { ...EMPTY, policies: [{ id: "p1" }], reports: [{ id: "r1" }, { id: "r2" }] },
      AT,
    );
    const policy = pack.sections.find((s) => s.elementId === "1.1")!;
    expect(policy.holding).toBe("RECORDS");
    expect(policy.count).toBe(1);
    expect(policy.gap).toBeUndefined();
    const hazard = pack.sections.find((s) => s.elementId === "2.1")!;
    expect(hazard.count).toBe(2);
    expect(pack.gaps).not.toContain("1.1");
  });
});

describe("the pack covers the same twelve elements the product does", () => {
  it("MAPS EVERY ANNEX 19 ELEMENT, with no invented ones", () => {
    /* Read from maturity.ts rather than typed here — a pack that
       covered eleven of the twelve would be exactly the omission this
       file exists to prevent, arriving through the map instead of
       through the data. */
    const known = SMS_ELEMENTS.map((e: { id: string }) => e.id).sort();
    const mapped = PACK_MAP.map((m) => m.id).sort();
    expect(mapped).toEqual(known);
  });

  it("asks a real question under each, not a field name", () => {
    for (const m of PACK_MAP) {
      expect(m.asks.length, m.id).toBeGreaterThan(30);
      expect(m.keys.length, m.id).toBeGreaterThan(0);
    }
  });
});

describe("counting", () => {
  it("adds every source under one element", () => {
    /* 1.4 draws on contacts AND exercises: a directory with no
       exercise is not the same as neither, and the count has to show
       the element is not empty. */
    const pack = composePack({ ...EMPTY, contacts: [{}, {}], exercises: [{}] }, AT);
    expect(pack.sections.find((s) => s.elementId === "1.4")!.count).toBe(3);
  });

  it("counts a single-record section as one, not as empty", () => {
    /* The voluntary scheme is one object or none. Treating a present
       object as an empty list would report element 2.1 as holding
       nothing while the scheme sat in the export. */
    const pack = composePack({ ...EMPTY, voluntaryScheme: { scope: "all" } }, AT);
    expect(pack.sections.find((s) => s.elementId === "2.1")!.count).toBe(1);
  });

  it("treats null and absent alike", () => {
    const pack = composePack({ ...EMPTY, voluntaryScheme: null, policies: undefined }, AT);
    expect(pack.sections.find((s) => s.elementId === "1.1")!.count).toBe(0);
  });
});

describe("verification, which is what makes it evidence", () => {
  it("carries the last hash and how to check it WITHOUT trusting us", () => {
    const pack = composePack(
      { ...EMPTY, auditLog: [{ hash: "aaa" }, { hash: "bbb" }] },
      AT,
    );
    expect(pack.verification.entries).toBe(2);
    expect(pack.verification.lastHash).toBe("bbb");
    expect(pack.verification.howToVerify).toBe(HOW_TO_VERIFY);
    /* The instruction has to name the endpoint, or it is reassurance
       rather than a method. */
    expect(HOW_TO_VERIFY).toMatch(/audit\/verify/);
  });

  it("says there is no chain rather than inventing one", () => {
    const pack = composePack(EMPTY, AT);
    expect(pack.verification.entries).toBe(0);
    expect(pack.verification.lastHash).toBeNull();
  });
});
