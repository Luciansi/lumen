---
title: Draft Example
published: 2026-08-26
description: "What draft: true does — visible while you work, absent from production builds, listings and search."
tags: [Guide, Demo, Draft]
category: Examples
draft: true
---

# This note is a draft

This note is a live demonstration of the `draft: true` frontmatter flag. You can read it right now because the dev server shows drafts — that is exactly what drafts are for.

## What `draft: true` actually does

| Context | Behavior |
| --- | --- |
| `pnpm dev` | **Visible** — you see drafts so you can review them in place |
| `pnpm build` (production) | **Absent** — no page is generated, and the note leaves the homepage overview and `/archive/` |
| Search (Pagefind) | Indexed only from the built output, so a draft is not searchable in production |

Any post **or** [[knowledge-vaults|vault note]] can carry the flag — the semantics are identical for both.

## Publishing the draft

Flip the flag to `false` (or delete the line) when it is ready:

```markdown
---
title: Draft Example
published: 2026-08-26
tags: [Guide, Demo, Draft]
category: Examples
draft: false
---
```

The `published` date uses `yyyy-mm-dd`; once the draft flag is off, that date decides where the note lands in the homepage overview and archive. For the rest of the release flow — scaffolding, builds and deployment — see [[publishing-workflow]].
