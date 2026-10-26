
"use client";

import { useCallback, useEffect, useRef, useState } from "react";


export interface ObstructionAnalysis {
  obstructionPercent: number;
  skylineYPercent: number;
  estimatedSkylineAngleDegrees: number | null;
  confidencePercent: number;
  detectedColumnsPercent: number;
  status: "estimated" | "low-confidence";
  method: "on-device-heuristic";
  boundaryProfile?: Array<{
    xPercent: number;
    yPercent: number;
  }>;
}


export interface HorizonScanFrame {
  azimuth: number;
  pitch: number | null;
  roll: number | null;
  imageDataUrl: string;
  capturedAt: string;
  headingSource: "compass" | "estimated";
  obstruction?: ObstructionAnalysis;
}

interface HorizonScannerProps {
  onScanComplete: (frames: HorizonScanFrame[]) => void;
  onCancel?: () => void;
}

const SECTOR_COUNT = 24;
const SECTOR_SIZE = 360 / SECTOR_COUNT;
const IMAGE_WIDTH = 640;
const IMAGE_HEIGHT = 360;
const ANALYSIS_WIDTH = 240;
const ANALYSIS_HEIGHT = 135;
const STABLE_HEADING_MS = 700;
const HEADING_TOLERANCE_DEGREES = 4;

// This is only an assumed vertical field of view. It is not calibrated
// to the device's actual camera lens or image stabilization/crop.
const ASSUMED_VERTICAL_FOV_DEGREES = 60;

function normalizeAzimuth(value: number): number {
  return ((value % 360) + 360) % 360;
}

function getSector(azimuth: number): number {
  return Math.floor(normalizeAzimuth(azimuth) / SECTOR_SIZE) % SECTOR_COUNT;
}

function sectorCenter(sector: number): number {
  return sector * SECTOR_SIZE + SECTOR_SIZE / 2;
}

function getDirection(azimuth: number): string {
  const directions = [
    "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
    "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
  ];
  return directions[Math.round(normalizeAzimuth(azimuth) / 22.5) % 16];
}

function angularDifference(a: number, b: number): number {
  const difference = Math.abs(normalizeAzimuth(a) - normalizeAzimuth(b));
  return Math.min(difference, 360 - difference);
}

function getHeading(event: DeviceOrientationEvent): {
  azimuth: number;
  source: "compass" | "estimated";
} | null {
  const extendedEvent = event as DeviceOrientationEvent & {
    webkitCompassHeading?: number;
  };

  if (
    typeof extendedEvent.webkitCompassHeading === "number" &&
    Number.isFinite(extendedEvent.webkitCompassHeading)
  ) {
    return {
      azimuth: normalizeAzimuth(extendedEvent.webkitCompassHeading),
      source: "compass",
    };
  }

  if (
    event.absolute &&
    typeof event.alpha === "number" &&
    Number.isFinite(event.alpha)
  ) {
    return {
      azimuth: normalizeAzimuth(360 - event.alpha),
      source: "estimated",
    };
  }

  return null;
}

/**
 * Heuristic sky classifier.
 *
 * This does not use a trained machine-learning model. It recognizes some
 * common blue-sky and bright, low-saturation sky colors. Clouds, haze,
 * sunsets, night scenes, snow, glass, and brightly lit objects can fool it.
 */

/**
 * Heuristic sky classifier.
 *
 * This is not a trained model. It recognizes common blue sky, pale blue
 * sky, and bright neutral sky/cloud colors. Night scenes, sunsets, haze,
 * snow, glass, and unusually colored objects can still cause errors.
 */

function isLikelySkyPixel(
  r: number,
  g: number,
  b: number,
): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const brightness = (r + g + b) / 3;
  const saturation = max - min;

  const blueSky =
    b > 65 &&
    b >= r * 1.08 &&
    b >= g * 0.94 &&
    b - r >= 8;

  const brightNeutralSky =
    brightness > 165 &&
    saturation < 38 &&
    b >= r * 0.95;

  const paleBlueSky =
    brightness > 125 &&
    b >= r * 1.02 &&
    b >= g * 0.94 &&
    b - r >= 5 &&
    saturation < 75;

  // Warm orange and pink sunset colors.
  // The channel differences help distinguish warm sky from
  // gray concrete and dark brown terrain.
  const warmSky =
    brightness > 120 &&
    r > 150 &&
    r - g >= 35 &&
    g - b >= 20;

  return blueSky || brightNeutralSky || paleBlueSky || warmSky;
}


