/**
 * Code-Styler decoration, run AFTER the syntax-highlighting (RPC) transformer
 * and BEFORE the OFM htmlPlugins in the rehype chain (so mermaid blocks are
 * still class-less `code.mermaid` and easy to skip).
 *
 * For every fenced block the params plugin stashed (`code.data.codeStylerParams`):
 *  - rebuilds the code into Code-Styler rows (div.code-styler-line* →
 *    line-number + line-text), MOVING the RPC token spans (their
 *    `--shiki-light/--shiki-dark` vars and `data-token-type` must survive —
 *    never re-serialize them);
 *  - computes line-highlight row classes from the parsed params (numbers,
 *    words, regexes, alternative names) plus RPC's own `data-highlighted-line`
 *    markers;
 *  - renders the header (icon, language tag, title/fold-placeholder text,
 *    optional resolved link), inserted as the first child of the figure
 *    (deviation from the plugin, which nests it inside the pre — on the blog
 *    the pre is the horizontal scroll container);
 *  - turns links written in code comments into real anchors;
 *  - emits the classes the CSS + client fold logic contract on
 *    (`code-styler-folded` at SSR for `fold:` params, wrap classes, …).
 *
 * All generated anchors carry `data-code-link` so rehype-crawl-links skips
 * them (they must not enter the page link graph — Obsidian parity — nor get
 * an external icon inside code lines).
 */

import type { Element, ElementContent, Properties, Root, Text } from "hast";
import { visit } from "unist-util-visit";
import {
	displayLanguageName,
	getLanguageIcon,
	iconDataUri,
	wrapIconSvg,
} from "../code-styler/icons.ts";
import type { CodeblockParameters, Highlights } from "../code-styler/params.ts";
import { slugifyName } from "../code-styler/params.ts";
import type { UrlManifest } from "../manifest.ts";
import { resolveHref } from "../manifest.ts";
import type { CodeStylerStash } from "./rehype-code-styler-params.ts";
import { isAbsoluteUrl } from "./rehype-crawl-links.ts";

const FOLD_PLACEHOLDER = "Folded Code";
const CODE_LINK_RE = /(\[\[[^\]|\r\n]+?(?:\|[^\]|\r\n]+?)?\]\]|\[.*?\]\(.+\))/g;

export interface CodeStylerDecorateOpts {
	manifest: UrlManifest;
	header: {
		showLanguageTag: "none" | "ifHeader" | "always";
		showLanguageIcon: "none" | "ifHeader" | "always";
	};
	/** CS-dialect default for line numbers (theme default, plugin: true) */
	lineNumbers: boolean;
	/** CS-dialect default soft wrapping (class `wrapped`) */
	wrapLines: boolean;
	openLinksInNewTab: boolean;
}

type AnyElement = Element & { data?: Record<string, unknown> };

const element = (
	tagName: string,
	className: string | string[] | undefined,
	children: ElementContent[],
): Element => ({
	type: "element",
	tagName,
	properties: className
		? { className: Array.isArray(className) ? className : [className] }
		: {},
	children,
});

function textNode(value: string): Text {
	return { type: "text", value };
}

/** Full text content of a node subtree (no serialization). */
function textContent(node: ElementContent): string {
	if (node.type === "text") return node.value;
	if (node.type === "element") return node.children.map(textContent).join("");
	return "";
}

/** Whether a match group has any rule at all. */
function groupHasRules(hl: Highlights): boolean {
	return (
		hl.lineNumbers.length > 0 ||
		hl.plainText.length > 0 ||
		hl.regularExpressions.length > 0
	);
}

/**
 * Code-Styler getLineClass port: a row carries the default highlight class
 * AND every matching alternative class at once (the plugin accumulates the
 * class list; plain `code-styler-line` only when nothing matched).
 */
function matchLine(
	params: CodeblockParameters,
	displayNumber: number,
	lineText: string,
): { highlighted: boolean; altSlugs: string[] } {
	const match = (hl: Highlights) =>
		hl.lineNumbers.includes(displayNumber) ||
		hl.plainText.some((word) => lineText.includes(word)) ||
		hl.regularExpressions.some((re) => re.test(lineText));
	const altSlugs: string[] = [];
	const def = params.highlights.default;
	const defaultHit = groupHasRules(def) && match(def);
	for (const [name, hl] of Object.entries(params.highlights.alternative)) {
		if (groupHasRules(hl) && match(hl)) altSlugs.push(slugifyName(name));
	}
	return { highlighted: defaultHit || altSlugs.length > 0, altSlugs };
}

interface ResolvedTarget {
	href: string;
	label: string;
	external: boolean;
	broken: boolean;
}

