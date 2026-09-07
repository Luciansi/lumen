/**
 * Remark-stage transclusion for OFM embeds (`![[note]]`, `![[note#Heading]]`,
 * `![[note#^block]]`). Ported from quartz's renderTranscludes
 * (quartz/components/renderPage.tsx) — quartz resolves transclusions at the
 * HAST stage; Astro's injected pipeline has no render-time HAST step, so the
 * same semantics run on mdast after OFM has emitted the transclude stubs.
 *
 * Target files are processed through the shared remark sub-chain (OFM, GFM,
 * math, directives) and the resulting base trees are cached (mtime-keyed).
 * Transclusion resolution itself happens on clones of those base trees, so a
 * SINGLE `visited` set guards cycles across the whole render — including
 * nested embeds and circular references.
 */
import fs from "node:fs";
import { joinSegments, resolveRelative } from "@quartz-community/utils";
import { slug as githubSlug } from "github-slugger";
import matter from "gray-matter";
import type { Root } from "mdast";
import { toString as mdastToString } from "mdast-util-to-string";
import remarkParse from "remark-parse";
import type { PluggableList } from "unified";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { VFile } from "vfile";
import type { UrlManifest } from "../manifest.ts";
import { normalizeFrontmatter } from "./remark-vfile-init.ts";

const BLOCK_ID_RE = /\^([^\s^]+)$/;
const TRANSCLUDE_RE =
	/<blockquote class="transclude" data-url="([^"]*)" data-block="([^"]*)"[^>]*><a href="([^"]*)" class="transclude-inner">([^<]*)<\/a><\/blockquote>/;

interface BaseTreeEntry {
	mtimeMs: number;
	mdast: Root;
	frontmatter: Record<string, unknown>;
	hasMermaidDiagram: boolean;
}

/** Resolve a transclusion target slug to a content file via the manifest. */
function resolveTarget(
	manifest: UrlManifest,
	target: string,
): { slug: string; filePath: string } | null {
	let entry =
		manifest.bySlug.get(target) ?? manifest.bySlug.get(`${target}/index`);
	if (!entry && target.endsWith("/index")) {
		entry = manifest.bySlug.get(target.slice(0, -"/index".length));
	}
	if (!entry) {
		// dot-extension strip fallback (foo.en → foo), per renderTranscludes
		const dotIdx = target.lastIndexOf(".");
		const slashIdx = target.lastIndexOf("/");
		if (dotIdx > slashIdx + 1) {
			entry = manifest.bySlug.get(target.slice(0, dotIdx));
		}
	}
	if (!entry) {
		const basename = target.split("/").at(-1) ?? target;
		const candidates = manifest.byBasename.get(basename);
		if (candidates && candidates.length === 1) entry = candidates[0];
	}
	return entry ? { slug: entry.slug, filePath: entry.filePath } : null;
}

/** Rebase relative link/image URLs from the target's context to the parent's. */
function rebaseRelativeUrls(
	node: any,
	parentSlug: string,
	targetSlug: string,
): void {
	visit(node, (n: any) => {
		if (
			(n.type === "link" || n.type === "image") &&
			typeof n.url === "string"
		) {
			const url = n.url;
			if (
				!url.startsWith(".") ||
				url.startsWith("/") ||
				/^[a-zA-Z][a-zA-Z\d+\-.]*?:/.test(url)
			) {
				return;
			}
			const [pathPart, anchor] = url.split("#", 2);
			const rebased = joinSegments(
				(resolveRelative as any)(parentSlug, targetSlug),
				"..",
				pathPart,
			);
			n.url = rebased + (anchor !== undefined ? `#${anchor}` : "");
		}
	});
}

/** Find the mdast node a `^block-id` refers to (port of rehype-obsidian
 * blockReferences; recurses because listItems and blockquote paragraphs are
 * nested in mdast, unlike the flat HAST element walk in quartz). */
