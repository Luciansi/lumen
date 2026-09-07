---
title: Site Configuration
published: 2026-09-07
description: One YAML file configures the whole site — titles, theme, banner, navigation, license, profile and UI copy — and saves hot.
tags: [Guide, Config]
---

Lumen concentrates **all site configuration in a single file**: `src/content/index.md`. Its frontmatter is plain YAML, every group is commented in place, and a save takes effect on the next request — no dev-server restart needed.

## What you can configure

The file is organized into groups that mirror what you see on the page:

| Group | Controls |
| --- | --- |
| `site` | browser title, subtitle, UI language |
| `themeColor` | accent hue (`0–360`) and whether visitors may pick their own |
| `banner` | the hero banner image, position and credit |
| `toc` | right-rail table of contents: on/off and depth |
| `graph` | knowledge graph: on/off, local depth, tag nodes |
| `favicon` | light/dark favicon entries (`[]` falls back to the built-ins) |
| `nav` | navbar links — presets (`home`/`archive`/`about`) that translate themselves, custom entries, and where [[knowledge-vaults|vault links]] are inserted |
| `license` | the license card shown under articles (dated notes) |
| `profile` | name, tagline, avatar and social links for the hero card |
| `ui` | optional UI copy overrides (defaults follow the language) |

Two further lists live in the **body** of the same file rather than YAML: the `# Recommended` section that feeds the recommendation card, and the `# Posts Overview` ordering list — each line a plain `- [Title](/route/)` entry.

## Saving is applying

Because the config file is re-read per request (and cached by content), editing `index.md` while the dev server runs updates titles, the banner, `lang`, nav links and everything else without a restart. Try it: change `site.title`, save, and refresh.

The same file doubles as the language switch: `site.lang` drives every server-rendered label (the navbar presets, archive text, hero statistics), with `zh_CN`/`zh_TW` getting Chinese defaults and other languages English ones — customize any string under the optional `ui:` block.

## What stays in code

Two deliberately code-side areas remain: the markdown pipeline settings in `src/integrations/quartz-pipeline/config.ts` and `astro.config.mjs` (`site` URL, integrations, `base` for sub-path deploys). Changing those still requires a restart.

Interested in how the notes themselves become pages and nav entries? See [[knowledge-vaults]], or [[knowledge-graph]] for what happens to all those links.
