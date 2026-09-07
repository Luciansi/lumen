---
title: Quartz Target
published: 2026-08-27
description: Transclusion fixture for the quartz pipeline demos — headings and block anchors that other notes embed.
tags: [Quartz, Fixture]
category: Test
---

> [!INFO] This note is a fixture, not an article
> [[quartz-features]] and [[code-styler]] embed parts of this page to demonstrate the quartz pipeline's transclusion and reference features — clicking those links is what the note is for. Its section headings and block anchors are load-bearing: other notes address them by name (`#Section-Two`, `^par-block` …), so keep them stable.

## Section Two

Content of section two, referenced via `![[quartz-target#Section-Two]]`.

## Section Three

A paragraph with a block reference marker.

Quoted paragraph to embed. ^par-block

- list item one ^list-block
- list item two

> A quote to embed. ^quote-block

## Nested

This section transcludes back into the main fixture to test recursion:

![[quartz-features#Nested-Anchor]]
