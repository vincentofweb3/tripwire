// Generates favicon PNGs + ICO for Tripwire (orange rounded square, dark delta).
import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, "..", "public");

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function encodePng(size, px) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}
function render(size) {
  const px = Buffer.alloc(size * size * 4);
  const s = size / 64; // design units scale
  const rx = 14 * s, cx = size / 2 - 0.5;
  const distToSeg = (px_, py_, ax, ay, bx, by) => {
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = ((px_ - ax) * dx + (py_ - ay) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const qx = ax + t * dx, qy = ay + t * dy;
    return Math.hypot(px_ - qx, py_ - qy);
  };
  const inRoundedRect = (x, y) => {
    const l = 0, t = 0, r = size - 1, b = size - 1;
    const ix = Math.max(l + rx, Math.min(x, r - rx));
    const iy = Math.max(t + rx, Math.min(y, b - rx));
    const outsideCorner = Math.hypot(x - ix, y - iy) > rx && (x < l + rx || x > r - rx || y < t + rx || y > b - rx);
    return !outsideCorner;
  };
  const ORANGE = [255, 107, 26], DARK = [22, 8, 0];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      if (!inRoundedRect(x, y)) continue;
      let col = ORANGE;
      const half = 3.25 * s;
      // delta polyline: (13,43)->(32,19)->(51,43)
      if (
        distToSeg(x, y, 13 * s, 43 * s, 32 * s, 19 * s) < half ||
        distToSeg(x, y, 32 * s, 19 * s, 51 * s, 43 * s) < half
      ) col = DARK;
      if (Math.hypot(x - 32 * s, y - 50.5 * s) < 2.6 * s) col = DARK;
      px[i] = col[0]; px[i + 1] = col[1]; px[i + 2] = col[2]; px[i + 3] = 255;
    }
  }
  return px;
}
for (const size of [32, 180]) {
  fs.writeFileSync(path.join(OUT, `favicon-${size}.png`), encodePng(size, render(size)));
  console.log(`favicon-${size}.png written`);
}
const png32 = fs.readFileSync(path.join(OUT, "favicon-32.png"));
const icoHeader = Buffer.alloc(6);
icoHeader.writeUInt16LE(0, 0); icoHeader.writeUInt16LE(1, 2); icoHeader.writeUInt16LE(1, 4);
const entry = Buffer.alloc(16);
entry[0] = 32; entry[1] = 32; entry[2] = 0; entry[3] = 0;
entry.writeUInt16LE(1, 4); entry.writeUInt16LE(32, 6);
entry.writeUInt32LE(png32.length, 8); entry.writeUInt32LE(22, 12);
fs.writeFileSync(path.join(OUT, "favicon.ico"), Buffer.concat([icoHeader, entry, png32]));
console.log("favicon.ico written");
