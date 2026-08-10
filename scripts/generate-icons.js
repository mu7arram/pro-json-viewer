import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

function createRawPng(width, height, drawPixel) {
  const scanlineLength = 1 + width * 4;
  const buffer = Buffer.alloc(height * scanlineLength);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * scanlineLength;
    buffer[rowOffset] = 0;
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const [r, g, b, a] = drawPixel(x, y, width, height);
      buffer[pxOffset] = r;
      buffer[pxOffset + 1] = g;
      buffer[pxOffset + 2] = b;
      buffer[pxOffset + 3] = a;
    }
  }

  const compressedData = zlib.deflateSync(buffer);
  const pngHeader = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const ihdrChunk = createChunk('IHDR', ihdr);
  const idatChunk = createChunk('IDAT', compressedData);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([pngHeader, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const len = data.length;
  const buf = Buffer.alloc(4 + 4 + len + 4);
  buf.writeUInt32BE(len, 0);
  buf.write(type, 4, 4, 'ascii');
  data.copy(buf, 8);
  const crc = crc32(buf.subarray(4, 8 + len));
  buf.writeUInt32BE(crc, 8 + len);
  return buf;
}

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    if (c & 1) c = 0xedb88320 ^ (c >>> 1);
    else c = c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function generateIcon(size) {
  return createRawPng(size, size, (x, y, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    const r = Math.min(w, h) / 2 - 1;

    const pad = Math.max(1, Math.floor(size * 0.05));
    if (x < pad || x >= w - pad || y < pad || y >= h - pad) {
      return [0, 0, 0, 0];
    }

    const distFromCenter = Math.hypot(x - cx, y - cy);
    if (distFromCenter > r) {
      return [0, 0, 0, 0];
    }

    const relX = x / w;
    const relY = y / h;

    const isLeftBracket = 
      (relX >= 0.22 && relX <= 0.38 && relY >= 0.25 && relY <= 0.75) &&
      ((relX <= 0.30 || relY <= 0.32 || relY >= 0.68 || (relY >= 0.46 && relY <= 0.54 && relX <= 0.38)));

    const isRightBracket = 
      (relX >= 0.62 && relX <= 0.78 && relY >= 0.25 && relY <= 0.75) &&
      ((relX >= 0.70 || relY <= 0.32 || relY >= 0.68 || (relY >= 0.46 && relY <= 0.54 && relX >= 0.62)));

    const isColon = (relX >= 0.47 && relX <= 0.53) && ((relY >= 0.36 && relY <= 0.42) || (relY >= 0.58 && relY <= 0.64));

    if (isLeftBracket || isRightBracket || isColon) {
      return [56, 189, 248, 255];
    }

    return [15, 23, 42, 255];
  });
}

const iconsDir = path.resolve('icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

[16, 48, 128].forEach(size => {
  const iconBuffer = generateIcon(size);
  const iconPath = path.join(iconsDir, `icon-${size}.png`);
  fs.writeFileSync(iconPath, iconBuffer);
  console.log(`Generated icon in root: ${iconPath} (${size}x${size})`);
});
