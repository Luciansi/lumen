---
title: Knowledge Graph
published: 2026-09-07
description: How notes connect — which links become edges, node identity, hub exclusion, local versus global view, and how the whole graph is built.
tags: [Guide, Graph]
---

Every wikilink, transclusion and internal markdown link is also an **edge** in the knowledge graph. The engine runs its own extraction pass over the content (same pipeline semantics as rendering) and publishes the result as `/linkgraph.json` — one entry per page, with resolved link targets and tags. The graph card on a note's right rail reads that endpoint, so what you see always matches what the pages actually link to.

## What becomes a node

A node is a **page that can be reached through content**: vault notes (dated notes double as articles) and standalone pages. Three deliberate exceptions keep the graph meaningful:

- `index.md` pages — every directory hub and the site-level config file at the content root — are excluded entirely. They never appear as nodes, and links pointing at them are dropped, so the graph shows genuine note-to-note connections instead of a star around each hub.
- `draft: true` notes have no page outside development, so the **production graph omits them** while the dev graph keeps them (their pages exist there) — the same liveness rule the pages follow.
- Tag nodes are optional pseudo-nodes, toggled by `graph.showTags` in [[site-configuration]] — handy for spotting themes that span vaults. Clicking one jumps to the archive filtered by that tag.

## Where edges come from

The extraction pass parses every note with the same remark/hast chain as rendering, then records each link that resolves to a page in the site manifest (`src/integrations/quartz-pipeline/manifest.ts`):

- Obsidian-style `[[wikilinks]]`, embeds `![[…]]` and markdown links to other notes;
- `aliases` frontmatter — a note becomes linkable under its alias names, and links written that way count as edges to the same node;
- frontmatter-declared links, when present.

`permalink` frontmatter pins a note's URL but deliberately adds no edge — those links resolve to a fixed address without a canonical note slug. Unresolvable targets are dropped (and marked `broken` on the page itself), so the graph never contains dead ends you can't navigate to.

## Reading the graph

On any note page, the right rail shows the **local graph**: the current note plus its neighborhood, found by breadth-first search and capped by `graph.localDepth` (1–3). The center note is highlighted; hovering a node focuses its neighbors, dragging moves the canvas, scrolling zooms.

Press `Ctrl`/`Cmd` + `G` (or the expand icon) for the **global graph** — every node of the site on one canvas. The same interactions apply, and clicking a node navigates to its page. Esc or clicking the backdrop closes it. Visited notes are remembered in `localStorage` and tinted differently, so you can see where you have and haven't been.

## Tuning the graph

All switches live in `src/content/index.md`:

- `graph.enable` turns the whole feature off (card and keyboard shortcut);
- `graph.localDepth` sets how many hops the local neighborhood reaches;
- `graph.showTags` adds the tag pseudo-nodes.

Layout parameters — forces, link distances, label size, colors — are carried in the graph card's `data-cfg` attribute and rendered from the site's CSS variables, a shell adapted from the quartz graph view; tinker with the `--graph-*` tokens in `src/styles/` for a different look.

## How it stays consistent

The data source is an endpoint (`src/pages/linkgraph.json.ts`) that runs its own extraction pass instead of depending on page render order — Astro builds pages concurrently, so a page-driven index would be racy. Extraction results are cached per file by mtime (1-second TTL in dev), so editing a note only re-parses that file and the neighborhood updates as you work. See [[knowledge-vaults]] for how folders become vaults, or [[quartz-features]] for the pipeline behind the pages.
