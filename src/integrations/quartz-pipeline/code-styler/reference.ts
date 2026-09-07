/**
 * ` ```reference ` codeblock support, ported from Obsidian-Code-Styler
 * src/Referencing.ts + src/Parsing/ReferenceParsing.ts, adapted to the
 * static blog:
 *  - no vault API: files are read from the repo at build time;
 *  - `@/` resolves against a configurable code root (default: repo root);
 *  - `./` / bare paths resolve relative to the rendering file;
 *  - `[[wikilink]]` resolves through the content manifest;
 *  - paths escaping the code root are rejected;
 *  - remote (http/https) references are not fetched in v1 — an error block
 *    is rendered instead.
 */

import fs from "node:fs";
import path from "node:path";
import { slugifyFilePath } from "@quartz-community/utils";
import type { UrlManifest } from "../manifest.ts";

export interface ResolvedReference {
	ok: true;
	code: string;
	language: string;
	/** 1-based line number of the first rendered line (drives ln: offset) */
	startLine: number;
	title: string;
}

export interface ReferenceError {
	ok: false;
	error: string;
}

type LineIdentifier = null | number | string | RegExp;

interface ReferenceParameters {
	filePath: string;
	language: string;
	start: LineIdentifier;
	end: LineIdentifier;
}

export interface ResolveReferenceOpts {
	/** directory of the markdown file containing the fence (absolute) */
	sourceFileDir: string;
	/** absolute code root; `@/path` resolves here */
	codeRoot: string;
	manifest: UrlManifest;
}

const EXT_TO_LANGUAGE: Record<string, string> = {
	py: "python",
	py3: "python",
	cs: "csharp",
	csharp: "csharp",
	h: "c",
	hh: "cpp",
	hpp: "cpp",
	cc: "cpp",
	cxx: "cpp",
	ipp: "cpp",
	mjs: "javascript",
	cjs: "javascript",
	jsx: "jsx",
	tsx: "tsx",
	md: "markdown",
	mdx: "mdx",
	yml: "yaml",
	styl: "stylus",
	less: "less",
	sh: "shellscript",
	bash: "shellscript",
	zsh: "shellscript",
	shell: "shellscript",
	toml: "ini",
	tex: "latex",
	"": "plaintext",
	txt: "plaintext",
};

/** Infer a shiki loadable language from a filename/[[link]] path. */
export function languageFromFilePath(filePath: string): string {
	const name = path.basename(filePath.replace(/\\/g, "/"));
	const dot = name.lastIndexOf(".");
	const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
	return EXT_TO_LANGUAGE[ext] ?? (ext === "" ? "plaintext" : ext);
}

/** Port of ReferenceParsing.getLineIdentifier. */
function getLineIdentifier(raw: string): LineIdentifier {
	const value = raw.trim();
	if (/^\/(.*)\/$/.test(value)) {
		try {
			return new RegExp(value.replace(/^\/(.*)\/$/, "$1"));
		} catch {
			return null;
		}
	}
	if (/^\d+$/.test(value)) return Number.parseInt(value, 10);
	return value; // word; `+N` stays a string → relative end in getLineLimits
}

/** Port of ReferenceParsing.getLineLimits on raw line text. */
function getLineLimits(
	codeContent: string,
	parameters: ReferenceParameters,
): { codeSection: string; startLine: number } {
	const lines = codeContent.split("\n");
	const start = parameters.start;
	const end = parameters.end;
	const firstIndex = (re: RegExp) => lines.findIndex((line) => re.test(line));
	const wordIndex = (word: string) =>
		lines.findIndex((line) => line.indexOf(word) > -1);

	let startIndex: number;
	let endIndex: number;
	if (start === null) startIndex = 0;
	else if (typeof start === "number") startIndex = start - 1;
	else if (start instanceof RegExp) startIndex = firstIndex(start);
	else if (
		typeof start === "string" &&
		start.startsWith("/") &&
		start.endsWith("/")
	) {
		startIndex = firstIndex(new RegExp(start.replace(/^\/(.*)\/$/, "$1")));
	} else {
		startIndex = wordIndex(String(start));
	}
	if (end === null) endIndex = lines.length - 1;
	else if (typeof end === "number") endIndex = end - 1;
	else if (end instanceof RegExp) endIndex = firstIndex(end);
	else if (
		typeof end === "string" &&
		end.startsWith("/") &&
		end.endsWith("/")
	) {
		endIndex = firstIndex(new RegExp(end.replace(/^\/(.*)\/$/, "$1")));
	} else if (typeof end === "string" && end.startsWith("+")) {
		endIndex = startIndex + Number(end.slice(1));
	} else {
		endIndex = wordIndex(String(end));
	}
	if (startIndex > endIndex)
		throw new Error("Specified Start line is after the specified End line");
	if (startIndex === -1) throw new Error("Start line could not be found");
	if (endIndex === -1) throw new Error("End line could not be found");
	return {
		codeSection: lines.slice(startIndex, endIndex + 1).join("\n"),
		startLine: startIndex + 1,
	};
}

