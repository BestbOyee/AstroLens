"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { segmentSky } from "@/lib/skySegmentation";

export interface ObstructionAnalysis {
  obstructionPercent: number;
  skylineYPercent: number;
  estimatedSkylineAngleDegrees: number | null;
  confidencePercent: number;
  detectedColumnsPercent: number;
  status: "estimated" | "low-confidence";
  method: "on-device-heuristic" | "segformer";
  boundaryProfile?: Array<{ xPercent: number; yPercent: number }>;
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

interface AnalysisTask {
  sector: number;
  frame: HorizonScanFrame;
  generation: number;
}

const SECTOR_COUNT = 24;
const SECTOR_SIZE = 360 / SECTOR_COUNT;
const IMAGE_WIDTH = 640;
const IMAGE_HEIGHT = 360;
const ANALYSIS_WIDTH = 240;
const ANALYSIS_HEIGHT = 135;
const STABLE_HEADING_MS = 700;
const HEADING_TOLERANCE_DEGREES = 4;

// This is an uncalibrated image-relative estimate, not a true horizon altitude.
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

function isLikelySkyPixel(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const brightness = (r + g + b) / 3;
  const saturation = max - min;

  const blueSky =
    b > 65 && b >= r * 1.08 && b >= g * 0.94 && b - r >= 8;

  const brightNeutralSky =
    brightness > 165 && saturation < 38 && b >= r * 0.95;

  const paleBlueSky =
    brightness > 125 &&
    b >= r * 1.02 &&
    b >= g * 0.94 &&
    b - r >= 5 &&
    saturation < 75;

  const warmSky =
    brightness > 120 && r > 150 && r - g >= 35 && g - b >= 20;

  return blueSky || brightNeutralSky || paleBlueSky || warmSky;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

export function analyzeImagePixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): ObstructionAnalysis {
  const boundaries: number[] = [];
  const boundaryProfile: Array<{ xPercent: number; yPercent: number }> = [];
  const totalSampledColumns = Math.floor(width / 2);

  for (let x = 1; x < width; x += 2) {
    let consecutiveNonSky = 0;
    let detectedBoundary = -1;

    for (let y = 0; y < height; y += 1) {
      const index = (y * width + x) * 4;
      const r = pixels[index];
      const g = pixels[index + 1];
      const b = pixels[index + 2];

      if (isLikelySkyPixel(r, g, b)) {
        consecutiveNonSky = 0;
      } else {
        consecutiveNonSky += 1;
        if (consecutiveNonSky >= 3) {
          detectedBoundary = y - 2;
          break;
        }
      }
    }

    if (detectedBoundary >= 0) {
      const clampedBoundary = Math.max(0, Math.min(height, detectedBoundary));
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

  if (boundaries.length < totalSampledColumns * 0.15) {
    return {
      obstructionPercent: 0,
      skylineYPercent: 100,
      estimatedSkylineAngleDegrees: null,
      confidencePercent: Math.round(Math.min(30, detectedColumnsPercent * 0.3)),
      detectedColumnsPercent: Math.round(detectedColumnsPercent),
      status: "low-confidence",
      method: "on-device-heuristic",
      boundaryProfile,
    };
  }

  // Median smoothing limits the influence of isolated branches and antennas.
  const smoothedBoundaries = boundaries.map((value, index) => {
    const start = Math.max(0, index - 2);
    const end = Math.min(boundaries.length, index + 3);
    return median(boundaries.slice(start, end));
  });

  const meanBoundary =
    smoothedBoundaries.reduce((sum, value) => sum + value, 0) /
    smoothedBoundaries.length;

  const skylineYPercent = (meanBoundary / height) * 100;
  const obstructionPercent = 100 - skylineYPercent;
  const estimatedSkylineAngleDegrees =
    (0.5 - meanBoundary / height) * ASSUMED_VERTICAL_FOV_DEGREES;

  const coverageConfidence = Math.min(100, detectedColumnsPercent);
  const skyFraction = skylineYPercent / 100;
  const plausibleSceneFactor =
    skyFraction > 0.03 && skyFraction < 0.98 ? 1 : 0.55;
  const confidencePercent = Math.round(
    Math.max(0, Math.min(100, coverageConfidence * plausibleSceneFactor)),
  );

  return {
    obstructionPercent: Math.round(obstructionPercent),
    skylineYPercent: Math.round(skylineYPercent),
    estimatedSkylineAngleDegrees:
      Math.round(estimatedSkylineAngleDegrees * 10) / 10,
    confidencePercent,
    detectedColumnsPercent: Math.round(detectedColumnsPercent),
    status: confidencePercent >= 60 ? "estimated" : "low-confidence",
    method: "on-device-heuristic",
    boundaryProfile,
  };
}

function lowConfidenceAnalysis(): ObstructionAnalysis {
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

function analyzeCanvas(sourceCanvas: HTMLCanvasElement): ObstructionAnalysis {
  const analysisCanvas = document.createElement("canvas");
  analysisCanvas.width = ANALYSIS_WIDTH;
  analysisCanvas.height = ANALYSIS_HEIGHT;

  const context = analysisCanvas.getContext("2d", {
    willReadFrequently: true,
  });

  if (!context) return lowConfidenceAnalysis();

  context.drawImage(sourceCanvas, 0, 0, ANALYSIS_WIDTH, ANALYSIS_HEIGHT);

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
    return lowConfidenceAnalysis();
  }
}

async function analyzeImageDataUrlHeuristic(
  imageDataUrl: string,
): Promise<ObstructionAnalysis> {
  try {
    const image = new Image();
    image.src = imageDataUrl;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Could not load captured image."));
    });

    const canvas = document.createElement("canvas");
    canvas.width = IMAGE_WIDTH;
    canvas.height = IMAGE_HEIGHT;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return lowConfidenceAnalysis();

    context.drawImage(image, 0, 0, IMAGE_WIDTH, IMAGE_HEIGHT);
    return analyzeCanvas(canvas);
  } catch {
    return lowConfidenceAnalysis();
  }
}

async function analyzeWithSegmentation(
  imageDataUrl: string,
): Promise<ObstructionAnalysis> {
  try {
    const result = await segmentSky(imageDataUrl);
    const points = result.boundaryProfile;

    if (points.length < 2) {
      return analyzeImageDataUrlHeuristic(imageDataUrl);
    }

    const meanBoundary =
      points.reduce((sum, point) => sum + point.yPercent, 0) / points.length;
    const obstructionPercent = 100 - meanBoundary;
    const detectedColumnsPercent = Math.min(
      100,
      (points.length / Math.ceil(result.width / 2)) * 100,
    );

    return {
      obstructionPercent: Math.round(obstructionPercent),
      skylineYPercent: Math.round(meanBoundary),
      estimatedSkylineAngleDegrees:
        Math.round(
          ((50 - meanBoundary) / 100) *
            ASSUMED_VERTICAL_FOV_DEGREES *
            10,
        ) / 10,
      confidencePercent: Math.round(detectedColumnsPercent),
      detectedColumnsPercent: Math.round(detectedColumnsPercent),
      status: detectedColumnsPercent >= 15 ? "estimated" : "low-confidence",
      method: "segformer",
      boundaryProfile: points,
    };
  } catch (error) {
    console.warn("Segmentation failed; using heuristic fallback:", error);
    return analyzeImageDataUrlHeuristic(imageDataUrl);
  }
}

function formatAngle(value: number | null): string {
  return value === null ? "Unavailable" : `~${value.toFixed(1)}°`;
}

function getObstructionLabel(analysis?: ObstructionAnalysis): string {
  if (!analysis || analysis.status === "low-confidence") return "Uncertain";
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

  // SegFormer work is queued separately from capture, so image capture does
  // not wait for model inference before allowing the next sector.
  const analysisQueueRef = useRef<AnalysisTask[]>([]);
  const analysisWorkerRef = useRef(false);
  const scanGenerationRef = useRef(0);

  const [cameraReady, setCameraReady] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [heading, setHeading] = useState<number | null>(null);
  const [pitch, setPitch] = useState<number | null>(null);
  const [roll, setRoll] = useState<number | null>(null);
  const [headingSource, setHeadingSource] = useState<
    "compass" | "estimated" | null
  >(null);
  const [frames, setFrames] = useState<HorizonScanFrame[]>([]);
  const [processingSectors, setProcessingSectors] = useState<number[]>([]);
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

    if (videoRef.current) videoRef.current.srcObject = null;
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

  const processAnalysisQueue = useCallback(async () => {
    if (analysisWorkerRef.current) return;
    analysisWorkerRef.current = true;

    try {
      while (analysisQueueRef.current.length > 0) {
        const task = analysisQueueRef.current.shift();
        if (!task) continue;

        try {
          const obstruction = await analyzeWithSegmentation(
            task.frame.imageDataUrl,
          );

          // Ignore results from an old scan or an image that has since been
          // replaced by a newer capture in the same sector.
          if (task.generation === scanGenerationRef.current) {
            const latestFrame = framesRef.current.get(task.sector);
            if (latestFrame?.capturedAt === task.frame.capturedAt) {
              const analyzedFrame = { ...latestFrame, obstruction };
              framesRef.current.set(task.sector, analyzedFrame);
              setFrames(
                Array.from(framesRef.current.values()).sort(
                  (a, b) => a.azimuth - b.azimuth,
                ),
              );
            }
          }
        } catch (analysisError) {
          console.error("Image analysis failed:", analysisError);

          if (task.generation === scanGenerationRef.current) {
            const latestFrame = framesRef.current.get(task.sector);
            if (latestFrame?.capturedAt === task.frame.capturedAt) {
              const analyzedFrame = {
                ...latestFrame,
                obstruction: lowConfidenceAnalysis(),
              };
              framesRef.current.set(task.sector, analyzedFrame);
              setFrames(
                Array.from(framesRef.current.values()).sort(
                  (a, b) => a.azimuth - b.azimuth,
                ),
              );
            }
          }
        } finally {
          setProcessingSectors((current) => {
            const anotherTaskForSector = analysisQueueRef.current.some(
              (queued) =>
                queued.sector === task.sector &&
                queued.generation === scanGenerationRef.current,
            );
            return anotherTaskForSector
              ? current
              : current.filter((sector) => sector !== task.sector);
          });
        }
      }
    } finally {
      analysisWorkerRef.current = false;

      // The queue is checked again on every loop iteration. JavaScript
      // cannot interleave another capture between the final check and this
      // synchronous cleanup, so no queued task is stranded here.
    }
  }, []);

  const captureFrame = useCallback(() => {
    if (captureInProgressRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const orientation = latestOrientationRef.current;

    if (!video || !canvas || !orientation) {
      setMessage("Waiting for a usable compass heading before capturing.");
      return;
    }

    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      setMessage("Waiting for the camera image...");
      return;
    }

    const context = canvas.getContext("2d");
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

      const imageDataUrl = canvas.toDataURL("image/jpeg", 0.7);
      const sector = getSector(orientation.azimuth);
      const frame: HorizonScanFrame = {
        azimuth: orientation.azimuth,
        pitch: orientation.pitch,
        roll: orientation.roll,
        imageDataUrl,
        capturedAt: new Date().toISOString(),
        headingSource: orientation.source,
      };

      framesRef.current.set(sector, frame);
      setFrames(
        Array.from(framesRef.current.values()).sort(
          (a, b) => a.azimuth - b.azimuth,
        ),
      );

      analysisQueueRef.current.push({
        sector,
        frame,
        generation: scanGenerationRef.current,
      });
      setProcessingSectors((current) =>
        current.includes(sector) ? current : [...current, sector],
      );

      setMessage(
        `Captured sector ${sector + 1}/24 (${Math.round(
          orientation.azimuth,
        )}°, ${getDirection(orientation.azimuth)}). Image analysis is running in the background; you can continue scanning.`,
      );

      void processAnalysisQueue();
    } catch {
      setError("Could not capture this image. Try capturing the direction again.");
    } finally {
      // The lock protects only the quick camera-to-image copy, not AI analysis.
      captureInProgressRef.current = false;
    }
  }, [processAnalysisQueue]);

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
      const nextPitch = typeof event.beta === "number" ? event.beta : null;
      const nextRoll = typeof event.gamma === "number" ? event.gamma : null;

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
          `Facing sector ${sector + 1}/24 (${getDirection(
            result.azimuth,
          )}). Hold steady briefly to capture it.`,
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
        stableSince > 0 && nowMs - stableSince >= STABLE_HEADING_MS;
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
      window.removeEventListener("deviceorientation", handleOrientation);
    };
  }, [scanning, captureFrame, selectedSector]);

  const startScan = async () => {
    setError(null);

    const [sensorsEnabled, cameraStarted] = await Promise.all([
      enableSensors(),
      startCamera(),
    ]);

    if (!cameraStarted || !sensorsEnabled) {
      stopCamera();
      return;
    }

    scanGenerationRef.current += 1;
    analysisQueueRef.current = [];
    framesRef.current.clear();
    latestOrientationRef.current = null;
    captureInProgressRef.current = false;

    setFrames([]);
    setProcessingSectors([]);
    setHeading(null);
    setPitch(null);
    setRoll(null);
    setHeadingSource(null);
    setCurrentSector(null);
    setSelectedSector(null);
    setMessage(
      "Start facing north, then rotate clockwise slowly. Pause in each 15-degree sector. Captures are saved immediately and analyzed in the background.",
    );
    setScanning(true);
  };

  const finishScan = () => {
    const capturedFrames = Array.from(framesRef.current.values()).sort(
      (a, b) => a.azimuth - b.azimuth,
    );

    const missing = Array.from({ length: SECTOR_COUNT }, (_, sector) => sector)
      .filter((sector) => !framesRef.current.has(sector));

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

    const pendingAnalysis = capturedFrames.some((frame) => !frame.obstruction);
    if (
      pendingAnalysis ||
      analysisQueueRef.current.length > 0 ||
      analysisWorkerRef.current
    ) {
      setError(
        "All images are captured, but some are still being analyzed. Wait for the analysis queue to finish before completing the scan.",
      );
      return;
    }

    setScanning(false);
    stopCamera();
    onScanCompleteRef.current(capturedFrames);
  };

  const cancelScan = () => {
    scanGenerationRef.current += 1;
    analysisQueueRef.current = [];
    setProcessingSectors([]);
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
      scanGenerationRef.current += 1;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const capturedCount = frames.length;
  const coverage = Math.round((capturedCount / SECTOR_COUNT) * 100);
  const analyzedCount = frames.filter((frame) => frame.obstruction).length;
  const pendingCount = processingSectors.length;

  const nextMissingSector = Array.from(
    { length: SECTOR_COUNT },
    (_, sector) => sector,
  ).find((sector) => !framesRef.current.has(sector));

  const guidedTarget =
    selectedSector !== null
      ? selectedSector
      : currentSector !== null && !framesRef.current.has(currentSector)
        ? currentSector
        : nextMissingSector ?? currentSector;

  const turnInstruction = (() => {
    if (currentSector === null) {
      return "Hold your phone upright and wait for a compass heading.";
    }

    if (selectedSector !== null) {
      return currentSector === selectedSector
        ? `You are pointing toward sector ${
            selectedSector + 1
          }. Pause, then tap “Capture this direction”.`
        : `Rotate slowly toward sector ${selectedSector + 1} (${Math.round(
            sectorCenter(selectedSector),
          )}°).`;
    }

    if (capturedCount === SECTOR_COUNT) {
      return pendingCount > 0
        ? "All sectors are captured. Wait for the remaining image analyses."
        : "All 24 sectors are captured and analyzed. Review the estimates before finishing.";
    }

    if (currentSector === guidedTarget) {
      return `You are pointing toward sector ${currentSector + 1}. Pause briefly to capture it.`;
    }

    return guidedTarget !== null
      ? `Rotate clockwise toward sector ${guidedTarget + 1} (${Math.round(
          sectorCenter(guidedTarget),
        )}°). Keep the skyline visible.`
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
    <section className="space-y-4 rounded-xl border p-3 sm:space-y-5 sm:p-5">
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-blue-500 sm:text-sm">
          AstroLens · 24-sector horizon scan
        </p>
        <h2 className="mt-1 text-xl font-semibold">Scan your surroundings</h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          Hold your phone vertically and rotate through a full 360 degrees.
          Each image is saved immediately and analyzed locally in the
          background, so you do not need to wait for the AI model between
          directions.
        </p>
      </div>

      <div className="relative overflow-hidden rounded-xl bg-black">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="aspect-[4/3] w-full object-cover sm:aspect-video"
          aria-label="Live camera preview for the horizon scan"
        />

        {!cameraReady && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-white">
            Camera preview will appear here after you start the scan.
          </div>
        )}

        {cameraReady && heading !== null && (
          <div className="absolute bottom-2 left-2 right-2 flex items-center gap-2 rounded-xl border border-white/20 bg-black/75 p-2 text-white shadow-lg backdrop-blur-md sm:bottom-3 sm:left-3 sm:right-3 sm:gap-3 sm:rounded-2xl sm:p-3">
            <div className="relative h-16 w-16 shrink-0 sm:h-20 sm:w-20">
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
                        className={`absolute left-1/2 top-1/2 text-[10px] font-semibold sm:text-xs ${
                          label === "N" ? "text-cyan-300" : "text-white/90"
                        }`}
                        style={{
                          transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(-24px) rotate(${-angle}deg)`,
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
              <p className="text-[10px] uppercase tracking-widest text-white/60 sm:text-xs">
                Currently facing
              </p>
              <p className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
                {getDirection(heading)}
                <span className="ml-2 text-base font-normal text-cyan-300 sm:text-lg">
                  {Math.round(heading)}°
                </span>
              </p>
              <p className="mt-1 text-[10px] text-white/70 sm:text-xs">
                {headingSource === "compass"
                  ? "Compass heading"
                  : "Estimated heading"}
              </p>
            </div>
          </div>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />

      <details className="rounded-lg border px-3 py-2">
        <summary className="cursor-pointer py-1 text-sm font-medium">
          Technical sensor readings
        </summary>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-gray-50 p-2 dark:bg-gray-900 sm:p-3">
            <p className="text-xs text-gray-500">Heading</p>
            <p className="mt-1 font-semibold tabular-nums">
              {heading === null ? "—" : `${heading.toFixed(0)}°`}
            </p>
          </div>
          <div className="rounded-lg bg-gray-50 p-2 dark:bg-gray-900 sm:p-3">
            <p className="text-xs text-gray-500">Pitch</p>
            <p className="mt-1 font-semibold tabular-nums">
              {pitch === null ? "—" : `${pitch.toFixed(0)}°`}
            </p>
          </div>
          <div className="rounded-lg bg-gray-50 p-2 dark:bg-gray-900 sm:p-3">
            <p className="text-xs text-gray-500">Roll</p>
            <p className="mt-1 font-semibold tabular-nums">
              {roll === null ? "—" : `${roll.toFixed(0)}°`}
            </p>
          </div>
        </div>
      </details>

      <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950 sm:p-4">
        <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
          {capturedCount === SECTOR_COUNT
            ? pendingCount > 0
              ? `All sectors captured · ${pendingCount} analyses pending`
              : "All 24 sectors captured and analyzed"
            : guidedTarget !== null
              ? `Next target: sector ${guidedTarget + 1}/24 · ${Math.round(
                  sectorCenter(guidedTarget),
                )}°`
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
            className="mt-3 min-h-10 rounded-lg border border-blue-300 px-3 py-2 text-sm dark:border-blue-700"
          >
            Return to automatic guidance
          </button>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="font-medium">Scan coverage</span>
          <span className="tabular-nums">
            {capturedCount}/24 · {coverage}%
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

        <div className="grid grid-cols-6 gap-1.5 sm:gap-2">
          {Array.from({ length: SECTOR_COUNT }, (_, sector) => {
            const frame = frames.find(
              (item) => getSector(item.azimuth) === sector,
            );
            const captured = Boolean(frame);
            const analysis = frame?.obstruction;
            const isProcessing = processingSectors.includes(sector);
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
                    `Sector ${sector + 1} selected (${Math.round(
                      center,
                    )}°). Point the camera toward this heading, then capture it to update its estimate.`,
                  );
                }}
                aria-pressed={isTarget}
                aria-label={`Sector ${sector + 1}, ${Math.round(
                  center,
                )} degrees, ${
                  isProcessing
                    ? "analysis pending"
                    : captured
                      ? "captured"
                      : "missing"
                }`}
                className={`min-h-[62px] rounded-lg border p-1 text-center text-xs transition sm:min-h-14 sm:p-2 sm:text-sm ${
                  isProcessing
                    ? "border-blue-500 bg-blue-50 text-blue-900 dark:bg-blue-950 dark:text-blue-200"
                    : captured
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
                <span className="block text-[10px] sm:text-xs">
                  {Math.round(center)}° {getDirection(center)}
                </span>
                <span className="block text-[10px] sm:text-xs">
                  {isProcessing
                    ? "Analyzing…"
                    : captured
                      ? `${analysis?.obstructionPercent ?? "—"}% blocked`
                      : isCurrent
                        ? "Here"
                        : "Missing"}
                </span>
                {captured && analysis?.status === "low-confidence" && (
                  <span className="block text-[10px] sm:text-xs">
                    Check result
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <p className="text-xs text-gray-500">
          Blue sectors are being analyzed; green sectors have an estimate;
          amber sectors have low-confidence results. Select any sector to
          target or recapture it. All 24 sectors are required.
        </p>
      </div>

      <section className="space-y-3 rounded-xl border p-3 sm:p-4">
        <div>
          <h3 className="font-semibold">Obstruction analysis</h3>
          <p className="mt-1 text-xs text-gray-500">
            SegFormer analyzes each saved image in the background. The
            heuristic is used only if segmentation fails or returns too few
            boundary points.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900">
            <p className="text-xs text-gray-500">Mean image obstruction</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {averageObstruction === null ? "—" : `${averageObstruction}%`}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Across {analyzedCount} analyzed sectors
            </p>
          </div>
          <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900">
            <p className="text-xs text-gray-500">Analysis remaining</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {pendingCount}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {lowConfidenceCount} low-confidence results
            </p>
          </div>
        </div>

        {analyzedFrames.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Captured sector estimates</p>
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
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          Sector {String(sector + 1).padStart(2, "0")} ·{" "}
                          {Math.round(frame.azimuth)}° ·{" "}
                          {getDirection(frame.azimuth)}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          {getObstructionLabel(analysis)} obstruction ·{" "}
                          {analysis.confidencePercent}% confidence
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          Method:{" "}
                          {analysis.method === "segformer"
                            ? "SegFormer AI segmentation"
                            : "Heuristic fallback"}
                        </p>
                      </div>
                      <p className="shrink-0 text-lg font-semibold tabular-nums">
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

                    <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-gray-500 sm:grid-cols-2 sm:gap-2">
                      <p>
                        Skyline position: {analysis.skylineYPercent}% down
                        from image top
                      </p>
                      <p>
                        Approx. image-relative angle:{" "}
                        {formatAngle(analysis.estimatedSkylineAngleDegrees)}
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
            Obstruction estimates will appear here as images finish processing.
          </p>
        )}

        <p className="text-xs text-gray-500">
          Obstruction percentage estimates the portion of the image below the
          detected boundary. Skyline position is measured in image
          coordinates. The angle assumes a 60° vertical field of view and is
          only a rough image-relative estimate; it is not a calibrated
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

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {!scanning ? (
          <button
            type="button"
            onClick={startScan}
            className="min-h-12 w-full rounded-xl bg-blue-600 px-5 py-3 text-base font-semibold text-white shadow-lg hover:bg-blue-700 sm:w-auto"
          >
            Start 360° scan
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={captureFrame}
              className="min-h-14 w-full rounded-xl bg-blue-600 px-5 py-3 text-base font-semibold text-white shadow-lg hover:bg-blue-700 sm:w-auto"
            >
              Capture this direction
            </button>
            <button
              type="button"
              onClick={finishScan}
              disabled={
                capturedCount !== SECTOR_COUNT ||
                pendingCount > 0 ||
                analyzedCount !== SECTOR_COUNT
              }
              className="min-h-12 w-full rounded-xl border px-4 py-3 text-sm font-medium hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-gray-800 sm:w-auto"
            >
              {pendingCount > 0 ? `Analyzing ${pendingCount}…` : "Finish scan"}
            </button>
          </>
        )}

        <button
          type="button"
          onClick={cancelScan}
          className="min-h-12 w-full rounded-xl border px-4 py-3 text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-800 sm:w-auto"
        >
          Cancel
        </button>
      </div>

      <p className="text-xs text-gray-500">
        Images and analysis are processed locally in the browser. Night
        scenes, clouds, haze, sunsets, and unusual foreground colors can
        produce inaccurate estimates. Device pitch and roll are recorded as
        sensor readings; they are not used as calibrated camera angles.
        Images and measurements remain in browser memory unless the parent
        component saves them.
      </p>
    </section>
  );
}
