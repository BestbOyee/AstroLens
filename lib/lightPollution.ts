
import type { LightPollutionConditions } from "@/types/astronomy";

/**
 * Returns an estimated 0–1 darkness factor.
 * This is a preliminary heuristic, not measured sky brightness.
 */
export function getLightPollutionFactor(
  conditions: LightPollutionConditions
): number {
  const { bortleClass } = conditions;

  if (
    !Number.isInteger(bortleClass) ||
    bortleClass < 1 ||
    bortleClass > 9
  ) {
    throw new Error("Bortle class must be an integer from 1 to 9.");
  }

  // Darker locations receive a higher factor.
  return 1 - ((bortleClass - 1) / 8) * 0.8;
}
