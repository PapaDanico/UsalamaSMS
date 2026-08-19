// @ts-nocheck
import { beforeEach, describe, expect, it } from "vitest";
import { checklistModel } from "../apps/web/src/components/OnboardingChecklist.js";

const store = new Map();

Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, value);
    },
    removeItem(key) {
      store.delete(key);
    },
  },
  configurable: true,
});

describe("the trial onboarding checklist", () => {
  beforeEach(() => {
    store.clear();
  });

  it("marks the shared-record steps from existing counts", () => {
    const items = checklistModel({
      scale: { reports: 1, indicators: 1, registerEntries: 1 },
      teamCount: 2,
      role: "ACCOUNTABLE_EXECUTIVE",
    });
    expect(items.find((i) => i.key === "REPORT")?.done).toBe(true);
    expect(items.find((i) => i.key === "REGISTER")?.done).toBe(true);
    expect(items.find((i) => i.key === "SPI")?.done).toBe(true);
    expect(items.find((i) => i.key === "TEAM")?.done).toBe(true);
  });

  it("counts the maturity assessment only when every element was graded locally", () => {
    store.set("usalamasms.maturity", JSON.stringify({ "1.1": 2 }));
    let items = checklistModel({
      scale: { reports: 0, indicators: 0, registerEntries: 0 },
      teamCount: 1,
      role: "SAFETY_MANAGER",
    });
    expect(items.find((i) => i.key === "MATURITY")?.done).toBe(false);

    const answers = {};
    for (const id of [
      "1.1", "1.2", "1.3", "1.4", "1.5", "2.1",
      "2.2", "3.1", "3.2", "3.3", "4.1", "4.2",
    ]) answers[id] = 2;
    store.set("usalamasms.maturity", JSON.stringify(answers));
    items = checklistModel({
      scale: { reports: 0, indicators: 0, registerEntries: 0 },
      teamCount: 1,
      role: "SAFETY_MANAGER",
    });
    expect(items.find((i) => i.key === "MATURITY")?.done).toBe(true);
  });
});
