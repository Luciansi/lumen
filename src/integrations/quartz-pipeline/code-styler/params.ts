/**
 * Code-Styler first-line codeblock parameter grammar, ported faithfully from
 * Obsidian-Code-Styler src/Parsing/CodeblockParsing.ts (v1.1.7) with the
 * plugin's parsing quirks preserved (title:= prefix slicing, brace unwrap,
 * comma stripping, word/range/regex highlight rules, …).
 *
 * The blog pipeline receives the fence info string pre-split by remark-parse
 * into `lang` (first whitespace word) + `meta` (the rest), which loses the
 * plugin's "leading space means no language" distinction. Where the original
 * info string is ambiguous, we disambiguate by content:
 *  - first word is a known parameter keyword → language-less parameter line;
 *  - the whole info string is one `{…}` group of digits/commas/dashes →
 *    language-less `{1,3-4}` highlight form;
 *  - the whole info string is one `{…}` group containing a word (rmarkdown
 *    `{r}`) with no other params → language-only rmarkdown fence.
 */

export interface Highlights {
	lineNumbers: number[];
	plainText: string[];
	regularExpressions: RegExp[];
}

export interface CodeblockParameters {
	language: string;
	title: string;
	/** link target when title/ref was a wikilink / markdown link / url ("" = none) */
	reference: string;
	fold: {
		enabled: boolean;
		placeholder: string;
	};
	lineNumbers: {
		alwaysEnabled: boolean;
		alwaysDisabled: boolean;
		offset: number;
	};
	lineUnwrap: {
		alwaysEnabled: boolean;
		alwaysDisabled: boolean;
		activeWrap: boolean;
	};
	highlights: {
		default: Highlights;
		alternative: Record<string, Highlights>;
	};
	ignore: boolean;
	/** info string was a braced rmarkdown header (`{r title, hl=5}`) */
	rmarkdown: boolean;
	/** `{digits}`-only info string: language-less highlight form */
	braceOnly: boolean;
	/** first word was a parameter keyword: no language was intended */
	languageLess: boolean;
}

export type TriggerClass = "cs" | "rpc" | "none";

export interface AnalyzedFence {
	params: CodeblockParameters;
	trigger: TriggerClass;
	/** tokens that carried Code-Styler semantics (removed from RPC's meta) */
	csTokens: string[];
	/** RPC-native `title="…"` tokens (removed from RPC's meta; we own the header) */
	titleTokens: string[];
	/** tokens left over after CS parsing (kept for RPC when trigger === "rpc") */
	metaRemainder: string;
	/** requested line numbers from RPC/EC-native meta (`showLineNumbers`, `{N}…`, `startLineNumber=N`) */
	rpcNumbers: { requested: boolean; offset: number };
}

export interface CodeStylerAnalyzeOpts {
	alternativeNames: string[];
}

const PARAM_KEYWORDS = new Set([
	"ignore",
	"title",
	"ref",
	"reference",
	"fold",
	"ln",
	"unwrap",
	"wrap",
	"hl",
]);

const emptyHighlights = (): Highlights => ({
	lineNumbers: [],
	plainText: [],
	regularExpressions: [],
});

export function slugifyName(name: string): string {
	return name.toLowerCase().replace(/\s+/g, "-");
}

/**
 * Tokenizer: the plugin's parameter split regex. Tokens are whitespace
 * separated; double/single quotes group; `title:`/`ref:`/`reference:`
 * followed by a wikilink/markdown-link stays atomic. Token edge commas are
 * stripped afterwards.
 */
