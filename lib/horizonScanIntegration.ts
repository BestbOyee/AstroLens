export interface HorizonPoint {
    azimuth: number;
    altitude: number;
  }
  
  export interface HorizonProfileLike {
    points: HorizonPoint[];
  }
  
  export interface HorizonMeasurement {
    azimuth: number;
    altitude: number;
  }
  
  function normalizeAzimuth(value: number): number {
    return ((value % 360) + 360) % 360;
  }
  
  function angularDifference(a: number, b: number): number {
    const difference = Math.abs(normalizeAzimuth(a) - normalizeAzimuth(b));
    return Math.min(difference, 360 - difference);
  }
  
  /**
   * Merges explicitly reviewed altitude measurements into an existing profile.
   * Existing points are retained except where a new measurement is within
   * half of a 15-degree scan sector (7.5 degrees) of that point.
   *
   * Important: pass only verified altitude values. Do not pass
   * ObstructionAnalysis.estimatedSkylineAngleDegrees; that value is relative
   * to the image and is not a calibrated altitude above the horizon.
   */
  export function mergeReviewedHorizonMeasurements<T extends HorizonProfileLike>(
    current: T,
    measurements: HorizonMeasurement[],
  ): T {
    const validMeasurements = measurements.filter(
      (measurement) =>
        Number.isFinite(measurement.azimuth) &&
        Number.isFinite(measurement.altitude) &&
        measurement.altitude >= -10 &&
        measurement.altitude <= 90,
    );
  
    const retainedPoints = current.points.filter(
      (existing) =>
        !validMeasurements.some(
          (measurement) =>
            angularDifference(existing.azimuth, measurement.azimuth) <= 7.5,
        ),
    );
  
    const merged = [
      ...retainedPoints,
      ...validMeasurements.map((measurement) => ({
        azimuth: normalizeAzimuth(measurement.azimuth),
        altitude: measurement.altitude,
      })),
    ].sort((a, b) => a.azimuth - b.azimuth);
  
    return { ...current, points: merged } as T;
  }
  