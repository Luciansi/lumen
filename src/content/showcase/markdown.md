---
title: Markdown Basics
published: 2026-08-18
description: What plain GFM markdown looks like in Lumen — headings, emphasis, lists, links, tables, code and math, all rendered the same way in every vault note.
tags: [Markdown, Guide, Demo]
category: Examples
draft: false
---

A compact tour of the everyday markdown that renders identically in every [[knowledge-vaults|vault note]]. For the extras — wikilinks, callouts, highlights, embeds — see [[writing-content]].

## Headings, paragraphs and rules

# h1
## h2
### h3

Paragraphs are separated by a blank line. **Bold**, *italic*, ***both***, `inline code` and ~~strikethrough~~ are plain markdown. Two or three dashes become an em-dash — and a double dash (12--14) or three dots … get typographic treatment as well (smartypants).

---

## Lists

Unordered, ordered, nested — and task lists, which render as interactive checkboxes:

- first
  - nested item
  - second nested item
- last

1. First step
2. Second step
   1. sub-step
3. Done

- [ ] a task that is open
- [x] a task that is done

> Block quotes are written with a leading `>` and can span
> multiple paragraphs if you like.

## Links

Inline links, [reference-style links][ref], bare autolinks <https://astro.build>, and local links that work across the site: [the archive](/archive/).

[ref]: https://docs.astro.build

## Code

Fenced blocks carry a language for highlighting — including diff and many others:

```js
for (const day of ["Mon", "Tue"]) {
  console.log(`It is ${day}day`);
}
```

```diff
- console.log("old behavior");
+ console.log("new behavior");
```

Indented code blocks and inline code (`const x = 1`) work as usual. Blocks can get titles, line numbers, folds and highlight ranges — that syntax is the [[code-styler]] dialect, covered in its own note.

## Tables

GFM tables align columns with the header separator:

| Feature        | In Lumen | Notes            |
| -------------- | :------: | ---------------- |
| Markdown       |    ✓     | GFM-flavored     |
| Math (KaTeX)   |    ✓     | inline and display |
| Footnotes      |    ✗     | not in GFM       |

## Math

Inline math like $\omega = d\phi/dt$ and display math on its own line:

$$
\int_0^\infty e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}
$$

Aligned environments work too:

$$
\begin{aligned}
x &= 1 + 1 \\
  &= 2
\end{aligned}
$$

## Escaping

Backslash-escape any character you want shown literally: \*not emphasis\*, \`not code\`, and a literal `# not a heading` inside inline code.