export function tokenizeMeta(meta: string): string[] {
	const matches = meta.match(
		/(?:(?:ref|reference|title):(?:\[\[.*?\]\]|\[.*?\]\(.+\))|[^\s"']+|"[^"]*"|'[^']*')+/g,
	);
	if (!matches) return [];
	return matches.map((t) => t.replace(/(?:^,|,$)/g, ""));
}

/** Port of parseHighlightedLines: comma-separated numbers, ranges, words, /regex/. */
export function parseHighlightedLines(rules: string): Highlights {
	const lineNumbers: Set<number> = new Set();
	const plainText: Set<string> = new Set();
	const regularExpressions: Set<RegExp> = new Set();
	for (const rule of rules.split(",")) {
		if (/\d+-\d+/.test(rule)) {
			const [start, end] = rule.split("-").map((n) => Number.parseInt(n, 10));
			if (start && end && start <= end) {
				for (let n = start; n <= end; n++) lineNumbers.add(n);
			}
		} else if (/^\/(.*)\/$/.test(rule)) {
			try {
				regularExpressions.add(new RegExp(rule.replace(/^\/(.*)\/$/, "$1")));
			} catch {
				// malformed regex — drop, matching the plugin
			}
		} else if (/".*"/.test(rule)) {
			plainText.add(rule.substring(1, rule.length - 1));
		} else if (/'.*'/.test(rule)) {
			plainText.add(rule.substring(1, rule.length - 1));
		} else if (/\D/.test(rule)) {
			plainText.add(rule);
		} else if (/\d+/.test(rule)) {
			lineNumbers.add(Number.parseInt(rule, 10));
		}
	}
	return {
		lineNumbers: [...lineNumbers],
		plainText: [...plainText],
		regularExpressions: [...regularExpressions],
	};
}

/** Port of manageLink: [[wiki|alias]], [text](url), bare http url. */
export function manageLink(
	parameterString: string,
): { title: string; reference: string } | undefined {
	const refWikiMatch = /\[\[([^\]|\r\n]+?)(?:\|([^\]|\r\n]+?))?\]\]/.exec(
		parameterString,
	);
	const refMdMatch = /\[(.*?)\]\((.+)\)/.exec(parameterString);
	const urlMatch = /^(["']?)(https?:\/\/.*)\1$/.exec(parameterString);
	if (refWikiMatch) {
		return {
			title: refWikiMatch[2] ? refWikiMatch[2].trim() : refWikiMatch[1].trim(),
			reference: refWikiMatch[1].trim(),
		};
	}
	if (refMdMatch) {
		return { title: refMdMatch[1].trim(), reference: refMdMatch[2].trim() };
	}
	if (urlMatch) {
		return { title: "URL", reference: urlMatch[2].trim() };
	}
	return undefined;
}

/**
 * Core parser: takes the fence's parameter region (the plugin's "parameter
 * line" after fence delimiters are stripped and rmarkdown braces are
 * unwrapped — but WITHOUT language separation; the first word may be a
 * language or a parameter keyword) and returns parameters plus the tokens
 * that were consumed.
 */
function parseParameterRegion(
	region: string,
	alternativeNames: Set<string>,
): { params: CodeblockParameters; consumed: number[] } {
	const params: CodeblockParameters = {
		language: "",
		title: "",
		reference: "",
		fold: { enabled: false, placeholder: "" },
		lineNumbers: { alwaysEnabled: false, alwaysDisabled: false, offset: 0 },
		lineUnwrap: {
			alwaysEnabled: false,
			alwaysDisabled: false,
			activeWrap: false,
		},
		highlights: { default: emptyHighlights(), alternative: {} },
		ignore: false,
		rmarkdown: false,
		braceOnly: false,
		languageLess: false,
	};

	const tokens = tokenizeMeta(region);
	if (tokens.length === 0) return { params, consumed: [] };

	const consumed = new Set<number>();
	const consume = (i: number) => consumed.add(i);

	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i];
		if (token === "ignore") {
			params.ignore = true;
			consume(i);
		} else if (/^title[:=]/.test(token)) {
			consume(i);
			params.title = token.slice("title:".length);
			// quoted/unquoted value stripping — plugin: /(["']?)([^\x01]+)\1/
			const valueMatch = /(["']?)([\s\S]+)\1/.exec(params.title);
			if (valueMatch) params.title = valueMatch[2].trim();
			const linkInfo = manageLink(token.slice("title:".length));
			if (linkInfo) {
				params.title = linkInfo.title;
				params.reference = linkInfo.reference;
			}
		} else if (/^ref[:=]/.test(token) || /^reference[:=]/.test(token)) {
			consume(i);
			const prefix = /^ref[:=]/.test(token) ? "ref:" : "reference:";
			const linkInfo = manageLink(token.slice(prefix.length));
			if (linkInfo) {
				params.reference = linkInfo.reference;
				if (params.title === "") params.title = linkInfo.title;
			}
		} else if (/^fold[:=]?/.test(token)) {
			consume(i);
			if (token === "fold") {
				params.fold = { enabled: true, placeholder: "" };
			} else {
				const placeholder = token.slice("fold:".length);
				const foldMatch = /(["']?)([\s\S]+)\1/.exec(placeholder);
				if (foldMatch) {
					params.fold = { enabled: true, placeholder: foldMatch[2].trim() };
				}
			}
		} else if (/^ln[:=]/.test(token)) {
			consume(i);
			const value = token.slice("ln:".length);
			if (/^\d+$/.test(value)) {
				params.lineNumbers = {
					alwaysEnabled: true,
					alwaysDisabled: false,
					offset: Number.parseInt(value, 10) - 1,
				};
			} else if (value.toLowerCase() === "true") {
				params.lineNumbers = {
					alwaysEnabled: true,
					alwaysDisabled: false,
					offset: 0,
				};
			} else if (value.toLowerCase() === "false") {
				params.lineNumbers = {
					alwaysEnabled: false,
					alwaysDisabled: true,
					offset: 0,
				};
			}
		} else if (/^unwrap[:=]?/.test(token) || token === "wrap") {
			consume(i);
			if (token === "wrap") {
				params.lineUnwrap = {
					alwaysEnabled: false,
					alwaysDisabled: true,
					activeWrap: false,
				};
			} else if (token === "unwrap") {
				params.lineUnwrap = {
					alwaysEnabled: true,
					alwaysDisabled: false,
					activeWrap: false,
				};
			} else {
				const value = token.slice("unwrap:".length).toLowerCase();
				if (value === "inactive") {
					params.lineUnwrap = {
						alwaysEnabled: true,
						alwaysDisabled: false,
						activeWrap: true,
					};
				} else if (value === "true") {
					params.lineUnwrap = {
						alwaysEnabled: true,
						alwaysDisabled: false,
						activeWrap: false,
					};
				} else if (value === "false") {
					params.lineUnwrap = {
						alwaysEnabled: false,
						alwaysDisabled: true,
						activeWrap: false,
					};
				}
			}
		} else {
			const highlightMatch = /^(\w+)[:=](.+)$/.exec(token);
			if (highlightMatch) {
				if (highlightMatch[1] === "hl") {
					consume(i);
					params.highlights.default = parseHighlightedLines(highlightMatch[2]);
				} else if (alternativeNames.has(highlightMatch[1])) {
					consume(i);
					params.highlights.alternative[highlightMatch[1]] =
						parseHighlightedLines(highlightMatch[2]);
				}
				// unknown \w+[:=] keys are ignored, like the plugin
			} else if (/^{[\d-,]+}$/.test(token)) {
				consume(i);
				params.highlights.default = parseHighlightedLines(token.slice(1, -1));
			}
			// everything else is unknown meta left for RPC
		}
	}

	return { params, consumed: [...consumed] };
}

const RPC_TITLE_RE = /^title=(?:"[^"]*"|'[^']*')$/;

/**
 * Detect RPC/EC-native features in the raw meta string: digit brace groups
 * (space tolerant — tokenization splits `{1, 4}`), quoted "char" or /regex/
 * specs, and the line-number words. CS-consumed tokens are not seen here.
 */
function hasRpcNativeFeature(rawMeta: string): boolean {
	if (/(^|\s)\{[\d\s,.-]+\}/.test(rawMeta)) return true; // digit brace group
	if (/["'][^"'\n]+["']/.test(rawMeta)) return true; // quoted char spec
	if (
		/[\s/]/s.test(rawMeta) &&
		/(^|\s)\/(?:\\\/|[^/\n])+\/(?=\s|$)/.test(rawMeta)
	)
		return true; // /regex/ spec
	if (/\bshowLineNumbers\b/.test(rawMeta) || /\bstartLineNumber=/.test(rawMeta))
		return true;
	return false;
}

/**
 * Whether meta requests line numbers via RPC/EC-native spelling, and from
 * which number they start. Honors `showLineNumbers=false` (RPC itself shows
 * them regardless — a bug we correct).
 */
export function resolveRpcNumberRequest(meta: string): {
	requested: boolean;
	offset: number;
} {
	const tokens = tokenizeMeta(meta);
	let offset = 0;
	let requested = false;
	for (const token of tokens) {
		if (token === "showLineNumbers") requested = true;
		else if (token === "showLineNumbers=false") requested = false;
		else if (/^startLineNumber=(\d+)$/.test(token)) {
			const m = /^startLineNumber=(\d+)$/.exec(token);
			if (m) {
				requested = true;
				offset = Number.parseInt(m[1], 10) - 1;
			}
		} else if (/^\{(\d+)\}showLineNumbers$/.test(token)) {
			const m = /^\{(\d+)\}showLineNumbers$/.exec(token);
			if (m) {
				requested = true;
				offset = Number.parseInt(m[1], 10) - 1;
			}
		}
	}
	// RPC-native meta may also spell it "showLineNumbers=false" — last wins above
	return { requested, offset };
}

/**
 * Analyze one fence. `lang` is the first info word (remark-parse lowercases
 * nothing; the plugin lowercases, so we do too). `meta` is the rest.
 * Returns decoration triggers + the meta tokens RPC must not see.
 */
export function analyzeFence(
	langRaw: string,
	metaRaw: string,
	opts: CodeStylerAnalyzeOpts,
): AnalyzedFence {
	const lang = langRaw.toLowerCase();
	const meta = metaRaw.trim();
	const alternativeNames = new Set(opts.alternativeNames);

	const full = (lang ? lang : "") + (meta ? ` ${meta}` : "");
	// region: what the plugin sees after fence stripping. Start from the full
	// info string; brace unwrapping happens below when the whole thing is `{…}`.
	let region = full;

	const params: CodeblockParameters = {
		language: "",
		title: "",
		reference: "",
		fold: { enabled: false, placeholder: "" },
		lineNumbers: { alwaysEnabled: false, alwaysDisabled: false, offset: 0 },
		lineUnwrap: {
			alwaysEnabled: false,
			alwaysDisabled: false,
			activeWrap: false,
		},
		highlights: { default: emptyHighlights(), alternative: {} },
		ignore: false,
		rmarkdown: false,
		braceOnly: false,
		languageLess: false,
	};
	const rpcNumbers = resolveRpcNumberRequest(meta);

	const finish = (
		consumed: string[],
		csTrigger: boolean,
		titlePresent = false,
	): AnalyzedFence => {
		const consumedSet = new Set(consumed);
		const tokens = tokenizeMeta(region);
		const titleTokens = tokens.filter((t) => RPC_TITLE_RE.test(t));
		const remainderTokens = tokens.filter((t) => !consumedSet.has(t));
		const hasRpcNative = hasRpcNativeFeature(meta) || titleTokens.length > 0;
		let trigger: TriggerClass = "none";
		if (csTrigger) trigger = "cs";
		else if (titlePresent || hasRpcNative) trigger = "rpc";
		// What RPC sees again:
		//  - cs blocks: only our unconsumed tokens (all CS + title tokens are gone);
		//  - rpc blocks: everything except title tokens (RPC would emit a
		//    figcaption we replace with our own header). When nothing at all was
		//    consumed, hand RPC the verbatim meta so its parsers see the original.
		let metaRemainder: string;
		if (consumed.length === 0 && titleTokens.length === 0) {
			metaRemainder = meta;
		} else if (trigger === "cs") {
			metaRemainder = remainderTokens.join(" ");
		} else {
			metaRemainder = remainderTokens
				.filter((t) => !RPC_TITLE_RE.test(t))
				.join(" ");
		}
		const csTokens = tokens.filter(
			(t) => consumedSet.has(t) && !RPC_TITLE_RE.test(t),
		);
		return {
			params,
			trigger,
			csTokens,
			titleTokens,
			metaRemainder,
			rpcNumbers,
		};
	};

	// --- rmarkdown / brace-only whole-info forms -----------------------------
	if (/^\{[^}]*\}\s*$/.test(full)) {
		const inner = full.slice(1, full.lastIndexOf("}")).trim();
		if (/^[\d,\s-]+$/.test(inner) && !/\s/.test(inner.replace(/[\d,]/g, ""))) {
			// `{1,3-4}` language-less highlight form (leading-space idiom lost by CommonMark)
			params.braceOnly = true;
			params.languageLess = true;
			params.highlights.default = parseHighlightedLines(inner);
			params.language = "";
			return finish([`{${inner}}`], true);
		}
		// rmarkdown with a real language: `{r title, hl=5}` or `{r}`
		params.rmarkdown = true;
		region = inner;
		// fall through to normal first-word parsing on the inner region
	}

	// --- language-less lines: first word is a keyword, not a language --------
	const firstWord = /^\S+/.exec(region)?.[0] ?? "";
	if (
		!params.rmarkdown &&
		meta &&
		PARAM_KEYWORDS.has(firstWord) &&
		firstWord !== "reference"
	) {
		params.languageLess = true;
		params.language = "";
	} else {
		// first word = language (plugin lowercases); the rest are params.
		// rmarkdown region has no leading space — first word is the language.
		const breakAt = region.indexOf(" ");
		const hasSpace = breakAt !== -1;
		const langWord = hasSpace ? region.slice(0, breakAt) : region;
		params.language = langWord.toLowerCase();
		if (!hasSpace) {
			// language only (e.g. `cpp` alone, `{r}` unwrapped to `r`)
			const consumed: string[] = [];
			if (params.rmarkdown) {
				// `{python}` fence with braces → rewrite to plain `python` for RPC
			}
			if (langWord.startsWith("{") && langWord.endsWith("}")) {
				// rmarkdown braces were already unwrapped above; else `{python}`-as-lang is
				// the no-space rmarkdown spelling → strip braces.
				params.language = langWord.slice(1, -1).toLowerCase();
				params.rmarkdown = true;
			}
			return finish(
				consumed,
				params.rmarkdown || params.braceOnly || params.language === "reference",
			);
		}
		region = region.slice(breakAt + 1);
		// rmarkdown: plugin prefixes the remainder with "title:" so `{r name, hl=5}`
		// renders `name` as the title.
		if (params.rmarkdown && region) region = `title:${region}`;
	}

	const { params: parsed, consumed } = parseParameterRegion(
		region,
		alternativeNames,
	);
	const regionTokens = tokenizeMeta(region);
	Object.assign(params.highlights, parsed.highlights);
	if (parsed.title !== "") {
		params.title = parsed.title;
		params.reference = parsed.reference;
	}
	if (parsed.fold.enabled) params.fold = parsed.fold;
	if (parsed.lineNumbers.alwaysEnabled || parsed.lineNumbers.alwaysDisabled)
		params.lineNumbers = parsed.lineNumbers;
	if (parsed.lineUnwrap.alwaysEnabled || parsed.lineUnwrap.alwaysDisabled)
		params.lineUnwrap = parsed.lineUnwrap;
	if (parsed.ignore) params.ignore = true;

	// NOTE: a lone title (esp. RPC-native `title="…"`) is not a CS-trigger on
	// its own — RPC/expressive-code blocks stay numberless unless asked. `ref:`
	// is Code-Styler-exclusive, so it does pull the block into the CS dialect.
	const csActive =
		params.ignore ||
		params.reference !== "" ||
		params.fold.enabled ||
		params.lineNumbers.alwaysEnabled ||
		params.lineNumbers.alwaysDisabled ||
		params.lineUnwrap.alwaysEnabled ||
		params.lineUnwrap.alwaysDisabled ||
		params.highlights.default.lineNumbers.length > 0 ||
		params.highlights.default.plainText.length > 0 ||
		params.highlights.default.regularExpressions.length > 0 ||
		Object.keys(params.highlights.alternative).length > 0 ||
		params.rmarkdown ||
		params.braceOnly ||
		params.languageLess ||
		params.language === "reference";

	return finish(
		consumed
			.map((index) => regionTokens[index] ?? "")
			.filter((token) => token !== ""),
		csActive,
		params.title !== "",
	);
}

/** Wildcard language matching like the plugin's excluded-languages list ("ad-*"). */
export function languageMatchesPatterns(
	language: string,
	patterns: string[],
): boolean {
	return patterns.some((pattern) =>
		new RegExp(`^${pattern.trim().replace(/\*/g, ".+")}$`, "i").test(language),
	);
}
