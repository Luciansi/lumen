/**
 * Quartz pipeline configuration for fuwari.
 * Mirrors the transformer options from quartz.config.yaml (quartz v5),
 * including the manifest-level defaults that quartz's config loader would merge.
 */
export const quartzConfig = {
	// @quartz-community/created-modified-date
	createdModifiedDate: {
		priority: ["frontmatter", "git", "filesystem"] as const,
		defaultDateType: "modified" as const,
	},
	// @quartz-community/syntax-highlighting
	syntaxHighlighting: {
		theme: { light: "github-light", dark: "github-dark" },
		keepBackground: false,
		clipboard: true,
		tokenClassification: true,
	},
	// @quartz-community/obsidian-flavored-markdown (manifest defaults + user overrides)
	ofm: {
		comments: true,
		highlight: true,
		wikilinks: true,
		callouts: true,
		mermaid: true,
		parseTags: true,
		parseBlockReferences: true,
		enableInHtmlEmbed: false,
		enableYouTubeEmbed: true,
		enableTweetEmbed: true,
		enableVideoEmbed: true,
		enableCheckbox: true,
		enableObsidianUri: true,
	},
	// @quartz-community/github-flavored-markdown
	gfm: {
		enableSmartyPants: true,
		linkHeadings: true,
	},
	// @quartz-community/table-of-contents
	toc: {
		maxDepth: 3,
		minEntries: 1,
		showByDefault: true,
		collapseByDefault: false,
	},
	// vendored rehype-crawl-links
	crawlLinks: {
		markdownLinkResolution: "shortest" as const,
		prettyLinks: true,
		openLinksInNewTab: true,
		lazyLoad: true,
		externalLinkIcon: true,
		detectBrokenLinks: true,
	},
	// @quartz-community/description
	description: {
		descriptionLength: 150,
		maxDescriptionLength: 300,
		replaceExternalLinks: true,
	},
	// @quartz-community/latex
	latex: {
		renderEngine: "katex" as const,
		customMacros: {},
	},
	// code-styler port (mirrors the plugin's theme defaults where sensible)
	codeStyler: {
		header: {
			// "none" | "ifHeader" | "always" — always = Code-Styler header shown
			// on every decorated block (language tag + icon), header click folds
			showLanguageTag: "always",
			showLanguageIcon: "always",
		},
		// CS-dialect blocks show line numbers by default (plugin default theme)
		lineNumbers: true,
		// CS-dialect blocks soft-wrap by default
		wrapLines: true,
		// wildcard language patterns that are never decorated, e.g. ["ad-*"]
		ignoredLanguages: [] as string[],
		// names recognized as alternative line highlights (each needs a
		// --cs-hl-<name> pair in variables.styl / code-styler.css to be colored)
		alternativeHighlightNames: ["alt", "ins", "del", "warn", "err"] as string[],
		// absolute root for `@/` reference paths (default: repo root)
		referenceCodeRoot: process.cwd(),
	},
	// obsidian-image-converter port (mirrors the plugin's embed-token grammar)
	imageConverter: {
		// bangless `[text](img.webp)` links whose destination is a raster image
		// and whose text carries converter tokens/size render as images too
		convertImageLinks: true,
	},
};
