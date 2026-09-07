import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";
import { listVaultDirs } from "./utils/vaults";

// Obsidian vault content: schema stays wide open (notes carry arbitrary
// frontmatter — including the "article" keys `published`/`draft`/`tags`/
// `category`; quartz keys like
// aliases/permalink/cssclasses/created/modified pass through untouched). The
// glob loader's default generateId replicates the legacy per-segment slug
// (lowercased, extension and trailing /index dropped), so ids keep matching
// the /<vault-route>/<slug>/ routes.
function vaultCollection(dir: string) {
	return defineCollection({
		loader: glob({ pattern: "**/*.md", base: `./src/content/${dir}` }),
		schema: z.looseObject({}),
	});
}

// One collection per vault directory that exists on disk — a directory is a
// vault (static "pages" like /about/ are just vault root notes, e.g.
// src/content/about/index.md). Registering only existing directories keeps
// astro sync/build happy when a vault hasn't been created yet — make a
// directory under src/content (that alone creates the vault) and restart the
// dev server to pick up a brand-new vault.
const vaultCollections = Object.fromEntries(
	listVaultDirs().map((dir) => [dir, vaultCollection(dir)]),
);

export const collections = {
	...vaultCollections,
};
