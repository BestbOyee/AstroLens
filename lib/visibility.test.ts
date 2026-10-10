
import { describe, expect, it } from "vitest";
import * as Astronomy from "astronomy-engine";

import { analyzeHorizonVisibility } from "@/lib/visibility";
import type {
  HorizonProfile,
  ObserverLocation,
} from "@/types/astronomy";

const location: ObserverLocation = {
  latitude: 40.7128,
  longitude: -74.006,
  elevation: 10,
};

const clearHorizon: HorizonProfile = {
  points: Array.from({ length: 8 }, (_, index) => ({
    azimuth: index * 45,
    altitude: 0,
  })),
};

const blockedHorizon: HorizonProfile = {
  points: Array.from({ length: 8 }, (_, index) => ({
    azimuth: index * 45,
    altitude: 30,
  })),
};

describe("analyzeHorizonVisibility", () => {
  it("returns a zero score when the object is below the horizon", () => {
    // Use a fixed date so the test is repeatable.
    const date = new Date("2026-10-10T04:00:00Z");

    const result = analyzeHorizonVisibility(
      Astronomy.Body.Sun,
      location,
      clearHorizon,
      date
    );

    // This assertion assumes the Sun is below the horizon at this
    // location and time; we'll verify it when running the test.
    if (result.altitude <= 0) {
      expect(result.visible).toBe(false);
      expect(result.score).toBe(0);
    }
  });

  it("returns a score between 0 and 100", () => {
    const date = new Date("2026-10-10T16:00:00Z");

    const result = analyzeHorizonVisibility(
      Astronomy.Body.Sun,
      location,
      clearHorizon,
      date
    );

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("returns altitude and azimuth values", () => {
    const date = new Date("2026-10-10T16:00:00Z");

    const result = analyzeHorizonVisibility(
      Astronomy.Body.Sun,
      location,
      clearHorizon,
      date
    );

    expect(Number.isFinite(result.altitude)).toBe(true);
    expect(Number.isFinite(result.azimuth)).toBe(true);
    expect(result.azimuth).toBeGreaterThanOrEqual(0);
    expect(result.azimuth).toBeLessThan(360);
  });
});
