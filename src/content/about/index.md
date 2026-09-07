---
title: About
---

**Lumen** is a static blog-and-knowledge-base built on [Astro](https://astro.build/): markdown in, a fast static site out — with a knowledge-vault twist. Everything on this site is content: dated vault notes (articles), knowledge notes, the link graph, even the site configuration itself.
::github{repo="Luciansi/lumen"}
## What's inside

- **Articles and vaults** — a dated vault note (`published` in frontmatter) is an article; every top-level folder under `content/` is a knowledge vault with its own route, navigation entry and graph presence.
- **A link graph** — every wikilink is an edge; each note page shows its local neighborhood, and `Ctrl/Cmd+G` opens the whole site graph. Hub (`index.md`) pages stay out of the picture so only real connections show.
- **One-file configuration** — titles, theme, banner, navigation, license and profile all live in `src/content/index.md` (YAML) and apply on save.
- **A rich markdown pipeline** — GFM, Obsidian-flavored syntax (wikilinks, transclusion, callouts, highlights), KaTeX math, Mermaid diagrams, and ported code-block dialects for Code Styler and Image Converter.
- **Full-text search, offline-friendly** — a static Pagefind index, no external font or asset CDNs.

The fastest tour is the **Showcase** vault at `/showcase/` — a set of notes that double as living documentation, from [[writing-content|writing syntax]] to [[publishing-workflow|the build pipeline]].

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | Astro (static output, no server runtime) |
| Markdown | Quartz v5 community pipeline (`@quartz-community/*`) over unified/remark/rehype |
| Highlighting | Shiki, dual light/dark themes |
| Math & diagrams | KaTeX, Mermaid |
| Search | Pagefind |
| Transitions | swup (single-container page morphing) |
| UI islands | Svelte (search, theme and display settings) |

## Credits

- Template lineage: [fuwari](https://github.com/saicaca/fuwari) (MIT) — extensively customized since.
- Markdown pipeline: the [Quartz](https://quartz.jzhao.xyz/) community ecosystem — `@quartz-community` transformers (GFM, OFM, syntax highlighting, transclusion, created-modified-date, and friends).
- Code-block and image dialects ported from the Obsidian plugins [Code Styler](https://github.com/mayurankv/Obsidian-Code-Styler) and Image Converter; every port lives auditable in `src/integrations/quartz-pipeline/`.
