/**
 * Knowledge-base display helpers for the content-layer API — generic across
 * vaults (any top-level directory under src/content, see utils/vaults.ts).
 *
 * With the glob loader, `entry.id` is the slugified route path (lowercase,
 * extension stripped) and original casing lives on `entry.filePath`
 * (project-relative, e.g. "src/content/VaultName/Concept/VPN.md").
 * Obsidian-style titles and breadcrumbs are derived from the file path.
 */

/** Structural subset of an entry the helpers rely on. */
type VaultEntry = {
	id: string;
	filePath?: unknown;
};

/** Vault-relative file path with original case, e.g. "Concept/VPN.md". */
export function kbRelPath(entry: VaultEntry): string {
	const filePath = (entry as { filePath?: string }).filePath;
	const rel = filePath
		? filePath.replace(/^src\/content\/[^/]+\//, "")
		: `${entry.id}.md`;
	return rel.replace(/^\/+/, "");
}

/** Display title: frontmatter-free fallback keeps the file's original case. */
export function kbTitleOf(entry: VaultEntry): string {
	const rel = kbRelPath(entry);
	const folderOverview = rel !== "index.md" && rel.endsWith("/index.md");
	if (folderOverview) {
		return rel.slice(0, -"/index.md".length).split("/").pop() || entry.id;
	}
	return rel.replace(/\.md$/, "").split("/").pop() || entry.id;
}

/** Breadcrumb path: file path minus extension and a trailing folder "/index". */
export function kbVaultPathOf(entry: VaultEntry): string {
	const rel = kbRelPath(entry);
	const withoutExt = rel.replace(/\.md$/, "");
	// the vault-root note (index.md) has no parent path to show
	if (withoutExt === "index") return "";
	return withoutExt.replace(/\/index$/, "");
}

/**
 * ImageWrapper base path for a note's `image` cover: the note's directory
 * under src/, e.g. "content/showcase/" for a vault-root note or
 * "content/showcase/guide/" for a note nested under showcase/guide/.
 */
export function kbRelDir(entry: VaultEntry, vaultDir: string): string {
	const rel = kbRelPath(entry);
	// 无斜杠 = 库根笔记(如 guide.md → 目录为空);否则去掉末段文件名
	const dir = rel.includes("/") ? rel.replace(/\/[^/]+$/, "") : "";
	return `content/${vaultDir}${dir ? `/${dir}` : ""}/`;
}
