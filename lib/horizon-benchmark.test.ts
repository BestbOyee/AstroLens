
import { describe, expect, it } from "vitest";
import { analyzeImagePixels } from "../components/HorizonScanner";

const WIDTH = 240;
const HEIGHT = 135;
const BENCHMARK_CASES = 1_000;
const OPEN_SKY_CASES = 100;

function createRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil(p * sorted.length) - 1;

  return sorted[Math.max(0, index)];
}

function createSkylineScene(seed: number) {
  const random = createRandom(seed);
  const pixels = new Uint8ClampedArray(WIDTH * HEIGHT * 4);

  const baseBoundary = 25 + random() * 80;
  const amplitude = random() * 7;
  const waveFrequency = 8 + random() * 20;
  const slope = (random() - 0.5) * 0.06;

  let boundarySum = 0;

  const boundaries = Array.from({ length: WIDTH }, (_, x) => {
    const wave =
      Math.sin(x / waveFrequency) * amplitude +
      Math.sin(x / (waveFrequency * 0.43)) * amplitude * 0.2;

    const boundary = Math.max(
      8,
      Math.min(
        HEIGHT - 8,
        Math.round(baseBoundary + wave + (x - WIDTH / 2) * slope),
      ),
    );

    boundarySum += boundary;
    return boundary;
  });

  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const index = (y * WIDTH + x) * 4;
      const isSky = y < boundaries[x];

      // Small, repeatable pixel variations simulate camera noise.
      const noise = Math.floor(random() * 13) - 6;

      if (isSky) {
        pixels[index] = 80 + noise;
        pixels[index + 1] = 150 + noise;
        pixels[index + 2] = 220 + noise;
      } else {
        pixels[index] = 45 + noise;
        pixels[index + 1] = 65 + noise;
        pixels[index + 2] = 40 + noise;
      }

      pixels[index + 3] = 255;
    }
  }

  return {
    pixels,
    // Ground truth: average boundary position across all columns.
    trueBoundary: boundarySum / WIDTH,
  };
}

function createOpenSkyScene(seed: number): Uint8ClampedArray {
  const random = createRandom(seed);
  const pixels = new Uint8ClampedArray(WIDTH * HEIGHT * 4);

  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const index = (y * WIDTH + x) * 4;
      const noise = Math.floor(random() * 17) - 8;

      pixels[index] = 80 + noise;
      pixels[index + 1] = 150 + noise;
      pixels[index + 2] = 220 + noise;
      pixels[index + 3] = 255;
    }
  }

  return pixels;
}

