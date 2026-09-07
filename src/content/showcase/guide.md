---
title: Getting Started with Lumen
published: 2026-09-01
description: "Start here: what Lumen is, where files live, how notes, articles and the site config fit together, and the everyday commands."
image: images/demo-landscape.png
tags: ["Guide", "Getting Started", "Customization"]
category: Guides
draft: false
---

**Lumen** is a static blog-and-knowledge-base built with [Astro](https://astro.build/): vault-style knowledge notes (dated ones double as blog articles), a link graph, full-text search — everything generated from plain markdown at build time. It descends from the [fuwari](https://github.com/saicaca/fuwari) template (MIT) with a rewritten config system and a quartz-based markdown pipeline, but you don't need any of that history to use it: everything you can configure lives in one markdown file, and every page on this site is content in `src/content/`.

This note is the switchboard — the deeper topics are one wikilink away: [[writing-content]] for syntax, [[knowledge-vaults]] for how folders become sites, [[site-configuration]] for the config file, [[publishing-workflow]] for builds and deploys.

## The content map

```
src/content/
├── index.md        # site-wide config: title, theme, nav, profile… (YAML)
├── about/          # a vault whose root note is /about/ (pages are vaults too)
└── showcase/       # this vault: a tour of the project, in English
    └── <any vault you add>   # one top-level folder = one knowledge base
```

There is **one content model**: vault notes, with an open schema that keeps any Obsidian frontmatter. A note carrying a `published` date is an **article** — it gains the article header, license card, structured data and prev/next links, and appears in the homepage overview, the archive, RSS and the [[knowledge-graph]]. Undated notes stay quietly in their vault.

## Frontmatter you will actually use

```yaml
---
title: My First Article
published: 2026-09-07        # yyyy-mm-dd — dated notes become articles
description: One line for cards and meta tags.
image: images/cover.png      # cover: http(s):// URL, /public-path, or note-relative
tags: [Foo, Bar]
category: Front-end           # optional grouping (article-style header shows it)
draft: false                 # true = dev preview only, absent from builds
aliases: [alternate-name]    # optional: extra wikilink targets
---
```

Three rules of thumb: `published` decides visibility in the homepage overview and `/archive/`; `draft: true` keeps a page out of production builds entirely (no page, no archive, no search hit); `image` covers render on any note page (this note's cover is one of the local demo images).

## Everyday commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | dev server with hot reload — including config-file edits |
| `pnpm build` | static build + Pagefind search index into `dist/` |
| `pnpm check` / `pnpm type-check` | astro check / TypeScript validation |
| `pnpm new-note <vault>` | scaffold a note inside a vault |
| `mkdir src/content/<name>` | create a vault — a folder is a vault, auto-registered |
| `pnpm index-vaults` | refresh every vault hub's auto-index (runs on `predev`/`prebuild`) |

Two lifecycle facts worth remembering: a **newly created vault folder** requires a dev-server restart before its collection and routes register; everything else (new notes, edits, the config file) appears on save.

## First-day checklist

1. Set `site.title`, `site.lang` and the `profile` block in `src/content/index.md` — each option is commented in place and applies on save ([[site-configuration]]).
2. Put your real avatar at `src/assets/images/` (or use a URL) and point `profile.avatar` at it.
3. Set the deployment domain in `astro.config.mjs` (`site`), and `base` if hosting under a sub-path.
4. Write your first article: add a note (say with `pnpm new-note showcase`) and give it a `published` date — or simply open this vault in Obsidian and start typing.

Everything else is tuning: the [[knowledge-graph]] depth, banner and license in the config file, fonts and hue in the stylesheets. The demo content sitting around this vault — [[writing-content]] included — doubles as living documentation: steal the syntax, delete what you don't need.
