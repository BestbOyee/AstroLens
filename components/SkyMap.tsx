
"use client";

import { useMemo, useState } from "react";

export type SkyMapTarget = {
  id: string;
  name: string;
  type: string;
  altitude: number;
  azimuth: number;
  score: number;
};

type SkyMapProps = {
  targets: SkyMapTarget[];
  location: {
    latitude: number;
    longitude: number;
  };
  date: Date;
};

type Star = {
  name: string;
  ra: number; // Right ascension in hours
  dec: number; // Declination in degrees
  magnitude: number;
};

const SIZE = 600;
const CENTER = SIZE / 2;
const RADIUS = 250;

// Approximate J2000 catalog coordinates and visual magnitudes.
// RA is in hours; declination is in degrees.
const STARS: Star[] = [
  { name: "Polaris", ra: 2.5303, dec: 89.2641, magnitude: 1.98 },
  { name: "Dubhe", ra: 11.0621, dec: 61.751, magnitude: 1.79 },
  { name: "Merak", ra: 11.0307, dec: 56.3824, magnitude: 2.37 },
  { name: "Phecda", ra: 11.8972, dec: 53.6948, magnitude: 2.44 },
  { name: "Megrez", ra: 12.2571, dec: 57.0326, magnitude: 3.31 },
  { name: "Alioth", ra: 12.9005, dec: 55.9598, magnitude: 1.77 },
  { name: "Mizar", ra: 13.3987, dec: 54.9254, magnitude: 2.23 },
  { name: "Alkaid", ra: 13.7923, dec: 49.3133, magnitude: 1.86 },
  { name: "Vega", ra: 18.6156, dec: 38.7837, magnitude: 0.03 },
  { name: "Deneb", ra: 20.6905, dec: 45.2803, magnitude: 1.25 },
  { name: "Albireo", ra: 19.512, dec: 27.9597, magnitude: 3.1 },
  { name: "Altair", ra: 19.8464, dec: 8.8683, magnitude: 0.77 },
  { name: "Caph", ra: 0.1529, dec: 59.1498, magnitude: 2.27 },
  { name: "Schedar", ra: 0.6751, dec: 56.5373, magnitude: 2.24 },
  { name: "Navi", ra: 0.9451, dec: 60.7167, magnitude: 2.47 },
  { name: "Ruchbah", ra: 1.4303, dec: 60.2353, magnitude: 2.68 },
  { name: "Segin", ra: 1.9066, dec: 63.67, magnitude: 3.37 },
  { name: "Betelgeuse", ra: 5.9195, dec: 7.4071, magnitude: 0.5 },
  { name: "Bellatrix", ra: 5.4189, dec: 6.3497, magnitude: 1.64 },
  { name: "Alnitak", ra: 5.6793, dec: -1.9426, magnitude: 1.77 },
  { name: "Alnilam", ra: 5.6036, dec: -1.2019, magnitude: 1.69 },
  { name: "Mintaka", ra: 5.5334, dec: -0.2991, magnitude: 2.23 },
  { name: "Rigel", ra: 5.2423, dec: -8.2016, magnitude: 0.13 },
  { name: "Saiph", ra: 5.7959, dec: -9.6696, magnitude: 2.07 },
];

const CONSTELLATIONS: {
  name: string;
  stars: string[];
}[] = [
  {
    name: "Ursa Major",
    stars: [
      "Dubhe", "Merak", "Phecda", "Megrez",
      "Alioth", "Mizar", "Alkaid",
    ],
  },
  {
    name: "Cassiopeia",
    stars: ["Caph", "Schedar", "Navi", "Ruchbah", "Segin"],
  },
  {
    name: "Orion",
    stars: ["Betelgeuse", "Bellatrix", "Mintaka", "Alnilam",
      "Alnitak", "Saiph", "Rigel", "Mintaka"],
  },
  {
    name: "Summer Triangle",
    stars: ["Vega", "Deneb", "Altair", "Vega"],
  },
];

function starHorizontalPosition(
  star: Star,
  latitude: number,
  longitude: number,
  date: Date
) {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const t = (jd - 2451545.0) / 36525;

  const gmst =
    280.46061837 +
    360.98564736629 * (jd - 2451545.0) +
    0.000387933 * t * t -
    (t * t * t) / 38710000;

  const lst = ((gmst + longitude) % 360 + 360) % 360;
  const hourAngle =
    (((lst - star.ra * 15 + 540) % 360) - 180) *
    (Math.PI / 180);

  const dec = (star.dec * Math.PI) / 180;
  const lat = (latitude * Math.PI) / 180;

  const sinAltitude =
    Math.sin(lat) * Math.sin(dec) +
    Math.cos(lat) * Math.cos(dec) * Math.cos(hourAngle);

  const altitude = Math.asin(
    Math.max(-1, Math.min(1, sinAltitude))
  );

  const azimuth = Math.atan2(
    -Math.sin(hourAngle) * Math.cos(dec),
    Math.sin(dec) * Math.cos(lat) -
      Math.cos(dec) * Math.sin(lat) * Math.cos(hourAngle)
  );

  return {
    altitude: (altitude * 180) / Math.PI,
    azimuth: ((azimuth * 180) / Math.PI + 360) % 360,
  };
}

