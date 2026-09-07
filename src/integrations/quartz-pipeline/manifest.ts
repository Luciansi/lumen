/**
 * Content manifest: maps quartz slugs (content-relative, e.g.
 * "showcase/guide/index") to site page URLs (e.g. "/showcase/guide/"), and
 * resolves link targets the way quartz's crawl-links would — but against the
 * site's vault URL layout instead of quartz's content-mirroring one.
 */
import fs from "node:fs";
import path from "node:path";
import {
	getFileExtension,
	slugifyFilePath,
	splitAnchor,
} from "@quartz-community/utils";
import { slug as githubSlug } from "github-slugger";
import matter from "gray-matter";
import { vaultRouteOf } from "../../utils/vaults";

export interface ManifestEntry {
	/** quartz slug relative to the content root, e.g. "showcase/guide/index" */
	slug: string;
	/** absolute path of the markdown file */
	filePath: string;
	/** site page URL, e.g. "/showcase/guide/" */
	url: string;
}

export interface UrlManifest {
	bySlug: Map<string, ManifestEntry>;
	byBasename: Map<string, ManifestEntry[]>;
	allSlugs: string[];
}

const MARKDOWN_EXTENSIONS = new Set([".md", ".mdx"]);

// Site pages that are not backed by a content file (wikilinks/basenames may
// still target them). "about" is NOT here: it is a regular vault root note
// (src/content/about/index.md → /about/), registered through the generic path.
const SPECIAL_PAGES = new Map<string, string>([["archive", "/archive/"]]);

function walkFiles(dir: string, out: string[] = []): string[] {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (entry.name.startsWith(".")) continue;
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) walkFiles(full, out);
		else if (MARKDOWN_EXTENSIONS.has(path.extname(entry.name))) out.push(full);
	}
	return out;
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

/** Port of note-properties' getAliasSlugs */
function aliasSlugs(aliases: string[]): string[] {
	return aliases.map((alias) => {
		const mockFp =
			getFileExtension(alias as any) === ".md" ? alias : `${alias}.md`;
		return slugifyFilePath(mockFp as any);
	});
}

/** Astro's collection slug rules (getContentEntryIdAndSlug): per-segment
 * github-slugger, then trailing "/index" dropped. Segments are relative to
 * the collection dir (the first path segment of the content file). */
function astroSlugFor(relPosix: string, frontmatterSlug?: unknown): string {
	if (typeof frontmatterSlug === "string" && frontmatterSlug !== "") {
		return frontmatterSlug.replace(/\/index$/, "");
	}
	const segments = relPosix
		.split("/")
		.slice(1) // drop the vault's own directory segment
		.map((seg) => githubSlug(seg.replace(/\.[^.]+$/, "")));
	const joined = segments.join("/");
	// trailing "/index" dropped — incl. the single-segment case ("index" -> "")
	// so <VaultDir>/index.md resolves to the vault root "/<route>/"
	return joined.endsWith("/index")
		? joined.slice(0, -"/index".length)
		: joined === "index"
			? ""
			: joined;
}

function registerEntry(
	manifest: UrlManifest,
	slug: string,
	entry: ManifestEntry,
): void {
	const existing = manifest.bySlug.get(slug);
	if (!existing) manifest.bySlug.set(slug, entry);
	const segments = slug.split("/");
	const basename =
		segments[segments.length - 1] === "index" && segments.length > 1
			? segments[segments.length - 2]
			: segments[segments.length - 1];
	if (!basename) return;
	const list = manifest.byBasename.get(basename) ?? [];
	if (!list.some((e) => e.slug === slug)) list.push(entry);
	manifest.byBasename.set(basename, list);
}

