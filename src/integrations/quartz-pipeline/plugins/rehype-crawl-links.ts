/**
 * Vendored from @quartz-community/crawl-links (LinkProcessing), adapted for
 * this site: target URLs are resolved through the content manifest (quartz's
 * transformLink emits content-mirroring relative URLs that don't match the
 * site's /<vault>/<slug>/ layout). Runs after OFM's rehypeRaw so links inside
 * callouts/raw HTML are visible.
 *
 * Behavior preserved: internal/external class marking, external icon + new
 * tab, pretty links, lazy loading, outgoing-link collection (file.data.links)
 * and broken-link detection. Image `src`s are left untouched on purpose —
 * Astro's rehypeImages resolves them relative to the markdown file.
 *
 * Anchors carrying `data-code-link` (code-styler comment/header links) are
 * skipped entirely: they are pre-resolved and must not join the link graph
 * or get the external icon inside code lines.
 */
import path from "node:path";
import { simplifySlug } from "@quartz-community/utils";
import { visit } from "unist-util-visit";
import type { UrlManifest } from "../manifest.ts";
import { resolveHref } from "../manifest.ts";

const ABSOLUTE_URL_REGEX = /^[a-zA-Z][a-zA-Z\d+\-.]*?:/;
const WINDOWS_PATH_REGEX = /^[a-zA-Z]:\\/;

export function isAbsoluteUrl(url: string): boolean {
	if (WINDOWS_PATH_REGEX.test(url)) return false;
	return ABSOLUTE_URL_REGEX.test(url);
}

export const EXTERNAL_ICON: any = {
	type: "element",
	tagName: "svg",
	properties: {
		"aria-hidden": "true",
		class: "external-icon",
		style: "max-width:0.8em;max-height:0.8em",
		viewBox: "0 0 512 512",
	},
	children: [
		{
			type: "element",
			tagName: "path",
			properties: {
				d: "M320 0H288V64h32 82.7L201.4 265.4 178.7 288 224 333.3l22.6-22.6L448 109.3V192v32h64V192 32 0H480 320zM32 32H0V64 480v32H32 456h32V480 352 320H424v32 96H64V96h96 32V32H160 32z",
			},
			children: [],
		},
	],
};

export function rehypeCrawlLinks(opts: {
	manifest: UrlManifest;
	markdownLinkResolution?: "shortest" | "absolute" | "relative";
	prettyLinks?: boolean;
	openLinksInNewTab?: boolean;
	lazyLoad?: boolean;
	externalLinkIcon?: boolean;
	detectBrokenLinks?: boolean;
}) {
	const {
		manifest,
		prettyLinks = true,
		openLinksInNewTab = false,
		lazyLoad = false,
		externalLinkIcon = true,
		detectBrokenLinks = true,
	} = opts;

	return function crawlLinks(tree: any, file: { data: any }): void {
		const fileSlug: string = file.data.slug;
		const outgoing = new Set<string>();

		visit(tree, "element", (node: any) => {
			if (
				node.tagName === "a" &&
				node.properties &&
				// both spellings: decorate writes both; an intermediate transformer
				// may camelize the dashed form before we run
				(node.properties["data-code-link"] !== undefined ||
					node.properties.dataCodeLink !== undefined)
			) {
				// Code-Styler generated links (code-block comments / headers) are
				// already resolved and must not enter the page link graph (Obsidian
				// parity: links inside code blocks aren't metadata-cache links either)
				// nor receive the external icon inside code lines.
				return;
			}
			if (
				node.tagName === "a" &&
				node.properties &&
				typeof node.properties.href === "string"
			) {
				const dest = node.properties.href as string;
				const classes: string[] = node.properties.className ?? [];
				const isExternal = isAbsoluteUrl(dest);
				if (isExternal) {
					classes.push("external", "external-link");
				} else {
					classes.push("internal", "internal-link");
				}
				if (isExternal && externalLinkIcon) {
					node.children.push(structuredClone(EXTERNAL_ICON));
				}
				const firstChild = node.children[0];
				if (
					node.children.length === 1 &&
					firstChild?.type === "text" &&
					firstChild.value !== dest
				) {
					classes.push("alias");
				}
				node.properties.className = classes;
				if (isExternal && openLinksInNewTab) {
					node.properties.target = "_blank";
				}
				const isInternal = !(isAbsoluteUrl(dest) || dest.startsWith("#"));
				if (isInternal) {
					const resolved = resolveHref(manifest, fileSlug, dest);
					node.properties.href = resolved.href;
					if (resolved.slug) {
						node.properties["data-slug"] = resolved.slug;
						outgoing.add(simplifySlug(resolved.slug));
					}
					if (detectBrokenLinks && resolved.broken) {
						classes.push("broken");
						node.properties.className = classes;
					}
					if (
						prettyLinks &&
						node.children.length === 1 &&
						!classes.includes("alias")
					) {
						const textChild = node.children[0];
						if (
							textChild?.type === "text" &&
							!textChild.value.startsWith("#")
						) {
							textChild.value = path.basename(textChild.value);
						}
					}
				}
			}
			if (
				["img", "video", "audio", "iframe"].includes(node.tagName) &&
				node.properties &&
				typeof node.properties.src === "string"
			) {
				if (lazyLoad) {
					node.properties.loading = "lazy";
				}
				// src stays relative to the markdown file: Astro's rehypeImages
				// resolves and processes images; media must live in /public.
			}
		});

		// frontmatter links participate in the outgoing-link graph
		const frontmatterLinks: string[] = file.data.frontmatterLinks ?? [];
		for (const fmLink of frontmatterLinks) {
			const resolved = resolveHref(manifest, fileSlug, fmLink);
			if (resolved.slug) outgoing.add(simplifySlug(resolved.slug));
		}
		file.data.links = [...outgoing];
	};
}