/**
 * Calculates the median of a list of numbers.
 * The median is less sensitive to isolated trees, antennas, and other
 * narrow objects than a simple average.
 */
function median(values: number[]): number {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  return sorted[middle];
}

/**
 * Estimates the foreground boundary using vertical image samples.
 *
 * A column is considered usable only when a sufficient proportion of
 * its top pixels look like sky. This prevents a column that begins
 * inside a tree or building from automatically being counted as a
 * detected skyline.
 *
 * Columns with verified sky but no detected foreground are treated as
 * open sky. Their boundary is placed at the bottom of the image.
 *
 * obstructionPercent is an image-space estimate, not a measurement
 * of real-world terrain obstruction.
 *
 * estimatedSkylineAngleDegrees is only an approximate image-relative
 * angle based on an assumed vertical field of view. It is not a
 * calibrated altitude above the astronomical horizon.
 */


export function analyzeImagePixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): ObstructionAnalysis {
  const boundaries: number[] = [];

  const boundaryProfile: Array<{
    xPercent: number;
    yPercent: number;
  }> = [];

  const totalSampledColumns = Math.floor(width / 2);

  for (let x = 1; x < width; x += 2) {
    let consecutiveNonSky = 0;
    let detectedBoundary = -1;

    // Scan downward through this column, looking for foreground.
    for (let y = 0; y < height; y += 1) {
      const index = (y * width + x) * 4;

      const r = pixels[index];
      const g = pixels[index + 1];
      const b = pixels[index + 2];

      if (isLikelySkyPixel(r, g, b)) {
        consecutiveNonSky = 0;
      } else {
        consecutiveNonSky += 1;

        // Require three consecutive non-sky pixels to reduce noise.
        if (consecutiveNonSky >= 3) {
          detectedBoundary = y - 2;
          break;
        }
      }
    }

    // Preserve the detected point rather than discarding its position.
    if (detectedBoundary >= 0) {
      const clampedBoundary = Math.max(
        0,
        Math.min(height, detectedBoundary),
      );

      boundaries.push(clampedBoundary);

      boundaryProfile.push({
        xPercent: (x / (width - 1)) * 100,
        yPercent: (clampedBoundary / height) * 100,
      });
    }
  }

  const detectedColumnsPercent =
    totalSampledColumns > 0
      ? (boundaries.length / totalSampledColumns) * 100
      : 0;

  // Insufficient detections: retain available points but do not
  // claim that the overall obstruction estimate is reliable.
  if (boundaries.length < totalSampledColumns * 0.15) {
    return {
      obstructionPercent: 0,
      skylineYPercent: 100,
      estimatedSkylineAngleDegrees: null,
      confidencePercent: Math.round(
        Math.min(30, detectedColumnsPercent * 0.3),
      ),
      detectedColumnsPercent: Math.round(
        detectedColumnsPercent,
      ),
      status: "low-confidence",
      method: "on-device-heuristic",
      boundaryProfile,
    };
  }

  // Keep the existing average measurement for compatibility.
  const meanBoundary =
    boundaries.reduce((sum, value) => sum + value, 0) /
    boundaries.length;

  const skylineYPercent =
    (meanBoundary / height) * 100;

  const obstructionPercent = 100 - skylineYPercent;

  // Approximate image-relative angle using the existing assumed
  // vertical field of view. This is not calibrated altitude.
  const normalizedDisplacement =
    0.5 - meanBoundary / height;

  const estimatedSkylineAngleDegrees =
    normalizedDisplacement *
    ASSUMED_VERTICAL_FOV_DEGREES;

  // Confidence reflects detection coverage, not verified accuracy.
  const coverageConfidence = Math.min(
    100,
    detectedColumnsPercent,
  );

  const skyFraction = skylineYPercent / 100;

  const plausibleSceneFactor =
    skyFraction > 0.03 && skyFraction < 0.98
      ? 1
      : 0.55;

  const confidencePercent = Math.round(
    Math.max(
      0,
      Math.min(
        100,
        coverageConfidence * plausibleSceneFactor,
      ),
    ),
  );

  return {
    obstructionPercent: Math.round(obstructionPercent),
    skylineYPercent: Math.round(skylineYPercent),
    estimatedSkylineAngleDegrees:
      Math.round(estimatedSkylineAngleDegrees * 10) / 10,
    confidencePercent,
    detectedColumnsPercent: Math.round(
      detectedColumnsPercent,
    ),
    status:
      confidencePercent >= 60
        ? "estimated"
        : "low-confidence",
    method: "on-device-heuristic",
    boundaryProfile,
  };
}




