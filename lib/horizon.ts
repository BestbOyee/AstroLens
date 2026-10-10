
import type { HorizonPoint, HorizonProfile } from "@/types/astronomy";

/**
 * Normalize an azimuth to the range [0, 360).
 *
 * 0° = North, 90° = East, 180° = South, 270° = West.
 */
function normalizeAzimuth(azimuth: number): number {
  return ((azimuth % 360) + 360) % 360;
}

/**
 * Estimate the obstruction altitude at a given azimuth.
 *
 * Uses linear interpolation between measured horizon points.
 * Interpolation wraps around from 360° back to 0°.
 *
 * @param azimuth Direction to check, in degrees.
 * @param profile User's measured horizon profile.
 * @returns Obstruction altitude in degrees.
 */
export function getHorizonAltitude(
  azimuth: number,
  profile: HorizonProfile
): number {
  if (!Number.isFinite(azimuth)) {
    throw new Error("Azimuth must be a finite number.");
  }

  if (profile.points.length === 0) {
    return 0;
  }

  const points = profile.points;

  for (const point of points) {
    if (
      !Number.isFinite(point.azimuth) ||
      !Number.isFinite(point.altitude) ||
      point.altitude < 0 ||
      point.altitude > 90
    ) {
      throw new Error(
        "Horizon points must have finite azimuths and altitudes between 0° and 90°."
      );
    }
  }

  const sorted: HorizonPoint[] = [...points]
    .map((point) => ({
      azimuth: normalizeAzimuth(point.azimuth),
      altitude: point.altitude,
    }))
    .sort((a, b) => a.azimuth - b.azimuth);

  // Reject duplicate directions, including 0° and 360°.
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].azimuth === sorted[i - 1].azimuth) {
      throw new Error("Horizon points must have unique azimuths.");
    }
  }

  const target = normalizeAzimuth(azimuth);

  // A single measurement defines a constant horizon.
  if (sorted.length === 1) {
    return sorted[0].altitude;
  }

  // Return exact measurements without interpolation.
  const exact = sorted.find((point) => point.azimuth === target);
  if (exact) {
    return exact.altitude;
  }

  // Find the two measurements surrounding the target.
  for (let i = 0; i < sorted.length; i++) {
    const left = sorted[i];
    const right = sorted[(i + 1) % sorted.length];

    const adjustedTarget =
      target < left.azimuth ? target + 360 : target;

    const adjustedRight =
      right.azimuth <= left.azimuth
        ? right.azimuth + 360
        : right.azimuth;

    if (
      adjustedTarget > left.azimuth &&
      adjustedTarget < adjustedRight
    ) {
      const fraction =
        (adjustedTarget - left.azimuth) /
        (adjustedRight - left.azimuth);

      return (
        left.altitude +
        fraction * (right.altitude - left.altitude)
      );
    }
  }

  // Defensive fallback; valid profiles should return earlier.
  return 0;
}
