/**
 * Resolves image references (mainly OFM wikilink embeds like `![[Frp.webp]]`)
 * to real files, because Obsidian attachments often live in `images/`
 * subfolders and have case-sensitive names, while OFM slugifies embeds to a
 * bare lowercase basename ("frp.webp") — which Astro's asset resolver can't
 * find relative to the markdown file.
 *
 * Strategy: if the url doesn't resolve next to the markdown file, look it up
 * by lowercased basename anywhere under the content root and rewrite it to a
 * "./"-prefixed path relative to the markdown file (so Astro's
 * remarkCollectImages/rehypeImages and the transclusion rebasing both work).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Root } from "mdast";
import { visit } from "unist-util-visit";

const IMAGE_EXTENSIONS = new Set([
	".png",
	".jpg",
	".jpeg",
	".gif",
	".webp",
	".svg",
	".avif",
	".bmp",
	".jxl",
]);

function walkAllFiles(dir: string, out: string[] = []): string[] {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (entry.name.startsWith(".")) continue;
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) walkAllFiles(full, out);
		else if (IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
			out.push(full);
	}
	return out;
}

export function remarkImageResolver(opts: { contentRoot: string }) {
	const contentRoot = opts.contentRoot.replace(/\/+$/, "");
	let assets: Map<string, string> | null = null;

	function scanAssets(): Map<string, string> {
		const map = new Map<string, string>();
		for (const filePath of walkAllFiles(contentRoot)) {
			const rel = filePath
				.slice(contentRoot.length + 1)
				.split(path.sep)
				.join("/");
			map.set(path.basename(rel).toLowerCase(), rel);
		}
		return map;
	}

	return async function imageResolver(
		tree: Root,
		file: { data: any; path?: string | URL },
	): Promise<void> {
		// dev: rescan per render so newly added assets resolve immediately
		if (!assets || import.meta.env?.DEV) assets = scanAssets();

		const filePath =
			file.path instanceof URL
				? fileURLToPath(file.path)
				: String(file.path ?? "");
		const relMd = (file.data?.relativePath as string | undefined) ?? null;
		const mdDirAbs = filePath ? path.dirname(filePath) : null;
		const mdDirRel = relMd ? path.posix.dirname(relMd) : null;
		if (!mdDirAbs || !mdDirRel) return;

		visit(tree, "image", (node: any) => {
			const url: string = node.url ?? "";
			if (
				!url ||
				/^[a-zA-Z][a-zA-Z\d+\-.]*?:/.test(url) ||
				url.startsWith("/") ||
				url.startsWith("#")
			) {
				return;
			}
			const pathPart = url.split(/[?#]/, 1)[0];
			// resolves next to the markdown file → Astro handles it as-is
			if (fs.existsSync(path.resolve(mdDirAbs, pathPart))) return;

			// basename lookup anywhere under the content root
			const key = path.basename(pathPart).toLowerCase();
			const found = assets?.get(key);
			if (!found) return; // genuinely missing — let Astro report it

			// path relative to the markdown file's directory, "./"-prefixed so
			// the transclusion rebasing treats it as relative
			const rel = path.posix.relative(mdDirRel, found);
			node.url = rel.startsWith(".") ? rel : `./${rel}`;
		});
	};
}
