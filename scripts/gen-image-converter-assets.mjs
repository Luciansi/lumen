/**
 * Deterministic placeholder PNG generator for the image-converter demo note
 * (src/content/showcase/image-converter.md). Writes two truecolor PNGs into
 * the demo vault's images/ dir, chosen so alignment/wrap/size rendering is
 * easy to eyeball:
 *
 *   demo-landscape.png  640×360  — quadrant tints + a 64px grid (scaling probe)
 *   demo-portrait.png   300×480  — same scheme with swapped axes
 *
 * Pure Node (zlib deflate + hand-rolled CRC32), no image tools needed.
 * Safe to re-run: output is deterministic, existing files are overwritten.
 *
 * Usage: node scripts/gen-image-converter-assets.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
const outDir = path.join(repoRoot, "src", "content", "showcase", "images");

// ---- minimal PNG writer (truecolor, 8-bit, filter 0) ----

const CRC_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		table[n] = c >>> 0;
	}
	return table;
})();

function crc32(buffer) {
	let crc = 0xffffffff;
	for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
	return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
	const typeBuf = Buffer.from(type, "ascii");
	const length = Buffer.alloc(4);
	length.writeUInt32BE(data.length);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
	return Buffer.concat([length, typeBuf, data, crc]);
}

function writePng(filePath, width, height, rowPixel) {
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(width, 0);
	ihdr.writeUInt32BE(height, 4);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 2; // color type: truecolor RGB
	const scanlines = [];
	for (let y = 0; y < height; y++) {
		const row = Buffer.alloc(1 + width * 3);
		for (let x = 0; x < width; x++) {
			const [r, g, b] = rowPixel(x, y, width, height);
			row[1 + x * 3] = r;
			row[2 + x * 3] = g;
			row[3 + x * 3] = b;
		}
		scanlines.push(row);
	}
	const png = Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk("IHDR", ihdr),
		chunk("IDAT", deflateSync(Buffer.concat(scanlines), { level: 9 })),
		chunk("IEND", Buffer.alloc(0)),
	]);
	fs.writeFileSync(filePath, png);
}

// ---- pixel schemes ----

/** diagonal hue gradient over a white grid, corners tinted per quadrant */
function quadrantGradientPixel(x, y, width, height) {
	// 2px grid lines every 64px — a scaling / distortion probe
	if (x % 64 < 2 || y % 64 < 2) return [222, 226, 232];
	// quadrant tint: TL red, TR blue, BL green, BR amber — blended smoothly
	const [qx, qy] = [x / width, y / height];
	const r = Math.round(40 + 200 * (1 - qx) * (1 - qy) + 60 * qx * (1 - qy));
	const g = Math.round(40 + 200 * qx * (1 - qy) + 60 * (1 - qx) * qy);
	const b = Math.round(90 + 165 * qx * qy + 40 * (1 - qx) * (1 - qy));
	return [Math.min(255, r), Math.min(255, g), Math.min(255, b)];
}

/** portrait: rotate the landscape scheme so it does not read as a crop */
function rotatedGradientPixel(x, y, width, height) {
	const [r, g, b] = quadrantGradientPixel(y, width - 1 - x, height, width);
	return [b, r, g];
}

const assets = [
	{
		name: "demo-landscape.png",
		width: 640,
		height: 360,
		pixel: quadrantGradientPixel,
	},
	{
		name: "demo-portrait.png",
		width: 300,
		height: 480,
		pixel: rotatedGradientPixel,
	},
];

fs.mkdirSync(outDir, { recursive: true });
for (const asset of assets) {
	const target = path.join(outDir, asset.name);
	writePng(target, asset.width, asset.height, asset.pixel);
	const size = fs.statSync(target).size;
	console.log(
		`${asset.name}  ${asset.width}x${asset.height}  ${size} bytes  -> ${path.relative(repoRoot, target)}`,
	);
}
