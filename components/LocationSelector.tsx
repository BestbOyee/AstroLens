
"use client";

import { useEffect, useState } from "react";
import type { ObserverLocation } from "@/types/astronomy";

type LocationSelectorProps = {
  location: ObserverLocation;
  onChange: (location: ObserverLocation) => void;
};

type SavedLocation = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  elevation: number;
};

const STORAGE_KEY = "astrolens-saved-locations";

export default function LocationSelector({
  location,
  onChange,
}: LocationSelectorProps) {
  const [savedLocations, setSavedLocations] = useState<SavedLocation[]>([]);
  const [locationName, setLocationName] = useState("");
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [storageReady, setStorageReady] = useState(false);

  // Load saved locations after mounting to avoid server-rendering issues.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);

      if (stored) {
        const parsed: unknown = JSON.parse(stored);

        if (Array.isArray(parsed)) {
          const validLocations = parsed.filter(
            (item): item is SavedLocation =>
              item !== null &&
              typeof item === "object" &&
              typeof item.id === "string" &&
              typeof item.name === "string" &&
              item.name.trim().length > 0 &&
              typeof item.latitude === "number" &&
              Number.isFinite(item.latitude) &&
              item.latitude >= -90 &&
              item.latitude <= 90 &&
              typeof item.longitude === "number" &&
              Number.isFinite(item.longitude) &&
              item.longitude >= -180 &&
              item.longitude <= 180 &&
              typeof item.elevation === "number" &&
              Number.isFinite(item.elevation)
          );

          setSavedLocations(validLocations);
        }
      }
    } catch {
      setSaveError("Could not load saved locations from this browser.");
    } finally {
      setStorageReady(true);
    }
  }, []);

  // Persist saved locations whenever the list changes.
  useEffect(() => {
    if (!storageReady) return;

    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(savedLocations)
      );
    } catch {
      setSaveError(
        "Could not save locations. Browser storage may be unavailable or full."
      );
    }
  }, [savedLocations, storageReady]);

  function updateLocation(
    field: keyof ObserverLocation,
    value: number
  ) {
    onChange({
      ...location,
      [field]: value,
    });

    setSelectedLocationId("");
  }

  function useMyLocation() {
    setGeoError("");

    if (!("geolocation" in navigator)) {
      setGeoError(
        "Geolocation is not supported by this browser."
      );
      return;
    }

    setGeoLoading(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        onChange({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          elevation:
            position.coords.altitude !== null &&
            Number.isFinite(position.coords.altitude)
              ? position.coords.altitude
              : location.elevation,
        });

        setSelectedLocationId("");
        setGeoLoading(false);
      },
      (error) => {
        const messages: Record<number, string> = {
          1: "Location permission was denied. Allow location access in your browser settings and try again.",
          2: "Your current location could not be determined. Try again or enter coordinates manually.",
          3: "The location request timed out. Please try again.",
        };

        setGeoError(
          messages[error.code] ??
            "Unable to retrieve your location. Enter coordinates manually."
        );

        setGeoLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 60000,
      }
    );
  }

  function saveCurrentLocation() {
    setSaveError("");

    const name = locationName.trim();

    if (!name) {
      setSaveError("Enter a name for this observing location.");
      return;
    }

    if (
      !Number.isFinite(location.latitude) ||
      location.latitude < -90 ||
      location.latitude > 90 ||
      !Number.isFinite(location.longitude) ||
      location.longitude < -180 ||
      location.longitude > 180 ||
      !Number.isFinite(location.elevation)
    ) {
      setSaveError("Enter valid coordinates and elevation first.");
      return;
    }

    const saved: SavedLocation = {
      id: crypto.randomUUID(),
      name,
      latitude: location.latitude,
      longitude: location.longitude,
      elevation: location.elevation ?? 0,
    };

    setSavedLocations((previous) => [...previous, saved]);
    setSelectedLocationId(saved.id);
    setLocationName("");
  }

  function selectSavedLocation(id: string) {
    setSelectedLocationId(id);
    setGeoError("");
    setSaveError("");

    const saved = savedLocations.find((item) => item.id === id);

    if (!saved) return;

    onChange({
      latitude: saved.latitude,
      longitude: saved.longitude,
      elevation: saved.elevation,
    });
  }

  function deleteSavedLocation(id: string) {
    setSavedLocations((previous) =>
      previous.filter((item) => item.id !== id)
    );

    if (selectedLocationId === id) {
      setSelectedLocationId("");
    }
  }

  const inputClass =
    "mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-500";

  const labelClass = "block text-sm font-medium text-slate-300";

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-white">
          Observing Location
        </h3>
        <p className="mt-1 text-sm text-slate-400">
          Enter coordinates, use your current location, or select a
          saved observing site.
        </p>
      </div>

      <div>
        <button
          type="button"
          onClick={useMyLocation}
          disabled={geoLoading}
          className="rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {geoLoading ? "Finding your location..." : "Use my location"}
        </button>

        <p className="mt-2 text-xs text-slate-500">
          Your browser will ask for permission. Location access generally
          requires HTTPS or localhost.
        </p>

        {geoError && (
          <p role="alert" className="mt-3 text-sm text-red-400">
            {geoError}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="saved-location" className={labelClass}>
          Saved observing locations
        </label>

        <select
          id="saved-location"
          value={selectedLocationId}
          onChange={(event) => selectSavedLocation(event.target.value)}
          className={inputClass}
        >
          <option value="">Use manually entered coordinates</option>

          {savedLocations.map((saved) => (
            <option key={saved.id} value={saved.id}>
              {saved.name}
            </option>
          ))}
        </select>

        {savedLocations.length > 0 && (
          <ul className="mt-3 space-y-2">
            {savedLocations.map((saved) => (
              <li
                key={saved.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-200">
                    {saved.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {saved.latitude.toFixed(4)},{" "}
                    {saved.longitude.toFixed(4)}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => deleteSavedLocation(saved.id)}
                  aria-label={`Delete ${saved.name}`}
                  className="shrink-0 rounded-md px-2 py-1 text-sm text-slate-400 hover:bg-slate-800 hover:text-red-400"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h4 className="mb-3 text-sm font-semibold text-slate-200">
          Coordinates
        </h4>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="latitude" className={labelClass}>
              Latitude (°)
            </label>
            <input
              id="latitude"
              type="number"
              step="any"
              min="-90"
              max="90"
              value={location.latitude}
              onChange={(event) =>
                updateLocation("latitude", event.target.valueAsNumber)
              }
              className={inputClass}
            />
            <p className="mt-1 text-xs text-slate-500">
              −90 to 90
            </p>
          </div>

          <div>
            <label htmlFor="longitude" className={labelClass}>
              Longitude (°)
            </label>
            <input
              id="longitude"
              type="number"
              step="any"
              min="-180"
              max="180"
              value={location.longitude}
              onChange={(event) =>
                updateLocation("longitude", event.target.valueAsNumber)
              }
              className={inputClass}
            />
            <p className="mt-1 text-xs text-slate-500">
              −180 to 180
            </p>
          </div>

          <div>
            <label htmlFor="elevation" className={labelClass}>
              Elevation (m)
            </label>
            <input
              id="elevation"
              type="number"
              step="any"
              value={location.elevation}
              onChange={(event) =>
                updateLocation("elevation", event.target.valueAsNumber)
              }
              className={inputClass}
            />
            <p className="mt-1 text-xs text-slate-500">
              Meters above sea level
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
        <h4 className="text-sm font-semibold text-slate-200">
          Save this location
        </h4>

        <p className="mt-1 text-sm text-slate-400">
          Save the current coordinates so you can reuse this observing
          site later.
        </p>

        <form
          className="mt-3 flex flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            saveCurrentLocation();
          }}
        >
          <input
            type="text"
            value={locationName}
            onChange={(event) => setLocationName(event.target.value)}
            placeholder="e.g. Home, Backyard, Dark-Sky Site"
            maxLength={60}
            aria-label="Observing location name"
            className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-500"
          />

          <button
            type="submit"
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-sky-500 hover:bg-slate-800"
          >
            Save location
          </button>
        </form>

        {saveError && (
          <p role="alert" className="mt-3 text-sm text-red-400">
            {saveError}
          </p>
        )}
      </div>
    </div>
  );
}
