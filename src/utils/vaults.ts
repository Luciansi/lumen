/**
 * Knowledge-base vault discovery & naming.
 *
 * A "vault" is any top-level directory under src/content — a directory is a
 * vault, no registration and no reserved collections — and each vault renders
 * at /<route>/… where route is the github-slug of the directory name. Static
 * pages like /about/ are just vault root notes (src/content/about/index.md).
 *
 * Server-side only (fs at build/dev time). Consumed by content.config.ts
 * (collection registration), the quartz manifest (wikilink → URL resolution)
 * and the [vault]/… pages. The standalone node scripts under scripts/
 * intentionally mirror these rules (they can't import TS) — keep them in sync.
 */
import fs from "node:fs";
import path from "node:path";
import { slug as githubSlug } from "github-slugger";

/** Content root on disk — cwd is the project root under astro dev/build/sync. */
export const CONTENT_ROOT = path.join(process.cwd(), "src", "content");

/**
 * Route names that collide with real code-driven pages served from the site
 * root (a vault directory with such a name would clash at build time).
 * Everything else is free for vault directories.
 */
export const RESERVED_ROUTES = new Set(["archive"]);

export interface Vault {
	/** Directory name under src/content (collection name), original case. */
	dir: string;
	/** URL route root (first path segment of every page in this vault). */
	route: string;
}

/** URL route root of a vault directory (github-slug of the dir name). */
export function vaultRouteOf(dirName: string): string {
	return githubSlug(dirName);
}

/** Top-level directory names under the content root that are vaults. */
export function listVaultDirs(root: string = CONTENT_ROOT): string[] {
	try {
		return fs
			.readdirSync(root, { withFileTypes: true })
			.filter((d) => d.isDirectory() && !d.name.startsWith("."))
			.map((d) => d.name);
	} catch {
		return [];
	}
}

/** All vaults with their route roots, in directory order. */
export function listVaults(root: string = CONTENT_ROOT): Vault[] {
	return listVaultDirs(root).map((dir) => ({ dir, route: vaultRouteOf(dir) }));
}

/** The vault whose route root is `route`, or null when no such vault exists. */
export function findVaultByRoute(route: string): Vault | null {
	return listVaults().find((v) => v.route === route) ?? null;
}
