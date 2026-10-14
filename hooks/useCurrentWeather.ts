
"use client";

import { useEffect, useState } from "react";

export interface CurrentWeather {
  time: string;
  temperatureC: number;
  relativeHumidity: number;
  cloudCover: number;
  windSpeedKmh: number;
  weatherCode: number;
}

interface OpenMeteoResponse {
  current?: {
    time?: string;
    temperature_2m?: number;
    relative_humidity_2m?: number;
    cloud_cover?: number;
    wind_speed_10m?: number;
    weather_code?: number;
  };
}

interface WeatherState {
  weather: CurrentWeather | null;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
}

export function useCurrentWeather(
  latitude: number,
  longitude: number
): WeatherState {
  const [weather, setWeather] = useState<CurrentWeather | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    let controller: AbortController | null = null;

    async function loadWeather() {
      controller?.abort();
      const requestController = new AbortController();
      controller = requestController;

      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          latitude: String(latitude),
          longitude: String(longitude),
          current:
            "temperature_2m,relative_humidity_2m,cloud_cover,wind_speed_10m,weather_code",
          timezone: "auto",
        });

        const response = await fetch(
          `https://api.open-meteo.com/v1/forecast?${params.toString()}`,
          { signal: requestController.signal }
        );

        if (!response.ok) {
          throw new Error(`Weather service returned ${response.status}.`);
        }

        const data: OpenMeteoResponse = await response.json();
        const current = data.current;

        if (
          !current ||
          typeof current.time !== "string" ||
          typeof current.temperature_2m !== "number" ||
          typeof current.relative_humidity_2m !== "number" ||
          typeof current.cloud_cover !== "number" ||
          typeof current.wind_speed_10m !== "number" ||
          typeof current.weather_code !== "number"
        ) {
          throw new Error("The weather service returned incomplete data.");
        }

        if (!cancelled) {
          setWeather({
            time: current.time,
            temperatureC: current.temperature_2m,
            relativeHumidity: current.relative_humidity_2m,
            cloudCover: current.cloud_cover,
            windSpeedKmh: current.wind_speed_10m,
            weatherCode: current.weather_code,
          });
          setLastUpdated(new Date());
        }
      } catch (err) {
        if (
          cancelled ||
          (err instanceof Error && err.name === "AbortError")
        ) {
          return;
        }

        setError(
          err instanceof Error
            ? err.message
            : "Unable to retrieve current weather."
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadWeather();

    const interval = window.setInterval(() => {
      void loadWeather();
    }, 10 * 60 * 1000);

    return () => {
      cancelled = true;
      controller?.abort();
      window.clearInterval(interval);
    };
  }, [latitude, longitude]);

  return { weather, loading, error, lastUpdated };
}
