
"use client";

import { useEffect, useState } from "react";
import * as Astronomy from "astronomy-engine";

import { analyzeHorizonVisibility } from "@/lib/visibility";
import { getLightPollutionFactor } from "@/lib/lightPollution";

import type {
  HorizonProfile,
  ObserverLocation,
} from "@/types/astronomy";

export default function AstronomyTestPage() {
  const [now, setNow] = useState<Date | null>(null);
  const [bortleClass, setBortleClass] = useState(6);

  useEffect(() => {
    const updateTime = () => setNow(new Date());

    updateTime();

    const interval = window.setInterval(updateTime, 60_000);

    return () => window.clearInterval(interval);
  }, []);

  const location: ObserverLocation = {
    latitude: 40.7128,
    longitude: -74.006,
    elevation: 10,
  };

  const horizon: HorizonProfile = {
    points: [
      { azimuth: 0, altitude: 8 },
      { azimuth: 45, altitude: 12 },
      { azimuth: 90, altitude: 5 },
      { azimuth: 135, altitude: 4 },
      { azimuth: 180, altitude: 7 },
      { azimuth: 225, altitude: 18 },
      { azimuth: 270, altitude: 25 },
      { azimuth: 315, altitude: 15 },
    ],
  };

  const bodies = [
    { name: "Sun", body: Astronomy.Body.Sun },
    { name: "Moon", body: Astronomy.Body.Moon },
    { name: "Jupiter", body: Astronomy.Body.Jupiter },
    { name: "Mars", body: Astronomy.Body.Mars },
    { name: "Saturn", body: Astronomy.Body.Saturn },
  ];

  const results = now
    ? bodies.map(({ name, body }) => ({
        name,
        result: analyzeHorizonVisibility(
          body,
          location,
          horizon,
          now,
          bortleClass
        ),
      }))
    : [];

  const lightPollutionFactor = getLightPollutionFactor({
    bortleClass,
  });

  return (
    <main className="min-h-screen bg-slate-950 p-6 text-white sm:p-8">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-3xl font-bold">
          AstroLens Visibility Test
        </h1>

        <p className="mt-3 text-slate-300">
          Test location: New York City
        </p>

        <p className="mt-1 text-slate-400">
          Time: {now ? now.toLocaleString() : "Calculating..."}
        </p>

        <section className="mt-6 rounded-xl border border-slate-700 bg-slate-900 p-5">
          <h2 className="text-xl font-semibold">
            Light Pollution Settings
          </h2>

          <label
            htmlFor="bortle-class"
            className="mt-4 block text-sm text-slate-300"
          >
            Bortle class: {bortleClass}
          </label>

          <select
            id="bortle-class"
            value={bortleClass}
            onChange={(event) =>
              setBortleClass(Number(event.target.value))
            }
            className="mt-2 w-full rounded-lg border border-slate-600 bg-slate-800 p-3 text-white sm:max-w-sm"
          >
            <option value={1}>1 — Exceptionally dark</option>
            <option value={2}>2 — Truly dark</option>
            <option value={3}>3 — Rural sky</option>
            <option value={4}>4 — Rural/suburban transition</option>
            <option value={5}>5 — Suburban sky</option>
            <option value={6}>6 — Bright suburban sky</option>
            <option value={7}>7 — Suburban/urban transition</option>
            <option value={8}>8 — City sky</option>
            <option value={9}>9 — Inner-city sky</option>
          </select>

          <p className="mt-3 text-sm text-slate-400">
            Light-pollution factor: {lightPollutionFactor.toFixed(2)}
          </p>

          <p className="mt-2 text-sm text-slate-400">
            This is a simplified scoring model. The selected Bortle
            class is a test input, not a measured reading for your location.
          </p>
        </section>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {results.map(({ name, result }) => (
            <section
              key={name}
              className="rounded-xl border border-slate-700 bg-slate-900 p-5"
            >
              <h2 className="text-xl font-semibold">{name}</h2>

              <p className="mt-3">
                Altitude: {result.altitude.toFixed(2)}°
              </p>

              <p>
                Azimuth: {result.azimuth.toFixed(2)}°
              </p>

              <p className="mt-3">
                Observing suitability: {result.score}/100
              </p>

              <div
                className="mt-2 h-2 overflow-hidden rounded-full bg-slate-700"
                role="progressbar"
                aria-label={`${name} observing suitability`}
                aria-valuenow={result.score}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full rounded-full bg-indigo-400 transition-all"
                  style={{ width: `${result.score}%` }}
                />
              </div>

              <p className="mt-3 text-sm">
                Horizon status:{" "}
                {result.visible
                  ? "Clears modeled horizon"
                  : "Blocked or below horizon"}
              </p>

              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-300">
                {result.reasons.map((reason, index) => (
                  <li key={`${name}-${index}`}>{reason}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <p className="mt-6 text-sm text-slate-500">
          Note: Horizon clearance indicates geometric visibility above
          the modeled obstruction. It does not guarantee that an object
          is detectable by the naked eye or a telescope. Never look
          directly at the Sun without appropriate certified solar
          observing equipment.
        </p>
      </div>
    </main>
  );
}
