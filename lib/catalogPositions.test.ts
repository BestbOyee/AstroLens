
import { describe, expect, it } from "vitest";

import { astronomicalObjects } from "@/data/objects";
import {
  getCatalogObjectPosition,
  getSolarSystemPositions,
} from "@/lib/catalogPositions";
import { getCatalogPositions } from "@/lib/catalogPositions";
import type { ObserverLocation } from "@/types/astronomy";

const location: ObserverLocation = {
  latitude: 40.7128,
  longitude: -74.006,
  elevation: 10,
};

const fixedDate = new Date("2026-10-10T20:00:00Z");

describe("catalog positions", () => {
  it("calculates positions for supported solar-system objects", () => {
    const mars = astronomicalObjects.find(
      (object) => object.id === "mars"
    );

    expect(mars).toBeDefined();

    const result = getCatalogObjectPosition(
      mars!,
      location,
      fixedDate
    );

    expect(result).not.toBeNull();
    expect(Number.isFinite(result!.position.altitude)).toBe(true);
    expect(result!.position.azimuth).toBeGreaterThanOrEqual(0);
    expect(result!.position.azimuth).toBeLessThan(360);
  });

  it("does not treat deep-sky objects as solar-system bodies", () => {
    const andromeda = astronomicalObjects.find(
      (object) => object.id === "andromeda"
    );

    expect(andromeda).toBeDefined();

    expect(
      getCatalogObjectPosition(andromeda!, location, fixedDate)
    ).toBeNull();
  });

  it("returns supported catalog objects only", () => {
    const results = getSolarSystemPositions(
      astronomicalObjects,
      location,
      fixedDate
    );

    expect(results.length).toBe(7);
    expect(results.every((object) => object.position)).toBe(true);
  });

it("calculates positions for both planets and deep-sky objects", () => {
  const results = getCatalogPositions(
    astronomicalObjects,
    location,
    fixedDate
  );

  expect(results.length).toBe(10);

  expect(
    results.some((object) => object.id === "mars")
  ).toBe(true);

  expect(
    results.some((object) => object.id === "andromeda")
  ).toBe(true);

  expect(
    results.some((object) => object.id === "orion-nebula")
  ).toBe(true);

  expect(
    results.some((object) => object.id === "pleiades")
  ).toBe(true);
});

});
