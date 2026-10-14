
"use client";

import { useMemo, useState } from "react";

type Telescope = {
  id: string;
  name: string;
  type: "Refractor" | "Reflector" | "Dobsonian" | "Catadioptric";
  apertureMm: number;
  focalLengthMm: number;
  mount: string;
  description: string;
  strengths: string[];
};

const telescopes: Telescope[] = [
  {
    id: "starter-refractor",
    name: "Starter Refractor",
    type: "Refractor",
    apertureMm: 70,
    focalLengthMm: 400,
    mount: "Alt-azimuth",
    description:
      "A compact beginner telescope suited to the Moon, bright planets, and wide star fields.",
    strengths: ["Moon", "Bright planets", "Wide star fields"],
  },
  {
    id: "classic-reflector",
    name: "Classic Reflector",
    type: "Reflector",
    apertureMm: 130,
    focalLengthMm: 650,
    mount: "Alt-azimuth",
    description:
      "A versatile telescope with more light-gathering ability for planets and brighter deep-sky objects.",
    strengths: ["Planets", "Star clusters", "Bright nebulae"],
  },
  {
    id: "dobsonian-8",
    name: "8-inch Dobsonian",
    type: "Dobsonian",
    apertureMm: 203,
    focalLengthMm: 1200,
    mount: "Dobsonian",
    description:
      "A large-aperture visual telescope well suited to lunar, planetary, and deep-sky observing.",
    strengths: ["Galaxies", "Nebulae", "Globular clusters"],
  },
  {
    id: "compact-catadioptric",
    name: "Compact Catadioptric",
    type: "Catadioptric",
    apertureMm: 127,
    focalLengthMm: 1500,
    mount: "Alt-azimuth",
    description:
      "A compact, long-focal-length telescope suited to detailed lunar and planetary viewing.",
    strengths: ["Moon", "Planets", "Double stars"],
  },
];

function formatNumber(value: number): string {
  return value.toLocaleString("en-US");
}

