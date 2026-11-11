
"use client";

import Image from "next/image";
import { useState } from "react";

import HorizonEditor from "@/components/HorizonEditor";
import HorizonScanner, {
  type HorizonScanFrame,
} from "@/components/HorizonScanner";
import WeatherPanel from "@/components/WeatherPanel";
import { useCurrentWeather } from "@/hooks/useCurrentWeather";
import { useObservatory } from "@/context/ObservatoryContext";

export default function RecommendationsPage() {
  const {
    location,
    horizon,
    setHorizon,
    bortleClass,
    setBortleClass,
  } = useObservatory();

  const [scanFrames, setScanFrames] = useState<HorizonScanFrame[]>([]);

  const {
    weather,
    loading: weatherLoading,
    error: weatherError,
    lastUpdated: weatherLastUpdated,
  } = useCurrentWeather(
    location.latitude,
    location.longitude
  );

  return (
    <main className="mx-auto w-full max-w-4xl space-y-5 px-4 py-5 sm:px-6 sm:py-8">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-500">
          AstroLens Observatory
        </p>

        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Observe
        </h1>

        <p className="max-w-2xl text-sm leading-relaxed text-gray-600 dark:text-gray-300 sm:text-base">
          Configure your observing conditions and scan your
          surroundings to help AstroLens determine which
          celestial objects are actually visible.
        </p>
      </header>

      <section className="rounded-xl border border-sky-900/30 bg-sky-950/10 p-4">
        <h2 className="font-semibold">Your observing profile</h2>

        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          These settings are shared with the Sky page.
        </p>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-gray-500">Latitude</p>
            <p className="font-semibold tabular-nums">
              {location.latitude.toFixed(4)}°
            </p>
          </div>

          <div>
            <p className="text-xs text-gray-500">Longitude</p>
            <p className="font-semibold tabular-nums">
              {location.longitude.toFixed(4)}°
            </p>
          </div>
        </div>

        <div className="mt-3">
          <label htmlFor="bortle" className="mb-2 block text-sm font-medium">
            Light pollution level
          </label>

          <select
            id="bortle"
            value={bortleClass}
            onChange={(event) =>
              setBortleClass(Number(event.target.value))
            }
            className="min-h-11 w-full rounded-lg border bg-transparent px-3 py-2 text-base"
          >
            {Array.from({ length: 9 }, (_, index) => index + 1).map(
              (level) => (
                <option key={level} value={level}>
                  Bortle {level}
                  {level === 1
                    ? " — Excellent dark sky"
                    : level === 9
                      ? " — Inner-city sky"
                      : ""}
                </option>
              )
            )}
          </select>

          <p className="mt-2 text-xs text-gray-500">
            Bortle 1 represents the darkest skies; Bortle 9
            represents heavily light-polluted urban skies.
          </p>
        </div>
      </section>

      <WeatherPanel
        weather={weather}
        loading={weatherLoading}
        error={weatherError}
        lastUpdated={weatherLastUpdated}
      />

      <section className="space-y-3">
        <div>
          <h2 className="text-xl font-semibold">
            Map your horizon
          </h2>

          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
            Use the camera scanner for automatic estimates,
            or adjust obstruction heights manually.
          </p>
        </div>

        <HorizonScanner
          onScanComplete={(frames) => {
            setScanFrames(frames);
          }}
          onCancel={() => {
            setScanFrames([]);
          }}
        />
      </section>

      <details className="rounded-xl border p-4">
        <summary className="cursor-pointer font-semibold">
          Manually edit horizon obstructions
        </summary>

        <div className="mt-4">
          <HorizonEditor
            profile={horizon}
            onChange={setHorizon}
          />
        </div>
      </details>

      {scanFrames.length > 0 && (
        <section className="space-y-3 rounded-xl border p-4">
          <div>
            <h2 className="text-lg font-semibold">
              Completed scan
            </h2>

            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              {scanFrames.length} directional images captured.
              Review the individual obstruction estimates in
              the scanner above.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {scanFrames.map((frame) => (
              <article
                key={`${frame.azimuth}-${frame.capturedAt}`}
                className="overflow-hidden rounded-lg border"
              >
                <Image
                  src={frame.imageDataUrl}
                  alt={`Skyline at ${frame.azimuth.toFixed(0)} degrees`}
                  className="aspect-video w-full object-cover"
                  width={640}
                  height={360}
                  unoptimized
                />

                <div className="p-2">
                  <p className="text-sm font-medium">
                    {frame.azimuth.toFixed(0)}°
                  </p>

                  {frame.obstruction && (
                    <p className="text-xs text-gray-500">
                      {frame.obstruction.obstructionPercent}% image obstruction
                    </p>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <footer className="border-t pt-4 text-xs text-gray-500">
        Your horizon profile currently contains{" "}
        {horizon.points.length} manually defined points.
        Scanner estimates and manually entered values are
        not yet automatically merged into the horizon profile.
      </footer>
    </main>
  );
}
