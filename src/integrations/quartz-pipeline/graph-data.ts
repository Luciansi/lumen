/**
 * Whole-site link-graph data for the Graph View (every knowledge vault).
 *
 * Endpoint-only data source (src/pages/linkgraph.json.ts): it must NOT depend
 * on page render order (Astro builds pages concurrently), so it runs its own
 * extraction pass over the content files with the same plugin semantics as
 * the page pipeline — reusing the identical transformer factories /
 * quartzConfig / manifest — and captures the same `file.data.links` that
 * rehype-crawl-links records during page rendering.
 *
 * Node identity: canonical id = page URL with slashes trimmed, e.g.
 * "/a/concept/vpn/" -> "a/concept/vpn" (URLs are lowercase, github-slugger
 * per segment). The crawl records manifest slugs via simplifySlug
 * (case-preserving, "/index" -> trailing "/"); every slug form is mapped onto
 * the canonical id so resolved links land on the node set.
 *
 * index.md pages (directory hubs and the site-level config file) are excluded
 * from the node set entirely — never rendered in the Graph View, and links
 * targeting them are dropped (see the `excluded` set in buildGraphData).
 */
import fs from "node:fs";
import path from "node:path";
import { CreatedModifiedDate } from "@quartz-community/created-modified-date";
import { GitHubFlavoredMarkdown } from "@quartz-community/github-flavored-markdown";
import { Latex } from "@quartz-community/latex";
import { ObsidianFlavoredMarkdown } from "@quartz-community/obsidian-flavored-markdown";
import { TableOfContentsTransformer } from "@quartz-community/table-of-contents";
import { simplifySlug } from "@quartz-community/utils";
import remarkDirective from "remark-directive";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { VFile } from "vfile";
import { quartzConfig } from "./config.ts";
import { createQuartzCtx, type QuartzCtx } from "./ctx.ts";
import { getManifest, type UrlManifest } from "./manifest.ts";
import { rehypeCrawlLinks } from "./plugins/rehype-crawl-links.ts";
import { parseDirectiveNode } from "./plugins/remark-directive-rehype.js";
import { quartzTextTransform } from "./plugins/remark-quartz-text-transform.ts";
import { remarkTransclude } from "./plugins/remark-transclude.ts";
import { remarkVfileInit } from "./plugins/remark-vfile-init.ts";

export interface GraphEntry {
	/** site page URL, e.g. "/vault-name/concept/vpn/" */
	url: string;
	/** display title (normalized frontmatter title, filename fallback) */
	title: string;
	/** canonical ids of internal-link targets present in the node set */
	links: string[];
	/** normalized (slugified) tags from frontmatter */
	tags: string[];
}
export type GraphJson = Record<string, GraphEntry>;

/** canonical id: "/vault-name/concept/vpn/" -> "vault-name/concept/vpn" */
function canonicalOf(url: string): string {
	return url.replace(/^\/+|\/+$/g, "");
}

const contentRoot = (): string => path.join(process.cwd(), "src", "content");

// ---- extraction pass ----

interface Shared {
	ctx: QuartzCtx;
	manifest: UrlManifest;
	/** filePath -> { canonical id, page url } (nodes = files with a page URL) */
	byFilePath: Map<string, { canon: string; url: string }>;
	/** slug variants (raw manifest slug + simplifySlug forms) -> canonical */
	bySlugKey: Map<string, string>;
}

function makeChain(shared: Shared) {
	const { ctx, manifest } = shared;
	// mirror src/integrations/quartz-pipeline/index.ts instance construction
	const ofm = (ObsidianFlavoredMarkdown as any)(quartzConfig.ofm);
	const gfm = (GitHubFlavoredMarkdown as any)(quartzConfig.gfm);
	const latex = (Latex as any)(quartzConfig.latex);
	const createdModifiedDate = (CreatedModifiedDate as any)(
		quartzConfig.createdModifiedDate,
	);
	const toc = (TableOfContentsTransformer as any)(quartzConfig.toc);

	const textTransformFn = (src: string) => ofm.textTransform(ctx, src);
	const root = contentRoot();
	const vfileInitOpts = { contentRoot: root, ctx };

	// "full remark semantics minus parent-only plugins", mirroring index.ts's
	// subChain — transclusion targets are parsed with this chain; the
	// top-level chain below additionally attaches remarkTransclude and the
	// hast side (remarkRehype + OFM html plugins + crawl-links).
	const subChain: any[] = [
		[quartzTextTransform, textTransformFn],
		[remarkVfileInit, vfileInitOpts],
		...createdModifiedDate.markdownPlugins(ctx as any),
		...ofm.markdownPlugins(ctx as any),
		...gfm.markdownPlugins(ctx as any),
		...toc.markdownPlugins(ctx as any),
		...latex.markdownPlugins(ctx as any),
		remarkDirective,
		parseDirectiveNode,
	];
	const transcludeOpts = {
		contentRoot: root,
		manifest,
		getSubChain: () => subChain,
	};

	// unified's .use() takes (factory, options) — tuple entries must be
	// spread into separate args (Astro unwraps them the same way)
	const p = unified();
	const entries: any[] = [
		remarkParse,
		[quartzTextTransform, textTransformFn],
		[remarkVfileInit, vfileInitOpts],
		...createdModifiedDate.markdownPlugins(ctx as any),
		...ofm.markdownPlugins(ctx as any),
		...gfm.markdownPlugins(ctx as any),
		...toc.markdownPlugins(ctx as any),
		...latex.markdownPlugins(ctx as any),
		remarkDirective,
		parseDirectiveNode,
		[remarkTransclude, transcludeOpts],
		// hast side: raw html (callout blocks etc.) must be rehype-parsed
		// before crawl-links can see the anchors inside
		[remarkRehype, { allowDangerousHtml: true } as any],
		...ofm.htmlPlugins(ctx as any),
		[rehypeCrawlLinks, { manifest, ...quartzConfig.crawlLinks } as any],
	];
	for (const entry of entries) {
		p.use(...(Array.isArray(entry) ? entry : [entry]));
	}
	return p;
}

