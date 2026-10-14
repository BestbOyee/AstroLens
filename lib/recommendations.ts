import type {
  AstronomicalObject,
  HorizonProfile,
  ObserverLocation,
  PositionedObject,
  VisibilityResult,
} from "@/types/astronomy";

import { getCatalogPositions } from "@/lib/catalogPositions";
import { analyzeHorizonVisibility } from "@/lib/visibility";
import { getHorizonAltitude } from "@/lib/horizon";

export interface ObjectRecommendation {
  object: PositionedObject;
  score: number;
  reasons: string[];
}

const HORIZON_CLEARANCE_DEGREES = 2;
function getMagnitudeFactor(
  magnitude: number | undefined,
  type: AstronomicalObject["type"],
): number {
  // Do not penalize objects when magnitude is unknown.
  if (magnitude === undefined || !Number.isFinite(magnitude)) {
    return 1;
  }

  // Magnitude is useful, but total magnitude alone does not
  // accurately predict visibility for extended deep-sky objects.
  if (type === "galaxy" || type === "nebula" || type === "cluster") {
    return 1;
  }

  // Brighter objects have smaller or more negative magnitudes.
  // This is a modest ranking adjustment, not a visibility probability.
  return Math.max(0.5, Math.min(1, 1 - Math.max(0, magnitude) * 0.05));
}
export function getObservingRecommendations(
  objects: AstronomicalObject[],
  location: ObserverLocation,
  horizon: HorizonProfile,
  date: Date = new Date(),
  bortleClass: number = 6,
): ObjectRecommendation[] {
  const positionedObjects = getCatalogPositions(objects, location, date);

  const recommendations: ObjectRecommendation[] = [];

  for (const object of positionedObjects) {
    const { altitude, azimuth } = object.position;

    const obstructionAltitude = getHorizonAltitude(azimuth, horizon);

    const minimumAltitude = obstructionAltitude + HORIZON_CLEARANCE_DEGREES;

    // Objects at or below the natural horizon cannot be observed.
    if (altitude <= 0) {
      continue;
    }

    // Exclude objects that are blocked or too close to an obstruction.
    if (altitude <= minimumAltitude) {
      continue;
    }

    let visibility: VisibilityResult;

    if (object.body) {
      visibility = analyzeHorizonVisibility(
        object.body as import("astronomy-engine").Body,
        location,
        horizon,
        date,
        bortleClass,
      );
    } else {
      // Estimate deep-sky visibility from altitude and
      // sensitivity to light pollution.
      const sensitivity = object.lightPollutionSensitivity ?? 0.7;

      const preferredAltitude = object.bestViewingAltitude ?? 20;

      const altitudeFactor = Math.max(
        0,
        Math.min(
          1,
          (altitude - preferredAltitude) / Math.max(30 - preferredAltitude, 1),
        ),
      );

      const lightPollutionFactor = Math.max(
        0,
        Math.min(1, 1 - ((bortleClass - 1) / 8) * 0.8 * sensitivity),
      );

      // Reduce the estimated score when the object is close
      // to the local obstruction profile.
      const clearance = altitude - obstructionAltitude;

      const obstructionFactor = Math.max(0, Math.min(1, clearance / 15));

      const score = Math.round(
        100 * altitudeFactor * lightPollutionFactor * obstructionFactor,
      );

      visibility = {
        visible: true,
        score,
        altitude,
        azimuth,
        reasons: [],
      };
    }

    const reasons = [...visibility.reasons];
    const magnitudeFactor = getMagnitudeFactor(object.magnitude, object.type);

    const adjustedScore = Math.round(visibility.score * magnitudeFactor);
    if (magnitudeFactor < 1) {
      reasons.push("The ranking accounts for the object's catalog magnitude.");
    }
    const clearance = altitude - obstructionAltitude;

    if (obstructionAltitude > 0) {
      reasons.push(
        `Local horizon obstruction reaches ${obstructionAltitude.toFixed(1)}° in this direction`,
      );
    }

    reasons.push(
      `${clearance.toFixed(1)}° above the local obstruction profile`,
    );

    if (altitude >= 45) {
      reasons.push("Well above the horizon");
    } else if (altitude < 20) {
      reasons.push("Low in the sky; atmospheric interference is greater");
    }

    if (reasons.length === 0) {
      reasons.push("Currently above your modeled horizon");
    }

    recommendations.push({
      object,
      score: adjustedScore,
      reasons,
    });
  }

  return recommendations.sort((a, b) => b.score - a.score);
}