/** Resolve a link written as [[wiki|alias]], [text](url) or a bare url/path. */
function resolveCodeLink(
	raw: string,
	fileSlug: string,
	manifest: UrlManifest,
): ResolvedTarget {
	const wiki = /^\[\[([^\]|\r\n]+?)(?:\|([^\]|\r\n]+?))?\]\]$/.exec(raw.trim());
	if (wiki) {
		const target = wiki[1].trim();
		const alias = wiki[2]?.trim();
		const resolved = resolveHref(manifest, fileSlug, target);
		const noAnchor = (target.split("#")[0].split("/").pop() ?? "").replace(
			/\.[^.]+$/,
			"",
		);
		return {
			href: resolved.href,
			label: alias ?? (noAnchor !== "" ? noAnchor : target),
			external: false,
			broken: resolved.broken,
		};
	}
	const md = /^\[(.*?)\]\((.+)\)$/.exec(raw.trim());
	if (md) {
		const target = md[2].trim();
		const resolved = resolveHref(manifest, fileSlug, target);
		const external = isAbsoluteUrl(target);
		return {
			href: resolved.href,
			label: md[1],
			external,
			broken: resolved.broken,
		};
	}
	// bare target: external URLs pass through; anything else resolves through
	// the manifest like an internal note reference (header ref:/title: links)
	const external = isAbsoluteUrl(raw.trim());
	if (external || raw.trim().startsWith("#")) {
		return { href: raw.trim(), label: raw.trim(), external, broken: false };
	}
	const resolved = resolveHref(manifest, fileSlug, raw.trim());
	return {
		href: resolved.href,
		label: raw.trim().split("#")[0].split("/").pop() ?? raw.trim(),
		external: false,
		broken: resolved.broken,
	};
}

function anchorNode(
	resolved: ResolvedTarget,
	extraClass: string[],
	attrs: { externalNewTab: boolean },
): Element {
	const classes = ["code-styler-code-link", ...extraClass];
	if (resolved.broken) classes.push("broken");
	if (resolved.external) classes.push("external-link");
	else if (!resolved.broken) classes.push("internal-link");
	const properties: Properties = {
		className: classes,
		href: resolved.href,
		// both spellings: an intermediate transformer camelizes data-* property
		// keys, so crawl-links may see either form
		"data-code-link": "",
		dataCodeLink: "",
	};
	if (resolved.external && attrs.externalNewTab) {
		properties.target = "_blank";
		properties.rel = ["noreferrer"];
	}
	const a = element("a", undefined, [textNode(resolved.label)]);
	a.properties = properties;
	return a;
}

/** Split links out of the text under ONE comment-classified element. */
function linkifyCommentText(
	children: ElementContent[],
	ctx: { fileSlug: string; manifest: UrlManifest; externalNewTab: boolean },
): ElementContent[] {
	const out: ElementContent[] = [];
	for (const child of children) {
		if (child.type === "text") {
			const value = child.value;
			let last = 0;
			CODE_LINK_RE.lastIndex = 0;
			let match: RegExpExecArray | null = CODE_LINK_RE.exec(value);
			while (match !== null) {
				if (match.index > last)
					out.push(textNode(value.slice(last, match.index)));
				const resolved = resolveCodeLink(match[1], ctx.fileSlug, ctx.manifest);
				if (!resolved.external && resolved.broken) {
					// broken internal links stay plain text in comments
					out.push(textNode(match[1]));
				} else {
					const a = anchorNode(resolved, [], {
						externalNewTab: ctx.externalNewTab,
					});
					out.push(a);
				}
				last = match.index + match[0].length;
				match = CODE_LINK_RE.exec(value);
			}
			if (last === 0) out.push(child);
			else if (last < value.length) out.push(textNode(value.slice(last)));
		} else if (child.type === "element") {
			const copy = { ...child } as Element;
			copy.children = linkifyCommentText(copy.children, ctx);
			out.push(copy);
		} else {
			out.push(child);
		}
	}
	return out;
}

/**
 * Rewrite links only where the highlighter classified the token as a comment
 * (plugin parity: `[class*="comment"]` token scan). Everything else — strings,
 * docstrings, transclusion syntax in prose — stays untouched.
 */
function convertCommentLinks(
	children: ElementContent[],
	ctx: { fileSlug: string; manifest: UrlManifest; externalNewTab: boolean },
): ElementContent[] {
	const out: ElementContent[] = [];
	for (const child of children) {
		if (child.type === "element") {
			// RPC's classifier stores the type camelCased on properties; the HTML
			// serializer renders it back to `data-token-type`.
			const properties = (child.properties ?? {}) as Record<string, unknown>;
			const tokenType =
				properties["data-token-type"] ?? properties.dataTokenType;
			const copy = { ...child } as Element;
			if (tokenType === "comment") {
				copy.children = linkifyCommentText(copy.children, ctx);
			} else {
				copy.children = convertCommentLinks(copy.children, ctx);
			}
			out.push(copy);
		} else {
			out.push(child);
		}
	}
	return out;
}

