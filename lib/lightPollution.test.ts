
import { describe, expect, it } from "vitest";
import { getLightPollutionFactor } from "@/lib/lightPollution";

describe("getLightPollutionFactor", () => {
  it("returns 1 for Bortle class 1", () => {
    expect(getLightPollutionFactor({ bortleClass: 1 })).toBe(1);
  });

  it("returns 0.6 for Bortle class 5", () => {
    expect(getLightPollutionFactor({ bortleClass: 5 })).toBe(0.6);
  });

  it("returns 0.2 for Bortle class 9", () => {
    expect(getLightPollutionFactor({ bortleClass: 9 })).toBeCloseTo(0.2);
  });

  it("returns lower factors for brighter skies", () => {
    const dark = getLightPollutionFactor({ bortleClass: 2 });
    const suburban = getLightPollutionFactor({ bortleClass: 6 });
    const city = getLightPollutionFactor({ bortleClass: 9 });

    expect(dark).toBeGreaterThan(suburban);
    expect(suburban).toBeGreaterThan(city);
  });

  it("rejects invalid Bortle classes", () => {
    expect(() =>
      getLightPollutionFactor({ bortleClass: 0 })
    ).toThrow();

    expect(() =>
      getLightPollutionFactor({ bortleClass: 10 })
    ).toThrow();

    expect(() =>
      getLightPollutionFactor({ bortleClass: 2.5 })
    ).toThrow();
  });
});
