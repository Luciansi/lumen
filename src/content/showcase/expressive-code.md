---
title: Expressive Code in Lumen
published: 2026-08-22
description: Which Expressive Code ideas apply in Lumen's code blocks, and how to get the equivalent effect — titles, markers, collapse and line numbers map onto the code-styler dialect.
tags: [Markdown, Guide, Demo]
category: Examples
draft: false
---

[Expressive Code](https://expressive-code.com/) is the code-block engine of stock Astro themes. Lumen's markdown pipeline is a quartz-based one instead — code blocks are styled by the ported **code-styler** engine, so *some* Expressive Code conventions work as-is while others have a direct equivalent. Rather than guessing from upstream docs, this note only claims what the live renderer actually does — try any block by copying it.

## What works as written

The `title` attribute is honored: it becomes the block's header text (this is the one attribute both engines agree on).

````md
```js title="hello.js"
console.log("Titles work — they become the header text.");
```
````

Renders as:

```js title="hello.js"
console.log("Titles work — they become the header text.");
```

Language highlighting and diff syntax need no extra markup — they are handled by the Shiki-based highlighter underneath:

```python
def greet(name: str) -> str:
    return f"Hello, {name}!"
```

## What maps onto code-styler syntax

Expressive Code features that do **not** parse here have equivalents in the [[code-styler]] dialect (same repo note as the real demo):

| Expressive Code you know | In Lumen, write | Result |
| --- | --- | --- |
| `title="…"` | `title:…` or `title=…` | header text (both spellings work) |
| `{1, 4, 7-8}` line markers | `hl:1,4,7-8` | highlighted lines/ranges |
| `del={…}` / `ins={…}` markers | — | not ported; the code-styler dialect defines its own marker set (see [[code-styler]]) |
| `collapse={…}` plugin | `fold` / `fold:"Label"` | collapsible header |
| `showLineNumbers` / `startLineNumber` | `ln` (optionally `ln:5`) | line numbers, with start offset |
| `wrap` / `preserveIndent` | `wrap` (default on) | soft-wrapped lines |

The one concrete rule for the curious: in Lumen's code-styler port the header parameter grammar is `key:value` or `key=value` on the opening fence line right after the language — e.g. ` ```js fold:"solution" hl:2-4 ln ` — while curly-brace Expressive Code markers (`{1,4}`, `del=`, `ins=`) are left untouched as plain text, exactly like the plugin they replace.

## The takeaway

Code styling lives in one place: open [[code-styler]] for the full, live demo of the dialect this blog speaks — headers, folds, line numbers, highlight ranges, reference headers, per-line language tags, and the `reference`-file embedding trick. [[markdown]] covers the rest of GFM, and [[writing-content]] ties the syntax together.