function findBlockNode(root: Root, blockId: string): any | null {
	const walk = (parent: any): any | null => {
		const children: any[] = parent.children ?? [];
		for (let i = 0; i < children.length; i++) {
			const node: any = children[i];
			if (node.type === "blockquote") {
				// the marker lives in the immediately following paragraph
				const next = children[i + 1];
				if (next?.type === "paragraph") {
					const firstText = next.children.find((c: any) => c.type === "text");
					if (firstText) {
						const m = firstText.value.match(BLOCK_ID_RE);
						if (m && m[1].toLowerCase() === blockId) return node;
					}
				}
			} else if (node.type === "paragraph" || node.type === "listItem") {
				const m = mdastToString(node).match(BLOCK_ID_RE);
				if (m && m[1].toLowerCase() === blockId) {
					const text = mdastToString(node);
					const remainder = text.slice(0, m.index).trim();
					if (!remainder) {
						// id attaches to the nearest previous element sibling
						for (let j = i - 1; j >= 0; j--) {
							if (children[j].type !== "text") return children[j];
						}
						return null;
					}
					return node;
				}
			}
			// recurse into containers (lists, blockquotes, sections, listItems)
			if (node && "children" in node) {
				const found = walk(node);
				if (found) return found;
			}
		}
		return null;
	};
	return walk(root);
}

/** Strip the trailing ` ^id` marker from the last text node of a node copy. */
function stripBlockMarker(node: any): void {
	let lastText: any = null;
	visit(node, (n: any) => {
		if (n.type === "text") lastText = n;
	});
	if (lastText) {
		lastText.value = lastText.value.replace(/\s*\^[^\s^]+\s*$/, "");
	}
}