function analyzeCanvas(
  sourceCanvas: HTMLCanvasElement,
): ObstructionAnalysis {
  const analysisCanvas = document.createElement("canvas");
  analysisCanvas.width = ANALYSIS_WIDTH;
  analysisCanvas.height = ANALYSIS_HEIGHT;

  const context = analysisCanvas.getContext("2d", {
    willReadFrequently: true,
  });

  if (!context) {
    return {
      obstructionPercent: 0,
      skylineYPercent: 100,
      estimatedSkylineAngleDegrees: null,
      confidencePercent: 0,
      detectedColumnsPercent: 0,
      status: "low-confidence",
      method: "on-device-heuristic",
    };
  }

  context.drawImage(
    sourceCanvas,
    0,
    0,
    ANALYSIS_WIDTH,
    ANALYSIS_HEIGHT,
  );

  try {
    const imageData = context.getImageData(
      0,
      0,
      ANALYSIS_WIDTH,
      ANALYSIS_HEIGHT,
    );

    return analyzeImagePixels(
      imageData.data,
      ANALYSIS_WIDTH,
      ANALYSIS_HEIGHT,
    );
  } catch {
    // Browsers can deny pixel reads in some circumstances.
    return {
      obstructionPercent: 0,
      skylineYPercent: 100,
      estimatedSkylineAngleDegrees: null,
      confidencePercent: 0,
      detectedColumnsPercent: 0,
      status: "low-confidence",
      method: "on-device-heuristic",
    };
  }
}

function formatAngle(value: number | null): string {
  return value === null ? "Unavailable" : `~${value.toFixed(1)}°`;
}

function getObstructionLabel(analysis?: ObstructionAnalysis): string {
  if (!analysis || analysis.status === "low-confidence") {
    return "Uncertain";
  }

  if (analysis.obstructionPercent < 20) return "Low";
  if (analysis.obstructionPercent < 45) return "Moderate";
  if (analysis.obstructionPercent < 70) return "High";
  return "Very high";
}