// per-file results cached by mtime: dev rebuilds re-extract only changed files
interface CachedFile {
	mtimeMs: number;
	links: string[];
	title: string;
	tags: string[];
	draft: boolean;
}
const fileCache = new Map<string, CachedFile>();

function titleFallback(filePath: string): string {
	// (index.md nodes are excluded from the graph — see `excluded` above)
	return path.basename(filePath, ".md");
}

async function extractFile(
	processor: ReturnType<typeof makeChain>,
	filePath: string,
): Promise<CachedFile | null> {
	const stat = fs.statSync(filePath);
	const cached = fileCache.get(filePath);
	if (cached && cached.mtimeMs === stat.mtimeMs) return cached;

	const file = new VFile({
		path: filePath,
		value: fs.readFileSync(filePath, "utf8"),
	});
	let tree: any = null;
	try {
		tree = processor.parse(file);
		await processor.run(tree, file);
	} catch (err) {
		console.warn(`[graph-data] extraction failed for ${filePath}:`, err);
		return null;
	}

	const data = (file as any).data ?? {};
	const links = Array.isArray(data.links) ? (data.links as string[]) : [];
	const tags = Array.isArray(data.frontmatter?.tags)
		? data.frontmatter.tags
		: [];
	const result: CachedFile = {
		mtimeMs: stat.mtimeMs,
		links: links.slice(),
		title: data.frontmatter?.title ?? "",
		tags: tags.slice(),
		draft: data.frontmatter?.draft === true,
	};
	fileCache.set(filePath, result);
	return result;
}

// ---- public API ----

let cached: { builtAt: number; json: GraphJson } | null = null;
const DEV_TTL_MS = 1000;

/**
 * Build the whole-site graph JSON: { canonicalId -> { url, title, links, tags } }.
 * Dev: manifest scanned with its own 1s TTL; per-file extractions cached by
 * mtime, so only changed notes are re-parsed. Build: computed once.
 */
export async function buildGraphData(dev: boolean): Promise<GraphJson> {
	if (cached && (!dev || Date.now() - cached.builtAt < DEV_TTL_MS)) {
		return cached.json;
	}

	const root = contentRoot();
	if (!fs.existsSync(root)) {
		console.warn("[graph-data] content root not found:", root);
		return {};
	}

	const manifest = getManifest(root, dev);

	const byFilePath = new Map<string, { canon: string; url: string }>();
	const bySlugKey = new Map<string, string>();
	for (const { slug, url, filePath } of manifest.bySlug.values()) {
		const canon = canonicalOf(url);
		byFilePath.set(filePath, { canon, url });
		// register every slug form crawl-links may emit (raw slug, simplified
		// form — incl. trailing "/" for /index targets) plus slash-trimmed
		// variants so lookups are robust
		for (const form of new Set([
			slug,
			simplifySlug(slug as any),
			slug.replace(/\/+$/, ""),
		])) {
			if (form) bySlugKey.set(form, canon);
		}
	}

	const shared: Shared = {
		ctx: createQuartzCtx({ directory: root, allSlugs: manifest.allSlugs }),
		manifest,
		byFilePath,
		bySlugKey,
	};
	const processor = makeChain(shared);

	// All index.md pages (a directory's hub, and the site-level config file at
	// the content root, which manifests to a phantom page) stay OUT of the
	// graph entirely — they never become nodes, and links pointing at them are
	// dropped, so no dangling edges remain.
	const excluded = new Set<string>();
	for (const [filePath, { canon }] of byFilePath) {
		if (path.basename(filePath) === "index.md") excluded.add(canon);
	}

	const json: GraphJson = {};
	const files = [...byFilePath.keys()]
		.filter((fp) => fp.endsWith(".md"))
		.sort();
	for (const filePath of files) {
		const fileInfo = byFilePath.get(filePath);
		if (!fileInfo) continue;
		const { canon, url } = fileInfo;
		if (excluded.has(canon)) continue;
		const extracted = await extractFile(processor, filePath);
		if (!extracted) continue;
		// drafts have no page outside dev — keep them out of the built graph,
		// mirroring page rendering (dev keeps them: the pages exist there)
		if (!dev && extracted.draft) continue;

		const links = [
			...new Set(
				extracted.links
					.map((l) => bySlugKey.get(l))
					.filter(Boolean) as string[],
			),
		]
			.filter((l) => l !== canon && !excluded.has(l))
			.sort();
		json[canon] = {
			url,
			title: extracted.title || titleFallback(filePath),
			links,
			tags: extracted.tags,
		};
	}

	cached = { builtAt: Date.now(), json };
	return json;
}