export function rehypeCodeStylerDecorate(opts: CodeStylerDecorateOpts) {
	return function codeStylerDecorate(
		tree: Root,
		file: { data: Record<string, unknown> },
	): void {
		const fileSlug =
			typeof file.data.slug === "string" ? (file.data.slug as string) : "";
		const linkCtx = {
			fileSlug,
			manifest: opts.manifest,
			externalNewTab: opts.openLinksInNewTab,
		};

		visit(tree, "element", (node) => {
			// candidate: RPC figure, or a bare pre>code (the figure's own pre is
			// visited right after its figure — an idempotency flag on the code
			// element makes the double visit harmless)
			let figure: Element | undefined;
			let pre: Element | undefined;
			if (
				node.tagName === "figure" &&
				node.properties?.["data-rehype-pretty-code-figure"] !== undefined
			) {
				figure = node;
				pre = node.children.find(
					(c) => c.type === "element" && c.tagName === "pre",
				) as Element | undefined;
			} else if (node.tagName === "pre") {
				pre = node;
			} else {
				return;
			}
			if (!pre) return;
			const code = pre.children.find(
				(c) => c.type === "element" && c.tagName === "code",
			) as AnyElement | undefined;
			if (!code) return;
			if (code.data?.codeStylerDecorated) return; // idempotent

			const stash = code.data?.codeStylerParams as CodeStylerStash | undefined;
			if (!stash) return; // plain fence — untouched
			const { params } = stash;
			if (params.ignore) return;

			// guards: mermaid / math must never be touched (params plugin skipped
			// them, but stay defensive for stashes from earlier runs)
			const className = Array.isArray(code.properties?.className)
				? (code.properties.className as string[])
				: [];
			if (className.includes("mermaid")) return;
			const dataLanguage =
				typeof code.properties?.["data-language"] === "string"
					? (code.properties["data-language"] as string)
					: "";
			if (dataLanguage.toLowerCase() === "math") return;

			decorateBlock(figure ?? pre, pre, code, stash, opts, linkCtx);
			if (!code.data) code.data = {};
			code.data.codeStylerDecorated = true;
			code.data.codeStylerParams = undefined; // stash consumed
		});
	};
}