export default function HorizonScanner({
  onScanComplete,
  onCancel,
}: HorizonScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const framesRef = useRef<Map<number, HorizonScanFrame>>(new Map());
  const latestOrientationRef = useRef<{
    azimuth: number;
    pitch: number | null;
    roll: number | null;
    source: "compass" | "estimated";
  } | null>(null);
  const onScanCompleteRef = useRef(onScanComplete);
  const captureInProgressRef = useRef(false);

  const [cameraReady, setCameraReady] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [heading, setHeading] = useState<number | null>(null);
  const [pitch, setPitch] = useState<number | null>(null);
  const [roll, setRoll] = useState<number | null>(null);
  const [headingSource, setHeadingSource] = useState<
    "compass" | "estimated" | null
  >(null);
  const [frames, setFrames] = useState<HorizonScanFrame[]>([]);
  const [currentSector, setCurrentSector] = useState<number | null>(null);
  const [selectedSector, setSelectedSector] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState(
    "Allow camera and motion access to begin.",
  );

  useEffect(() => {
    onScanCompleteRef.current = onScanComplete;
  }, [onScanComplete]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCameraReady(false);
  }, []);

  const startCamera = useCallback(async (): Promise<boolean> => {
    setError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setError(
        "Camera access is unavailable. Open AstroLens using HTTPS or localhost in a supported browser.",
      );
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      streamRef.current = stream;
      const video = videoRef.current;

      if (!video) {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setError("The camera preview could not be initialized.");
        return false;
      }

      video.srcObject = stream;
      await video.play();
      setCameraReady(true);
      return true;
    } catch (caught) {
      const name = caught instanceof Error ? caught.name : "";

      if (name === "NotAllowedError" || name === "SecurityError") {
        setError(
          "Camera permission was denied. Allow camera access in your browser settings and try again.",
        );
      } else if (name === "NotFoundError") {
        setError("No compatible camera was found on this device.");
      } else {
        setError(
          "Could not start the camera. Check browser permissions and try again.",
        );
      }

      return false;
    }
  }, []);

  const enableSensors = useCallback(async (): Promise<boolean> => {
    setError(null);

    if (
      typeof window === "undefined" ||
      !("DeviceOrientationEvent" in window)
    ) {
      setError(
        "This browser does not expose device orientation. Try a supported mobile browser.",
      );
      return false;
    }

    try {
      const OrientationConstructor =
        window.DeviceOrientationEvent as typeof DeviceOrientationEvent & {
          requestPermission?: () => Promise<string>;
        };

      if (typeof OrientationConstructor.requestPermission === "function") {
        const permission = await OrientationConstructor.requestPermission();

        if (permission !== "granted") {
          setError(
            "Motion permission was not granted. Enable it in your browser settings to use the guided scan.",
          );
          return false;
        }
      }

      setMessage(
        "Sensors enabled. Hold the phone upright and point toward the skyline.",
      );
      return true;
    } catch {
      setError(
        "Could not enable orientation sensors. Check browser permissions and try again.",
      );
      return false;
    }
  }, []);

  const captureFrame = useCallback(() => {
    if (captureInProgressRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const orientation = latestOrientationRef.current;

    if (!video || !canvas || !orientation) {
      setMessage(
        "Waiting for a usable compass heading before capturing.",
      );
      return;
    }

    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      setMessage("Waiting for the camera image...");
      return;
    }

    const context = canvas.getContext("2d", {
      willReadFrequently: true,
    });

    if (!context) {
      setError("Could not initialize image capture.");
      return;
    }

    const sourceWidth = video.videoWidth;
    const sourceHeight = video.videoHeight;

    if (!sourceWidth || !sourceHeight) {
      setMessage("The camera has not produced an image yet.");
      return;
    }

    captureInProgressRef.current = true;

    try {
      canvas.width = IMAGE_WIDTH;
      canvas.height = IMAGE_HEIGHT;

      const targetRatio = IMAGE_WIDTH / IMAGE_HEIGHT;
      const sourceRatio = sourceWidth / sourceHeight;

      let sx = 0;
      let sy = 0;
      let sw = sourceWidth;
      let sh = sourceHeight;

      if (sourceRatio > targetRatio) {
        sw = sourceHeight * targetRatio;
        sx = (sourceWidth - sw) / 2;
      } else {
        sh = sourceWidth / targetRatio;
        sy = (sourceHeight - sh) / 2;
      }

      context.drawImage(
        video,
        sx,
        sy,
        sw,
        sh,
        0,
        0,
        IMAGE_WIDTH,
        IMAGE_HEIGHT,
      );

      // Both capture and analysis happen locally in the browser.
      const imageDataUrl = canvas.toDataURL("image/jpeg", 0.7);
      const obstruction = analyzeCanvas(canvas);
      const sector = getSector(orientation.azimuth);

      const frame: HorizonScanFrame = {
        azimuth: orientation.azimuth,
        pitch: orientation.pitch,
        roll: orientation.roll,
        imageDataUrl,
        capturedAt: new Date().toISOString(),
        headingSource: orientation.source,
        obstruction,
      };

      // Keep the newest image and its analysis in each 15-degree sector.
      framesRef.current.set(sector, frame);

      const updatedFrames = Array.from(
        framesRef.current.values(),
      ).sort((a, b) => a.azimuth - b.azimuth);

      setFrames(updatedFrames);

      
      const confidenceNote =
        obstruction.status === "estimated"
          ? `Estimated obstruction: ${obstruction.obstructionPercent}%. Confidence ${obstruction.confidencePercent}%.`
          : `Obstruction estimate unavailable. Low confidence (${obstruction.confidencePercent}%). Review or recapture this image if possible.`;

        setMessage(
        `Captured and analyzed sector ${sector + 1}/24 (${Math.round(orientation.azimuth)}°, ${getDirection(orientation.azimuth)}). ${confidenceNote}`,
        );

    } catch {
      setError(
        "Could not capture or analyze this image. Try capturing the direction again.",
      );
    } finally {
      captureInProgressRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!scanning) return;

    let lastAutoCapturedSector: number | null = null;
    let lastSeenSector: number | null = null;
    let previousHeading: number | null = null;
    let stableSince = 0;

    const handleOrientation = (event: DeviceOrientationEvent) => {
      const result = getHeading(event);

      if (!result) {
        setMessage(
          "Waiting for a reliable heading. Check motion permissions; manual capture is available when a heading is detected.",
        );
        return;
      }

      const nowMs = Date.now();
      const nextPitch =
        typeof event.beta === "number" ? event.beta : null;
      const nextRoll =
        typeof event.gamma === "number" ? event.gamma : null;

      latestOrientationRef.current = {
        azimuth: result.azimuth,
        pitch: nextPitch,
        roll: nextRoll,
        source: result.source,
      };

      setHeading(result.azimuth);
      setPitch(nextPitch);
      setRoll(nextRoll);
      setHeadingSource(result.source);

      const sector = getSector(result.azimuth);
      setCurrentSector(sector);

      if (sector !== lastSeenSector) {
        lastSeenSector = sector;
        stableSince = nowMs;
        previousHeading = result.azimuth;

        setMessage(
          `Facing sector ${sector + 1}/24 (${getDirection(result.azimuth)}). Hold steady briefly to capture and analyze it.`,
        );
      } else if (
        previousHeading === null ||
        angularDifference(result.azimuth, previousHeading) >
          HEADING_TOLERANCE_DEGREES
      ) {
        stableSince = nowMs;
        previousHeading = result.azimuth;
      }

      const headingIsStable =
        stableSince > 0 &&
        nowMs - stableSince >= STABLE_HEADING_MS;

      const sectorIsMissing = !framesRef.current.has(sector);
      const selectedTargetMatches =
        selectedSector === null || selectedSector === sector;

      if (
        headingIsStable &&
        sectorIsMissing &&
        selectedTargetMatches &&
        lastAutoCapturedSector !== sector
      ) {
        lastAutoCapturedSector = sector;
        captureFrame();
      }
    };

    window.addEventListener("deviceorientation", handleOrientation);

    return () => {
      window.removeEventListener(
        "deviceorientation",
        handleOrientation,
      );
    };
  }, [scanning, captureFrame, selectedSector]);

  const startScan = async () => {
    setError(null);

    // Invoke both permission APIs directly from the user's button action.
    const [sensorsEnabled, cameraStarted] = await Promise.all([
      enableSensors(),
      startCamera(),
    ]);

    if (!cameraStarted || !sensorsEnabled) {
      stopCamera();
      return;
    }

    framesRef.current.clear();
    latestOrientationRef.current = null;
    captureInProgressRef.current = false;

    setFrames([]);
    setHeading(null);
    setPitch(null);
    setRoll(null);
    setHeadingSource(null);
    setCurrentSector(null);
    setSelectedSector(null);
    setMessage(
      "Start facing north, then rotate clockwise slowly. Pause in each 15-degree sector to capture and analyze the full 360-degree horizon.",
    );
    setScanning(true);
  };

  const finishScan = () => {
    const capturedFrames = Array.from(
      framesRef.current.values(),
    ).sort((a, b) => a.azimuth - b.azimuth);

    const missing = Array.from(
      { length: SECTOR_COUNT },
      (_, sector) => sector,
    ).filter((sector) => !framesRef.current.has(sector));

    if (missing.length > 0) {
      setError(
        `Captured ${SECTOR_COUNT - missing.length} of ${SECTOR_COUNT} sectors. Missing: ${missing
          .map(
            (sector) =>
              `${sector + 1} (${Math.round(sectorCenter(sector))}°)`,
          )
          .join(", ")}. Select a missing sector, point toward it, and capture it before finishing.`,
      );
      return;
    }

    setScanning(false);
    stopCamera();
    onScanCompleteRef.current(capturedFrames);
  };

  const cancelScan = () => {
    setScanning(false);
    stopCamera();
    framesRef.current.clear();
    latestOrientationRef.current = null;
    captureInProgressRef.current = false;

    setFrames([]);
    setCurrentSector(null);
    setSelectedSector(null);
    setError(null);
    setMessage("Scan cancelled.");
    onCancel?.();
  };

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const capturedCount = frames.length;
  const coverage = Math.round(
    (capturedCount / SECTOR_COUNT) * 100,
  );

  const nextMissingSector = Array.from(
    { length: SECTOR_COUNT },
    (_, sector) => sector,
  ).find((sector) => !framesRef.current.has(sector));

  const guidedTarget =
    selectedSector !== null
      ? selectedSector
      : currentSector !== null &&
          !framesRef.current.has(currentSector)
        ? currentSector
        : nextMissingSector ?? currentSector;

  const turnInstruction = (() => {
    if (currentSector === null) {
      return "Hold your phone upright and wait for a compass heading.";
    }

    if (selectedSector !== null) {
      if (currentSector === selectedSector) {
        return `You are pointing toward sector ${selectedSector + 1}. Pause, then tap “Capture this direction” to analyze it.`;
      }

      return `Rotate slowly toward sector ${selectedSector + 1} (${Math.round(sectorCenter(selectedSector))}°).`;
    }

    if (capturedCount === SECTOR_COUNT) {
      return "All 24 sectors are captured and analyzed. Review the estimates before finishing.";
    }

    if (currentSector === guidedTarget) {
      return `You are pointing toward sector ${currentSector + 1}. Pause briefly so AstroLens can capture and analyze it.`;
    }

    return guidedTarget !== null
      ? `Rotate clockwise toward sector ${guidedTarget + 1} (${Math.round(sectorCenter(guidedTarget))}°). Keep the skyline visible.`
      : "Rotate slowly to review the horizon.";
  })();

  const analyzedFrames = frames.filter((frame) => frame.obstruction);
  const averageObstruction =
    analyzedFrames.length > 0
      ? Math.round(
          analyzedFrames.reduce(
            (sum, frame) =>
              sum + (frame.obstruction?.obstructionPercent ?? 0),
            0,
          ) / analyzedFrames.length,
        )
      : null;

  const lowConfidenceCount = analyzedFrames.filter(
    (frame) => frame.obstruction?.status === "low-confidence",
  ).length;

  return (
    <section className="space-y-4 rounded-xl border p-4 sm:p-5">
      <div>
        <p className="text-sm font-medium uppercase tracking-widest text-blue-500">
          AstroLens · 24-sector horizon scan
        </p>
        <h2 className="mt-1 text-xl font-semibold">
          Scan your surroundings
        </h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          Hold your phone vertically and capture the skyline through a full
          360-degree rotation. Each image is analyzed locally to estimate
          foreground obstruction and skyline position. Daylight scans usually
          work better with this initial image-processing method.
        </p>
      </div>

      <div className="relative overflow-hidden rounded-xl bg-black">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="aspect-video w-full object-cover"
          aria-label="Live camera preview for the horizon scan"
        />

        {!cameraReady && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-white">
            Camera preview will appear here after you start the scan.
          </div>
        )}

        {cameraReady && heading !== null && (
          <div className="absolute bottom-3 left-3 right-3 flex items-center gap-3 rounded-2xl border border-white/20 bg-black/75 p-3 text-white shadow-lg backdrop-blur-md">
            <div className="relative h-20 w-20 shrink-0">
              <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2">
                <div className="h-0 w-0 border-x-[7px] border-b-[11px] border-x-transparent border-b-cyan-400" />
              </div>

              <div
                className="absolute inset-1 rounded-full border border-white/40 transition-transform duration-150"
                style={{ transform: `rotate(${-heading}deg)` }}
              >
                {["N", "NE", "E", "SE", "S", "SW", "W", "NW"].map(
                  (label, index) => {
                    const angle = index * 45;

                    return (
                      <span
                        key={label}
                        className={`absolute left-1/2 top-1/2 text-xs font-semibold ${
                          label === "N"
                            ? "text-cyan-300"
                            : "text-white/90"
                        }`}
                        style={{
                          transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(-29px) rotate(${-angle}deg)`,
                        }}
                      >
                        {label}
                      </span>
                    );
                  },
                )}

                <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-400" />
              </div>
            </div>

            <div className="min-w-0">
              <p className="text-xs uppercase tracking-widest text-white/60">
                Currently facing
              </p>
              <p className="mt-1 text-3xl font-semibold tracking-tight">
                {getDirection(heading)}
                <span className="ml-2 text-lg font-normal text-cyan-300">
                  {Math.round(heading)}°
                </span>
              </p>
              <p className="mt-1 text-xs text-white/70">
                {headingSource === "compass"
                  ? "Compass heading"
                  : "Estimated heading"}
              </p>
            </div>
          </div>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900">
          <p className="text-xs text-gray-500">Heading</p>
          <p className="mt-1 font-semibold tabular-nums">
            {heading === null ? "—" : `${heading.toFixed(0)}°`}
          </p>
        </div>

        <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900">
          <p className="text-xs text-gray-500">Pitch</p>
          <p className="mt-1 font-semibold tabular-nums">
            {pitch === null ? "—" : `${pitch.toFixed(0)}°`}
          </p>
        </div>

        <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900">
          <p className="text-xs text-gray-500">Roll</p>
          <p className="mt-1 font-semibold tabular-nums">
            {roll === null ? "—" : `${roll.toFixed(0)}°`}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950">
        <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
          {capturedCount === SECTOR_COUNT
            ? "All 24 sectors captured and analyzed"
            : guidedTarget !== null
              ? `Next target: sector ${guidedTarget + 1}/24 · ${Math.round(sectorCenter(guidedTarget))}°`
              : "Waiting for compass heading"}
        </p>

        <p className="mt-1 text-sm text-gray-700 dark:text-gray-200">
          {turnInstruction}
        </p>

        {headingSource === "estimated" && (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
            Heading is approximate. Move slowly and use manual capture if
            directions appear inaccurate.
          </p>
        )}

        {selectedSector !== null && (
          <button
            type="button"
            onClick={() => setSelectedSector(null)}
            className="mt-3 min-h-11 rounded-lg border border-blue-300 px-3 py-2 text-sm dark:border-blue-700"
          >
            Return to automatic guidance
          </button>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Scan coverage</span>
          <span className="tabular-nums">
            {capturedCount}/24 sectors · {coverage}%
          </span>
        </div>

        <div
          className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"
          role="progressbar"
          aria-label="Horizon scan coverage"
          aria-valuemin={0}
          aria-valuemax={SECTOR_COUNT}
          aria-valuenow={capturedCount}
        >
          <div
            className="h-full rounded-full bg-blue-600 transition-all"
            style={{ width: `${coverage}%` }}
          />
        </div>

        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
          {Array.from({ length: SECTOR_COUNT }, (_, sector) => {
            const frame = framesRef.current.get(sector);
            const captured = Boolean(frame);
            const analysis = frame?.obstruction;
            const isCurrent = currentSector === sector;
            const isTarget = guidedTarget === sector;
            const center = sectorCenter(sector);

            return (
              <button
                key={sector}
                type="button"
                onClick={() => {
                  setSelectedSector(sector);
                  setError(null);
                  setMessage(
                    `Sector ${sector + 1} selected (${Math.round(center)}°). Point the camera toward this heading, then capture it to update its obstruction estimate.`,
                  );
                }}
                aria-pressed={isTarget}
                aria-label={`Sector ${sector + 1}, ${Math.round(center)} degrees, ${
                  captured ? "captured" : "missing"
                }`}
                className={`min-h-14 rounded-lg border p-2 text-sm transition ${
                  captured
                    ? analysis?.status === "low-confidence"
                      ? "border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
                      : "border-green-600 bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200"
                    : isTarget
                      ? "border-blue-600 bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-200"
                      : "border-gray-300 dark:border-gray-700"
                }`}
              >
                <span className="block font-semibold">
                  {String(sector + 1).padStart(2, "0")}
                </span>
                <span className="block text-xs">
                  {Math.round(center)}° · {getDirection(center)}
                </span>
                <span className="block text-xs">
                  {captured
                    ? `${analysis?.obstructionPercent ?? "—"}% blocked`
                    : isCurrent
                      ? "Here"
                      : "Missing"}
                </span>
                {captured && analysis?.status === "low-confidence" && (
                  <span className="block text-xs">Check estimate</span>
                )}
              </button>
            );
          })}
        </div>

        <p className="text-xs text-gray-500">
          Green sectors have an estimate; amber sectors have low-confidence
          results. Select any sector to target or recapture it. All 24 sectors
          are required to finish.
        </p>
      </div>

      <section className="space-y-3 rounded-xl border p-4">
        <div>
          <h3 className="font-semibold">Obstruction analysis</h3>
          <p className="mt-1 text-xs text-gray-500">
            On-device heuristic estimates from captured images. Results are
            not calibrated astronomical horizon altitudes.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900">
            <p className="text-xs text-gray-500">
              Mean image obstruction
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {averageObstruction === null
                ? "—"
                : `${averageObstruction}%`}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Across {analyzedFrames.length} analyzed sectors
            </p>
          </div>

          <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900">
            <p className="text-xs text-gray-500">
              Low-confidence sectors
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {lowConfidenceCount}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              May need recapturing
            </p>
          </div>
        </div>

        {analyzedFrames.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">
              Captured sector estimates
            </p>

            {analyzedFrames
              .slice()
              .sort((a, b) => a.azimuth - b.azimuth)
              .map((frame) => {
                const analysis = frame.obstruction!;
                const sector = getSector(frame.azimuth);

                return (
                  <div
                    key={`${sector}-${frame.capturedAt}`}
                    className="rounded-lg border p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">
                          Sector {String(sector + 1).padStart(2, "0")} ·{" "}
                          {Math.round(frame.azimuth)}° ·{" "}
                          {getDirection(frame.azimuth)}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          {getObstructionLabel(analysis)} obstruction ·{" "}
                          {analysis.confidencePercent}% confidence
                        </p>
                      </div>

                      <p className="text-lg font-semibold tabular-nums">
                        {analysis.obstructionPercent}%
                      </p>
                    </div>

                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                      <div
                        className={`h-full rounded-full ${
                          analysis.status === "low-confidence"
                            ? "bg-amber-500"
                            : "bg-blue-600"
                        }`}
                        style={{
                          width: `${analysis.obstructionPercent}%`,
                        }}
                      />
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-500">
                      <p>
                        Skyline position: {analysis.skylineYPercent}% down
                        from image top
                      </p>
                      <p>
                        Approx. image-relative angle:{" "}
                        {formatAngle(
                          analysis.estimatedSkylineAngleDegrees,
                        )}
                      </p>
                    </div>

                    {analysis.status === "low-confidence" && (
                      <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                        The algorithm could not confidently identify the
                        skyline. This percentage may be inaccurate.
                      </p>
                    )}
                  </div>
                );
              })}
          </div>
        )}

        {analyzedFrames.length === 0 && (
          <p className="text-sm text-gray-500">
            Obstruction estimates will appear here as you capture sectors.
          </p>
        )}

        <p className="text-xs text-gray-500">
          The obstruction percentage estimates the portion of the image below
          the detected boundary. The skyline position is measured in image
          coordinates. The angle assumes a 60° vertical field of view and is
          only a rough image-relative estimate. Neither value is a calibrated
          altitude above the astronomical horizon.
        </p>
      </section>

      <p
        className="rounded-lg border p-3 text-sm text-gray-600 dark:text-gray-300"
        aria-live="polite"
      >
        {message}
      </p>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-300 p-3 text-sm text-red-700 dark:border-red-900 dark:text-red-300"
        >
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {!scanning ? (
          <button
            type="button"
            onClick={startScan}
            className="min-h-11 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            Start 360° scan
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={captureFrame}
              className="min-h-11 rounded-lg border px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              Capture this direction
            </button>

            <button
              type="button"
              onClick={finishScan}
              className="min-h-11 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            >
              Finish scan
            </button>
          </>
        )}

        <button
          type="button"
          onClick={cancelScan}
          className="min-h-11 rounded-lg border px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          Cancel
        </button>
      </div>

      <p className="text-xs text-gray-500">
        Images and analysis are processed locally in the browser. This
        heuristic is an initial prototype, not a trained sky-segmentation
        model. Night scenes, clouds, haze, sunsets, and unusual foreground
        colors can produce inaccurate estimates. Images and measurements
        remain in browser memory unless the parent component saves them.
      </p>
    </section>
  );
}
