"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface HorizonScanFrame {
  azimuth: number;
  pitch: number | null;
  roll: number | null;
  imageDataUrl: string;
  capturedAt: string;
  headingSource: "compass" | "estimated";
}

interface HorizonScannerProps {
  onScanComplete: (frames: HorizonScanFrame[]) => void;
  onCancel?: () => void;
}

const SECTOR_COUNT = 24;
const SECTOR_SIZE = 360 / SECTOR_COUNT; // 15 degrees
const IMAGE_WIDTH = 640;
const IMAGE_HEIGHT = 360;
const STABLE_HEADING_MS = 700;
const HEADING_TOLERANCE_DEGREES = 4;

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

  const [cameraReady, setCameraReady] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [heading, setHeading] = useState<number | null>(null);
  const [pitch, setPitch] = useState<number | null>(null);
  const [roll, setRoll] = useState<number | null>(null);
  const [headingSource, setHeadingSource] = useState<"compass" | "estimated" | null>(null);
  const [frames, setFrames] = useState<HorizonScanFrame[]>([]);
  const [currentSector, setCurrentSector] = useState<number | null>(null);
  const [selectedSector, setSelectedSector] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("Allow camera and motion access to begin.");

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
      setError("Camera access is unavailable. Open AstroLens using HTTPS or localhost in a supported browser.");
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
        setError("Camera permission was denied. Allow camera access in your browser settings and try again.");
      } else if (name === "NotFoundError") {
        setError("No compatible camera was found on this device.");
      } else {
        setError("Could not start the camera. Check browser permissions and try again.");
      }
      return false;
    }
  }, []);

  const enableSensors = useCallback(async (): Promise<boolean> => {
    setError(null);

    if (typeof window === "undefined" || !("DeviceOrientationEvent" in window)) {
      setError("This browser does not expose device orientation. Try a supported mobile browser.");
      return false;
    }

    try {
      const OrientationConstructor = window.DeviceOrientationEvent as typeof DeviceOrientationEvent & {
        requestPermission?: () => Promise<string>;
      };

      if (typeof OrientationConstructor.requestPermission === "function") {
        const permission = await OrientationConstructor.requestPermission();
        if (permission !== "granted") {
          setError("Motion permission was not granted. Enable it in your browser settings to use the guided scan.");
          return false;
        }
      }

      setMessage("Sensors enabled. Hold the phone upright and point toward the skyline.");
      return true;
    } catch {
      setError("Could not enable orientation sensors. Check browser permissions and try again.");
      return false;
    }
  }, []);

  const captureFrame = useCallback(() => {
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

    context.drawImage(video, sx, sy, sw, sh, 0, 0, IMAGE_WIDTH, IMAGE_HEIGHT);
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

    // Keep the newest image in each 15-degree sector.
    framesRef.current.set(sector, frame);
    const updatedFrames = Array.from(framesRef.current.values()).sort(
      (a, b) => a.azimuth - b.azimuth,
    );
    setFrames(updatedFrames);
    setMessage(
      `Captured sector ${sector + 1}/24 (${Math.round(orientation.azimuth)}°, ${getDirection(orientation.azimuth)}). Continue to the next uncovered sector or select a sector to retry.`,
    );
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
        setMessage("Waiting for a reliable heading. Check motion permissions; manual capture is available when a heading is detected.");
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
        setMessage(`Facing sector ${sector + 1}/24 (${getDirection(result.azimuth)}). Hold steady briefly to capture it.`);
      } else if (
        previousHeading === null ||
        angularDifference(result.azimuth, previousHeading) > HEADING_TOLERANCE_DEGREES
      ) {
        stableSince = nowMs;
        previousHeading = result.azimuth;
      }

      const headingIsStable = stableSince > 0 && nowMs - stableSince >= STABLE_HEADING_MS;
      const sectorIsMissing = !framesRef.current.has(sector);
      const selectedTargetMatches = selectedSector === null || selectedSector === sector;

      if (headingIsStable && sectorIsMissing && selectedTargetMatches && lastAutoCapturedSector !== sector) {
        lastAutoCapturedSector = sector;
        captureFrame();
      }
    };

    window.addEventListener("deviceorientation", handleOrientation);
    return () => window.removeEventListener("deviceorientation", handleOrientation);
  }, [scanning, captureFrame, selectedSector]);

  const startScan = async () => {
    setError(null);
    // Call both permission APIs directly from the user's button action.
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
    setFrames([]);
    setHeading(null);
    setPitch(null);
    setRoll(null);
    setHeadingSource(null);
    setCurrentSector(null);
    setSelectedSector(null);
    setMessage("Start facing north, then rotate clockwise slowly. Pause in each 15-degree sector to capture the full 360° horizon.");
    setScanning(true);
  };

  const finishScan = () => {
    const capturedFrames = Array.from(framesRef.current.values()).sort(
      (a, b) => a.azimuth - b.azimuth,
    );
    const missing = Array.from({ length: SECTOR_COUNT }, (_, sector) => sector).filter(
      (sector) => !framesRef.current.has(sector),
    );

    if (missing.length > 0) {
      setError(
        `Captured ${SECTOR_COUNT - missing.length} of ${SECTOR_COUNT} sectors. Missing: ${missing
          .map((sector) => `${sector + 1} (${Math.round(sectorCenter(sector))}°)`)
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
    setFrames([]);
    setCurrentSector(null);
    setSelectedSector(null);
    setError(null);
    setMessage("Scan cancelled.");
    onCancel?.();
  };

  useEffect(() => {
    return () => streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const capturedCount = frames.length;
  const coverage = Math.round((capturedCount / SECTOR_COUNT) * 100);
  const nextMissingSector = Array.from({ length: SECTOR_COUNT }, (_, sector) => sector).find(
    (sector) => !framesRef.current.has(sector),
  );
  const guidedTarget =
    selectedSector !== null
      ? selectedSector
      : currentSector !== null && !framesRef.current.has(currentSector)
        ? currentSector
        : nextMissingSector ?? currentSector;

  const turnInstruction = (() => {
    if (currentSector === null) return "Hold your phone upright and wait for a compass heading.";
    if (selectedSector !== null) {
      if (currentSector === selectedSector) {
        return `You are pointing toward sector ${selectedSector + 1}. Pause, then tap “Capture this direction” if it has not been captured.`;
      }
      return `Rotate slowly toward sector ${selectedSector + 1} (${Math.round(sectorCenter(selectedSector))}°).`;
    }
    if (capturedCount === SECTOR_COUNT) return "All 24 sectors are captured. You can finish the scan.";
    if (currentSector === guidedTarget) return `You are pointing toward sector ${currentSector + 1}. Pause briefly so AstroLens can capture it.`;
    return guidedTarget !== null
      ? `Rotate clockwise toward sector ${guidedTarget + 1} (${Math.round(sectorCenter(guidedTarget))}°). Keep the skyline visible.`
      : "Rotate slowly to review the horizon.";
  })();

  return (
    <section className="space-y-4 rounded-xl border p-4 sm:p-5">
      <div>
        <p className="text-sm font-medium uppercase tracking-widest text-blue-500">
          AstroLens · 24-sector horizon scan
        </p>
        <h2 className="mt-1 text-xl font-semibold">Scan your surroundings</h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          Hold your phone vertically and capture the skyline through a full 360-degree rotation. The horizon is divided into 24 sectors of 15 degrees each. Daylight scans make buildings, trees, and hills easier to identify.
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
                {["N", "NE", "E", "SE", "S", "SW", "W", "NW"].map((label, index) => {
                  const angle = index * 45;
                  return (
                    <span
                      key={label}
                      className={`absolute left-1/2 top-1/2 text-xs font-semibold ${label === "N" ? "text-cyan-300" : "text-white/90"}`}
                      style={{
                        transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(-29px) rotate(${-angle}deg)`,
                      }}
                    >
                      {label}
                    </span>
                  );
                })}
                <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-400" />
              </div>
            </div>
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-widest text-white/60">Currently facing</p>
              <p className="mt-1 text-3xl font-semibold tracking-tight">
                {getDirection(heading)}
                <span className="ml-2 text-lg font-normal text-cyan-300">{Math.round(heading)}°</span>
              </p>
              <p className="mt-1 text-xs text-white/70">
                {headingSource === "compass" ? "Compass heading" : "Estimated heading"}
              </p>
            </div>
          </div>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900">
          <p className="text-xs text-gray-500">Heading</p>
          <p className="mt-1 font-semibold tabular-nums">{heading === null ? "—" : `${heading.toFixed(0)}°`}</p>
        </div>
        <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900">
          <p className="text-xs text-gray-500">Pitch</p>
          <p className="mt-1 font-semibold tabular-nums">{pitch === null ? "—" : `${pitch.toFixed(0)}°`}</p>
        </div>
        <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900">
          <p className="text-xs text-gray-500">Roll</p>
          <p className="mt-1 font-semibold tabular-nums">{roll === null ? "—" : `${roll.toFixed(0)}°`}</p>
        </div>
      </div>

      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950">
        <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
          {capturedCount === SECTOR_COUNT
            ? "All 24 sectors captured"
            : guidedTarget !== null
              ? `Next target: sector ${guidedTarget + 1}/24 · ${Math.round(sectorCenter(guidedTarget))}°`
              : "Waiting for compass heading"}
        </p>
        <p className="mt-1 text-sm text-gray-700 dark:text-gray-200">{turnInstruction}</p>
        {headingSource === "estimated" && (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
            Heading is approximate. Move slowly and use manual capture if directions appear inaccurate.
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
          <span className="tabular-nums">{capturedCount}/24 sectors · {coverage}%</span>
        </div>
        <div
          className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"
          role="progressbar"
          aria-label="Horizon scan coverage"
          aria-valuemin={0}
          aria-valuemax={SECTOR_COUNT}
          aria-valuenow={capturedCount}
        >
          <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${coverage}%` }} />
        </div>

        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
          {Array.from({ length: SECTOR_COUNT }, (_, sector) => {
            const captured = framesRef.current.has(sector);
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
                  setMessage(`Sector ${sector + 1} selected (${Math.round(center)}°). Point the camera toward this heading, then capture it.`);
                }}
                aria-pressed={isTarget}
                aria-label={`Sector ${sector + 1}, ${Math.round(center)} degrees, ${captured ? "captured" : "missing"}`}
                className={`min-h-14 rounded-lg border p-2 text-sm transition ${
                  captured
                    ? "border-green-600 bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200"
                    : isTarget
                      ? "border-blue-600 bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-200"
                      : "border-gray-300 dark:border-gray-700"
                }`}
              >
                <span className="block font-semibold">{String(sector + 1).padStart(2, "0")}</span>
                <span className="block text-xs">{Math.round(center)}° · {getDirection(center)}</span>
                <span className="block text-xs">{captured ? "Captured" : isCurrent ? "Here" : "Missing"}</span>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-gray-500">
          Each tile represents a 15° azimuth sector. Select any tile to target or recapture it. All 24 sectors are required to finish the scan.
        </p>
      </div>

      <p className="rounded-lg border p-3 text-sm text-gray-600 dark:text-gray-300" aria-live="polite">
        {message}
      </p>

      {error && (
        <p role="alert" className="rounded-lg border border-red-300 p-3 text-sm text-red-700 dark:border-red-900 dark:text-red-300">
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
        Captured images remain in browser memory in this prototype. Heading estimates may be inaccurate on some devices. This scanner records one image per 15° azimuth sector; it does not yet infer obstruction altitudes from the images or save a horizon profile.
      </p>
    </section>
  );
}