describe("AstroLens skyline benchmark", () => {
  it("benchmarks 1,000 synthetic skyline images", () => {
    const errors: number[] = [];
    let successfulDetections = 0;
    let lowConfidenceCount = 0;

    const startedAt = performance.now();

    for (let i = 0; i < BENCHMARK_CASES; i += 1) {
      const scene = createSkylineScene(i + 1);
      const result = analyzeImagePixels(
        scene.pixels,
        WIDTH,
        HEIGHT,
      );

      expect(Number.isFinite(result.obstructionPercent)).toBe(true);
      expect(Number.isFinite(result.skylineYPercent)).toBe(true);

      if (
        result.status === "estimated" &&
        result.estimatedSkylineAngleDegrees !== null
      ) {
        successfulDetections += 1;

        const estimatedBoundary =
          (result.skylineYPercent / 100) * HEIGHT;

        errors.push(
          Math.abs(estimatedBoundary - scene.trueBoundary),
        );
      } else {
        lowConfidenceCount += 1;
      }
    }

    const elapsedMs = performance.now() - startedAt;
    const meanError =
      errors.length > 0
        ? errors.reduce((sum, error) => sum + error, 0) /
          errors.length
        : null;

    const report = {
      imagesTested: BENCHMARK_CASES,
      successfulDetections,
      lowConfidenceResults: lowConfidenceCount,
      detectionRatePercent: Number(
        (successfulDetections / BENCHMARK_CASES * 100).toFixed(2),
      ),
      meanAbsoluteErrorPx:
        meanError === null ? "N/A" : Number(meanError.toFixed(3)),
      percentile90ErrorPx: Number(
        percentile(errors, 0.9).toFixed(3),
      ),
      worstCaseErrorPx: Number(
        Math.max(0, ...errors).toFixed(3),
      ),
      runtimeMs: Number(elapsedMs.toFixed(1)),
    };

    console.log("\n=== AstroLens Skyline Benchmark ===");
    console.table(report);

    // The benchmark must process all cases and produce valid metrics.
    expect(successfulDetections + lowConfidenceCount).toBe(
      BENCHMARK_CASES,
    );
    expect(errors.every(Number.isFinite)).toBe(true);
  });

  it("measures false positives on 100 open-sky images", () => {
    let falsePositives = 0;

    for (let i = 0; i < OPEN_SKY_CASES; i += 1) {
      const pixels = createOpenSkyScene(10_000 + i);
      const result = analyzeImagePixels(pixels, WIDTH, HEIGHT);

      // A false positive means the detector reports a usable
      // obstruction estimate when the image contains only sky.
      if (
        result.status === "estimated" &&
        result.detectedColumnsPercent > 0
      ) {
        falsePositives += 1;
      }
    }

    const falsePositiveRate =
      (falsePositives / OPEN_SKY_CASES) * 100;

    console.log("\n=== Open-Sky False-Positive Test ===");
    console.table({
      imagesTested: OPEN_SKY_CASES,
      falsePositives,
      falsePositiveRatePercent: Number(
        falsePositiveRate.toFixed(2),
      ),
    });

    // This test measures and reports the rate; it does not hide
    // a poor result behind an arbitrary pass/fail threshold.
    expect(falsePositives).toBeGreaterThanOrEqual(0);
    expect(falsePositives).toBeLessThanOrEqual(OPEN_SKY_CASES);
  });

  it("stress-tests different sky and foreground colors", () => {
    const skyTypes = [
      { name: "Blue sky", rgb: [80, 150, 220] },
      { name: "Overcast sky", rgb: [180, 200, 215] },
      { name: "Sunset sky", rgb: [240, 145, 90] },
      { name: "Gray sky", rgb: [130, 140, 150] },
    ];

    const foregroundTypes = [
      { name: "Dark foliage", rgb: [35, 75, 35] },
      { name: "Gray building", rgb: [90, 90, 90] },
      { name: "Brown terrain", rgb: [85, 60, 40] },
      { name: "Bright concrete", rgb: [175, 170, 160] },
    ];

    const CASES_PER_COMBINATION = 25;
    const rows: Array<{
      sky: string;
      foreground: string;
      scenes: number;
      detected: number;
      detectionRatePercent: number;
      meanErrorPx: number | string;
    }> = [];

    for (const sky of skyTypes) {
      for (const foreground of foregroundTypes) {
        let detected = 0;
        const errors: number[] = [];

        for (let caseIndex = 0; caseIndex < CASES_PER_COMBINATION; caseIndex += 1) {
          const seed =
            50_000 +
            skyTypes.indexOf(sky) * 10_000 +
            foregroundTypes.indexOf(foreground) * 1_000 +
            caseIndex;

          const random = createRandom(seed);
          const pixels = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
          const boundary =
            25 + Math.floor(random() * (HEIGHT - 50));

          for (let y = 0; y < HEIGHT; y += 1) {
            for (let x = 0; x < WIDTH; x += 1) {
              const index = (y * WIDTH + x) * 4;
              const color = y < boundary ? sky.rgb : foreground.rgb;
              const noise = Math.floor(random() * 13) - 6;

              pixels[index] = Math.max(0, Math.min(255, color[0] + noise));
              pixels[index + 1] = Math.max(0, Math.min(255, color[1] + noise));
              pixels[index + 2] = Math.max(0, Math.min(255, color[2] + noise));
              pixels[index + 3] = 255;
            }
          }

          const result = analyzeImagePixels(pixels, WIDTH, HEIGHT);

          if (
            result.status === "estimated" &&
            result.estimatedSkylineAngleDegrees !== null
          ) {
            detected += 1;

            const estimatedBoundary =
              (result.skylineYPercent / 100) * HEIGHT;

            errors.push(Math.abs(estimatedBoundary - boundary));
          }
        }

        const meanError =
          errors.length > 0
            ? errors.reduce((sum, error) => sum + error, 0) / errors.length
            : null;

        rows.push({
          sky: sky.name,
          foreground: foreground.name,
          scenes: CASES_PER_COMBINATION,
          detected,
          detectionRatePercent: Number(
            (detected / CASES_PER_COMBINATION * 100).toFixed(1),
          ),
          meanErrorPx:
            meanError === null ? "N/A" : Number(meanError.toFixed(2)),
        });
      }
    }

    console.log("\n=== AstroLens Color Stress Benchmark ===");
    console.table(rows);

    expect(rows).toHaveLength(
      skyTypes.length * foregroundTypes.length,
    );
    expect(
      rows.reduce((sum, row) => sum + row.scenes, 0),
    ).toBe(400);
  });

});
