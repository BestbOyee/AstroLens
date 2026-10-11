
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

const BIN_COUNT = 24;
const BIN_SIZE = 360 / BIN_COUNT;
const IMAGE_WIDTH = 640;
const IMAGE_HEIGHT = 360;

function normalizeAzimuth(value: number): number {
  return ((value % 360) + 360) % 360;
}

function getBin(azimuth: number): number {
  return Math.floor(normalizeAzimuth(azimuth) / BIN_SIZE);
}

function getBinCenter(bin: number): number {
  return normalizeAzimuth(bin * BIN_SIZE + BIN_SIZE / 2);
}

function getHeading(
  event: DeviceOrientationEvent
): {
  azimuth: number;
  source: "compass" | "estimated";
} | null {
  const extendedEvent = event as DeviceOrientationEvent & {
    webkitCompassHeading?: number;
  };

  // iOS Safari provides a compass heading when available.
  if (
    typeof extendedEvent.webkitCompassHeading === "number" &&
    Number.isFinite(extendedEvent.webkitCompassHeading)
  ) {
    return {
      azimuth: normalizeAzimuth(
        extendedEvent.webkitCompassHeading
      ),
      source: "compass",
    };
  }

  // Absolute alpha can provide an approximate heading on some
  // devices. Its accuracy and reference direction vary by browser.
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
  const framesRef = useRef<Map<number, HorizonScanFrame>>(
    new Map()
  );
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
  const [headingSource, setHeadingSource] = useState<
    "compass" | "estimated" | null
  >(null);
  const [frames, setFrames] = useState<HorizonScanFrame[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState(
    "Allow camera and motion access to begin."
  );

  useEffect(() => {
    onScanCompleteRef.current = onScanComplete;
  }, [onScanComplete]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => {
      track.stop();
    });

    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCameraReady(false);
  }, []);

  const startCamera = useCallback(async () => {
    setError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setError(
        "Camera access is unavailable. Open AstroLens in a supported browser over HTTPS or localhost."
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
      const name =
        caught instanceof Error ? caught.name : "";

      if (name === "NotAllowedError") {
        setError(
          "Camera permission was denied. Allow camera access in your browser settings and try again."
        );
      } else if (name === "NotFoundError") {
        setError("No compatible camera was found on this device.");
      } else {
        setError(
          "Could not start the camera. Check browser permissions and try again."
        );
      }

      return false;
    }
  }, []);

  const enableSensors = useCallback(async () => {
    setError(null);

    if (typeof window === "undefined") {
      return false;
    }

    if (!("DeviceOrientationEvent" in window)) {
      setError(
        "This browser does not expose device orientation. Try a supported mobile browser."
      );
      return false;
    }

    try {
      const OrientationConstructor =
        window.DeviceOrientationEvent as typeof DeviceOrientationEvent & {
          requestPermission?: () => Promise<string>;
        };

      if (
        typeof OrientationConstructor.requestPermission ===
        "function"
      ) {
        const permission =
          await OrientationConstructor.requestPermission();

        if (permission !== "granted") {
          setError(
            "Motion permission was not granted. Enable it in your browser settings to use the guided scan."
          );
          return false;
        }
      }

      setMessage(
        "Sensors enabled. Point toward the skyline and rotate slowly."
      );

      return true;
    } catch {
      setError(
        "Could not enable orientation sensors. Check browser permissions and try again."
      );
      return false;
    }
  }, []);

  const captureFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const orientation = latestOrientationRef.current;

    if (!video || !canvas || !orientation) {
      setMessage(
        "Waiting for a usable compass heading before capturing."
      );
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

    canvas.width = IMAGE_WIDTH;
    canvas.height = IMAGE_HEIGHT;

    const sourceWidth = video.videoWidth;
    const sourceHeight = video.videoHeight;

    if (!sourceWidth || !sourceHeight) {
      setMessage("The camera has not produced an image yet.");
      return;
    }

    // Center-crop to a consistent landscape aspect ratio.
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
      IMAGE_HEIGHT
    );

    const imageDataUrl = canvas.toDataURL("image/jpeg", 0.7);
    const bin = getBin(orientation.azimuth);

    const frame: HorizonScanFrame = {
      azimuth: orientation.azimuth,
      pitch: orientation.pitch,
      roll: orientation.roll,
      imageDataUrl,
      capturedAt: new Date().toISOString(),
      headingSource: orientation.source,
    };

    // Keep the newest frame for each 15-degree sector.
    framesRef.current.set(bin, frame);

    const updatedFrames = Array.from(
      framesRef.current.values()
    ).sort((a, b) => a.azimuth - b.azimuth);

    setFrames(updatedFrames);

    setMessage(
      `Captured sector centered near ${getBinCenter(bin)}°. Continue rotating to cover the full skyline.`
    );
  }, []);

  useEffect(() => {
    if (!scanning) {
      return;
    }

    let lastAutoCapturedBin: number | null = null;
    let lastCaptureTime = 0;

    const handleOrientation = (
      event: DeviceOrientationEvent
    ) => {
      const result = getHeading(event);

      if (!result) {
        setMessage(
          "No reliable heading is available. Check sensor permissions or capture directions manually when a heading appears."
        );
        return;
      }

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

      const currentBin = getBin(result.azimuth);
      const nowMs = Date.now();

      // Capture automatically on entry to a new sector.
      // A short cooldown avoids duplicate captures from noisy sensors.
      if (
        currentBin !== lastAutoCapturedBin &&
        nowMs - lastCaptureTime > 1200
      ) {
        lastAutoCapturedBin = currentBin;
        lastCaptureTime = nowMs;
        captureFrame();
      }
    };

    window.addEventListener(
      "deviceorientation",
      handleOrientation
    );

    return () => {
      window.removeEventListener(
        "deviceorientation",
        handleOrientation
      );
    };
  }, [scanning, captureFrame]);
    