export default function TelescopesPage() {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(telescopes[0].id);
  const [comparisonId, setComparisonId] = useState(telescopes[2].id);

  const filteredTelescopes = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return telescopes;

    return telescopes.filter((telescope) =>
      [
        telescope.name,
        telescope.type,
        telescope.description,
        telescope.mount,
        ...telescope.strengths,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [search]);

  const selected =
    telescopes.find((telescope) => telescope.id === selectedId) ??
    telescopes[0];

  const comparison =
    telescopes.find((telescope) => telescope.id === comparisonId) ??
    telescopes[2];

  function renderTelescopeDetails(telescope: Telescope) {
    return (
      <div className="mt-5 grid grid-cols-2 gap-4">
        <div className="rounded-lg bg-slate-800 p-4">
          <p className="text-sm text-slate-400">Aperture</p>
          <p className="mt-1 text-xl font-semibold">
            {telescope.apertureMm} mm
          </p>
        </div>

        <div className="rounded-lg bg-slate-800 p-4">
          <p className="text-sm text-slate-400">Focal length</p>
          <p className="mt-1 text-xl font-semibold">
            {formatNumber(telescope.focalLengthMm)} mm
          </p>
        </div>

        <div className="rounded-lg bg-slate-800 p-4">
          <p className="text-sm text-slate-400">Focal ratio</p>
          <p className="mt-1 text-xl font-semibold">
            f/{(
              telescope.focalLengthMm / telescope.apertureMm
            ).toFixed(1)}
          </p>
        </div>

        <div className="rounded-lg bg-slate-800 p-4">
          <p className="text-sm text-slate-400">Mount</p>
          <p className="mt-1 text-lg font-semibold">{telescope.mount}</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 p-6 text-white sm:p-8">
      <div className="mx-auto max-w-6xl space-y-10">
        <header>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-400">
            AstroLens Equipment
          </p>
          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
            Telescope Explorer
          </h1>
          <p className="mt-4 max-w-2xl text-slate-300">
            Explore telescope specifications, compare equipment, and prepare
            to find the best targets for your observing setup.
          </p>
        </header>

        <section>
          <label
            htmlFor="telescope-search"
            className="mb-2 block text-sm font-medium text-slate-300"
          >
            Search telescopes
          </label>
          <input
            id="telescope-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name, type, or target..."
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none focus:border-sky-400"
          />
        </section>

        <section>
          <h2 className="mb-4 text-xl font-semibold">Telescope catalog</h2>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {filteredTelescopes.map((telescope) => (
              <article
                key={telescope.id}
                className={`flex flex-col rounded-xl border p-5 ${
                  selectedId === telescope.id
                    ? "border-sky-400 bg-slate-900"
                    : "border-slate-800 bg-slate-900/50"
                }`}
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-sky-400">
                  {telescope.type}
                </p>
                <h3 className="mt-2 text-lg font-semibold">
                  {telescope.name}
                </h3>
                <p className="mt-3 flex-1 text-sm leading-6 text-slate-300">
                  {telescope.description}
                </p>

                <p className="mt-4 text-sm text-slate-400">
                  Aperture: {telescope.apertureMm} mm
                </p>
                <p className="mt-1 text-sm text-slate-400">
                  Focal length: {telescope.focalLengthMm} mm
                </p>

                <button
                  type="button"
                  onClick={() => setSelectedId(telescope.id)}
                  className="mt-5 rounded-lg bg-sky-600 px-4 py-2 font-medium text-white transition hover:bg-sky-500"
                >
                  {selectedId === telescope.id ? "Selected" : "View details"}
                </button>
              </article>
            ))}
          </div>

          {filteredTelescopes.length === 0 && (
            <p className="rounded-xl border border-slate-800 p-6 text-slate-300">
              No telescopes match that search. Try a different name or target.
            </p>
          )}
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <p className="text-sm font-semibold uppercase tracking-wide text-sky-400">
            Selected equipment
          </p>
          <h2 className="mt-2 text-2xl font-bold">{selected.name}</h2>
          <p className="mt-2 text-slate-300">{selected.description}</p>

          {renderTelescopeDetails(selected)}

          <div className="mt-5">
            <p className="mb-2 text-sm font-medium text-slate-300">
              Well-suited targets
            </p>
            <div className="flex flex-wrap gap-2">
              {selected.strengths.map((strength) => (
                <span
                  key={strength}
                  className="rounded-full border border-slate-700 px-3 py-1 text-sm text-slate-200"
                >
                  {strength}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 p-6">
          <h2 className="text-xl font-semibold">Compare telescopes</h2>
          <p className="mt-2 text-sm text-slate-400">
            Compare the selected telescope with another catalog entry.
          </p>

          <label
            htmlFor="comparison-telescope"
            className="mt-5 block text-sm font-medium text-slate-300"
          >
            Compare against
          </label>
          <select
            id="comparison-telescope"
            value={comparisonId}
            onChange={(event) => setComparisonId(event.target.value)}
            className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-white sm:max-w-md"
          >
            {telescopes
              .filter((telescope) => telescope.id !== selectedId)
              .map((telescope) => (
                <option key={telescope.id} value={telescope.id}>
                  {telescope.name}
                </option>
              ))}
          </select>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400">
                  <th className="py-3 pr-4">Specification</th>
                  <th className="py-3 pr-4">{selected.name}</th>
                  <th className="py-3">{comparison.name}</th>
                </tr>
              </thead>
              <tbody>
                {[
                  [
                    "Type",
                    selected.type,
                    comparison.type,
                  ],
                  [
                    "Aperture",
                    `${selected.apertureMm} mm`,
                    `${comparison.apertureMm} mm`,
                  ],
                  [
                    "Focal length",
                    `${selected.focalLengthMm} mm`,
                    `${comparison.focalLengthMm} mm`,
                  ],
                  [
                    "Focal ratio",
                    `f/${(
                      selected.focalLengthMm / selected.apertureMm
                    ).toFixed(1)}`,
                    `f/${(
                      comparison.focalLengthMm / comparison.apertureMm
                    ).toFixed(1)}`,
                  ],
                  ["Mount", selected.mount, comparison.mount],
                ].map(([label, first, second]) => (
                  <tr key={label} className="border-b border-slate-800">
                    <td className="py-3 pr-4 text-slate-400">{label}</td>
                    <td className="py-3 pr-4">{first}</td>
                    <td className="py-3">{second}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <p className="text-xs leading-5 text-slate-500">
          This catalog uses representative telescope configurations for
          exploration, not verified listings for specific products. Actual
          performance depends on optics, eyepieces, sky conditions, and
          observing experience.
        </p>
      </div>
    </main>
  );
}