function project(altitude: number, azimuth: number) {
  // Azimuthal equidistant projection, centered on the zenith.
  const r = ((90 - altitude) / 90) * RADIUS;
  const angle = (azimuth * Math.PI) / 180;

  return {
    x: CENTER + r * Math.sin(angle),
    y: CENTER - r * Math.cos(angle),
  };
}

export default function SkyMap({
  targets,
  location,
  date,
}: SkyMapProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showConstellations, setShowConstellations] = useState(true);
  const [showStarNames, setShowStarNames] = useState(true);

  const stars = useMemo(() => {
    return STARS.map((star) => ({
      ...star,
      ...starHorizontalPosition(star, location.latitude, location.longitude, date),
    })).filter((star) => star.altitude > 0);
  }, [location.latitude, location.longitude, date]);

  const starByName = useMemo(
    () => new Map(stars.map((star) => [star.name, star])),
    [stars]
  );

  const visibleTargets = targets.filter(
    (target) =>
      Number.isFinite(target.altitude) &&
      Number.isFinite(target.azimuth) &&
      target.altitude > 0 &&
      target.altitude <= 90
  );

  const selected = visibleTargets.find(
    (target) => target.id === selectedId
  );

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-800 bg-[#050914] text-slate-100">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 px-5 py-5 sm:px-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-400">
            AstroLens Observatory
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">
            Tonight&apos;s Sky
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            North-up sky chart · {stars.length} catalog stars above horizon
          </p>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <button
            type="button"
            onClick={() => setShowConstellations((v) => !v)}
            aria-pressed={showConstellations}
            className={`rounded-full border px-3 py-2 ${
              showConstellations
                ? "border-sky-700 bg-sky-950 text-sky-200"
                : "border-slate-700 text-slate-400"
            }`}
          >
            Constellations
          </button>
          <button
            type="button"
            onClick={() => setShowStarNames((v) => !v)}
            aria-pressed={showStarNames}
            className={`rounded-full border px-3 py-2 ${
              showStarNames
                ? "border-sky-700 bg-sky-950 text-sky-200"
                : "border-slate-700 text-slate-400"
            }`}
          >
            Star names
          </button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-2xl px-2 py-4 sm:px-6">
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="h-auto w-full"
          role="group"
          aria-label="Interactive star chart with constellation lines and observing targets"
        >
          <defs>
            <radialGradient id="night-sky">
              <stop offset="0%" stopColor="#111e38" />
              <stop offset="68%" stopColor="#091224" />
              <stop offset="100%" stopColor="#030711" />
            </radialGradient>
            <clipPath id="chart-clip">
              <circle cx={CENTER} cy={CENTER} r={RADIUS} />
            </clipPath>
            <filter id="star-glow" x="-200%" y="-200%" width="400%" height="400%">
              <feGaussianBlur stdDeviation="2" />
            </filter>
          </defs>

          <circle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS + 1}
            fill="url(#night-sky)"
            stroke="#475569"
            strokeWidth="1.5"
          />

          <g clipPath="url(#chart-clip)">
            {[30, 60].map((altitude) => (
              <circle
                key={altitude}
                cx={CENTER}
                cy={CENTER}
                r={((90 - altitude) / 90) * RADIUS}
                fill="none"
                stroke="#334155"
                strokeWidth="1"
                strokeDasharray="4 6"
              />
            ))}

            <g stroke="#25344c" strokeWidth="0.8">
              <line x1={CENTER} y1={CENTER - RADIUS} x2={CENTER} y2={CENTER + RADIUS} />
              <line x1={CENTER - RADIUS} y1={CENTER} x2={CENTER + RADIUS} y2={CENTER} />
              <line x1={CENTER - 177} y1={CENTER - 177} x2={CENTER + 177} y2={CENTER + 177} />
              <line x1={CENTER + 177} y1={CENTER - 177} x2={CENTER - 177} y2={CENTER + 177} />
            </g>

            {/* Actual catalog star positions */}
            {stars.map((star) => {
              const point = project(star.altitude, star.azimuth);
              const radius = Math.max(1.1, Math.min(4, 3.6 - star.magnitude * 0.7));

              return (
                <g key={star.name}>
                  {star.magnitude < 1.1 && (
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r={radius * 2.3}
                      fill="#dbeafe"
                      opacity="0.15"
                      filter="url(#star-glow)"
                    />
                  )}
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={radius}
                    fill={star.magnitude < 1.1 ? "#ffffff" : "#b9d7ff"}
                    opacity={star.magnitude > 3 ? 0.65 : 0.95}
                  />
                  {showStarNames &&
                    star.magnitude < 1.5 &&
                    point.x > 35 &&
                    point.x < SIZE - 35 &&
                    point.y > 30 &&
                    point.y < SIZE - 25 && (
                      <text
                        x={point.x + 7}
                        y={point.y - 7}
                        fill="#94a3b8"
                        fontSize="10"
                      >
                        {star.name}
                      </text>
                    )}
                </g>
              );
            })}

            {/* Constellation connections follow the catalog stars */}
            {showConstellations &&
              CONSTELLATIONS.map((constellation) => (
                <g key={constellation.name}>
                  {constellation.stars.slice(0, -1).map((name, i) => {
                    const a = starByName.get(name);
                    const b = starByName.get(constellation.stars[i + 1]);

                    if (!a || !b) return null;

                    const p1 = project(a.altitude, a.azimuth);
                    const p2 = project(b.altitude, b.azimuth);

                    return (
                      <line
                        key={`${name}-${constellation.stars[i + 1]}`}
                        x1={p1.x}
                        y1={p1.y}
                        x2={p2.x}
                        y2={p2.y}
                        stroke="#6d91c4"
                        strokeWidth="1.1"
                        opacity="0.55"
                      />
                    );
                  })}
                </g>
              ))}

            {/* Recommended targets are highlighted separately */}
            {visibleTargets.map((target) => {
              const point = project(target.altitude, target.azimuth);
              const isSelected = target.id === selectedId;

              return (
                <g
                  key={target.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Select ${target.name}`}
                  aria-pressed={isSelected}
                  className="cursor-pointer"
                  onClick={() => setSelectedId(target.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedId(target.id);
                    }
                  }}
                >
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r="12"
                    fill="transparent"
                  />
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={isSelected ? 8 : 5}
                    fill="#38bdf8"
                    fillOpacity="0.22"
                    stroke="#38bdf8"
                    strokeWidth="1.5"
                  />
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r="2"
                    fill="#ffffff"
                  />
                  <text
                    x={point.x + 9}
                    y={point.y - 9}
                    fontSize="11"
                    fill="#7dd3fc"
                    stroke="#050914"
                    strokeWidth="3"
                    paintOrder="stroke"
                  >
                    {target.name}
                  </text>
                </g>
              );
            })}
          </g>

          {/* Compass labels */}
          <g
            fill="#cbd5e1"
            fontSize="14"
            fontWeight="600"
            textAnchor="middle"
          >
            <text x={CENTER} y="19">N</text>
            <text x={SIZE - 15} y={CENTER + 5}>E</text>
            <text x={CENTER} y={SIZE - 10}>S</text>
            <text x="15" y={CENTER + 5}>W</text>
          </g>

          <g fill="#64748b" fontSize="10">
            <text x={CENTER + 6} y={CENTER - 78}>30°</text>
            <text x={CENTER + 6} y={CENTER - 36}>60°</text>
            <text x={CENTER + 6} y={CENTER - 7}>90°</text>
          </g>

          <circle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            fill="none"
            stroke="#64748b"
            strokeWidth="1.5"
          />
        </svg>

        <div className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-slate-400">
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-white" />
            Catalog star
          </span>
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-sky-400" />
            Recommended target
          </span>
          <span className="flex items-center gap-2">
            <span className="h-px w-4 bg-blue-300" />
            Constellation line
          </span>
        </div>
      </div>

      <div className="border-t border-slate-800 px-5 py-4 sm:px-6">
        {selected ? (
          <div>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-white">{selected.name}</h3>
                <p className="mt-1 text-sm capitalize text-slate-400">
                  {selected.type}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="text-sm text-slate-400 hover:text-white"
              >
                Clear selection
              </button>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <div>
                <p className="text-xs text-slate-500">Altitude</p>
                <p className="mt-1 font-medium">
                  {selected.altitude.toFixed(1)}°
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Azimuth</p>
                <p className="mt-1 font-medium">
                  {selected.azimuth.toFixed(1)}°
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Score</p>
                <p className="mt-1 font-medium text-sky-400">
                  {Math.round(selected.score)}/100
                </p>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-400">
            Select a highlighted target on the chart to inspect its observing score.
          </p>
        )}

        {visibleTargets.length === 0 && (
          <p className="mt-3 text-sm text-slate-400">
            No recommended targets are currently above the horizon.
          </p>
        )}
      </div>
    </section>
  );
}
