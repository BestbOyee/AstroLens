
import * as Astronomy from "astronomy-engine";

import type {
  AstronomicalObject,
  ObserverLocation,
  PositionedObject,
} from "@/types/astronomy";

export function getDeepSkyObjectPosition(
  object: AstronomicalObject,
  location: ObserverLocation,
  date: Date = new Date()
): PositionedObject | null {
  if (
    object.rightAscension === undefined ||
    object.declination === undefined
  ) {
    return null;
  }

  const observer = new Astronomy.Observer(
    location.latitude,
    location.longitude,
    location.elevation ?? 0
  );

  const horizontal = Astronomy.Horizon(
    date,
    observer,
    object.rightAscension,
    object.declination,
    "normal"
  );

  const position = {
    altitude: horizontal.altitude,
    azimuth: ((horizontal.azimuth % 360) + 360) % 360,
  };

  return {
    ...object,
    position,
    isAboveHorizon: position.altitude > 0,
  };
}
