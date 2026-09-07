#!/usr/bin/env node
/**
 * Renders labeled placeholder screenshots for the README gallery into
 * docs/screenshots/. The real captures live in the same folder under the same
 * names — overwrite a file here and the README picks it up automatically;
 * delete the placeholder file once a real one exists.
 *
 * Usage (repo root): node scripts/gen-readme-screenshots.mjs
 *
 * Pure sharp (SVG → PNG at 2x, 1280×800 CSS px), no other tooling needed.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const OUT_DIR = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
	"docs",
	"screenshots",
);

const W = 1280;
const H = 800;

/** 占位卡:深底圆角窗口 + 两行文本;hue 区分主题,便于扫视预览墙。 */
function cardSvg({ label, sub, hue, dark }) {
	const bg1 = dark ? "#14161d" : "#f6f7fb";
	const bg2 = dark ? "#1e2230" : "#e9ecf4";
	const fg = dark ? "#e8eaf2" : "#1c2030";
	const mut = dark ? "#9aa0b0" : "#6b7280";
	const accent = `hsl(${hue} 70% 55%)`;
	const bar = dark ? "#0c0e13" : "#ffffff";
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  <rect x="28" y="28" width="${W - 56}" height="${H - 56}" rx="28" fill="${dark ? "#0d0f14" : "#ffffff"}"/>
  <rect x="28" y="28" width="${W - 56}" height="64" rx="28" fill="${bar}"/>
  <circle cx="76" cy="60" r="10" fill="hsl(${(hue + 40) % 360} 70% 60%)"/>
  <circle cx="106" cy="60" r="10" fill="hsl(${(hue + 140) % 360} 60% 55%)"/>
  <circle cx="136" cy="60" r="10" fill="hsl(${(hue + 220) % 360} 55% 60%)"/>
  <rect x="180" y="44" width="${W - 180 - 240}" height="32" rx="16" fill="${dark ? "#232838" : "#eceff6"}"/>
  <rect x="${W - 216}" y="44" width="96" height="32" rx="16" fill="${accent}"/>
  <rect x="${W - 108}" y="44" width="80" height="32" rx="16" fill="${dark ? "#2a3040" : "#e2e6ef"}"/>
  <text x="76" y="${H / 2 - 14}" font-family="system-ui, 'Segoe UI', sans-serif" font-size="64" font-weight="700" fill="${fg}">${label}</text>
  <text x="78" y="${H / 2 + 58}" font-family="system-ui, 'Segoe UI', sans-serif" font-size="34" fill="${mut}">${sub}</text>
  <text x="${W - 76}" y="${H - 64}" text-anchor="end" font-family="system-ui, 'Segoe UI', sans-serif" font-size="30" fill="${accent}">placeholder - replace with a real capture</text>
</svg>`;
}

const SHOTS = [
	{ name: "overview-mobile.png", label: "Responsive overview", sub: "single column: hero, posts, widgets", hue: 250, dark: false },
	{ name: "search-light.png", label: "Full-text search", sub: "Pagefind panel - titles, tags and categories", hue: 200, dark: false },
	{ name: "markdown-light.png", label: "Rich markdown", sub: "callouts, KaTeX math, mermaid, embeds", hue: 160, dark: false },
	{ name: "code-dark.png", label: "Code blocks", sub: "dual-theme highlighting, line numbers, headers", hue: 20, dark: true },
	{ name: "archive-light.png", label: "Archive", sub: "grouped by year, tag &amp; category filters", hue: 300, dark: false },
	{ name: "about-light.png", label: "Pages are vaults", sub: "any directory + index.md is a page (/about/)", hue: 45, dark: false },
];

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const shot of SHOTS) {
	const svg = cardSvg(shot);
	const target = path.join(OUT_DIR, shot.name);
	await sharp(Buffer.from(svg), { density: 72 })
		.png()
		.toFile(target);
	console.log(`${shot.name}  ${W}x${H} -> docs/screenshots/${shot.name}`);
}
