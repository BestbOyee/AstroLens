
import * as Astronomy from "astronomy-engine";
import type { Body } from "astronomy-engine";
import {objectProfiles} from "@/lib/objectProfiles";
import type {
  HorizonProfile,
  ObserverLocation,
  VisibilityResult,
} from "@/types/astronomy";

import { getBodyPosition } from "@/lib/astronomy";
import { getHorizonAltitude } from "@/lib/horizon";
import { getLightPollutionFactor } from "@/lib/lightPollution";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getDarknessFactor(sunAltitude: number): number {
  if (sunAltitude >= 0) return 0.15;
  if (sunAltitude <= -18) return 1;

  return 0.15 + (Math.abs(sunAltitude) / 18) * 0.85;
}

export function analyzeHorizonVisibility(
  body: Body,
  location: ObserverLocation,
  horizon: HorizonProfile,
  date: Date = new Date(),
  bortleClass: number = 6
): VisibilityResult {
  const position = getBodyPosition(body, location, date);

  const obstructionAltitude = getHorizonAltitude(
    position.azimuth,
    horizon
  );

  const aboveMathematicalHorizon = position.altitude > 0;
  const clearsObstruction = position.altitude > obstructionAltitude;

  const reasons: string[] = [];

  if (!aboveMathematicalHorizon) {
    reasons.push("Object is below the mathematical horizon.");
  } else if (!clearsObstruction) {
    reasons.push(
      `Object is blocked by an obstruction reaching ${obstructionAltitude.toFixed(1)}°.`
    );
  } else {
    reasons.push("Object clears the modeled horizon obstruction.");
  }

  if (!aboveMathematicalHorizon || !clearsObstruction) {
    return {
      visible: false,
      score: 0,
      reasons,
      altitude: position.altitude,
      azimuth: position.azimuth,
    };
  }

  const bodyName = Astronomy.Body[body];

const profile =
  objectProfiles[bodyName] ?? objectProfiles.stars;

const altitudeFactor = clamp(
  (position.altitude - profile.minimumUsefulAltitude) /
    Math.max(30 - profile.minimumUsefulAltitude, 1),
  0,
  1
);

  let darknessFactor = 1;

  if (body !== Astronomy.Body.Sun) {
    const sunPosition = getBodyPosition(
      Astronomy.Body.Sun,
      location,
      date
    );

    darknessFactor = getDarknessFactor(sunPosition.altitude);

    if (sunPosition.altitude >= 0) {
      reasons.push(
        "The Sun is above the horizon; daylight may hinder observing."
      );
    } else if (sunPosition.altitude > -18) {
      reasons.push("Twilight may reduce visibility.");
    } else {
      reasons.push("The Sun is below astronomical twilight.");
    }
  }

  if (position.altitude < 10) {
    reasons.push(
      "The object is low in the sky; atmospheric effects may reduce clarity."
    );
  }

  const baseLightPollutionFactor =
  getLightPollutionFactor({ bortleClass });

const lightPollutionFactor =
  body === Astronomy.Body.Sun
    ? 1
    : 1 -
      (1 - baseLightPollutionFactor) *
        profile.lightPollutionSensitivity;

  if (body !== Astronomy.Body.Sun) {
    reasons.push(
      `Light-pollution adjustment: Bortle class ${bortleClass}.`
    );
  }

  const score = Math.round(
    100 *
      altitudeFactor *
      darknessFactor *
      lightPollutionFactor
  );

  if (score >= 70) {
    reasons.push(
      "Estimated conditions are favorable based on altitude, darkness, and light pollution."
    );
  } else if (score >= 35) {
    reasons.push("Estimated observing conditions are moderate.");
  } else {
    reasons.push(
      "Estimated observing conditions are poor based on altitude, darkness, and light pollution."
    );
  }

  return {
    visible: true,
    score,
    reasons,
    altitude: position.altitude,
    azimuth: position.azimuth,
  };
}
