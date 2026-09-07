/**
 * Astro integration that wires the quartz v5 markdown pipeline into fuwari.
 *
 * Reuses the published @quartz-community transformer packages directly
 * (they need only a minimal ctx shim) and vendors the pieces that must be
 * adapted to Astro's pipeline: the textTransform stage (parser wrapper),
 * note-properties normalization (Astro strips frontmatter before unified),
 * link resolution (quartz URLs don't match the site's /<vault>/<slug>/ layout)
 * and transclusion (no render-time HAST stage exists in Astro).
 */
import { fileURLToPath } from "node:url";
import { unified } from "@astrojs/markdown-remark";
import { CreatedModifiedDate } from "@quartz-community/created-modified-date";
import { Description } from "@quartz-community/description";
import { GitHubFlavoredMarkdown } from "@quartz-community/github-flavored-markdown";
import { Latex } from "@quartz-community/latex";
import { ObsidianFlavoredMarkdown } from "@quartz-community/obsidian-flavored-markdown";
import { SyntaxHighlighting } from "@quartz-community/syntax-highlighting";
import { TableOfContentsTransformer } from "@quartz-community/table-of-contents";
import { UnlistedPages } from "@quartz-community/unlisted-pages";
import type { AstroIntegration } from "astro";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeComponents from "rehype-components";
import rehypeSlug from "rehype-slug";
import remarkDirective from "remark-directive";
import remarkSectionize from "remark-sectionize";
import { quartzConfig } from "./config.ts";
import { createQuartzCtx } from "./ctx.ts";
import { getManifest } from "./manifest.ts";
import { rehypeCodeStylerDecorate } from "./plugins/rehype-code-styler-decorate.ts";
import { rehypeCodeStylerParams } from "./plugins/rehype-code-styler-params.ts";
import { AdmonitionComponent } from "./plugins/rehype-component-admonition.mjs";
import { GithubCardComponent } from "./plugins/rehype-component-github-card.mjs";
import { rehypeCrawlLinks } from "./plugins/rehype-crawl-links.ts";
import { rehypeGuardImages } from "./plugins/rehype-guard-images.ts";
import { parseDirectiveNode } from "./plugins/remark-directive-rehype.js";
import { remarkExcerpt } from "./plugins/remark-excerpt.js";
import { remarkExposeMermaid } from "./plugins/remark-expose-mermaid.ts";
import { remarkImageConverter } from "./plugins/remark-image-converter.ts";
import { remarkImageResolver } from "./plugins/remark-image-resolver.ts";
import { remarkInlineCodeStyler } from "./plugins/remark-inline-code-styler.ts";
import { quartzTextTransform } from "./plugins/remark-quartz-text-transform.ts";
import { remarkReadingTime } from "./plugins/remark-reading-time.mjs";
import { remarkTransclude } from "./plugins/remark-transclude.ts";
import { remarkVfileInit } from "./plugins/remark-vfile-init.ts";

