import sitemap from "@astrojs/sitemap";
import svelte from "@astrojs/svelte";
import swup from "@swup/astro";
import tailwindcss from "@tailwindcss/vite";
import icon from "astro-icon";
import { defineConfig } from "astro/config";
import quartzPipeline from "./src/integrations/quartz-pipeline/index.ts";

// https://astro.build/config
export default defineConfig({
	// 部署前替换为正式域名(canonical / RSS / sitemap 均以此为基准)
	site: "http://localhost:4321/",
	base: "/",
	trailingSlash: "always",
	integrations: [
		swup({
			theme: false,
			animationClass: "transition-swup-", // see https://swup.js.org/options/#animationselector
			// the default value `transition-` cause transition delay
			// when the Tailwind class `transition-all` is used
			// single container covering every layout variant (grid sidebar vs.
			// knowledge-note drawer + rail), so navigation morphs it wholesale
			containers: ["#swup-root"],
			smoothScrolling: true,
			cache: true,
			preload: true,
			accessibility: true,
			updateHead: true,
			updateBodyClass: false,
			globalInstance: true,
		}),
		icon({
			include: {
				"fa6-brands": ["*"],
				"fa6-regular": ["*"],
				"fa6-solid": ["*"],
			},
		}),
		// quartz markdown pipeline (OFM, callouts, wikilinks, transclusion,
		// dual-theme Shiki, crawl-links, katex, ...)
		quartzPipeline(),
		svelte(),
		sitemap(),
	],
	markdown: {
		// Astro 7's default pipeline is the Rust Sätteri processor; the quartz
		// chain (20+ unified plugins) needs the classic unified processor. The
		// full processor — plugin chains included — is assembled by the
		// quartz-pipeline integration (config:setup), where contentRoot and the
		// per-vault manifest are already known. Only non-deprecated top-level
		// switches live here: Astro's built-in shiki would pre-empt the code
		// styler (rehype-pretty-code), so it stays off.
		syntaxHighlight: false,
	},
	// keep the pre-v7 HTML minification semantics (default 'jsx' would drop
	// whitespace between inline elements, affecting CJK text)
	compressHTML: true,
	vite: {
		plugins: [tailwindcss()],
		build: {
			rollupOptions: {
				onwarn(warning, warn) {
					// temporarily suppress this warning
					if (
						warning.message.includes("is dynamically imported by") &&
						warning.message.includes("but also statically imported by")
					) {
						return;
					}
					warn(warning);
				},
			},
		},
	},
});
