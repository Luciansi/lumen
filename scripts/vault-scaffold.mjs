/* 内容目录共享逻辑(供 scripts 直用;与 src/utils/vaults.ts 的规则一致):
 *   - src/content/ 下的每个顶层目录都是一座库;
 *   - 库 = 目录,建库即手动创建目录(集合与导航自动注册);
 *   - 路由 = 目录名 github-slug。
 * 消费方: new-note.js(向导)、index-vaults.mjs(索引刷新)、
 * generate-knowledge-index.mjs(库首页自动索引)。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { slug as githubSlug } from "github-slugger";

export const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(SCRIPTS_DIR, "..");
export const CONTENT_ROOT = path.join(REPO_ROOT, "src", "content");

// 路径段禁止字符:\ 为转义;| [ ] 破坏 wikilink;# ^ 是 Obsidian 锚点;其余为文件名保留字符
export const FORBIDDEN_SEG = /[\\:*?"<>|[\]#^]/;

/** 库目录名 → 页面路由根(与 src/utils/vaults.ts 一致:目录名 github-slug)。 */
export function vaultRouteOf(dirName) {
  return githubSlug(dirName);
}

/** content 根下当前已存在的顶层目录(过滤点开头)。 */
export function listTopLevelDirs() {
  try {
    return fs
      .readdirSync(CONTENT_ROOT, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("."))
      .map((d) => d.name);
  } catch {
    return [];
  }
}
