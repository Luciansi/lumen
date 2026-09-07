---
title: Knowledge Vaults
published: 2026-09-07
description: A vault is a top-level folder under src/content — it becomes a route, a nav entry, a collection and part of the graph, with zero configuration.
tags: [Guide, Vault]
---

A **vault** is simply a top-level directory under `src/content/` — like this one. Nothing needs to be registered: each vault automatically becomes

- a **content collection** with an open schema (any Obsidian frontmatter is kept),
- a **route** (`/<name>/` for the hub page, `/<name>/<note>/` for notes),
- a **navbar entry** linking to its hub, and
- a set of **nodes in the knowledge graph** (see [[knowledge-graph]]).

Nothing is reserved: any top-level directory becomes a vault. Only genuine code-driven page routes (like `archive`) can't double as a vault name. Standalone pages such as `/about/` are ordinary vault root notes (`about/index.md`).

## Anatomy of a vault

A vault usually starts with an `index.md` — the note served at `/<vault>/`. Everything between the two markers below is maintained by `pnpm index-vaults`, which lists the vault's notes so the hub stays current as you add files:

<!-- auto-index:start -->

<!-- auto-index:end -->

Prose outside the markers is yours and survives regeneration untouched.

## Working with vaults

The scaffold scripts cover the common moves:

| Command | Effect |
| --- | --- |
| `mkdir src/content/<name>` | create a vault — a folder is a vault, auto-registered |
| `pnpm new-note <vault>` | walk the note wizard inside an existing vault |
| `pnpm index-vaults` | refresh every vault hub's auto-index (runs automatically on `predev`/`prebuild`) |

Newly created **folders** need a dev-server restart to be discovered; notes inside an existing vault appear immediately. Deleting a vault directory removes its routes, nav entry and graph nodes in one move.

## A vault you can open in Obsidian

The content folders are ordinary markdown — point Obsidian at `src/content/showcase/` (or the whole `src/content/`) and the same files you browse here are your local notes. Wiki links, callouts and tags behave identically on both sides, which is what makes the site feel like an extension of your vault rather than a copy of it.

See also: [[writing-content]] for the syntax notes use, [[site-configuration]] for how nav and graph behavior is tuned, and [[publishing-workflow]] for the build pipeline.
