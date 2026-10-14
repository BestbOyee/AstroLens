
import type { CurrentWeather } from "@/hooks/useCurrentWeather";

interface WeatherPanelProps {
  weather: CurrentWeather | null;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
}

function describeWeatherCode(code: number): string {
  if (code === 0) return "Clear sky";
  if (code === 1) return "Mainly clear";
  if (code === 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code === 45 || code === 48) return "Fog";
  if (code >= 51 && code <= 57) return "Drizzle";
  if (code >= 61 && code <= 67) return "Rain";
  if (code >= 71 && code <= 77) return "Snow";
  if (code >= 80 && code <= 82) return "Rain showers";
  if (code === 85 || code === 86) return "Snow showers";
  if (code >= 95 && code <= 99) return "Thunderstorms";
  return "Conditions unavailable";
}

export default function WeatherPanel({
  weather,
  loading,
  error,
  lastUpdated,
}: WeatherPanelProps) {
  return (
    <section className="space-y-3 rounded-xl border p-4">
      <div>
        <h2 className="text-xl font-semibold">
          Current weather
        </h2>
        <p className="text-sm text-gray-500">
          Live conditions for your selected observing coordinates
        </p>
      </div>

      {loading && (
        <p role="status" className="text-sm">
          Fetching current weather...
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm text-amber-700 dark:text-amber-400">
          Weather is unavailable: {error}
          {" "}Astronomy recommendations can still be calculated.
        </p>
      )}

      {!loading && !error && weather && (
        <>
          <p className="text-lg font-medium">
            {describeWeatherCode(weather.weatherCode)}
          </p>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-sm text-gray-500">Temperature</p>
              <p className="text-lg font-semibold">
                {weather.temperatureC.toFixed(1)} °C
              </p>
            </div>

            <div>
              <p className="text-sm text-gray-500">Cloud cover</p>
              <p className="text-lg font-semibold">
                {weather.cloudCover}%
              </p>
            </div>

            <div>
              <p className="text-sm text-gray-500">Humidity</p>
              <p className="text-lg font-semibold">
                {weather.relativeHumidity}%
              </p>
            </div>

            <div>
              <p className="text-sm text-gray-500">Wind</p>
              <p className="text-lg font-semibold">
                {weather.windSpeedKmh.toFixed(1)} km/h
              </p>
            </div>
          </div>

          <p className="text-xs text-gray-500">
            Provider time: {weather.time.replace("T", " ")}
          </p>

          {lastUpdated && (
            <p className="text-xs text-gray-500">
              Retrieved: {lastUpdated.toLocaleTimeString()}
            </p>
          )}

          <p className="text-xs text-gray-500">
            Cloud cover is a forecast-model estimate and may not match
            conditions at your exact viewing spot.
          </p>
        </>
      )}
    </section>
  );
}
