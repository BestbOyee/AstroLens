
"use client";

import { useEffect, useMemo, useState } from "react";

import { astronomicalObjects } from "@/data/objects";
import { getObservingRecommendations } from "@/lib/recommendations";
import { useObservatory } from "@/context/ObservatoryContext";
import { useCurrentWeather } from "@/hooks/useCurrentWeather";
import SkyMap from "@/components/SkyMap";

export default function SkyPage() {
  const {
    location,
    horizon,
    bortleClass,
  } = useObservatory();

  const [now, setNow] = useState<Date | null>(null);

  const {
    weather,
    loading: weatherLoading,
    error: weatherError,
  } = useCurrentWeather(
    location.latitude,
    location.longitude
  );

  useEffect(() => {
    setNow(new Date());

    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 60_000);

    return () => window.clearInterval(timer);
  }, []);

  const baseRecommendations = useMemo(() => {
    if (!now) return [];

    return getObservingRecommendations(
      astronomicalObjects,
      location,
      horizon,
      now,
      bortleClass
    );
  }, [now, location, horizon, bortleClass]);

  const recommendations = useMemo(() => {
    if (!weather) return baseRecommendations;

    const cloudFactor = Math.max(
      0.15,
      1 - (weather.cloudCover / 100) * 0.85
    );

    return baseRecommendations.map((recommendation) => ({
      ...recommendation,
      score: Math.round(recommendation.score * cloudFactor),
      reasons: [
        ...recommendation.reasons,
        weather.cloudCover > 0
          ? `Weather adjustment: ${weather.cloudCover}% cloud cover.`
          : "Weather adjustment: no cloud-cover penalty.",
      ],
    }));
  }, [baseRecommendations, weather]);

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
    <main className="mx-auto w-full max-w-6xl space-y-5 px-3 py-5 sm:px-6 sm:py-8">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-500">
          AstroLens Observatory
        </p>

        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Explore the Sky
        </h1>

        <p className="max-w-2xl text-sm leading-relaxed text-gray-600 dark:text-gray-300 sm:text-base">
          Explore the objects above your horizon and see
          which ones are worth observing from your location.
        </p>

        <div className="flex flex-wrap gap-2 pt-1 text-xs">
          <span className="rounded-full border px-3 py-2">
            Bortle {bortleClass}
          </span>

          <span className="rounded-full border px-3 py-2">
            {location.latitude.toFixed(2)}°,{" "}
            {location.longitude.toFixed(2)}°
          </span>

          <span className="rounded-full border px-3 py-2">
            {now ? now.toLocaleTimeString() : "Calculating..."}
          </span>
        </div>
      </header>

      {weatherLoading && (
        <p className="text-sm text-gray-500">
          Checking local weather conditions...
        </p>
      )}

      {weatherError && (
        <p className="rounded-lg border border-amber-500/40 p-3 text-sm text-amber-700 dark:text-amber-300">
          Weather data is unavailable. Recommendations are
          being calculated without a weather adjustment.
        </p>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">
              Your sky right now
            </h2>
            <p className="text-sm text-gray-500">
              Select a highlighted target for more information.
            </p>
          </div>

          <span className="shrink-0 text-sm text-gray-500">
            {now ? `${recommendations.length} targets` : "Loading"}
          </span>
        </div>

        {now ? (
          <SkyMap
            targets={skyMapTargets}
            location={location}
            date={now}
          />
        ) : (
          <div className="rounded-xl border p-8 text-center text-sm text-gray-500">
            Calculating the current sky...
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-xl font-semibold">
            Recommended targets
          </h2>

          <p className="text-sm text-gray-500">
            Ranked by estimated observing suitability.
          </p>
        </div>

        {!now ? (
          <p className="rounded-xl border p-5 text-sm text-gray-500">
            Calculating recommendations...
          </p>
        ) : recommendations.length === 0 ? (
          <p className="rounded-xl border p-5 text-sm text-gray-500">
            No catalog targets are currently recommended
            under your modeled observing conditions.
            Try checking again later or adjusting your
            settings on the Observe page.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {recommendations.map((recommendation, index) => (
              <article
                key={recommendation.object.id}
                className="min-w-0 rounded-xl border p-4 sm:p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-gray-500">
                      Rank #{index + 1} · {recommendation.object.type}
                    </p>

                    <h3 className="mt-1 text-lg font-semibold">
                      {recommendation.object.name}
                    </h3>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="text-2xl font-bold tabular-nums">
                      {recommendation.score}
                    </p>
                    <p className="text-xs text-gray-500">
                      /100
                    </p>
                  </div>
                </div>

                <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                  <div
                    className="h-full rounded-full bg-sky-500"
                    style={{
                      width: `${Math.max(
                        0,
                        Math.min(100, recommendation.score)
                      )}%`,
                    }}
                  />
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-gray-500">Altitude</p>
                    <p className="font-semibold">
                      {recommendation.object.position.altitude.toFixed(1)}°
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-gray-500">Azimuth</p>
                    <p className="font-semibold">
                      {recommendation.object.position.azimuth.toFixed(1)}°
                    </p>
                  </div>
                </div>

                <details className="mt-4 border-t pt-3">
                  <summary className="cursor-pointer text-sm font-medium">
                    Why this target?
                  </summary>

                  <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-gray-600 dark:text-gray-300">
                    {recommendation.reasons.map((reason, reasonIndex) => (
                      <li key={reasonIndex}>{reason}</li>
                    ))}
                  </ul>
                </details>
              </article>
            ))}
          </div>
        )}
      </section>

      <footer className="border-t pt-4 text-xs text-gray-500">
        Observing scores are preliminary estimates, not
        guarantees of visibility. Your observing conditions
        can be adjusted on the Observe page.
      </footer>
    </main>
  );
}
