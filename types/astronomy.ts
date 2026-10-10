// types/astronomy.ts

/**
 * Geographic location of the observer.
 */
export interface ObserverLocation {
  latitude: number;
  longitude: number;
  elevation?: number;
}

/**
 * Current position of an astronomical object in the sky.
 */
export interface SkyPosition {
  altitude: number;
  azimuth: number;
}

/**
 * Basic information about an astronomical object.
 */


export interface AstronomicalObject {
  id: string;
  name: string;
  type: "star" | "planet" | "galaxy" | "nebula" | "cluster" | "moon";
  magnitude?: number;
  description?: string;
  body?: string;
  bestViewingAltitude?: number;
  lightPollutionSensitivity?: number;

  // Fixed equatorial coordinates for deep-sky objects.
  rightAscension?: number; // Hours, from 0 to 24
  declination?: number; // Degrees, from -90 to +90
}



/**
 * An astronomical object combined with its current
 * position in the observer's sky.
 */
export interface PositionedObject extends AstronomicalObject {
  position: SkyPosition;
  isAboveHorizon: boolean;
}

/**
 * A single point describing an obstruction on the
 * observer's physical horizon.
 *
 * Azimuth:
 * 0   = North
 * 90  = East
 * 180 = South
 * 270 = West
 *
 * Horizon altitude represents how many degrees above
 * the mathematical horizon an obstruction reaches.
 */
export interface HorizonPoint {
  azimuth: number;
  altitude: number;
}

/**
 * A complete horizon profile for the observer.
 */
export interface HorizonProfile {
  points: HorizonPoint[];
}

/**
 * Basic weather conditions relevant to observing.
 */
export interface WeatherConditions {
  cloudCover: number;
  visibility: number;
  humidity: number;
  temperature?: number;
}

/**
 * Moon conditions that can affect astronomical visibility.
 */
export interface MoonConditions {
  altitude: number;
  azimuth: number;
  illumination: number;
  phase: string;
}

/**
 * Telescope specifications.
 */
export interface Telescope {
  id: string;
  name: string;
  type: string;
  aperture: number;
  focalLength: number;
  description?: string;
}

/**
 * Result of AstroLens's visibility analysis.
 */
export interface VisibilityResult {
  visible: boolean;
  score: number;
  reasons: string[];
  altitude: number;
  azimuth: number;
}
export interface LightPollutionConditions {
  bortleClass: number;
}

export interface VisibilityProfile {
  magnitude: number;
  minimumUsefulAltitude: number;
  lightPollutionSensitivity: number;
}
