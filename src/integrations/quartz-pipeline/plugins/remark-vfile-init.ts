/**
 * Pre-populates vfile data for the quartz transformer chain and performs the
 * note-properties normalization (vendored from @quartz-community/note-properties,
 * whose remarkFrontmatter/gray-matter stage is useless in Astro because Astro
 * strips frontmatter before unified runs).
 *
 * Frontmatter is re-read from disk (mtime-cached) because Astro's zod schema
 * strips unknown keys (aliases, permalink, cssclasses, created, ...) before
 * they reach `data.astro.frontmatter`.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	getFileExtension,
	slugifyFilePath,
	slugTag,
	splitAnchor,
} from "@quartz-community/utils";
import matter from "gray-matter";
import type { QuartzCtx } from "../ctx.ts";

// ---- ports from note-properties (dist/index.js) ----

function coalesceAliases(data: Record<string, unknown>, aliases: string[]) {
	for (const alias of aliases) {
		if (data[alias] !== undefined && data[alias] !== null) return data[alias];
	}
	return undefined;
}

function coerceToArray(input: unknown): string[] | undefined {
	if (input === undefined || input === null) return undefined;
	if (!Array.isArray(input))
		return String(input)
			.split(",")
			.map((s) => s.trim());
	return input
		.filter((v) => typeof v === "string" || typeof v === "number")
		.map((v) => v.toString());
}

function getAliasSlugs(aliases: string[]): string[] {
	return aliases.map((alias) => {
		const mockFp =
			getFileExtension(alias as any) === ".md" ? alias : `${alias}.md`;
		return slugifyFilePath(mockFp as any);
	});
}

const WIKILINK_PATTERN = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
const MDLINK_PATTERN = /\[(?:[^\]]*)\]\(([^)]+)\)/g;

function slugifyWikilinkTarget(target: string): string {
	const [rawPath, anchor] = splitAnchor(target as any);
	if (!rawPath) return anchor;
	const pathWithExt = rawPath.endsWith(".md") ? rawPath : `${rawPath}.md`;
	return slugifyFilePath(pathWithExt as any) + anchor;
}

function extractLinksFromValue(value: unknown): string[] {
	if (typeof value === "string") {
		// matchAll 自带全局扫描,无需手动维护 lastIndex/循环赋值
		const links: string[] = [];
		for (const m of value.matchAll(WIKILINK_PATTERN)) {
			links.push(slugifyWikilinkTarget(m[1]));
		}
		for (const m of value.matchAll(MDLINK_PATTERN)) {
			links.push(m[1]);
		}
		return links;
	}
	if (Array.isArray(value))
		return value.flatMap((item) => extractLinksFromValue(item));
	if (value !== null && typeof value === "object") {
		return Object.values(value).flatMap((v) => extractLinksFromValue(v));
	}
	return [];
}

// ---- frontmatter disk cache ----

const frontmatterCache = new Map<
	string,
	{ mtimeMs: number; data: Record<string, unknown> }
>();

export function readFrontmatterFromDisk(
	filePath: string,
): Record<string, unknown> {
	const stat = fs.statSync(filePath);
	const cached = frontmatterCache.get(filePath);
	if (cached && cached.mtimeMs === stat.mtimeMs) return cached.data;
	const parsed = matter(fs.readFileSync(filePath, "utf8"));
	const data = (parsed.data ?? {}) as Record<string, unknown>;
	frontmatterCache.set(filePath, { mtimeMs: stat.mtimeMs, data });
	return data;
}

/** Normalization core, shared with the transclusion sub-processor. */
export function normalizeFrontmatter(
	raw: Record<string, unknown>,
	filePath: string,
): Record<string, unknown> {
	const data: Record<string, unknown> = { ...raw };
	if (data.title != null && String(data.title) !== "") {
		data.title = String(data.title);
	} else {
		const stem = path.parse(filePath).name;
		data.title =
			stem !== "index"
				? stem
				: path.basename(path.dirname(filePath)) || "Untitled";
	}
	const tags = coerceToArray(coalesceAliases(data, ["tags", "tag"]));
	if (tags) data.tags = [...new Set(tags.map((tag) => slugTag(tag)))];
	const aliases = coerceToArray(coalesceAliases(data, ["aliases", "alias"]));
	if (aliases) data.aliases = aliases;
	if (data.permalink != null && String(data.permalink) !== "") {
		data.permalink = String(data.permalink);
	}
	const cssclasses = coerceToArray(
		coalesceAliases(data, ["cssclasses", "cssclass"]),
	);
	if (cssclasses) data.cssclasses = cssclasses;
	const socialImage = coalesceAliases(data, ["socialImage", "image", "cover"]);
	const created = coalesceAliases(data, ["created", "date"]);
	if (created) data.created = created;
	const modified = coalesceAliases(data, [
		"modified",
		"lastmod",
		"updated",
		"last-modified",
	]);
	if (modified) data.modified = modified;
	(data as { modified?: unknown }).modified ??= created;
	const published = coalesceAliases(data, ["published", "publishDate", "date"]);
	if (published) data.published = published;
	if (socialImage) data.socialImage = socialImage;
	return data;
}

// ---- the plugin ----

export function remarkVfileInit(opts: { contentRoot: string; ctx: QuartzCtx }) {
	return async function vfileInit(
		_tree: unknown,
		file: { data: any; path?: string | URL },
	): Promise<void> {
		const filePath =
			file.path instanceof URL
				? fileURLToPath(file.path)
				: String(file.path ?? "");
		const contentRoot = opts.contentRoot.replace(/\/+$/, "");
		const rel = filePath.startsWith(contentRoot + path.sep)
			? filePath
					.slice(contentRoot.length + 1)
					.split(path.sep)
					.join("/")
			: path.posix.relative(contentRoot, filePath.split(path.sep).join("/"));
		const slug = slugifyFilePath(rel as any);

		file.data.filePath = filePath;
		file.data.relativePath = rel;
		file.data.slug = slug;

		if (filePath && fs.existsSync(filePath)) {
			const data = normalizeFrontmatter(
				readFrontmatterFromDisk(filePath),
				filePath,
			);
			const aliases = coerceToArray(data.aliases as unknown);
			if (aliases && aliases.length > 0) {
				file.data.aliases = getAliasSlugs(aliases);
				opts.ctx.allSlugs.push(...file.data.aliases);
			}
			if (typeof data.permalink === "string" && data.permalink !== "") {
				const fileAliases = (file.data.aliases ?? []) as string[];
				fileAliases.push(data.permalink);
				file.data.aliases = fileAliases;
				opts.ctx.allSlugs.push(data.permalink);
			}
			const frontmatterLinks = extractLinksFromValue(data);
			if (frontmatterLinks.length > 0) {
				file.data.frontmatterLinks = [
					...(file.data.frontmatterLinks ?? []),
					...frontmatterLinks,
				];
			}
			file.data.frontmatter = data;
		}
	};
}