function decorateBlock(
	shell: Element, // figure (RPC) or pre (plain)
	pre: Element,
	code: AnyElement,
	stash: CodeStylerStash,
	opts: CodeStylerDecorateOpts,
	linkCtx: { fileSlug: string; manifest: UrlManifest; externalNewTab: boolean },
): void {
	const { params } = stash;
	const isFigure = shell.tagName === "figure";

	// ---- shell/pre classes -------------------------------------------------
	const preClasses = Array.isArray(pre.properties?.className)
		? (pre.properties.className as string[])
		: [];
	if (!preClasses.includes("code-styler-pre"))
		preClasses.push("code-styler-pre");
	if (isFigure) {
		const shellClasses = Array.isArray(shell.properties?.className)
			? (shell.properties.className as string[])
			: [];
		if (!shellClasses.includes("code-styler-decorated"))
			shellClasses.push("code-styler-decorated");
		shell.properties.className = shellClasses;
	} else {
		preClasses.push("code-styler-standalone");
	}
	if (params.language) preClasses.push(`language-${params.language}`);
	pre.properties.className = preClasses;

	// ---- numbers & wrapping ------------------------------------------------
	// All decorated blocks follow the theme default (opts.lineNumbers); ln: /
	// ln:false and RPC-native {N}showLineNumbers/startLineNumber adjust it.
	const numbersOn =
		!params.lineNumbers.alwaysDisabled &&
		(params.lineNumbers.alwaysEnabled || opts.lineNumbers);
	const offset = params.lineNumbers.offset || stash.rpcNumbers.offset || 0;
	if (!numbersOn) preClasses.push("code-styler-hide-numbers");

	let wrapClass: string | null = null;
	if (params.lineUnwrap.alwaysEnabled) {
		wrapClass = params.lineUnwrap.activeWrap
			? "code-styler-unwrapped-inactive"
			: "code-styler-unwrapped";
	} else if (params.lineUnwrap.alwaysDisabled) {
		wrapClass = "code-styler-wrapped";
	} else {
		wrapClass = opts.wrapLines
			? "code-styler-wrapped"
			: "code-styler-unwrapped";
	}
	if (wrapClass) preClasses.push(wrapClass);
	pre.properties.className = preClasses;

	// ---- collect lines ------------------------------------------------------
	const lineSpans: Element[] = [];
	const textLines: string[] = [];
	for (const child of code.children) {
		if (
			child.type === "element" &&
			child.properties?.["data-line"] !== undefined
		) {
			lineSpans.push(child as Element);
		} else if (child.type === "text") {
			textLines.push(child.value);
		}
	}
	const plainLines: string[] = [];
	if (lineSpans.length === 0) {
		const joined = textLines.join("");
		plainLines.push(...joined.split("\n"));
		if (plainLines.length > 0 && plainLines[plainLines.length - 1] === "")
			plainLines.pop();
	}

	const rows: Element[] = [];
	for (
		let i = 0;
		i < (lineSpans.length > 0 ? lineSpans.length : plainLines.length);
		i++
	) {
		const displayNumber = i + 1 + offset;
		let lineText: string;
		let rpcHighlighted = false;
		let inner: ElementContent[];
		if (lineSpans.length > 0) {
			const span = lineSpans[i];
			rpcHighlighted = span.properties?.["data-highlighted-line"] !== undefined;
			lineText = textContent(span);
			inner = span.children;
		} else {
			lineText = plainLines[i];
			inner = lineText === "" ? [] : [textNode(lineText)];
		}
		const matched = matchLine(params, displayNumber, lineText);
		// plugin parity: default highlight + every matching alternative at once;
		// plain `code-styler-line` only when nothing matched
		const rowClasses: string[] = [];
		if (matched.highlighted || rpcHighlighted)
			rowClasses.push("code-styler-line-highlighted");
		for (const slug of matched.altSlugs)
			rowClasses.push(`code-styler-line-highlighted-${slug}`);
		if (rowClasses.length === 0) rowClasses.push("code-styler-line");

		const lineChildren: ElementContent[] = [];
		if (numbersOn) {
			lineChildren.push(
				element("div", "code-styler-line-number", [
					textNode(String(displayNumber)),
				]),
			);
		}
		const textChildren: ElementContent[] =
			inner.length > 0 ? inner : [element("br", undefined, [])];
		lineChildren.push(
			element(
				"div",
				"code-styler-line-text",
				convertCommentLinks(textChildren, linkCtx),
			),
		);
		rows.push(element("div", rowClasses, lineChildren));
	}
	code.children = rows;
	// RPC's grid inline style lacks our column template; the CSS adds it via
	// grid-template-columns on the decorated code element.

	// ---- header --------------------------------------------------------------
	const headerRequired =
		params.title !== "" ||
		params.fold.enabled ||
		opts.header.showLanguageTag === "always" ||
		opts.header.showLanguageIcon === "always";
	if (headerRequired) {
		const language = params.language;
		const header = element("div", "code-styler-header-container", []);
		const showTag =
			language &&
			(opts.header.showLanguageTag === "always" ||
				(opts.header.showLanguageTag === "ifHeader" &&
					(params.title !== "" || params.fold.enabled)));
		const icon = language ? getLanguageIcon(language) : undefined;
		const showIcon =
			language &&
			icon?.icon &&
			(opts.header.showLanguageIcon === "always" ||
				(opts.header.showLanguageIcon === "ifHeader" &&
					(params.title !== "" || params.fold.enabled)));
		if (showIcon && icon?.icon) {
			const img = element("img", "code-styler-icon", []) as Element;
			img.properties = {
				...img.properties,
				src: iconDataUri(wrapIconSvg(icon.icon)),
				alt: "",
				width: 32,
				height: 32,
			};
			header.children.push(element("div", "code-styler-header-icon", [img]));
		}
		if (showTag) {
			header.children.push(
				element("div", "code-styler-header-language-tag", [
					textNode(displayLanguageName(language)),
				]),
			);
		}
		// title slot only exists when there is something to show: a real title,
		// or the fold placeholder for `fold:` blocks (default "Folded Code")
		const hasTitle = params.title !== "" || params.fold.enabled;
		if (hasTitle) {
			const titleText =
				params.title !== ""
					? params.title
					: params.fold.placeholder || FOLD_PLACEHOLDER;
			const titleChildren: ElementContent[] = [];
			if (params.reference && params.reference !== "") {
				// the displayed text is the parsed title (alias / link text), the
				// href comes from the reference target
				const resolved = resolveCodeLink(
					params.reference,
					linkCtx.fileSlug,
					linkCtx.manifest,
				);
				resolved.label = titleText !== "" ? titleText : resolved.label;
				titleChildren.push(
					anchorNode(resolved, [], { externalNewTab: linkCtx.externalNewTab }),
				);
			} else {
				titleChildren.push(textNode(titleText));
			}
			header.children.push(
				element("div", "code-styler-header-text", titleChildren),
			);
		}

		// header first child of the shell (before pre), fold flag on pre
		shell.children.unshift(header);
		if (params.fold.enabled) {
			const classes = Array.isArray(pre.properties?.className)
				? (pre.properties.className as string[])
				: [];
			if (!classes.includes("code-styler-folded"))
				classes.push("code-styler-folded");
			pre.properties.className = classes;
			pre.properties["data-default-fold"] = "true";
		}
	}
}
