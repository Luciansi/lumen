/**
 * Inline-code `{lang} code` prefix syntax, ported from Obsidian-Code-Styler
 * Parsing/InlineCodeParsing.ts. Registered in remarkChain AND subChain so
 * transcluded notes get the same treatment.
 *
 * Transform:
 *  - `` `{lang} code` `` → `` `code{:lang}` `` — the rehype-pretty-code inline
 *    suffix path (already in the pipeline) then syntax-highlights the text;
 *  - `` `{}{literal braces}` `` → `` `{literal braces}` `` (escape form);
 *  - unknown/unsuffixable languages (c++, c#, …): params consumed, text kept
 *    plain — mirrors the plugin, whose inline highlighting is opt-in per
 *    language as well. `title:`/`icon` params are parsed but inert in v1
 *    (the RPC suffix mechanism cannot carry them).
 */

import type { Root } from "mdast";
import { visit } from "unist-util-visit";
import { LANGUAGE_NAMES } from "../code-styler/languages.ts";

const INLINE_PREFIX_RE =
	/^{((?:[^"'{}\\]|\\.|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')*)} *?([^ ].*)$/;
/** safe trailing-suffix charset for the RPC inline syntax */
const SUFFIX_SAFE_RE = /^[A-Za-z0-9][\w.+-]*$/;
/** short aliases that shiki knows but the prism-derived name map may not */
const EXTRA_ALIASES = new Set([
	"py",
	"py3",
	"cjs",
	"mjs",
	"jsx",
	"tsx",
	"yml",
	"sh",
	"bash",
	"zsh",
	"shell",
	"h",
	"hh",
	"hpp",
	"cc",
	"cxx",
	"ipp",
	"md",
	"toml",
	"txt",
	"tex",
	"rst",
	"dockerfile",
	"makefile",
]);

function languageKnown(lang: string): boolean {
	return lang in LANGUAGE_NAMES || EXTRA_ALIASES.has(lang);
}

export function remarkInlineCodeStyler() {
	return function inlineCodeStyler(tree: Root): void {
		visit(tree, "inlineCode", (node) => {
			const match = INLINE_PREFIX_RE.exec(node.value);
			if (!match) return;
			if (match[1] === "") {
				node.value = match[2]; // `{}` escape form
				return;
			}
			const params = match[1];
			const rest = match[2];
			const languageBreak = params.indexOf(" ");
			const language = (
				languageBreak !== -1 ? params.slice(0, languageBreak) : params
			).toLowerCase();
			// params after the language (title:/icon) are consumed but inert in v1
			if (language === "") return; // nothing usable — leave text as written
			if (
				languageKnown(language) &&
				SUFFIX_SAFE_RE.test(language) &&
				!/\{:?[^}]*\}$/.test(rest) // don't stack on an existing suffix
			) {
				node.value = `${rest}{:${language}}`;
			} else {
				node.value = rest;
			}
		});
	};
}
