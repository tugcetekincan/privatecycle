/**
 * One-off asset generator: a 96x96 all-white, transparent notification icon
 * (Android small-icon requirements). Kept in the repo as a script of record so
 * the binary can be regenerated without an image toolchain.
 *
 *   node scripts/make-notification-icon.mjs
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const SIZE = 96;
const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);

for (let y = 0; y < SIZE; y++) {
  const row = y * (SIZE * 4 + 1);
  raw[row] = 0; // filter: none
  for (let x = 0; x < SIZE; x++) {
    const dx = x - SIZE / 2;
    const inBell = (() => {
      // Teardrop: a tapered top that opens into a circle at the bottom.
      const top = y >= 18 && y <= 62 && Math.abs(dx) <= ((y - 18) / 44) * 25;
      const bulb = dx * dx + (y - 62) * (y - 62) <= 25 * 25;
      return top || bulb;
    })();
    const offset = row + 1 + x * 4;
    raw[offset] = 255;
    raw[offset + 1] = 255;
    raw[offset + 2] = 255;
    raw[offset + 3] = inBell ? 255 : 0;
  }
}

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}

const crc32 = (buffer) => {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const chunk = (type, data) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const target = fileURLToPath(
  new URL('../assets/images/notification-icon.png', import.meta.url)
);
fs.writeFileSync(target, png);
console.log(`wrote ${target} (${png.length} bytes)`);
