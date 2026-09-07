---
title: Embedding Video
published: 2026-08-24
description: How to embed YouTube and Bilibili videos in notes — paste the platform iframe, or reference an existing one with an Obsidian-style embed.
tags: [Example, Video, Guide]
category: Examples
draft: false
---

Video embeds are plain HTML: copy the share/embed code from the platform and paste it straight into the markdown — it works identically in any [[knowledge-vaults|vault note]] because the pipeline keeps raw HTML.

## YouTube

The share dialog's embed code pastes directly:

<iframe width="560" height="315" src="https://www.youtube.com/embed/8jypK2U1AM0?si=bW--3ofUe_HI30U9" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>

In the source it looks like this:

```html
<iframe width="560" height="315" src="https://www.youtube.com/embed/8jypK2U1AM0?si=bW--3ofUe_HI30U9" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
```

## Bilibili

The same trick works for Bilibili's player page:

<iframe width="100%" height="468" src="//player.bilibili.com/player.html?isOutside=true&aid=115265949932260&bvid=BV1p1n8zdEAk&cid=32626182742&p=1" scrolling="no" border="0" frameborder="no" framespacing="0" allowfullscreen="true"></iframe>

```html
<iframe width="100%" height="468" src="//player.bilibili.com/player.html?isOutside=true&aid=115265949932260&bvid=BV1p1n8zdEAk&cid=32626182742&p=1" scrolling="no" border="0" frameborder="no" framespacing="0" allowfullscreen="true"></iframe>
```

Two practical notes: the `width="100%"` keeps players responsive on every screen, and the embed sits in a normal markdown flow — it scrolls with the page and plays inline without any client JavaScript of its own. For pulling *other notes and images* into a page — the embed side of the pipeline — see [[writing-content]].
