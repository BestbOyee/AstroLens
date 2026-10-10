
import * as Astronomy from "astronomy-engine";
import type {
  ObserverLocation,
  SkyPosition,
} from "@/types/astronomy";

/**
 * Convert a celestial body's position into altitude and azimuth
 * for a particular observer and time.
 *
 * Altitude:
 *   0° = horizon
 *  90° = directly overhead
 * Below 0° = below the mathematical horizon
 *
 * Azimuth:
 *   0° = North
 *  90° = East
 * 180° = South
 * 270° = West
 */
export function getBodyPosition(
  body: Astronomy.Body,
  location: ObserverLocation,
  date: Date = new Date()
): SkyPosition {
  const observer = new Astronomy.Observer(
    location.latitude,
    location.longitude,
    location.elevation ?? 0
  );

  const equatorial = Astronomy.Equator(
    body,
    date,
    observer,
    true,
    true
  );

  const horizontal = Astronomy.Horizon(
    date,
    observer,
    equatorial.ra,
    equatorial.dec,
    "normal"
  );

  return {
    altitude: horizontal.altitude,
    azimuth: ((horizontal.azimuth % 360) + 360) % 360,
  };
}

/**
 * Convert fixed equatorial coordinates into local horizontal
 * coordinates for an observer and date.
 *
 * Right ascension is in hours; declination is in degrees.
 */
export function getDeepSkyPosition(
  rightAscension: number,
  declination: number,
  location: ObserverLocation,
  date: Date = new Date()
): SkyPosition {
  if (
    !Number.isFinite(rightAscension) ||
    rightAscension < 0 ||
    rightAscension >= 24
  ) {
    throw new Error("Right ascension must be in the range [0, 24).");
  }

  if (
    !Number.isFinite(declination) ||
    declination < -90 ||
    declination > 90
  ) {
    throw new Error("Declination must be between -90° and +90°.");
  }

  const observer = new Astronomy.Observer(
    location.latitude,
    location.longitude,
    location.elevation ?? 0
  );

  const horizontal = Astronomy.Horizon(
    date,
    observer,
    rightAscension,
    declination,
    "normal"
  );

  return {
    altitude: horizontal.altitude,
    azimuth: ((horizontal.azimuth % 360) + 360) % 360,
  };
}

