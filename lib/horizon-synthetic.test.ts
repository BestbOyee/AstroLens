
import { describe, expect, it } from "vitest";
import { analyzeImagePixels } from "../components/HorizonScanner";

const WIDTH = 240;
const HEIGHT = 135;

type BoundaryFunction = (x: number) => number;

/**
 * Generate an RGBA image entirely in memory.
 * Above the boundary is blue sky; below it is a dark obstruction.
 * The boundary function is the known correct answer for each column.
 */
function makeSyntheticImage(boundaryAt: BoundaryFunction) {
  const pixels = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
  const trueBoundaries: number[] = [];

  for (let x = 0; x < WIDTH; x += 1) {
    const boundary = Math.max(
      4,
      Math.min(HEIGHT - 4, Math.round(boundaryAt(x))),
    );

    trueBoundaries.push(boundary);

    for (let y = 0; y < HEIGHT; y += 1) {
      const index = (y * WIDTH + x) * 4;
      const isSky = y < boundary;

      if (isSky) {
        // Blue sky that satisfies the current detector's sky classifier.
        pixels[index] = 80;
        pixels[index + 1] = 150;
        pixels[index + 2] = 220;
      } else {
        // Dark building/tree silhouette, classified as non-sky.
        pixels[index] = 45;
        pixels[index + 1] = 45;
        pixels[index + 2] = 45;
      }

      pixels[index + 3] = 255;
    }
  }

  // The detector samples x = 1, 3, 5, ... rather than every column.
  const sampledBoundaries = trueBoundaries.filter(
    (_, x) => x % 2 === 1,
  );

  const expectedMeanBoundary =
    sampledBoundaries.reduce((sum, value) => sum + value, 0) /
    sampledBoundaries.length;

  return {
    pixels,
    expectedMeanBoundary,
  };
}

function runSyntheticCase(boundaryAt: BoundaryFunction) {
  const { pixels, expectedMeanBoundary } =
    makeSyntheticImage(boundaryAt);

  const result = analyzeImagePixels(pixels, WIDTH, HEIGHT);
  
  // Convert the detector's rounded percentage back to pixel coordinates.
  const estimatedBoundary =
    (result.skylineYPercent / 100) * HEIGHT;

  return {
    result,
    expectedMeanBoundary,
    estimatedBoundary,
    errorPixels: Math.abs(
      estimatedBoundary - expectedMeanBoundary,
    ),
  };
}

