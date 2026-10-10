
import { describe, expect, it } from "vitest";
import { getHorizonAltitude } from "@/lib/horizon";
import type { HorizonProfile } from "@/types/astronomy";

const sampleHorizon: HorizonProfile = {
  points: [
    { azimuth: 0, altitude: 8 },
    { azimuth: 45, altitude: 12 },
    { azimuth: 90, altitude: 4 },
    { azimuth: 135, altitude: 4 },
    { azimuth: 180, altitude: 7 },
    { azimuth: 225, altitude: 18 },
    { azimuth: 270, altitude: 25 },
    { azimuth: 315, altitude: 15 },
  ],
};

describe("getHorizonAltitude", () => {
  it("returns the altitude at an exact azimuth", () => {
    expect(getHorizonAltitude(0, sampleHorizon)).toBe(8);
    expect(getHorizonAltitude(90, sampleHorizon)).toBe(4);
  });

  it("interpolates between adjacent points", () => {
    expect(getHorizonAltitude(22.5, sampleHorizon)).toBe(10);
  });

  it("handles azimuths that wrap around north", () => {
    expect(getHorizonAltitude(337.5, sampleHorizon)).toBe(11.5);
  });

  it("normalizes azimuths outside 0–360 degrees", () => {
    expect(getHorizonAltitude(360, sampleHorizon)).toBe(8);
    expect(getHorizonAltitude(-45, sampleHorizon)).toBe(15);
  });

  it("returns zero for an empty horizon profile", () => {
    expect(
      getHorizonAltitude(180, { points: [] })
    ).toBe(0);
  });

  it("rejects invalid horizon altitudes", () => {
    expect(() =>
      getHorizonAltitude(90, {
        points: [{ azimuth: 90, altitude: 95 }],
      })
    ).toThrow();
  });
});
