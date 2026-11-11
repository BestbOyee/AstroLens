
"use client";

import {
  createContext,
  useContext,
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

const ObservatoryContext =
  createContext<ObservatoryContextValue | null>(null);

export function ObservatoryProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [location, setLocation] = useState<ObserverLocation>({
    latitude: 40.7128,
    longitude: -74.006,
    elevation: 10,
  });

  const [horizon, setHorizon] = useState<HorizonProfile>({
    points: [],
  });

  const [bortleClass, setBortleClass] = useState(6);

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
