
"use client";

import { useEffect, useState } from "react";
import {
  analyzeImagePixels,
  type ObstructionAnalysis,
} from "../../components/HorizonScanner";

const TEST_IMAGES = [
  { name: "Trees and buildings", file: "trees-buildings.jpg" },
  { name: "Buildings and branches", file: "branches.jpg" },
  { name: "Distant city skyline", file: "city-skyline.jpg" },
  { name: "Sunset lighting", file: "sunset.jpg" },
  { name: "Residential twilight", file: "twilight.jpg" },
];

type TestResult = {
  name: string;
  src: string;
  analysis: ObstructionAnalysis | null;
  error: string | null;
};

const ANALYSIS_WIDTH = 240;
const ANALYSIS_HEIGHT = 135;

export default function TestHorizonPage() {
  const [results, setResults] = useState<TestResult[]>(
    TEST_IMAGES.map((image) => ({
      name: image.name,
      src: `/test-images/${image.file}`,
      analysis: null,
      error: null,
    })),
  );

  useEffect(() => {
    let cancelled = false;

    async function analyzeImages() {
      const updated = await Promise.all(
        TEST_IMAGES.map(
          (image) =>
            new Promise<TestResult>((resolve) => {
              const src = `/test-images/${image.file}`;
              const img = new Image();

              img.onload = () => {
                try {
                  const canvas = document.createElement("canvas");
                  canvas.width = ANALYSIS_WIDTH;
                  canvas.height = ANALYSIS_HEIGHT;

                  const context = canvas.getContext("2d", {
                    willReadFrequently: true,
                  });

                  if (!context) {
                    throw new Error("Could not create canvas context.");
                  }

                  context.drawImage(
                    img,
                    0,
                    0,
                    ANALYSIS_WIDTH,
                    ANALYSIS_HEIGHT,
                  );

                  const pixels = context.getImageData(
                    0,
                    0,
                    ANALYSIS_WIDTH,
                    ANALYSIS_HEIGHT,
                  );

                  const analysis = analyzeImagePixels(
                    pixels.data,
                    ANALYSIS_WIDTH,
                    ANALYSIS_HEIGHT,
                  );

                  resolve({
                    name: image.name,
                    src,
                    analysis,
                    error: null,
                  });
                } catch (error) {
                  resolve({
                    name: image.name,
                    src,
                    analysis: null,
                    error:
                      error instanceof Error
                        ? error.message
                        : "Image analysis failed.",
                  });
                }
              };

              img.onerror = () => {
                resolve({
                  name: image.name,
                  src,
                  analysis: null,
                  error: `Could not load ${image.file}. Check the filename and folder.`,
                });
              };

              img.src = src;
            }),
        ),
      );

      if (!cancelled) {
        setResults(updated);
      }
    }

    void analyzeImages();

    return () => {
      cancelled = true;
    };
  }, []);

  const completed = results.filter((item) => item.analysis !== null);
  const confident = completed.filter(
    (item) => item.analysis?.status === "estimated",
  );
  const uncertain = completed.length - confident.length;
  const failed = results.filter((item) => item.error !== null);

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-5 sm:p-8">
      <header className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-widest text-sky-600">
          AstroLens · Developer Test
        </p>
        <h1 className="text-3xl font-bold">
          Real-Photo Skyline Benchmark
        </h1>
        <p className="max-w-3xl text-sm text-gray-600">
          Runs the existing on-device color heuristic on five photographs.
          The horizontal line represents the detector&apos;s mean estimated
          boundary, not a pixel-by-pixel skyline trace.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Summary label="Images loaded" value={`${completed.length}/5`} />
        <Summary label="Confident estimates" value={String(confident.length)} />
        <Summary label="Low confidence" value={String(uncertain)} />
        <Summary label="Load or analysis errors" value={String(failed.length)} />
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        {results.map((item) => {
          const analysis = item.analysis;

          return (
            <article
              key={item.src}
              className="overflow-hidden rounded-xl border border-gray-200"
            >
              <div className="border-b border-gray-200 p-4">
                <h2 className="font-semibold">{item.name}</h2>
                <p className="text-xs text-gray-500">{item.src}</p>
              </div>

              <div className="relative aspect-video bg-gray-100">
                <img
                  src={item.src}
                  alt={item.name}
                  className="h-full w-full object-fill"
                />
                      {analysis && (
            <p className="absolute bottom-2 left-2 z-20 rounded bg-black px-2 py-1 text-xs text-white">
              Status: {analysis.status} · Boundary points:{" "}
              {analysis.boundaryProfile?.length ?? 0}
            </p>
          )}
                
                  
              {analysis?.status === "estimated" &&
                analysis.boundaryProfile &&
                analysis.boundaryProfile.length >= 2 && (
                  <svg
                    className="absolute inset-0 z-10 h-full w-full"
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    aria-label="Detected skyline boundary"
                  >
                    <polyline
                      points={analysis.boundaryProfile
                        .map(
                          (point) =>
                            `${point.xPercent},${point.yPercent}`,
                        )
                        .join(" ")}
                      fill="none"
                      stroke="#ff0000"
                      strokeWidth="0.6"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  </svg>
                )}



                {item.error && (
                  <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-red-700">
                    {item.error}
                  </div>
                )}

                {!analysis && !item.error && (
                  <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-600">
                    Analyzing image…
                  </div>
                )}
              </div>

              <div className="space-y-2 p-4 text-sm">
                {analysis ? (
                  <>
                    <Metric
                      label="Result"
                      value={
                        analysis.status === "estimated"
                          ? "Estimate available"
                          : "Low confidence"
                      }
                    />
                    
                    <Metric
                      label="Estimated obstruction"
                      value={
                        analysis.status === "estimated"
                          ? `${analysis.obstructionPercent}%`
                          : "Unavailable — low confidence"
                      }
                    />

                    
                    <Metric
                      label="Mean boundary from image top"
                      value={
                        analysis.status === "estimated"
                          ? `${analysis.skylineYPercent}%`
                          : "Unavailable — low confidence"
                      }
                    />

                    <Metric
                      label="Detected columns"
                      value={`${analysis.detectedColumnsPercent}%`}
                    />
                    <Metric
                      label="Confidence score"
                      value={`${analysis.confidencePercent}%`}
                    />
                    <Metric
                      label="Estimated image-relative angle"
                      value={
                        analysis.estimatedSkylineAngleDegrees === null
                          ? "Unavailable"
                          : `${analysis.estimatedSkylineAngleDegrees}°`
                      }
                    />
                    <p className="pt-2 text-xs text-gray-500">
                      Confidence measures detected boundaries, not whether
                      the boundary is truly the skyline. Angle is approximate
                      and uses an assumed camera field of view.
                    </p>
                  </>
                ) : (
                  !item.error && (
                    <p className="text-gray-500">Waiting for analysis…</p>
                  )
                )}
              </div>
            </article>
          );
        })}
      </div>

      <section className="space-y-2 rounded-xl border border-gray-200 p-4">
        <h2 className="font-semibold">What to check</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-gray-600">
          <li>
            Does the red line roughly match where the sky meets trees or
            buildings?
          </li>
          <li>
            Does the detector mistake clouds, bright concrete, or sunset
            colors for sky?
          </li>
          <li>
            Does it report low confidence when the boundary is unclear?
          </li>
          <li>
            Does a high confidence score actually correspond to a correct
            result?
          </li>
        </ul>
      </section>
    </main>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-gray-600">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
