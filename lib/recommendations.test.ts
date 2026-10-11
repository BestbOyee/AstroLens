
import { describe, it, expect } from "vitest";

import { getObservingRecommendations } from "@/lib/recommendations";
import type {
  AstronomicalObject,
  HorizonProfile,
  ObserverLocation,
} from "@/types/astronomy";

describe("getObservingRecommendations", () => {
  const location: ObserverLocation = {
    latitude: 40.7128,
    longitude: -74.006,
    elevation: 10,
  };

  const horizon: HorizonProfile = {
    points: [],
  };

  const fixedDate = new Date("2026-10-10T02:00:00Z");

  const objects: AstronomicalObject[] = [
    {
      id: "mars",
      name: "Mars",
      type: "planet",
      body: "Mars",
      bestViewingAltitude: 10,
      lightPollutionSensitivity: 0.25,
    },
    {
      id: "andromeda",
      name: "Andromeda Galaxy",
      type: "galaxy",
      rightAscension: 0.712,
      declination: 41.27,
      bestViewingAltitude: 25,
      lightPollutionSensitivity: 1,
    },
  ];

  it("returns recommendations in descending score order", () => {
    const results = getObservingRecommendations(
      objects,
      location,
      horizon,
      fixedDate,
      6
    );

    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(
        results[i].score
      );
    }
  });

  it("only recommends objects above the horizon", () => {
    const results = getObservingRecommendations(
      objects,
      location,
      horizon,
      fixedDate,
      6
    );

    for (const result of results) {
      expect(result.object.position.altitude).toBeGreaterThan(0);
    }
  });

  it("returns a reasons array for every recommendation", () => {
    const results = getObservingRecommendations(
      objects,
      location,
      horizon,
      fixedDate,
      6
    );

    for (const result of results) {
      expect(Array.isArray(result.reasons)).toBe(true);
      expect(result.reasons.length).toBeGreaterThan(0);
    }
  });

  it("returns an empty array when the catalog is empty", () => {
    const results = getObservingRecommendations(
      [],
      location,
      horizon,
      fixedDate,
      6
    );

    expect(results).toEqual([]);
  });
});
