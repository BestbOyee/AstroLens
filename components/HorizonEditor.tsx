
"use client";

import {
  getHorizonAltitude,
} from "@/lib/horizon";
import type {
  HorizonPoint,
  HorizonProfile,
} from "@/types/astronomy";

interface HorizonEditorProps {
  profile: HorizonProfile;
  onChange: (profile: HorizonProfile) => void;
}

const DIRECTIONS = [
  { label: "N", azimuth: 0 },
  { label: "NE", azimuth: 45 },
  { label: "E", azimuth: 90 },
  { label: "SE", azimuth: 135 },
  { label: "S", azimuth: 180 },
  { label: "SW", azimuth: 225 },
  { label: "W", azimuth: 270 },
  { label: "NW", azimuth: 315 },
];

export default function HorizonEditor({
  profile,
  onChange,
}: HorizonEditorProps) {
  function getValue(azimuth: number): number {
    return getHorizonAltitude(azimuth, profile);
  }

  function updateDirection(
    azimuth: number,
    value: number
  ) {
    const altitude = Math.max(
      0,
      Math.min(90, Number.isFinite(value) ? value : 0)
    );

    // Preserve the currently interpolated values at the other
    // compass directions when the user edits one direction.
    const updatedPoints: HorizonPoint[] = DIRECTIONS.map(
      (direction) => ({
        azimuth: direction.azimuth,
        altitude:
          direction.azimuth === azimuth
            ? altitude
            : getValue(direction.azimuth),
      })
    );

    onChange({ points: updatedPoints });
  }

  function resetHorizon() {
    onChange({ points: [] });
  }

  return (
    <section className="space-y-4 rounded-xl border p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">
            Horizon obstructions
          </h2>

          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
            Estimate how many degrees above the natural horizon
            trees, buildings, or hills block each direction.
          </p>
        </div>

        <button
          type="button"
          onClick={resetHorizon}
          className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          Reset to clear horizon
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {DIRECTIONS.map((direction) => {
          const altitude = getValue(direction.azimuth);

          return (
            <div
              key={direction.azimuth}
              className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900"
            >
              <div className="mb-2 flex items-center justify-between gap-3">
                <label
                  htmlFor={`horizon-${direction.azimuth}`}
                  className="font-medium"
                >
                  {direction.label}
                  <span className="ml-2 text-xs text-gray-500">
                    {direction.azimuth}°
                  </span>
                </label>

                <span className="text-sm font-semibold tabular-nums">
                  {altitude.toFixed(0)}°
                </span>
              </div>

              <input
                id={`horizon-${direction.azimuth}`}
                type="range"
                min={0}
                max={45}
                step={1}
                value={Math.min(45, altitude)}
                onChange={(event) =>
                  updateDirection(
                    direction.azimuth,
                    Number(event.target.value)
                  )
                }
                className="w-full accent-blue-600"
                aria-label={`Horizon obstruction toward ${direction.label}`}
              />

              <div className="mt-2 flex items-center gap-2">
                <label
                  htmlFor={`horizon-number-${direction.azimuth}`}
                  className="text-xs text-gray-500"
                >
                  Exact altitude
                </label>

                <input
                  id={`horizon-number-${direction.azimuth}`}
                  type="number"
                  min={0}
                  max={90}
                  step={1}
                  value={altitude}
                  onChange={(event) => {
                    const rawValue = event.target.value;

                    if (rawValue === "") {
                      return;
                    }

                    const value = Number(rawValue);

                    if (
                      Number.isFinite(value) &&
                      value >= 0 &&
                      value <= 90
                    ) {
                      updateDirection(
                        direction.azimuth,
                        value
                      );
                    }
                  }}
                  className="w-20 rounded-md border bg-transparent px-2 py-1 text-sm"
                />

                <span className="text-xs text-gray-500">
                  0°–90°
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-lg border border-blue-200 p-3 text-sm dark:border-blue-900">
        <p className="font-medium">How to use this</p>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-gray-600 dark:text-gray-300">
          <li>
            0° means the natural horizon is unobstructed.
          </li>
          <li>
            10° means objects lower than 10° in that direction
            may be blocked.
          </li>
          <li>
            Use the compass direction you face when measuring
            an obstruction.
          </li>
        </ul>
      </div>
    </section>
  );
}
