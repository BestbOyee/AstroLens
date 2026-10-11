
"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

import { getObservingRecommendations } from "@/lib/recommendations";
import { astronomicalObjects } from "@/data/objects";
import LocationSelector from "@/components/LocationSelector";
import HorizonEditor from "@/components/HorizonEditor";
import SkyMap from "@/components/SkyMap";
import HorizonScanner, {
  type HorizonScanFrame,
} from "@/components/HorizonScanner";
import type {
  HorizonProfile,
  ObserverLocation,
} from "@/types/astronomy";

export default function RecommendationsPage() {
  const [bortleClass, setBortleClass] = useState(6);
  const [scanFrames, setScanFrames] = useState<HorizonScanFrame[]>([]);
  const [location, setLocation] = useState<ObserverLocation>({
    latitude: 40.7128,
    longitude: -74.006,
    elevation: 10,
  });

  const [horizon, setHorizon] = useState<HorizonProfile>({
    points: [],
  });

  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const initialUpdate = window.setTimeout(() => {
      setNow(new Date());
    }, 0);

    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 60_000);

    return () => {
      window.clearTimeout(initialUpdate);
      window.clearInterval(timer);
    };
  }, []);

  const refreshSky = () => {
    setNow(new Date());
  };

  const recommendations = useMemo(() => {
    if (!now) {
      return [];
    }

    return getObservingRecommendations(
      astronomicalObjects,
      location,
      horizon,
      now,
      bortleClass
    );
  }, [now, bortleClass, location, horizon]);

  const skyMapTargets = useMemo(
    () =>
      recommendations.map((recommendation) => ({
        id: recommendation.object.id,
        name: recommendation.object.name,
        type: recommendation.object.type,
        altitude: recommendation.object.position.altitude,
        azimuth: recommendation.object.position.azimuth,
        score: recommendation.score,
      })),
    [recommendations]
  );

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <header className="space-y-3">
        <p className="text-sm uppercase tracking-widest text-blue-500">
          AstroLens
        </p>

        <h1 className="text-3xl font-bold">
          What Should I Observe?
        </h1>

        <p className="text-gray-600 dark:text-gray-300">
          Discover celestial objects worth observing based on
          their current positions, horizon obstructions,
          darkness, and estimated light-pollution conditions.
        </p>

        <button
          type="button"
          onClick={refreshSky}
          className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        >
          Refresh sky conditions
        </button>

        <p className="text-sm text-gray-500">
          {now
            ? `Last calculated: ${now.toLocaleTimeString()}`
            : "Initializing sky calculations..."}
        </p>
      </header>

      <LocationSelector
        location={location}
        onChange={setLocation}
      />

      <section className="rounded-xl border p-4">
        <label
          htmlFor="bortle"
          className="mb-2 block font-medium"
        >
          Light pollution level
        </label>

        <select
          id="bortle"
          value={bortleClass}
          onChange={(event) =>
            setBortleClass(Number(event.target.value))
          }
          className="rounded-lg border bg-transparent p-2"
        >
          {Array.from(
            { length: 9 },
            (_, index) => index + 1
          ).map((level) => (
            <option key={level} value={level}>
              Bortle {level}
              {level === 1
                ? " — Excellent dark sky"
                : level === 9
                  ? " — Inner-city sky"
                  : ""}
            </option>
          ))}
        </select>

        <p className="mt-2 text-sm text-gray-500">
          Bortle 1 represents the darkest skies; Bortle 9
          represents heavily light-polluted urban skies.
        </p>
      </section>

      <HorizonEditor
        profile={horizon}
        onChange={setHorizon}
      />
          <HorizonScanner
      onScanComplete={(frames) => {
        setScanFrames(frames);
      }}
      onCancel={() => {
        setScanFrames([]);
      }}
    />
    {scanFrames.length > 0 && (
  <section className="space-y-3 rounded-xl border p-4">
    <h2 className="text-lg font-semibold">
      Captured scan frames
    </h2>

    <p className="text-sm text-gray-600 dark:text-gray-300">
      {scanFrames.length} directional frames captured.
      Automatic obstruction detection is the next step.
    </p>

    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {scanFrames.map((frame) => (
        <article
          key={`${frame.azimuth}-${frame.capturedAt}`}
          className="overflow-hidden rounded-lg border"
        >
          <Image
            src={frame.imageDataUrl}
            alt={`Captured skyline at azimuth ${frame.azimuth.toFixed(0)} degrees`}
            className="aspect-video w-full object-cover"
            width={640}
            height={360}
            unoptimized
          />

          <p className="p-2 text-sm">
            {frame.azimuth.toFixed(0)}° azimuth
          </p>
        </article>
      ))}
    </div>
  </section>
)}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-semibold">
            Current sky map
          </h2>

          <span className="text-sm text-gray-500">
            {now
              ? `${recommendations.length} targets`
              : "Calculating..."}
          </span>
        </div>

        {now ? (
          <SkyMap
            targets={skyMapTargets}
            location={location}
            date={now}
          />
        ) : (
          <p className="rounded-xl border p-5">
            Calculating current sky conditions...
          </p>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-semibold">
            Recommended targets
          </h2>

          <span className="text-sm text-gray-500">
            {now
              ? `${recommendations.length} objects`
              : "Calculating..."}
          </span>
        </div>

        {!now ? (
          <p className="rounded-xl border p-5">
            Calculating current sky conditions...
          </p>
        ) : recommendations.length === 0 ? (
          <p className="rounded-xl border p-5">
            No catalog targets are currently recommended under
            your modeled observing conditions. Try refreshing
            later or adjusting your observing settings.
          </p>
        ) : (
          recommendations.map((recommendation, index) => (
            <article
              key={recommendation.object.id}
              className="rounded-xl border p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-gray-500">
                    Rank #{index + 1} ·{" "}
                    {recommendation.object.type}
                  </p>

                  <h3 className="text-lg font-semibold">
                    {recommendation.object.name}
                  </h3>
                </div>

                <div className="text-right">
                  <p className="text-2xl font-bold">
                    {recommendation.score}/100
                  </p>

                  <p className="text-xs text-gray-500">
                    Estimated observing score
                  </p>
                </div>
              </div>

              <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                <div
                  className="h-full rounded-full bg-blue-600"
                  style={{
                    width: `${Math.max(
                      0,
                      Math.min(100, recommendation.score)
                    )}%`,
                  }}
                />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <p>
                  Altitude:{" "}
                  <strong>
                    {recommendation.object.position.altitude.toFixed(1)}°
                  </strong>
                </p>

                <p>
                  Azimuth:{" "}
                  <strong>
                    {recommendation.object.position.azimuth.toFixed(1)}°
                  </strong>
                </p>
              </div>

              <div className="mt-4">
                <h4 className="text-sm font-semibold">
                  Observing conditions
                </h4>

                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-600 dark:text-gray-300">
                  {recommendation.reasons.map(
                    (reason, reasonIndex) => (
                      <li
                        key={`${recommendation.object.id}-${reasonIndex}`}
                      >
                        {reason}
                      </li>
                    )
                  )}
                </ul>
              </div>
            </article>
          ))
        )}
      </section>

      <footer className="border-t pt-4 text-sm text-gray-500">
        <p>
          Observing coordinates:{" "}
          {location.latitude.toFixed(4)}°,{" "}
          {location.longitude.toFixed(4)}°.
          {" "}Elevation: {location.elevation ?? 0} m.
          {" "}Horizon profile:{" "}
          {horizon.points.length === 0
            ? "unobstructed"
            : "customized"}.
          {" "}Scores are preliminary estimates, not guarantees
          of visibility.
        </p>
      </footer>
    </main>
  );
}
