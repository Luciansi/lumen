---
title: Publishing Workflow
published: 2026-09-07
description: Drafts, scaffolding scripts, search indexing and static deployment — how a saved note becomes a published page.
tags: [Guide, Workflow]
---

Writing and shipping notes here follows a small, script-backed workflow.

## Writing

Notes with `draft: true` behave like blog-post drafts: visible in dev, silently absent from production builds (no page, no archive entry, no search hit). Everything else — dated or not — is immediately live at its `/<vault>/<name>/` route, and dated notes (a `published` key) also surface in the homepage overview and the archive.

Scaffolding comes in two flavors:

| Command | Use |
| --- | --- |
| `pnpm new-note <vault>` | a knowledge note inside an existing vault |
| `mkdir src/content/<name>` | a brand-new vault (directory = vault, auto-registered) |

## Building

`pnpm build` runs the Astro static build **and** the Pagefind search index (`pagefind.yml` excludes noise such as KaTeX output and panels). The pipeline is fully static:

1. vault hubs are refreshed (`prebuild` hook),
2. Astro renders every page — notes, vault hubs, `/about/`, `/linkgraph.json`, `/rss.xml`, `/sitemap-index.xml`, `/robots.txt`,
3. Pagefind indexes `dist/` for the client-side search panel.

The result is a pure-static `dist/` with no server runtime — deployable to Vercel, Netlify, Cloudflare Pages or a plain nginx folder. A sub-path install only needs `astro.config.mjs`'s `base`; internal links pick it up automatically.

## Browsing the result

Page transitions run through swup (a single morphing container), so long-form notes and the drawer-style layouts swap seamlessly. Client conveniences — theme and hue picker (stored in `localStorage`), code copy buttons, collapsible callouts, Mermaid fullscreen, the graph — reinitialize idempotently on every page change.

Put together with [[writing-content]] for the syntax, [[site-configuration]] for the switches, and [[knowledge-vaults]] for how folders become sites.