export default function quartzPipeline(): AstroIntegration {
	return {
		name: "quartz-pipeline",
		hooks: {
			"astro:config:setup"({ config, command, updateConfig }) {
				const contentRoot = fileURLToPath(new URL("src/content/", config.root));
				const manifest = getManifest(contentRoot, command === "dev");
				const ctx = createQuartzCtx({
					directory: contentRoot,
					allSlugs: manifest.allSlugs,
				});

				// transformer instances, mirroring quartz.config.yaml (full manifest defaults)
				const ofm = (ObsidianFlavoredMarkdown as any)(quartzConfig.ofm);
				const gfm = (GitHubFlavoredMarkdown as any)(quartzConfig.gfm);
				const syntax = (SyntaxHighlighting as any)(
					quartzConfig.syntaxHighlighting,
				);
				const createdModifiedDate = (CreatedModifiedDate as any)(
					quartzConfig.createdModifiedDate,
				);
				const toc = (TableOfContentsTransformer as any)(quartzConfig.toc);
				const description = (Description as any)(quartzConfig.description);
				const latex = (Latex as any)(quartzConfig.latex);
				const unlisted = (UnlistedPages as any)();

				const textTransformFn = (src: string) => ofm.textTransform(ctx, src);
				const vfileInitOpts = { contentRoot, ctx };
				const transcludeOpts = {
					contentRoot,
					manifest,
					getSubChain: () => subChain,
				};
				const imageResolverOpts = { contentRoot };

				// sub-chain for transclusion targets: full remark semantics minus
				// parent-only plugins (reading time / excerpt / sectionize / mermaid expose)
				// and minus the transclusion plugin itself — nested transclusions are
				// resolved by remark-transclude on clones with a shared visited set.
				// NOTE: all entries are plugin factories or [factory, options] tuples —
				// unified calls attachers with (processor, ...options) and registers
				// their return value as the transformer.
				const subChain: any[] = [
					[quartzTextTransform, textTransformFn],
					[remarkVfileInit, vfileInitOpts],
					...createdModifiedDate.markdownPlugins(ctx as any),
					...ofm.markdownPlugins(ctx as any),
					// image-converter must see OFM's converted image nodes (the
					// wiki embeds carry their token alias in hProperties.alt)
					[remarkImageConverter, quartzConfig.imageConverter],
					...gfm.markdownPlugins(ctx as any),
					...toc.markdownPlugins(ctx as any),
					...latex.markdownPlugins(ctx as any),
					remarkDirective,
					parseDirectiveNode,
					remarkInlineCodeStyler,
					[remarkImageResolver, imageResolverOpts],
				];

				const remarkChain: any[] = [
					[quartzTextTransform, textTransformFn],
					[remarkVfileInit, vfileInitOpts],
					...createdModifiedDate.markdownPlugins(ctx as any),
					remarkReadingTime,
					remarkExcerpt,
					...ofm.markdownPlugins(ctx as any),
					[remarkImageConverter, quartzConfig.imageConverter],
					...gfm.markdownPlugins(ctx as any),
					...toc.markdownPlugins(ctx as any),
					...latex.markdownPlugins(ctx as any),
					remarkDirective,
					parseDirectiveNode,
					remarkInlineCodeStyler,
					[remarkTransclude, transcludeOpts],
					[remarkImageResolver, imageResolverOpts],
					remarkExposeMermaid,
					remarkSectionize,
				];

				const rehypeChain: any[] = [
					[
						rehypeCodeStylerParams,
						{
							alternativeNames:
								quartzConfig.codeStyler.alternativeHighlightNames,
							codeRoot: quartzConfig.codeStyler.referenceCodeRoot,
							contentRoot,
							ignoredLanguages: quartzConfig.codeStyler.ignoredLanguages,
							getManifest: () => manifest,
						},
					],
					...syntax.htmlPlugins(ctx as any),
					[
						rehypeCodeStylerDecorate,
						{
							manifest,
							header: quartzConfig.codeStyler.header,
							lineNumbers: quartzConfig.codeStyler.lineNumbers,
							wrapLines: quartzConfig.codeStyler.wrapLines,
							openLinksInNewTab: quartzConfig.crawlLinks.openLinksInNewTab,
						},
					],
					...ofm.htmlPlugins(ctx as any),
					...unlisted.htmlPlugins(ctx as any),
					...description.htmlPlugins(ctx as any),
					...latex.htmlPlugins(ctx as any),
					rehypeSlug,
					[
						rehypeComponents,
						{
							components: {
								github: GithubCardComponent,
								note: (x: any, y: any) => AdmonitionComponent(x, y, "note"),
								tip: (x: any, y: any) => AdmonitionComponent(x, y, "tip"),
								important: (x: any, y: any) =>
									AdmonitionComponent(x, y, "important"),
								caution: (x: any, y: any) =>
									AdmonitionComponent(x, y, "caution"),
								warning: (x: any, y: any) =>
									AdmonitionComponent(x, y, "warning"),
							},
						},
					],
					[
						rehypeAutolinkHeadings,
						{
							behavior: "append",
							properties: {
								className: ["anchor"],
							},
							content: {
								type: "element",
								tagName: "span",
								properties: {
									className: ["anchor-icon"],
									"data-pagefind-ignore": true,
								},
								children: [{ type: "text", value: "#" }],
							},
						},
					],
				];

				// Crawl links must run LAST in the rehype chain: earlier placement
				// produced hrefs that later transformers (latex / components)
				// restored from their pre-crawl state. (code-styler anchors carry
				// data-code-link so this pass skips them.) The image guard runs
				// after it — Astro appends its own rehypeImages after our whole
				// chain, and must not see image paths that don't exist on disk.
				rehypeChain.push([
					rehypeCrawlLinks,
					{ manifest, ...quartzConfig.crawlLinks },
				]);
				rehypeChain.push([rehypeGuardImages, {}]);

				// Astro 7: the top-level markdown keys (gfm / smartypants /
				// remarkPlugins / rehypePlugins) are deprecated shims that will be
				// removed in a future major. Carry the whole quartz pipeline on the
				// processor instead — unified() accepts the same plugin arrays, and
				// its gfm/smartypants options replace the deprecated top-level keys
				// (the quartz chain provides GFM/smartypants itself, so Astro's
				// defaults must stay off to avoid double-processing).
				updateConfig({
					markdown: {
						processor: unified({
							gfm: false,
							smartypants: false,
							remarkPlugins: [
								...(config.markdown.remarkPlugins ?? []),
								...(remarkChain as any),
							],
							rehypePlugins: [
								...(config.markdown.rehypePlugins ?? []),
								...(rehypeChain as any),
							],
						}),
					},
				});

				// NOTE: the client interaction scripts (callout fold / checkbox /
				// clipboard / mermaid) are imported by Layout.astro — Astro's
				// injectScript only reaches pages with islands.
			},
		},
	};
}
