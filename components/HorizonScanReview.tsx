"use client";

import { useMemo, useState } from "react";
import type { HorizonScanFrame } from "@/components/HorizonScanner";

export interface ReviewedHorizonMeasurement {
  azimuth: number;
  altitude: number;
}

interface HorizonScanReviewProps {
  frames: HorizonScanFrame[];
  onSave: (measurements: ReviewedHorizonMeasurement[]) => void;
  onDiscard?: () => void;
}

function normalizeAzimuth(value: number): number {
  return ((value % 360) + 360) % 360;
}

function direction(azimuth: number): string {
  const labels = [
    "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
    "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
  ];
  return labels[Math.round(normalizeAzimuth(azimuth) / 22.5) % 16];
}

/**
 * The image analysis does not establish true altitude. This component asks
 * the user to review the skyline and enter a measured/known altitude manually.
 * It deliberately does not convert image-relative angles into horizon data.
 */
export default function HorizonScanReview({
  frames,
  onSave,
  onDiscard,
}: HorizonScanReviewProps) {
  const [altitudes, setAltitudes] = useState<Record<string, string>>({});

  const sortedFrames = useMemo(
    () => [...frames].sort((a, b) => a.azimuth - b.azimuth),
    [frames],
  );

  const measurements = sortedFrames.flatMap((frame) => {
    const raw = altitudes[frame.capturedAt];
    if (raw === undefined || raw.trim() === "") return [];

    const altitude = Number(raw);
    if (!Number.isFinite(altitude) || altitude < -10 || altitude > 90) {
      return [];
    }

    return [{ azimuth: normalizeAzimuth(frame.azimuth), altitude }];
  });

  const invalidCount = sortedFrames.filter((frame) => {
    const raw = altitudes[frame.capturedAt];
    if (raw === undefined || raw.trim() === "") return false;
    const value = Number(raw);
    return !Number.isFinite(value) || value < -10 || value > 90;
  }).length;

  return (
    <section className="space-y-4 rounded-xl border p-3 sm:p-5">
      <div>
        <h3 className="text-lg font-semibold">Review horizon measurements</h3>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          The scan identifies the skyline in each image, but it does not know
          the camera&apos;s calibrated vertical field of view or true camera
          elevation. Enter an altitude only when you can verify it independently.
          These values—not the image-relative angle—will be added to your horizon
          profile.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {sortedFrames.map((frame, index) => {
          const analysis = frame.obstruction;
          const value = altitudes[frame.capturedAt] ?? "";

          return (
            <article
              key={`${frame.capturedAt}-${index}`}
              className="overflow-hidden rounded-lg border"
            >
              <img
                src={frame.imageDataUrl}
                alt={`Captured skyline at ${Math.round(frame.azimuth)} degrees`}
                className="aspect-video w-full bg-black object-cover"
              />
              <div className="space-y-2 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">
                    {direction(frame.azimuth)} · {Math.round(frame.azimuth)}°
                  </p>
                  <span className="text-xs text-gray-500">
                    {analysis
                      ? `${analysis.obstructionPercent}% image obstruction`
                      : "Analysis unavailable"}
                  </span>
                </div>
                <label className="block text-sm">
                  <span className="mb-1 block text-gray-600 dark:text-gray-300">
                    Verified skyline altitude (degrees)
                  </span>
                  <input
                    type="number"
                    min="-10"
                    max="90"
                    step="0.5"
                    inputMode="decimal"
                    value={value}
                    onChange={(event) =>
                      setAltitudes((current) => ({
                        ...current,
                        [frame.capturedAt]: event.target.value,
                      }))
                    }
                    placeholder="Leave blank to skip"
                    className="min-h-11 w-full rounded-lg border bg-transparent px-3 py-2"
                  />
                </label>
                {value.trim() !== "" &&
                  (!Number.isFinite(Number(value)) ||
                    Number(value) < -10 ||
                    Number(value) > 90) && (
                    <p className="text-xs text-red-600">
                      Enter an altitude from -10° to 90°.
                    </p>
                  )}
                <p className="text-xs text-gray-500">
                  Image-relative angle:{" "}
                  {analysis?.estimatedSkylineAngleDegrees == null
                    ? "unavailable"
                    : `~${analysis.estimatedSkylineAngleDegrees.toFixed(1)}°`}
                  {" · "}not calibrated
                </p>
              </div>
            </article>
          );
        })}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {measurements.length} of {frames.length} directions ready to save.
          {invalidCount > 0 ? ` ${invalidCount} invalid value(s).` : ""}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          {onDiscard && (
            <button
              type="button"
              onClick={onDiscard}
              className="min-h-11 rounded-lg border px-4 py-2 text-sm font-medium"
            >
              Discard scan
            </button>
          )}
          <button
            type="button"
            disabled={measurements.length === 0 || invalidCount > 0}
            onClick={() => onSave(measurements)}
            className="min-h-11 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save {measurements.length} measurement(s)
          </button>
        </div>
      </div>
    </section>
  );
}
