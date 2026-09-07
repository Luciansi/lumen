/**
 * Code-Styler pre-processing, run BEFORE the syntax-highlighting (RPC)
 * transformer in the rehype chain.
 *
 * Responsibilities:
 *  - parse each fenced block's info string (Code-Styler dialect) and decide
 *    whether it is decorated (`trigger` in the stash) — language-carrying
 *    fences with no parameters are promoted to the default decoration
 *    (Obsidian default-theme parity); bare fences stay untouched;
 *  - rewrite the meta RPC sees so it never emits its own figcaption, braces
 *    or char-marks for blocks whose decorations we own (see code-styler/params);
 *  - ` ```reference ` blocks: resolve the referenced file at build time and
 *    replace the fence content + language so RPC highlights it like a normal
 *    fence; failures become an error block;
 *  - rmarkdown / language-less fences: normalize the className so RPC loads
 *    the real grammar (or skips entirely when no language was intended).
 *
 * The parsed result is stashed on `code.data.codeStylerParams`; RPC reattaches
 * the original code element's `data` object onto its rebuilt code, so the
 * decorate plugin (post-RPC) can read it back.
 */
import path from "node:path";
import type { Element, Root } from "hast";
import { visit } from "unist-util-visit";
import {
	type AnalyzedFence,
	analyzeFence,
	type CodeblockParameters,
	languageMatchesPatterns,
} from "../code-styler/params.ts";
import { resolveReference } from "../code-styler/reference.ts";
import type { UrlManifest } from "../manifest.ts";

/** Stash shape stored on code.data.codeStylerParams (survives RPC's rebuild). */
export interface CodeStylerStash {
	params: CodeblockParameters;
	trigger: AnalyzedFence["trigger"];
	rpcNumbers: { requested: boolean; offset: number };
}

export interface CodeStylerParamsOpts {
	/** alternative highlight names the parser recognizes (config) */
	alternativeNames: string[];
	/** absolute path code root; `@/` in reference paths resolves here */
	codeRoot: string;
	/** absolute content root (reference `./`-relative resolution base) */
	contentRoot: string;
	/** wildcard patterns of languages that must stay untouched ("ad-*") */
	ignoredLanguages: string[];
	getManifest: () => UrlManifest;
}

type AnyElement = Element & { data?: Record<string, unknown> };

const RPC_SKIP_LANGUAGES = new Set(["math"]);

function findCode(pre: Element): AnyElement | undefined {
	const code = pre.children.find(
		(child) => child.type === "element" && child.tagName === "code",
	);
	return code as AnyElement | undefined;
}

function codeText(code: Element): string {
	let out = "";
	for (const child of code.children) {
		if (child.type === "text") out += child.value;
		else if (child.type === "element" && child.tagName === "br") out += "\n";
	}
	return out;
}

function textNode(value: string): Element["children"][number] {
	return { type: "text", value };
}

