/**
 * Guards local images that don't exist on disk. Runs at the END of the
 * rehype chain — before Astro appends its own rehypeImages, which turns every
 * collected `localImagePaths` entry into a `__ASTRO_IMAGE_` element and then
 * fails the build with "Could not find requested image … Does it exist?" when
 * the file is missing (e.g. an Obsidian embed `![[数据.webp]]` whose asset was
 * never copied into the repo).
 *
 * Any relative <img> src that does not resolve to a real file next to the
 * markdown file is dropped from the collected list, so Astro leaves that tag
 * untouched (a plain, possibly broken, <img> with its alt) instead of
 * crashing the page. src is preserved — copying the asset into the repo later
 * makes the image work again without touching the note.
 */
import fs from "node:fs";
import path from "node:path";
import type { Root } from "hast";

export function rehypeGuardImages() {
	return function guardImages(
		_tree: Root,
		file: { data: Record<string, unknown> },
	): void {
		const astro = file.data.astro as
			| { localImagePaths?: string[]; remoteImagePaths?: string[] }
			| undefined;
		if (!astro?.localImagePaths || astro.localImagePaths.length === 0) return;
		const filePath =
			typeof file.data.filePath === "string"
				? (file.data.filePath as string)
				: undefined;
		if (!filePath) return;
		const dir = path.dirname(filePath);

		const missing = new Set<string>();
		for (const entry of astro.localImagePaths) {
			const clean = entry.split("#")[0].split("?")[0];
			if (!clean) continue;
			if (!fs.existsSync(path.resolve(dir, decodeURI(clean))))
				missing.add(entry);
		}
		if (missing.size === 0) return;
		astro.localImagePaths = astro.localImagePaths.filter(
			(entry) => !missing.has(entry),
		);
	};
}
