
"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import type {
  HorizonProfile,
  ObserverLocation,
} from "@/types/astronomy";

interface ObservatoryContextValue {
  location: ObserverLocation;
  setLocation: (location: ObserverLocation) => void;
  horizon: HorizonProfile;
  setHorizon: (horizon: HorizonProfile) => void;
  bortleClass: number;
  setBortleClass: (level: number) => void;
}

interface StoredObservatorySettings {
  location?: unknown;
  horizon?: unknown;
  bortleClass?: unknown;
}

const STORAGE_KEY = "astrolens-observatory-settings";

const DEFAULT_LOCATION: ObserverLocation = {
  latitude: 40.7128,
  longitude: -74.006,
  elevation: 10,
};

const DEFAULT_HORIZON: HorizonProfile = {
  points: [],
};

const DEFAULT_BORTLE_CLASS = 6;

const ObservatoryContext =
  createContext<ObservatoryContextValue | null>(null);

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function loadLocation(value: unknown): ObserverLocation {
  if (!isRecord(value)) {
    return DEFAULT_LOCATION;
  }

  const latitude = value.latitude;
  const longitude = value.longitude;
  const elevation = value.elevation;

  if (
    typeof latitude !== "number" ||
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    typeof longitude !== "number" ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    return DEFAULT_LOCATION;
  }

  return {
    latitude,
    longitude,
    elevation:
      typeof elevation === "number" && Number.isFinite(elevation)
        ? elevation
        : DEFAULT_LOCATION.elevation,
  };
}

function loadHorizon(value: unknown): HorizonProfile {
  if (!isRecord(value) || !Array.isArray(value.points)) {
    return DEFAULT_HORIZON;
  }

  const points = value.points.filter((point): point is {
    azimuth: number;
    altitude: number;
  } => {
    if (!isRecord(point)) {
      return false;
    }

    return (
      typeof point.azimuth === "number" &&
      Number.isFinite(point.azimuth) &&
      point.azimuth >= 0 &&
      point.azimuth < 360 &&
      typeof point.altitude === "number" &&
      Number.isFinite(point.altitude) &&
      point.altitude >= 0 &&
      point.altitude <= 90
    );
  });

  return { points };
}

function loadBortleClass(value: unknown): number {
  if (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 9
  ) {
    return value;
  }

  return DEFAULT_BORTLE_CLASS;
}

export function ObservatoryProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [location, setLocation] =
    useState<ObserverLocation>(DEFAULT_LOCATION);

  const [horizon, setHorizon] =
    useState<HorizonProfile>(DEFAULT_HORIZON);

  const [bortleClass, setBortleClass] =
    useState(DEFAULT_BORTLE_CLASS);

  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // Load saved settings once when the provider mounts.
  useEffect(() => {
    try {
      const savedSettings = localStorage.getItem(STORAGE_KEY);

      if (savedSettings) {
        const parsed: unknown = JSON.parse(savedSettings);

        if (isRecord(parsed)) {
          setLocation(loadLocation(parsed.location));
          setHorizon(loadHorizon(parsed.horizon));
          setBortleClass(loadBortleClass(parsed.bortleClass));
        }
      }
    } catch (error) {
      console.error(
        "Unable to load AstroLens observatory settings:",
        error
      );
    } finally {
      setSettingsLoaded(true);
    }
  }, []);

  // Save settings whenever they change, but only after loading finishes.
  useEffect(() => {
    if (!settingsLoaded) {
      return;
    }

    const settings: StoredObservatorySettings = {
      location,
      horizon,
      bortleClass,
    };

    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(settings)
      );
    } catch (error) {
      console.error(
        "Unable to save AstroLens observatory settings:",
        error
      );
    }
  }, [location, horizon, bortleClass, settingsLoaded]);

  return (
    <ObservatoryContext.Provider
      value={{
        location,
        setLocation,
        horizon,
        setHorizon,
        bortleClass,
        setBortleClass,
      }}
    >
      {children}
    </ObservatoryContext.Provider>
  );
}

export function useObservatory() {
  const context = useContext(ObservatoryContext);

  if (!context) {
    throw new Error(
      "useObservatory must be used inside ObservatoryProvider"
    );
  }

  return context;
}