export function rehypeCodeStylerParams(opts: CodeStylerParamsOpts) {
	return function codeStylerParams(
		tree: Root,
		file: { data: Record<string, unknown> },
	): void {
		const frontmatter = file.data.frontmatter as
			| Record<string, unknown>
			| undefined;
		if (frontmatter?.["code-styler-ignore"] === true) return; // whole-file opt-out
		const filePath =
			typeof file.data.filePath === "string"
				? (file.data.filePath as string)
				: undefined;
		const sourceFileDir = filePath ? path.dirname(filePath) : opts.contentRoot;
		const manifest = opts.getManifest();

		visit(tree, "element", (node) => {
			if (node.tagName !== "pre") return;
			const pre = node as Element;
			const code = findCode(pre);
			if (!code) return;

			const className = Array.isArray(code.properties?.className)
				? (code.properties.className as string[])
				: [];
			const langToken = className.find((c) => c.startsWith("language-"));
			const rawLang = langToken ? langToken.slice("language-".length) : "";
			const rawMeta =
				typeof code.data?.meta === "string" ? (code.data.meta as string) : "";

			if (!rawLang && !rawMeta) return; // plain, nothing to analyze
			if (
				className.includes("mermaid") ||
				RPC_SKIP_LANGUAGES.has(rawLang.toLowerCase())
			)
				return;

			const analyzedBase = analyzeFence(rawLang, rawMeta, {
				alternativeNames: opts.alternativeNames,
			});
			let analyzed = analyzedBase;
			let { params } = analyzed;
			if (analyzed.trigger === "none") {
				// Language-carrying fences with no parameters still get the default
				// decoration (Code-Styler theme defaults: rows, config-driven line
				// numbers, wrapping; no header without a title/fold) — Obsidian
				// parity. Bare fences without a language stay plain.
				if (!params.language) return;
				if (languageMatchesPatterns(params.language, opts.ignoredLanguages))
					return;
				analyzed = { ...analyzed, trigger: "cs" };
				params = analyzed.params;
				rawMetaHandle(code, analyzed.metaRemainder);
				stash(code, analyzed, params);
				return;
			}

			// reference codeblock: swap fence content for the referenced file
			if (params.language === "reference") {
				const resolved = resolveReference(codeText(code), {
					sourceFileDir,
					codeRoot: opts.codeRoot,
					manifest,
				});
				if (!resolved.ok) {
					// swap the code for an error block (the pre shell stays inert)
					const error = errorNode(resolved.error);
					const index = node.children.indexOf(code as Element);
					node.children.splice(index, 1, error);
					const preClasses = Array.isArray(node.properties?.className)
						? (node.properties.className as string[])
						: [];
					preClasses.push("code-styler-error-pre");
					node.properties = { ...node.properties, className: preClasses };
					code.data = {};
					return;
				}
				// plugin adjustReference semantics
				if (
					!params.lineNumbers.alwaysDisabled &&
					!params.lineNumbers.alwaysEnabled
				) {
					params.lineNumbers.offset = resolved.startLine - 1;
					params.lineNumbers.alwaysEnabled = resolved.startLine !== 1;
				}
				if (params.title === "") params.title = resolved.title;
				params.language = resolved.language;
				code.children = [textNode(resolved.code)];
				code.properties = { className: [`language-${resolved.language}`] };
				rawMetaHandle(code, "");
				stash(code, analyzed, params);
				return;
			}

			// rmarkdown / language-less fences: normalize what RPC sees
			if (params.rmarkdown && rawLang.startsWith("{")) {
				// ` ```{r title, hl=5} ` → className language-r so RPC loads the grammar
				const normalized = className.filter((c) => !c.startsWith("language-"));
				normalized.push(`language-${params.language}`);
				code.properties = { ...code.properties, className: normalized };
			} else if (params.language === "") {
				// language-less (brace highlight / keyword first word): RPC must skip
				// so the block stays a plain pre>code that decorate can handle
				code.properties = {
					...code.properties,
					className: className.filter((c) => !c.startsWith("language-")),
				};
			}

			// excluded-language policy: leave the block 100% untouched (blog-native)
			if (languageMatchesPatterns(params.language, opts.ignoredLanguages))
				return;

			if (params.ignore) return; // per-block opt-out: untouched, RPC-native

			rawMetaHandle(code, analyzed.metaRemainder);
			stash(code, analyzed, params);
		});
	};
}

function rawMetaHandle(code: AnyElement, remainder: string) {
	if (!code.data) code.data = {};
	if (remainder) code.data.meta = remainder;
	else delete code.data.meta;
}

function stash(
	code: AnyElement,
	analyzed: AnalyzedFence,
	params: CodeblockParameters,
) {
	if (!code.data) code.data = {};
	code.data.codeStylerParams = {
		params,
		trigger: analyzed.trigger,
		rpcNumbers: analyzed.rpcNumbers,
	} satisfies CodeStylerStash;
}

/** Caution-style error block replacing a failed ` ```reference ` fence. */
function errorNode(message: string): Element {
	return {
		type: "element",
		tagName: "div",
		properties: { className: ["code-styler-error"], role: "alert" },
		children: [
			{
				type: "element",
				tagName: "span",
				properties: { className: ["code-styler-error-title"] },
				children: [textNode("reference error")],
			},
			textNode(` ${message}`),
		],
	};
}