export function buildUrlManifest(contentRoot: string): UrlManifest {
	const manifest: UrlManifest = {
		bySlug: new Map(),
		byBasename: new Map(),
		allSlugs: [],
	};

	const root = contentRoot.replace(/\/+$/, "");
	for (const filePath of walkFiles(contentRoot)) {
		const rel = filePath
			.slice(root.length + 1)
			.split(path.sep)
			.join("/");
		const slug = slugifyFilePath(rel as any);

		let frontmatter: Record<string, unknown> = {};
		try {
			frontmatter = matter(fs.readFileSync(filePath, "utf8")).data as Record<
				string,
				unknown
			>;
		} catch {
			// unreadable file — skip frontmatter-derived data
		}

		// every content top-level directory is a knowledge vault, rendered at
		// /<route-of-vault-dir>/… (route = github-slug of the directory name)
		const topDir = rel.split("/")[0];
		const route = vaultRouteOf(topDir);
		const vaultSlug = astroSlugFor(rel, frontmatter.slug);
		const url = `/${route}/${vaultSlug}/`.replace(/\/{2,}/g, "/"); // index.md -> "/<route>/"

		manifest.allSlugs.push(slug);
		if (url) registerEntry(manifest, slug, { slug, filePath, url });

		for (const alias of coerceToArray(
			(frontmatter.aliases ?? frontmatter.alias) as unknown,
		) ?? []) {
			manifest.allSlugs.push(alias);
			if (url) {
				const aliasSlug = aliasSlugs([alias])[0];
				registerEntry(manifest, aliasSlug, { slug: aliasSlug, filePath, url });
			}
		}
		const permalink = frontmatter.permalink;
		if (typeof permalink === "string" && permalink !== "") {
			manifest.allSlugs.push(permalink);
			if (url) {
				registerEntry(manifest, slugifyFilePath(permalink as any), {
					slug: slugifyFilePath(permalink as any),
					filePath,
					url,
				});
			}
		}
	}

	return manifest;
}

let cached: { builtAt: number; manifest: UrlManifest } | null = null;
const DEV_TTL_MS = 1000;

/** TTL-cached manifest: 1s in dev (content edits picked up), static in build. */
export function getManifest(contentRoot: string, dev = false): UrlManifest {
	if (cached && (!dev || Date.now() - cached.builtAt < DEV_TTL_MS)) {
		return cached.manifest;
	}
	const manifest = buildUrlManifest(contentRoot);
	cached = { builtAt: Date.now(), manifest };
	return manifest;
}

export interface ResolvedLink {
	href: string;
	broken: boolean;
	/** canonical content slug of the target, when resolvable (for link graph data) */
	slug: string | null;
}

const EXTERNAL_RE = /^(https?:\/\/|mailto:|tel:|data:|javascript:)/i;

/**
 * Resolve a link/image target (as produced by OFM's wikilink transform or a
 * plain markdown link) to a site page URL. Mirrors quartz's transformLink
 * semantics (shortest/basename resolution against allSlugs) but emits the
 * site's vault URLs.
 */
export function resolveHref(
	manifest: UrlManifest,
	fileSlug: string,
	dest: string,
): ResolvedLink {
	if (!dest) return { href: dest, broken: false, slug: null };
	if (EXTERNAL_RE.test(dest)) return { href: dest, broken: false, slug: null };
	if (dest.startsWith("/")) return { href: dest, broken: false, slug: null };

	const [fp, anchor] = splitAnchor(dest as any);
	if (!fp) return { href: dest, broken: false, slug: null };

	// resolve ./ ../ segments against the current file's directory
	const baseDir = fileSlug.split("/").slice(0, -1);
	const segments = decodeURI(fp)
		.split("/")
		.filter((s) => s.length > 0);
	for (const seg of segments) {
		if (seg === ".") continue;
		if (seg === "..") baseDir.pop();
		else baseDir.push(seg);
	}
	const slug = slugifyFilePath(baseDir.join("/") as any);

	// tag links (OFM emits pathToRoot(slug)/tags/<tag>)
	if (slug.startsWith("tags/")) {
		const tag = slug.slice("tags/".length);
		return {
			href: `/archive/?tag=${encodeURIComponent(tag)}`,
			broken: false,
			slug: null,
		};
	}

	// special pages not backed by a content file
	const special = SPECIAL_PAGES.get(slug);
	if (special) return { href: special + anchor, broken: false, slug: null };

	// exact → folder (x/index) → file-with-index → unique basename
	const entry =
		manifest.bySlug.get(slug) ??
		manifest.bySlug.get(`${slug}/index`) ??
		(slug.endsWith("/index")
			? manifest.bySlug.get(slug.slice(0, -"/index".length))
			: undefined);
	if (entry)
		return { href: entry.url + anchor, broken: false, slug: entry.slug };

	const segmentsOfSlug = slug.split("/");
	const basename = segmentsOfSlug[segmentsOfSlug.length - 1];
	const candidates = manifest.byBasename.get(basename);
	if (candidates && candidates.length === 1) {
		return {
			href: candidates[0].url + anchor,
			broken: false,
			slug: candidates[0].slug,
		};
	}

	return { href: dest, broken: true, slug: null };
}
