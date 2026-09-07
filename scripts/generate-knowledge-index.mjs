#!/usr/bin/env node
/**
 * Regenerates the auto-index section of a vault's root index.md — the note
 * served at /<vault-route>/.
 *
 * The vault-root index.md is a normal Obsidian note: prose, frontmatter and
 * anything outside the two markers below is left untouched, so hand-written
 * content survives re-runs. Only the block between the markers is rewritten.
 * When the vault has no root index.md yet, one is created (header + markers +
 * current listing).
 *
 * Convention: a folder note (<folder>/index.md, "目录总览页", created by
 * pnpm new-note) is listed first within its group, aliased to the folder name
 * instead of "index" — e.g. "- [[Concept/index|Concept]]",
 * "- [[Conputer/操作系统/index|操作系统]]".
 *
 * Usage (repo root):
 *   node scripts/generate-knowledge-index.mjs [<库目录名>]   — 单库
 *   node scripts/index-vaults.mjs                            — 全库扫描
 * Rules mirror src/utils/vaults.ts / scripts/vault-scaffold.mjs.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { CONTENT_ROOT, vaultRouteOf } from "./vault-scaffold.mjs";

const START_MARKER = "<!-- auto-index:start -->";
const END_MARKER = "<!-- auto-index:end -->";

/** Wiki-link target as Obsidian writes it: vault path without extension. */
function noteTarget(rel) {
	return rel.replace(/\.md$/, "");
}

function collectNotes(dir, base = "", out = []) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (entry.name.startsWith(".")) continue;
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) collectNotes(full, path.posix.join(base, entry.name), out);
		else if (entry.name.endsWith(".md")) out.push(path.posix.join(base, entry.name));
	}
	return out;
}

function renderRegion(root) {
	const notes = collectNotes(root)
		// index.md is the page this list lives on — never list itself
		.filter((rel) => rel !== "index.md")
		.sort((a, b) => {
			const la = a.toLowerCase();
			const lb = b.toLowerCase();
			return la < lb ? -1 : la > lb ? 1 : 0;
		});

	// group by first path segment; files directly in the vault root are
	// rendered first as plain bullets (see below)
	const groups = new Map();
	const rootFiles = [];
	for (const rel of notes) {
		const segs = rel.split("/");
		if (segs.length === 1) rootFiles.push(rel);
		else {
			const list = groups.get(segs[0]) ?? [];
			list.push(rel);
			groups.set(segs[0], list);
		}
	}

	const lines = [];
	// vault-root notes come first, as plain bullets (no "## 其他" heading) —
	// 直接放在库根目录的笔记是这份索引的主角,应该排在最前面
	if (rootFiles.length > 0) {
		for (const rel of rootFiles) {
			lines.push(`- [[${noteTarget(rel)}|${noteTarget(rel)}]]`);
		}
		lines.push("");
	}
	for (const [folder, files] of groups) {
		lines.push(`## ${folder}`);
		// folder overviews (*/index.md) head the group (the global sort above
		// fixes group order; within a group re-rank overviews first, then name)
		const ranked = [...files].sort((a, b) => {
			const aIdx = a.endsWith("/index.md") ? 0 : 1;
			const bIdx = b.endsWith("/index.md") ? 0 : 1;
			if (aIdx !== bIdx) return aIdx - bIdx;
			const la = a.toLowerCase();
			const lb = b.toLowerCase();
			return la < lb ? -1 : la > lb ? 1 : 0;
		});
		for (const rel of ranked) {
			const target = noteTarget(rel);
			// alias = path below the folder being listed (basename for direct files),
			// so same-named notes in different subfolders stay distinguishable;
			// folder overviews drop the trailing "index" (empty → the folder name)
			let alias = target.split("/").slice(1).join("/");
			if (rel.endsWith("/index.md")) alias = alias.replace(/\/index$/, "") || folder;
			lines.push(`- [[${target}|${alias}]]`);
		}
		lines.push("");
	}
	return lines.join("\n").trimEnd();
}

/**
 * Ensure a vault's root index.md: create when missing, refresh the auto-index
 * region when the markers are present. Never touches an index.md whose markers
 * were removed by hand.
 *
 * @param {string} vaultDir directory name under src/content
 * @returns {{status: "created"|"updated"|"unchanged"|"aborted"|"missing",
 *            file: string, notes?: number, groups?: number, message?: string}}
 */
export function ensureVaultIndex(vaultDir) {
	const root = path.join(CONTENT_ROOT, vaultDir);
	const indexFile = path.join(root, "index.md");
	const display = `src/content/${vaultDir}`;

	if (!fs.existsSync(root)) {
		return {
			status: "missing",
			file: display,
			message: `库目录不存在: ${display}`,
		};
	}

	const route = vaultRouteOf(vaultDir);
	const title = vaultDir;
	const region = renderRegion(root);
	const notes = notesCount(region);
	const groups = groupsCount(region);

	const HEADER = `---
title: ${JSON.stringify(title)}
---
<!-- 本文件即 /${route}/ 首页,内容可在 Obsidian 中直接编辑;
标题上方可写自己的开场白,下方自动索引区域请勿手改。
索引区域由 scripts/generate-knowledge-index.mjs 维护,
在仓库根目录运行 node scripts/generate-knowledge-index.mjs ${vaultDir}可重新生成。
分类总览页(文件夹里的 index.md,可用 pnpm new-note 创建)会以
- [[路径/index|分类名]] 的形式列在所在组最前。 -->

`;

	const existing = fs.existsSync(indexFile) ? fs.readFileSync(indexFile, "utf8") : "";

	let content;
	let status;
	if (existing.trim() === "") {
		// no index.md yet: create the full file (骨架)
		content = HEADER + START_MARKER + "\n" + region + "\n" + END_MARKER + "\n";
		status = "created";
	} else {
		const start = existing.indexOf(START_MARKER);
		const end = existing.indexOf(END_MARKER);
		if (start === -1 || end === -1 || end <= start) {
			return {
				status: "aborted",
				file: indexFile,
				message:
					`${indexFile} 存在但没有 ${START_MARKER} / ${END_MARKER} 标记对,` +
					"为避免覆盖手写内容已跳过;确认后请手动补回标记(两标记之间的整块内容会被重写)。",
			};
		}
		content =
			existing.slice(0, start + START_MARKER.length) +
			"\n" +
			region +
			"\n" +
			existing.slice(end);
		status = "updated";
	}

	// skip the write when nothing would change (auto hooks run on every
	// dev/build start — stay quiet instead of rewriting identical files)
	if (existing !== "" && content === existing) {
		return { status: "unchanged", file: indexFile, notes, groups };
	}

	fs.writeFileSync(indexFile, content);
	return { status, file: indexFile, notes, groups };
}

function notesCount(content) {
	return (content.match(/^- \[\[/gm) ?? []).length;
}
function groupsCount(content) {
	return (content.match(/^## /gm) ?? []).length;
}

// CLI entry(被 new-note 以子进程调用,或手动指定单库)
const isDirectRun =
	process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
	const vaultDir = process.argv[2]?.trim();
	if (!vaultDir) {
		console.error("用法: node scripts/generate-knowledge-index.mjs <库目录名>");
		process.exit(1);
	}
	const res = ensureVaultIndex(vaultDir);
	if (res.status === "missing" || res.status === "aborted") {
		console.error(`\n${res.message}`);
		process.exit(1);
	}
	console.log(`${res.status === "unchanged" ? "Unchanged" : "Updated"} ${res.file}`);
	console.log(`  ${res.notes} notes listed under ${res.groups} sections`);
}
