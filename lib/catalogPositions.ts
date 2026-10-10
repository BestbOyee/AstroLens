
import * as Astronomy from "astronomy-engine";

import type {
  AstronomicalObject,
  ObserverLocation,
  PositionedObject,
} from "@/types/astronomy";

import {
  getBodyPosition,
  getDeepSkyPosition,
} from "@/lib/astronomy";

function getAstronomyBody(
  bodyName: string
): Astronomy.Body | null {
  const supportedBodies: Record<string, Astronomy.Body> = {
    Sun: Astronomy.Body.Sun,
    Moon: Astronomy.Body.Moon,
    Mercury: Astronomy.Body.Mercury,
    Venus: Astronomy.Body.Venus,
    Mars: Astronomy.Body.Mars,
    Jupiter: Astronomy.Body.Jupiter,
    Saturn: Astronomy.Body.Saturn,
  };

  return supportedBodies[bodyName] ?? null;
}

export function getCatalogObjectPosition(
  object: AstronomicalObject,
  location: ObserverLocation,
  date: Date = new Date()
): PositionedObject | null {
  if (!object.body) {
    return null;
  }

  const body = getAstronomyBody(object.body);

  if (body === null) {
    return null;
  }

  const position = getBodyPosition(body, location, date);

  return {
    ...object,
    position,
    isAboveHorizon: position.altitude > 0,
  };
}

export function getSolarSystemPositions(
  objects: AstronomicalObject[],
  location: ObserverLocation,
  date: Date = new Date()
): PositionedObject[] {
  return objects
    .map((object) =>
      getCatalogObjectPosition(object, location, date)
    )
    .filter(
      (object): object is PositionedObject => object !== null
    );
}

export function getDeepSkyPositions(
  objects: AstronomicalObject[],
  location: ObserverLocation,
  date: Date = new Date()
): PositionedObject[] {
  return objects
    .map((object) => {
      if (
        object.rightAscension === undefined ||
        object.declination === undefined
      ) {
        return null;
      }

      const position = getDeepSkyPosition(
        object.rightAscension,
        object.declination,
        location,
        date
      );

      return {
        ...object,
        position,
        isAboveHorizon: position.altitude > 0,
      };
    })
    .filter(
      (object): object is PositionedObject => object !== null
    );
}

export function getCatalogPositions(
  objects: AstronomicalObject[],
  location: ObserverLocation,
  date: Date = new Date()
): PositionedObject[] {
  return [
    ...getSolarSystemPositions(objects, location, date),
    ...getDeepSkyPositions(objects, location, date),
  ];
}
