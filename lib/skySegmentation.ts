
import { pipeline } from "@huggingface/transformers";

const MODEL_ID = "Xenova/segformer-b2-finetuned-ade-512-512";
const MAX_IMAGE_DIMENSION = 512;

type SegmentationResult = {
  label: string;
  score: number | null;
  mask: {
    data: Uint8Array | Uint8ClampedArray;
    width: number;
    height: number;
    channels: number;
  };
};

type Segmenter = (
  image: string,
) => Promise<SegmentationResult[]>;

let segmenterPromise: Promise<Segmenter> | null = null;

async function getSegmenter(): Promise<Segmenter> {
  if (!segmenterPromise) {
    segmenterPromise = pipeline(
      "image-segmentation",
      MODEL_ID,
    ) as unknown as Promise<Segmenter>;
  }

  try {
    return await segmenterPromise;
  } catch (error) {
    segmenterPromise = null;
    throw error;
  }
}

/**
 * Resize the original photograph before model inference.
 * This limits memory consumption and the size of the returned masks.
 */
async function prepareImage(imageUrl: string): Promise<string> {
  const image = new Image();
  image.src = imageUrl;

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () =>
      reject(new Error(`Could not load image: ${imageUrl}`));
  });

  const scale = Math.min(
    1,
    MAX_IMAGE_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight),
  );

  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Could not create image preprocessing canvas.");
  }

  context.drawImage(image, 0, 0, width, height);

  return canvas.toDataURL("image/jpeg", 0.85);
}

export type SkySegmentation = {
  width: number;
  height: number;
  skyMask: Uint8Array;
  boundaryProfile: Array<{
    xPercent: number;
    yPercent: number;
  }>;
  skyCoveragePercent: number;
};

export async function segmentSky(
  imageUrl: string,
): Promise<SkySegmentation> {
  // Reduce the image size before inference.
  const preparedImage = await prepareImage(imageUrl);

  const segmenter = await getSegmenter();
  const results = await segmenter(preparedImage);

  const skyResult = results.find(
    (result) => result.label.toLowerCase() === "sky",
  );

  if (!skyResult) {
    throw new Error(
      "The segmentation model did not identify a sky region.",
    );
  }

  const { width, height, data, channels } = skyResult.mask;

  if (!width || !height || !data.length || !channels) {
    throw new Error("The model returned an invalid sky mask.");
  }

  const skyMask = new Uint8Array(width * height);
  let skyPixels = 0;

  for (let i = 0; i < width * height; i++) {
    const value = data[i * channels];

    if (value > 127) {
      skyMask[i] = 1;
      skyPixels++;
    }
  }

  const boundaryProfile: SkySegmentation["boundaryProfile"] = [];

  // Sample every second horizontal pixel.
  for (let x = 0; x < width; x += 2) {
    let firstForegroundY = -1;

    for (let y = 0; y < height - 1; y++) {
      const current = skyMask[y * width + x];
      const below = skyMask[(y + 1) * width + x];

      if (current === 1 && below === 0) {
        firstForegroundY = y + 1;
        break;
      }
    }

    if (firstForegroundY >= 0) {
      boundaryProfile.push({
        xPercent: (x / width) * 100,
        yPercent: (firstForegroundY / height) * 100,
      });
    }
  }

  return {
    width,
    height,
    skyMask,
    boundaryProfile,
    skyCoveragePercent: Math.round(
      (skyPixels / (width * height)) * 100,
    ),
  };
}