/** Minimal line-wise YAML-subset parser for the reference parameter block. */
function parseReferenceParameters(source: string): ReferenceParameters {
	// mirror the plugin: quote unquoted [[wikilinks]] so they survive YAML-ish parsing
	const quoted = source.replace(/(?<!")\[\[(.*?)\]\](?!")/, '"[[$1]]"');
	const params: Record<string, string> = {};
	for (const line of quoted.split("\n")) {
		const match = /^\s*([\w-]+)\s*:\s*(.*?)\s*$/.exec(line);
		if (!match) continue;
		let value = match[2].trim();
		const wasQuoted =
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"));
		if (wasQuoted) value = value.slice(1, -1);
		params[match[1]] = value;
	}
	const filePath = params.filePath ?? params.file ?? params.path ?? params.link;
	if (typeof filePath === "undefined") throw new Error("No file specified");
	const start: LineIdentifier =
		typeof params.start === "undefined"
			? null
			: getLineIdentifier(params.start);
	const end: LineIdentifier =
		typeof params.end === "undefined" ? null : getLineIdentifier(params.end);
	// explicit language only; inference from the resolved file happens in
	// resolveReference ([[wikilinks]] have no extension here)
	const language = params.language ?? params.lang ?? "";
	return { filePath, language, start, end };
}

/** Resolve [[wikilink|alias]] targets through the content manifest to an absolute file path. */
function resolveWikilink(
	manifest: UrlManifest,
	raw: string,
): string | undefined {
	const target = raw.slice(2, -2).split("|")[0].trim();
	const slugify = slugifyFilePath as unknown as (p: string) => string;
	// exact + folder-index slugs (with and without extension)
	for (const name of [target, target.replace(/\.[^.]+$/, "")]) {
		for (const variant of [slugify(name), slugify(`${name}/index`)]) {
			const entry = manifest.bySlug.get(variant);
			if (entry) return path.resolve(entry.filePath);
		}
	}
	// unique-basename lookup ([[Note Name]] style)
	const base = slugify(target.split("/").pop() ?? target);
	const byName =
		manifest.byBasename.get(base) ??
		manifest.byBasename.get(target.split("/").pop() ?? "");
	if (byName?.[0]) return path.resolve(byName[0].filePath);
	return undefined;
}

/** Resolve the file parameter to an absolute repo path (throws descriptive errors). */
function resolveFilePath(rawPath: string, opts: ResolveReferenceOpts): string {
	const filePath = rawPath.trim();
	if (/^https?:\/\//i.test(filePath)) {
		throw new Error(
			"Remote references are not supported in v1 (no build-time fetching)",
		);
	}
	const abs = ((): string => {
		if (filePath.startsWith("[[") && filePath.endsWith("]]")) {
			const hit = resolveWikilink(opts.manifest, filePath);
			if (hit) return hit;
			throw new Error(
				`File could not be found in the content library: ${filePath}`,
			);
		}
		if (filePath.startsWith("@/"))
			return path.resolve(opts.codeRoot, filePath.slice(2));
		if (filePath.startsWith("/")) {
			throw new Error(
				'Path should not start with "/"; use "@/path" to reference the code root',
			);
		}
		if (filePath.startsWith("./") || !/^[<:"/\\>?|*]/.test(filePath[0] ?? "")) {
			return path.resolve(opts.sourceFileDir, filePath.replace(/^\.\//, ""));
		}
		throw new Error("Cannot resolve path");
	})();
	const root = path.resolve(opts.codeRoot);
	if (!abs.startsWith(root + path.sep) && abs !== root) {
		throw new Error("Path references outside the repository code root");
	}
	return abs;
}

/**
 * Resolve a ` ```reference ` block. `body` is the fence content (YAML-ish
 * parameters). Returns the code to render plus the language/start line, or a
 * descriptive error.
 */
export function resolveReference(
	body: string,
	opts: ResolveReferenceOpts,
): ResolvedReference | ReferenceError {
	try {
		const parameters = parseReferenceParameters(body);
		const absPath = resolveFilePath(parameters.filePath, opts);
		if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) {
			throw new Error(`Local file does not exist at ${parameters.filePath}`);
		}
		const codeContent = fs.readFileSync(absPath, "utf8").trim();
		const { codeSection, startLine } = getLineLimits(codeContent, parameters);
		return {
			ok: true,
			code: codeSection,
			language: parameters.language || languageFromFilePath(absPath),
			startLine,
			title: path.basename(absPath),
		};
	} catch (error) {
		return {
			ok: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}
