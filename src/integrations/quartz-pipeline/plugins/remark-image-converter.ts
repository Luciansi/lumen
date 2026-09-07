/**
 * Static port of the obsidian-image-converter alignment tokens (v1.4.6):
 *
 *   ![[img.png|right|wrap|400]]            (wikilink embed)
 *   ![caption|left|wrap](img.png)          (markdown image link)
 *   [img.png|right|wrap|400](img.png)      (bangless link to a raster image)
 *
 * where the tail token words are left | center | right, the flag wrap, and an
 * optional trailing `N` / `NxM` size. The plugin renders by slapping CSS
 * classes on the DOM <img> at runtime; this blog renders statically, so the
 * equivalent work happens here at build time: tokens are parsed and STRIPPED
 * from the alt text, the size becomes width/height attributes (the same value
 * shapes OFM produces for `![[img|400]]` embeds), and alignment becomes the
 * classes image-converter-aligned / image-position-* / image-wrap(-no-wrap),
 * styled by src/styles/image-converter.css.
 *
 * Chain slot: must run immediately AFTER ...ofm.markdownPlugins(ctx) — the OFM
 * pass is what turns `![[…]]` into image nodes (leaving the token alias in
 * data.hProperties.alt and the trailing size in width/height). Registered in
 * remarkChain AND subChain so transcluded notes get the same treatment (same
 * rule as remark-inline-code-styler). The plugin is read-only over note text:
 * urls are never rewritten (remark-image-resolver runs later and resolves
 * them), image nodes are kept intact so Astro's image collection/optimization
 * still applies, and no client-side JS is involved.
 *
 * Distinguishing the two image sources: OFM image nodes always carry
 * data.hProperties with an `alt` string key (plus width/height), while plain
 * markdown `![…]` images have no hProperties at all.
 *
 * Idempotency: stripping is self-terminating — a second pass finds no tokens
 * or size in the leftover text and touches nothing (no guard flag needed;
 * transclusion base trees are cached per file by remark-transclude anyway).
 *
 * Deviations from the plugin: no runtime re-application, no cache, no
 * markdown write-back, no context menu; remote images with a size token keep
 * an uncomputed "auto" height attribute (the browser ignores it — Astro can
 * only derive intrinsic dimensions for local files); escaped pipes inside
 * GFM table cells are not reliably distinguishable after remark has resolved
 * escapes — a known limitation, matching the plugin's own `\|` dance only
 * where the raw text survives.
 *
 * Whole-file opt-out: frontmatter `image-converter-ignore: true`.
 */

import type { Properties } from "hast";
import type { Image, Link, Root } from "mdast";
import { visit } from "unist-util-visit";
import type { VFile } from "vfile";
import {
	imageConverterClassNames,
	parseImageConverterTokens,
} from "../image-converter/parse.ts";

export interface ImageConverterOpts {
	/** bangless `[text](img.webp)` links to raster images render as images */
	convertImageLinks: boolean;
}

/** the raster set OFM treats as image embeds (no .avif/.svg — parity) */
const RASTER_IMAGE_EXTENSIONS = new Set([
	".jxl",
	".png",
	".jpg",
	".jpeg",
	".gif",
	".bmp",
	".webp",
]);

/** the subset of hast Properties this pass reads from / writes to image nodes */
type ImgProperties = Properties;

function mergeClassName(
	existing: ImgProperties["className"],
	added: string[],
): string[] {
	// OFM never sets className; defensive only
	return [...(Array.isArray(existing) ? existing : []), ...added];
}

/** Applies a parse result (tokens/size already stripped from the region) as img properties. */
function buildImageProperties(
	parsed: ReturnType<typeof parseImageConverterTokens>,
): ImgProperties {
	const hProperties: ImgProperties = {};
	if (parsed.hadSize) {
		hProperties.width = parsed.width;
		hProperties.height = parsed.height;
	}
	if (parsed.position !== null) {
		hProperties.className = imageConverterClassNames(
			parsed.position,
			parsed.wrap,
		);
	}
	return hProperties;
}

export function remarkImageConverter(opts: ImageConverterOpts) {
	return function imageConverter(tree: Root, file: VFile): void {
		const frontmatter = file.data?.frontmatter as
			| Record<string, unknown>
			| undefined;
		if (frontmatter?.["image-converter-ignore"] === true) return;

		visit(tree, "image", (image: Image) => {
			const hProperties = (image.data?.hProperties ?? undefined) as
				| ImgProperties
				| undefined;

			if (hProperties !== undefined && typeof hProperties.alt === "string") {
				// wiki-sourced (OFM): tokens live in hProperties.alt, the size was
				// already split into width/height by OFM's embed regex
				const parsed = parseImageConverterTokens(hProperties.alt, false);
				if (!parsed.hadTokens && !parsed.hadSize) return;

				const next: ImgProperties = { ...hProperties, alt: parsed.leftover };
				if (parsed.hadSize) {
					// edge: a stray trailing size OFM's regex did not consume
					next.width = parsed.width;
					next.height = parsed.height;
				}
				if (parsed.position !== null) {
					next.className = mergeClassName(
						hProperties.className,
						imageConverterClassNames(parsed.position, parsed.wrap),
					);
				}
				image.data = { ...image.data, hProperties: next };
				return;
			}

			// plain markdown `![…](…)`: the whole bracket region is node.alt
			const parsed = parseImageConverterTokens(image.alt ?? "", true);
			if (!parsed.hadTokens && !parsed.hadSize) return;

			image.alt = parsed.leftover;
			const hPropertiesNext = buildImageProperties(parsed);
			if (Object.keys(hPropertiesNext).length > 0) {
				image.data = { ...image.data, hProperties: hPropertiesNext };
			}
		});

		if (!opts.convertImageLinks) return;

		visit(tree, "link", (link: Link, index, parent) => {
			if (parent == null || index == null) return;
			const pathPart = (link.url ?? "").split(/[?#]/, 1)[0];
			const dot = pathPart.lastIndexOf(".");
			const ext = dot !== -1 ? pathPart.slice(dot).toLowerCase() : "";
			if (!RASTER_IMAGE_EXTENSIONS.has(ext)) return;
			// only plain-text links convert; nested links/images would need care
			if (!link.children.every((child) => child.type === "text")) return;
			const text = link.children
				.map((child) => (child.type === "text" ? child.value : ""))
				.join("");

			const parsed = parseImageConverterTokens(text, true);
			if (!parsed.hadTokens && !parsed.hadSize) return;

			const hPropertiesNext = buildImageProperties(parsed);
			const replacement: Image = {
				type: "image",
				url: link.url,
				alt: parsed.leftover,
				...(link.title ? { title: link.title } : {}),
			};
			if (Object.keys(hPropertiesNext).length > 0) {
				replacement.data = { hProperties: hPropertiesNext };
			}
			parent.children[index] = replacement;
		});
	};
}
