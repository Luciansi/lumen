---
title: Markdown Extended Features
published: 2026-08-20
description: "Extra markdown gadgets on top of GFM and Obsidian-flavored markdown — GitHub repository cards, directive-style admonitions and spoilers."
tags: [Demo, Example, Markdown]
category: Examples
draft: false
---

Three additions that go beyond plain GFM ([[markdown]] covers the base, [[writing-content]] covers the Obsidian-flavored layer). Everything on this page renders at build time except the GitHub card, which is fetched in the browser.

## GitHub repository cards

A dynamic card that links to a GitHub repository. The metadata (stars, forks, license, description) is pulled from the GitHub API **when the page loads in the browser**, then injected into the card below — so it appears with a short delay and needs a live connection, not a build-time one:

::github{repo="quartz-scheduler/quartz"}

The card above is this project's upstream template (MIT) — fitting, since the syntax is a single directive:

```markdown
::github{repo="quartz-scheduler/quartz"}
```

Any `<owner>/<repo>` works; cards render wherever the directive lands in a post or note.

## Admonitions (directive style)

The `:::type … :::` block form is supported alongside the Obsidian `> [!type]` callouts. These five types are guaranteed:

:::note
Highlights information that users should take into account, even when skimming.
:::

:::tip
Optional information to help a user be more successful.
:::

:::important
Crucial information necessary for users to succeed.
:::

:::warning
Critical content demanding immediate user attention due to potential risks.
:::

:::caution
Negative potential consequences of an action.
:::

Titles can be customized per block:

:::note[MY CUSTOM TITLE]
This is a note with a custom title.
:::

```markdown
:::note[MY CUSTOM TITLE]
This is a note with a custom title.
:::
```

Obsidian-style callouts — the `> [!note]` family with fold markers — are the same feature with a different spelling; see [[writing-content]] for those, and note that both spellings render identically. (GitHub's own `> [!TIP]` syntax is accepted there too.)

## Spoilers

`:spoiler[...]` hides text behind an expandable element, and the content supports full markdown:

The content :spoiler[is hidden **ayyy**]!

```markdown
The content :spoiler[is hidden **ayyy**]!
```

Use it for puzzle answers, plot twists or punchlines that readers may want to peek at deliberately.