const startScan = async () => {
  setError(null);

  // Initiate both permission requests from the button click.
  // iOS Safari may reject sensor permission if requested
  // after another asynchronous operation.
  const sensorPromise = enableSensors();
  const cameraPromise = startCamera();

  const [sensorsEnabled, cameraStarted] = await Promise.all([
    sensorPromise,
    cameraPromise,
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

  setMessage(
    "Rotate slowly through all directions. Keep the skyline visible in the camera."
  );

  setScanning(true);
};


  const finishScan = () => {
    const capturedFrames = Array.from(
      framesRef.current.values()
    ).sort((a, b) => a.azimuth - b.azimuth);

    if (capturedFrames.length < 12) {
      setError(
        "Capture at least 12 of the 24 sectors before finishing. Rotate slowly and capture missed directions."
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
    setFrames([]);
    setError(null);
    onCancel?.();
  };

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => {
        track.stop();
      });
    };
  }, []);

  const coverage = Math.round(
    (frames.length / BIN_COUNT) * 100
  );

  return (
    <section className="space-y-4 rounded-xl border p-4 sm:p-5">
      <div>
        <p className="text-sm font-medium uppercase tracking-widest text-blue-500">
          AstroLens · Horizon scan
        </p>

        <h2 className="mt-1 text-xl font-semibold">
          Scan your surroundings
        </h2>

        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          Capture the skyline as you rotate through 360°. For
          the clearest obstruction detection, scan during daylight
          with buildings, trees, and hills visible.
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

        {cameraReady && (
          <div className="absolute left-3 top-3 rounded-lg bg-black/65 px-3 py-2 text-sm text-white">
            {heading === null
              ? "Finding heading..."
              : `${heading.toFixed(0)}°`}
            {headingSource === "estimated" ? " · approximate" : ""}
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

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Scan coverage</span>
          <span className="tabular-nums">
            {frames.length}/{BIN_COUNT} sectors · {coverage}%
          </span>
        </div>

        <div
          className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"
          role="progressbar"
          aria-label="Horizon scan coverage"
          aria-valuemin={0}
          aria-valuemax={BIN_COUNT}
          aria-valuenow={frames.length}
        >
          <div
            className="h-full rounded-full bg-blue-600 transition-all"
            style={{ width: `${coverage}%` }}
          />
        </div>

        <div className="grid grid-cols-6 gap-1 sm:grid-cols-12">
          {Array.from({ length: BIN_COUNT }, (_, bin) => {
            const captured = frames.some(
              (frame) => getBin(frame.azimuth) === bin
            );

            return (
              <div
                key={bin}
                title={`${getBinCenter(bin)}° sector`}
                className={`h-2 rounded-sm ${
                  captured
                    ? "bg-blue-600"
                    : "bg-gray-200 dark:bg-gray-700"
                }`}
              />
            );
          })}
        </div>
      </div>

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
            className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            Start 360° scan
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={captureFrame}
              className="rounded-lg border px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              Capture this direction
            </button>

            <button
              type="button"
              onClick={finishScan}
              className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            >
              Finish scan
            </button>
          </>
        )}

        <button
          type="button"
          onClick={cancelScan}
          className="rounded-lg border px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          Cancel
        </button>
      </div>

      <p className="text-xs text-gray-500">
        Captured images remain in browser memory in this prototype.
        Heading estimates may be inaccurate on some devices. This
        step records frames; it does not yet calculate obstruction
        altitudes or save a horizon profile.
      </p>
    </section>
  );
}