describe("AstroLens synthetic skyline detector", () => {
  it("estimates a flat skyline near the top of the image", () => {
    const test = runSyntheticCase(() => 25);

    expect(test.result.status).toBe("estimated");
    expect(test.errorPixels).toBeLessThanOrEqual(1.5);
  });

  it("estimates a medium-height obstruction", () => {
    const test = runSyntheticCase(() => 68);

    expect(test.result.status).toBe("estimated");
    expect(test.errorPixels).toBeLessThanOrEqual(1.5);
  });

  it("estimates a tall obstruction", () => {
    const test = runSyntheticCase(() => 110);

    expect(test.result.status).toBe("estimated");
    expect(test.errorPixels).toBeLessThanOrEqual(1.5);
  });

  it("handles an uneven, tree-like skyline", () => {
    const test = runSyntheticCase(
      (x) =>
        65 +
        13 * Math.sin(x / 15) +
        6 * Math.sin(x / 4.5),
    );

    expect(test.result.status).toBe("estimated");
    expect(test.errorPixels).toBeLessThanOrEqual(1.5);
  });

  it("reports low confidence when the entire image is open sky", () => {
    const pixels = new Uint8ClampedArray(WIDTH * HEIGHT * 4);

    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = 80;
      pixels[i + 1] = 150;
      pixels[i + 2] = 220;
      pixels[i + 3] = 255;
    }

    const result = analyzeImagePixels(pixels, WIDTH, HEIGHT);
    console.log("All-sky test result:", result);
    expect(result.status).toBe("low-confidence");
    expect(result.detectedColumnsPercent).toBe(0);
    expect(result.estimatedSkylineAngleDegrees).toBeNull();
  });

  it("passes a batch of 500 randomized flat-skyline cases", () => {
    // Seeded pseudo-random generator: same cases on every run.
    let seed = 20261020;

    function nextRandom() {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    }

    let totalError = 0;
    let maxError = 0;

    for (let i = 0; i < 500; i += 1) {
      // Keep boundaries away from the image edges.
      const boundary = 8 + Math.floor(nextRandom() * 112);
      const test = runSyntheticCase(() => boundary);

      totalError += test.errorPixels;
      maxError = Math.max(maxError, test.errorPixels);

      expect(
        test.errorPixels,
        `Case ${i + 1}: true boundary ${boundary}px`,
      ).toBeLessThanOrEqual(1.5);

      expect(test.result.status).toBe("estimated");
    }

    console.info(
      [
        "AstroLens synthetic batch results:",
        "Images tested: 500",
        `Mean boundary error: ${(totalError / 500).toFixed(3)} px`,
        `Maximum boundary error: ${maxError.toFixed(3)} px`,
      ].join("\n"),
    );
  });

  it("detects a building covering only the left half of the image", () => {
    const pixels = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
    const boundary = 60;

    for (let y = 0; y < HEIGHT; y += 1) {
      for (let x = 0; x < WIDTH; x += 1) {
        const index = (y * WIDTH + x) * 4;
        const isSky = x >= WIDTH / 2 || y < boundary;

        if (isSky) {
          pixels[index] = 80;
          pixels[index + 1] = 150;
          pixels[index + 2] = 220;
        } else {
          pixels[index] = 45;
          pixels[index + 1] = 45;
          pixels[index + 2] = 45;
        }

        pixels[index + 3] = 255;
      }
    }

    const result = analyzeImagePixels(pixels, WIDTH, HEIGHT);
    const estimatedBoundary = (result.skylineYPercent / 100) * HEIGHT;

    expect(result.detectedColumnsPercent).toBeGreaterThanOrEqual(45);
    expect(result.detectedColumnsPercent).toBeLessThanOrEqual(55);
    expect(result.estimatedSkylineAngleDegrees).not.toBeNull();
    expect(Math.abs(estimatedBoundary - boundary)).toBeLessThanOrEqual(2);
  });

  it("estimates a skyline despite deterministic camera-like color noise", () => {
    const pixels = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
    const boundary = 70;

    for (let y = 0; y < HEIGHT; y += 1) {
      for (let x = 0; x < WIDTH; x += 1) {
        const index = (y * WIDTH + x) * 4;
        const isSky = y < boundary;

        // Repeatable small color variations simulate image noise.
        const noise = ((x * 7 + y * 11) % 17) - 8;

        if (isSky) {
          pixels[index] = 80 + noise;
          pixels[index + 1] = 150 + noise;
          pixels[index + 2] = 220 + noise;
        } else {
          pixels[index] = 45 + noise;
          pixels[index + 1] = 45 + noise;
          pixels[index + 2] = 45 + noise;
        }

        pixels[index + 3] = 255;
      }
    }

    const result = analyzeImagePixels(pixels, WIDTH, HEIGHT);
    const estimatedBoundary = (result.skylineYPercent / 100) * HEIGHT;

    expect(result.status).toBe("estimated");
    expect(result.detectedColumnsPercent).toBe(100);
    expect(Math.abs(estimatedBoundary - boundary)).toBeLessThanOrEqual(2);
  });
  
  it("detects an irregular tree line", () => {
    const pixels = new Uint8ClampedArray(WIDTH * HEIGHT * 4);

    for (let y = 0; y < HEIGHT; y += 1) {
      for (let x = 0; x < WIDTH; x += 1) {
        const index = (y * WIDTH + x) * 4;
        const boundary = Math.round(
          62 + Math.sin(x / 13) * 8 + Math.sin(x / 5) * 2,
        );
        const isSky = y < boundary;

        if (isSky) {
          pixels[index] = 80;
          pixels[index + 1] = 150;
          pixels[index + 2] = 220;
        } else {
          // Dark green foliage.
          pixels[index] = 35;
          pixels[index + 1] = 85;
          pixels[index + 2] = 40;
        }

        pixels[index + 3] = 255;
      }
    }

    const result = analyzeImagePixels(pixels, WIDTH, HEIGHT);
    const estimatedBoundary = (result.skylineYPercent / 100) * HEIGHT;

    expect(result.status).toBe("estimated");
    expect(result.detectedColumnsPercent).toBeGreaterThan(90);
    expect(estimatedBoundary).toBeGreaterThanOrEqual(55);
    expect(estimatedBoundary).toBeLessThanOrEqual(70);
  });

  it("keeps bright clouds above a flat skyline from appearing as obstructions", () => {
    const pixels = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
    const boundary = 65;

    for (let y = 0; y < HEIGHT; y += 1) {
      for (let x = 0; x < WIDTH; x += 1) {
        const index = (y * WIDTH + x) * 4;
        const isSky = y < boundary;

        // Several deterministic cloud patches entirely above the horizon.
        const inCloud =
          isSky &&
          (
            ((x - 35) ** 2) / 500 + ((y - 25) ** 2) / 70 < 1 ||
            ((x - 125) ** 2) / 850 + ((y - 35) ** 2) / 100 < 1 ||
            ((x - 200) ** 2) / 450 + ((y - 18) ** 2) / 55 < 1
          );

        if (!isSky) {
          pixels[index] = 45;
          pixels[index + 1] = 45;
          pixels[index + 2] = 45;
        } else if (inCloud) {
          pixels[index] = 225;
          pixels[index + 1] = 225;
          pixels[index + 2] = 225;
        } else {
          pixels[index] = 80;
          pixels[index + 1] = 150;
          pixels[index + 2] = 220;
        }

        pixels[index + 3] = 255;
      }
    }

    const result = analyzeImagePixels(pixels, WIDTH, HEIGHT);
    const estimatedBoundary = (result.skylineYPercent / 100) * HEIGHT;

    expect(result.status).toBe("estimated");
    expect(result.detectedColumnsPercent).toBe(100);
    expect(Math.abs(estimatedBoundary - boundary)).toBeLessThanOrEqual(2);
  });

  it("estimates the boundary of buildings with different heights", () => {
    const pixels = new Uint8ClampedArray(WIDTH * HEIGHT * 4);

    for (let y = 0; y < HEIGHT; y += 1) {
      for (let x = 0; x < WIDTH; x += 1) {
        const index = (y * WIDTH + x) * 4;

        // Three building sections with different roof heights.
        const boundary =
          x < WIDTH / 3 ? 45 :
          x < (WIDTH * 2) / 3 ? 70 :
          55;

        const isSky = y < boundary;

        if (isSky) {
          pixels[index] = 80;
          pixels[index + 1] = 150;
          pixels[index + 2] = 220;
        } else {
          pixels[index] = 45;
          pixels[index + 1] = 45;
          pixels[index + 2] = 45;
        }

        pixels[index + 3] = 255;
      }
    }

    const result = analyzeImagePixels(pixels, WIDTH, HEIGHT);
    const estimatedBoundary = (result.skylineYPercent / 100) * HEIGHT;

    expect(result.status).toBe("estimated");
    expect(result.detectedColumnsPercent).toBe(100);
    expect(estimatedBoundary).toBeGreaterThanOrEqual(52);
    expect(estimatedBoundary).toBeLessThanOrEqual(64);
  });

});