export function remarkTransclude(opts: {
	contentRoot: string;
	manifest: UrlManifest;
	getSubChain: () => PluggableList;
}) {
	const { manifest, getSubChain } = opts;
	const baseCache = new Map<string, BaseTreeEntry>();
	// Report each circular pair only once per process: the shared visited set
	// also flags sibling embeds of an already-expanded target, so one page can
	// otherwise repeat the same warning several times per render.
	const reportedCycles = new Set<string>();
	let subProcessor: any = null;

	function getSubProcessor(): any {
		if (!subProcessor) {
			// NOTE: the sub-chain must NOT contain the transclusion plugin itself —
			// nested resolution happens on clones with a shared visited set below.
			subProcessor = unified().use(remarkParse).use(getSubChain());
		}
		return subProcessor;
	}

	async function loadBaseTree(filePath: string): Promise<BaseTreeEntry | null> {
		let stat: fs.Stats;
		try {
			stat = fs.statSync(filePath);
		} catch {
			return null;
		}
		const cached = baseCache.get(filePath);
		if (cached && cached.mtimeMs === stat.mtimeMs) return cached;
		const raw = fs.readFileSync(filePath, "utf8");
		const parsed = matter(raw);
		const body = parsed.content ?? "";
		const frontmatter = normalizeFrontmatter(
			(parsed.data ?? {}) as Record<string, unknown>,
			filePath,
		);
		const subFile = new VFile({ path: filePath, value: body });
		const subProcessor = getSubProcessor();
		const mdast = (await subProcessor.run(
			subProcessor.parse(subFile),
			subFile,
		)) as Root;
		const entry: BaseTreeEntry = {
			mtimeMs: stat.mtimeMs,
			mdast,
			frontmatter,
			hasMermaidDiagram: subFile.data.hasMermaidDiagram === true,
		};
		baseCache.set(filePath, entry);
		return entry;
	}

	/** Resolve transclusion stubs in `tree`; `visited` is shared across nesting. */
	async function resolveIn(
		tree: Root,
		fileData: { data: any },
		visited: Set<string>,
	): Promise<void> {
		const parentSlug: string = fileData.data.slug;
		const walk = async (node: any): Promise<void> => {
			const children: any[] = node.children ?? [];
			for (let i = 0; i < children.length; i++) {
				const child = children[i];
				if (child?.type === "html") {
					const m = child.value.match(TRANSCLUDE_RE);
					if (m && (child.data?.hProperties?.transclude === true || m[1])) {
						const [, dataUrl, dataBlock, innerHref] = m;
						const resolved = resolveTarget(manifest, dataUrl);
						if (!resolved) continue; // unresolved — leave the stub
						const targetSlug = resolved.slug;
						if (visited.has(targetSlug)) {
							const cycle = `${parentSlug} -> ${targetSlug}`;
							if (!reportedCycles.has(cycle)) {
								reportedCycles.add(cycle);
								console.warn(
									`Warning: Skipping circular transclusion: ${cycle}`,
								);
							}
							children[i] = {
								type: "paragraph",
								data: { hProperties: { style: "color: var(--primary);" } },
								children: [
									{
										type: "text",
										value: `Circular transclusion detected: ${targetSlug}`,
									},
								],
							};
							continue;
						}
						visited.add(targetSlug);
						const target = await loadBaseTree(resolved.filePath);
						if (target) {
							// resolve nested transclusions inside a clone of the base tree
							const resolvedTree: Root = structuredClone(target.mdast);
							await resolveIn(
								resolvedTree,
								{ data: { slug: targetSlug } },
								visited,
							);
							const srcLink = (): any => ({
								type: "link",
								url: innerHref,
								data: {
									hProperties: {
										className: ["internal", "internal-link", "transclude-src"],
									},
								},
								children: [{ type: "text", value: "Link to original" }],
							});
							let replacement: any[] | null = null;

							if (dataBlock.startsWith("#^")) {
								// block transclude
								const blockId = dataBlock.slice("#^".length);
								const blockNode = findBlockNode(
									resolvedTree,
									blockId.toLowerCase(),
								);
								if (blockNode) {
									const clone: any = structuredClone(blockNode);
									stripBlockMarker(clone);
									replacement =
										clone.type === "listItem"
											? [{ type: "list", ordered: false, children: [clone] }]
											: [clone];
								}
							} else if (dataBlock.startsWith("#")) {
								// heading transclude: heading → following siblings until same/higher depth
								const ref = dataBlock.slice(1);
								const targetChildren = resolvedTree.children;
								let startIdx = -1;
								let startDepth = -1;
								let endIdx = targetChildren.length;
								for (let j = 0; j < targetChildren.length; j++) {
									const c: any = targetChildren[j];
									if (c.type !== "heading") continue;
									if (startIdx === -1) {
										if (githubSlug(mdastToString(c)) === ref) {
											startIdx = j;
											startDepth = c.depth;
										}
									} else if (c.depth <= startDepth) {
										endIdx = j;
										break;
									}
								}
								if (startIdx !== -1) {
									replacement = structuredClone(
										targetChildren.slice(startIdx, endIdx),
									);
								}
							} else {
								// full-page transclude
								replacement = [
									{
										type: "heading",
										depth: 1,
										children: [
											{
												type: "text",
												value: String(target.frontmatter.title ?? targetSlug),
											},
										],
									},
									...structuredClone(resolvedTree.children),
								];
							}

							if (replacement) {
								for (const n of replacement) {
									rebaseRelativeUrls(n, parentSlug, targetSlug);
								}
								replacement.push(srcLink());
								children.splice(i, 1, ...replacement);
								if (target.hasMermaidDiagram) {
									fileData.data.hasMermaidDiagram = true;
								}
								i += replacement.length - 1;
							}
						}
						visited.delete(targetSlug);
					}
				} else if (child && "children" in child) {
					await walk(child);
				}
			}
		};
		await walk(tree);
	}

	return async function transclude(
		tree: Root,
		file: { data: any },
	): Promise<void> {
		const visited = new Set<string>([file.data.slug]);
		await resolveIn(tree, file, visited);
	};
}
