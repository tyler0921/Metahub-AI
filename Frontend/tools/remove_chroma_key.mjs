#!/usr/bin/env node

import { createCanvas, loadImage } from '@napi-rs/canvas';
import { writeFileSync } from 'node:fs';

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  throw new Error('Usage: node remove_chroma_key.mjs <input.png> <output.png>');
}

const image = await loadImage(inputPath);
const canvas = createCanvas(image.width, image.height);
const context = canvas.getContext('2d');
context.drawImage(image, 0, 0);
const imageData = context.getImageData(0, 0, image.width, image.height);
const pixels = imageData.data;

// Generated direction sheets use a vivid green key. Sample the four corners so
// small model-side color shifts do not hard-code one exact RGB value.
const corners = [
  0,
  (image.width - 1) * 4,
  (image.height - 1) * image.width * 4,
  (image.height * image.width - 1) * 4,
];
const key = corners.reduce(
  (sum, offset) => ({
    r: sum.r + pixels[offset],
    g: sum.g + pixels[offset + 1],
    b: sum.b + pixels[offset + 2],
  }),
  { r: 0, g: 0, b: 0 },
);
key.r /= corners.length;
key.g /= corners.length;
key.b /= corners.length;

const transparentThreshold = 18;
const opaqueThreshold = 150;
for (let offset = 0; offset < pixels.length; offset += 4) {
  const red = pixels[offset];
  const green = pixels[offset + 1];
  const blue = pixels[offset + 2];
  const distance = Math.hypot(red - key.r, green - key.g, blue - key.b);
  const greenDominance = green - Math.max(red, blue);

  if (
    distance <= transparentThreshold ||
    (greenDominance > 34 && red < 58 && blue < 58)
  ) {
    pixels[offset + 3] = 0;
    continue;
  }

  if (distance < opaqueThreshold && greenDominance > 24) {
    const matte = (distance - transparentThreshold) / (opaqueThreshold - transparentThreshold);
    pixels[offset + 3] = Math.round(pixels[offset + 3] * Math.max(0, Math.min(1, matte)));
    // Remove green spill while retaining natural yellow/brown edge colors.
    pixels[offset + 1] = Math.min(green, Math.max(red, blue) + 20);
  } else if (greenDominance > 28) {
    // Contract isolated dark-green fringe pixels that sit farther from the
    // bright sampled key but are still clearly background-colored.
    pixels[offset + 1] = Math.max(red, blue) + 12;
    pixels[offset + 3] = Math.round(pixels[offset + 3] * 0.55);
  }
}

context.putImageData(imageData, 0, 0);
writeFileSync(outputPath, canvas.toBuffer('image/png'));
console.log(`Wrote ${outputPath} (${image.width}x${image.height}, key ${Math.round(key.r)},${Math.round(key.g)},${Math.round(key.b)})`);
