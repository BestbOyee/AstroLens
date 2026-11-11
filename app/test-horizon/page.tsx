
"use client";

import { useEffect, useState } from "react";
import { segmentSky, type SkySegmentation } from "../../lib/skySegmentation";

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
  segmentation: SkySegmentation | null;
  maskUrl: string | null;
  error: string | null;
  status: "waiting" | "loading" | "complete" | "error";
};

function createMaskUrl(segmentation: SkySegmentation): string {
  const canvas = document.createElement("canvas");
  canvas.width = segmentation.width;
  canvas.height = segmentation.height;

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Could not create mask canvas.");
  }

  const imageData = context.createImageData(
    segmentation.width,
    segmentation.height,
  );

  for (let i = 0; i < segmentation.skyMask.length; i++) {
    const offset = i * 4;

    if (segmentation.skyMask[i] === 1) {
      imageData.data[offset] = 0;
      imageData.data[offset + 1] = 220;
      imageData.data[offset + 2] = 255;
      imageData.data[offset + 3] = 125;
    } else {
      imageData.data[offset] = 0;
      imageData.data[offset + 1] = 0;
      imageData.data[offset + 2] = 0;
      imageData.data[offset + 3] = 0;
    }
  }

  context.putImageData(imageData, 0, 0);

  return canvas.toDataURL("image/png");
}

export default function TestHorizonPage() {
  const [results, setResults] = useState<TestResult[]>(
    TEST_IMAGES.map((image) => ({
      name: image.name,
      src: `/test-images/${image.file}`,
      segmentation: null,
      maskUrl: null,
      error: null,
      status: "waiting",
    })),
  );

  const [progress, setProgress] = useState(0);
  const [modelStatus, setModelStatus] = useState("Waiting to initialize");

  useEffect(() => {
    let cancelled = false;

    async function runBenchmark() {
      setModelStatus("Loading segmentation model...");

      for (let i = 0; i < TEST_IMAGES.length; i++) {
        if (cancelled) return;

        const image = TEST_IMAGES[i];
        const src = `/test-images/${image.file}`;

        setResults((previous) =>
          previous.map((item, index) =>
            index === i ? { ...item, status: "loading" } : item,
          ),
        );

        setModelStatus(`Analyzing ${image.name}...`);

        try {
          const segmentation = await segmentSky(src);

          if (cancelled) return;

          const maskUrl = createMaskUrl(segmentation);

          setResults((previous) =>
            previous.map((item, index) =>
              index === i
                ? {
                    ...item,
                    segmentation,
                    maskUrl,
                    error: null,
                    status: "complete",
                  }
                : item,
            ),
          );
        } catch (error) {
          if (cancelled) return;

          const message =
            error instanceof Error
              ? error.message
              : "Unknown segmentation error.";

          setResults((previous) =>
            previous.map((item, index) =>
              index === i
                ? {
                    ...item,
                    error: message,
                    status: "error",
                  }
                : item,
            ),
          );
        }

        setProgress(i + 1);
      }

      if (!cancelled) {
        setModelStatus("Benchmark complete");
      }
    }

    void runBenchmark();

    return () => {
      cancelled = true;
    };
  }, []);

  const completed = results.filter(
    (item) => item.status === "complete",
  ).length;

  const failed = results.filter(
    (item) => item.status === "error",
  ).length;

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-5 sm:p-8">
      <header className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-widest text-sky-600">
          AstroLens · Machine Learning Test
        </p>

        <h1 className="text-3xl font-bold">
          Semantic Skyline Segmentation
        </h1>

        <p className="max-w-3xl text-sm text-gray-600">
          SegFormer identifies sky pixels in each photograph.
          AstroLens then extracts a boundary from the resulting
          segmentation mask.
        </p>
      </header>

      <section className="rounded-xl border border-gray-200 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">Model progress</h2>
          <span className="text-sm text-gray-500">
            {progress}/5 images
          </span>
        </div>

        <div className="h-2 overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full rounded-full bg-sky-500 transition-all"
            style={{ width: `${(progress / 5) * 100}%` }}
          />
        </div>

        <p className="text-sm text-gray-600">{modelStatus}</p>

        <div className="grid grid-cols-3 gap-3 text-sm">
          <Summary label="Completed" value={String(completed)} />
          <Summary label="Failed" value={String(failed)} />
          <Summary label="Remaining" value={String(5 - completed - failed)} />
        </div>
      </section>

      <section className="flex flex-wrap gap-4 text-xs text-gray-600">
        <span className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-cyan-400" />
          Model-detected sky
        </span>

        <span className="flex items-center gap-2">
          <span className="h-0.5 w-5 bg-red-500" />
          Extracted boundary
        </span>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        {results.map((item) => {
          const segmentation = item.segmentation;
          const points = segmentation?.boundaryProfile ?? [];

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
                  className="absolute inset-0 h-full w-full object-fill"
                />

                {item.maskUrl && (
                  <img
                    src={item.maskUrl}
                    alt="Model sky segmentation mask"
                    className="absolute inset-0 h-full w-full object-fill"
                  />
                )}

                {points.length >= 2 && (
                  <svg
                    className="pointer-events-none absolute inset-0 h-full w-full"
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                  >
                    <polyline
                      points={points
                        .map(
                          (point) =>
                            `${point.xPercent},${point.yPercent}`,
                        )
                        .join(" ")}
                      fill="none"
                      stroke="#ff3030"
                      strokeWidth="0.8"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  </svg>
                )}

                {item.status === "loading" && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm text-white">
                    Running segmentation...
                  </div>
                )}

                {item.status === "waiting" && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-sm text-white">
                    Waiting...
                  </div>
                )}

                {item.status === "error" && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-4 text-center text-sm text-red-300">
                    {item.error}
                  </div>
                )}
              </div>

              <div className="space-y-2 p-4 text-sm">
                <Metric
                  label="Segmentation status"
                  value={item.status}
                />

                {segmentation && (
                  <>
                    <Metric
                      label="Sky coverage"
                      value={`${segmentation.skyCoveragePercent}%`}
                    />

                    <Metric
                      label="Boundary points"
                      value={String(points.length)}
                    />

                    <Metric
                      label="Mask dimensions"
                      value={`${segmentation.width} × ${segmentation.height}`}
                    />
                  </>
                )}

                {item.error && (
                  <p className="text-red-500">{item.error}</p>
                )}

                {segmentation && points.length < 2 && (
                  <p className="text-amber-600">
                    Not enough boundary points were found.
                  </p>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <section className="space-y-2 rounded-xl border border-gray-200 p-4">
        <h2 className="font-semibold">Evaluation criteria</h2>

        <ul className="list-disc space-y-1 pl-5 text-sm text-gray-600">
          <li>
            Does the cyan mask correctly identify the open sky?
          </li>
          <li>
            Does it exclude reflective glass buildings?
          </li>
          <li>
            Does it distinguish tree canopies and branches from sky?
          </li>
          <li>
            Does the red line follow the actual sky-to-foreground boundary?
          </li>
          <li>
            Does it handle sunset and twilight images?
          </li>
        </ul>
      </section>
    </main>
  );
}

function Summary({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg bg-gray-100 p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-gray-600">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
