
import type { VisibilityProfile } from "@/types/astronomy";

export const objectProfiles: Record<string, VisibilityProfile> = {
  Sun: {
    magnitude: -26.7,
    minimumUsefulAltitude: 5,
    lightPollutionSensitivity: 0,
  },
  Moon: {
    magnitude: -12.7,
    minimumUsefulAltitude: 5,
    lightPollutionSensitivity: 0.1,
  },
  Mercury: {
    magnitude: -1,
    minimumUsefulAltitude: 10,
    lightPollutionSensitivity: 0.2,
  },
  Venus: {
    magnitude: -4,
    minimumUsefulAltitude: 5,
    lightPollutionSensitivity: 0.1,
  },
  Mars: {
    magnitude: 0,
    minimumUsefulAltitude: 10,
    lightPollutionSensitivity: 0.25,
  },
  Jupiter: {
    magnitude: -2,
    minimumUsefulAltitude: 5,
    lightPollutionSensitivity: 0.15,
  },
  Saturn: {
    magnitude: 1,
    minimumUsefulAltitude: 10,
    lightPollutionSensitivity: 0.3,
  },
  stars: {
    magnitude: 2,
    minimumUsefulAltitude: 15,
    lightPollutionSensitivity: 0.5,
  },
  galaxy: {
    magnitude: 8,
    minimumUsefulAltitude: 25,
    lightPollutionSensitivity: 1,
  },
  nebula: {
    magnitude: 7,
    minimumUsefulAltitude: 25,
    lightPollutionSensitivity: 0.9,
  },
  cluster: {
    magnitude: 6,
    minimumUsefulAltitude: 20,
    lightPollutionSensitivity: 0.7,
  },
};
