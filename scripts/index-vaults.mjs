#!/usr/bin/env node
/**
 * 扫描 src/content 下的全部顶层目录(即全部知识库),为每座库补齐
 * 库根 index.md 的自动索引区域:
 *   - 目录还没有 index.md → 自动生成(title + auto-index 区域 + 当前笔记列表);
 *   - index.md 带 auto-index 标记 → 刷新列表(标记外的手写内容不动);
 *   - index.md 存在但没有标记(手写页)→ 跳过并提示,绝不覆盖;
 *   - 空目录 → 生成骨架(列表为空,以后新建笔记后重跑即可)。
 *
 * 用法(仓库根目录): node scripts/index-vaults.mjs
 * (包脚本: pnpm index-vaults)
 */
import { CONTENT_ROOT, listTopLevelDirs } from "./vault-scaffold.mjs";
import { ensureVaultIndex } from "./generate-knowledge-index.mjs";

const vaults = listTopLevelDirs();

if (vaults.length === 0) {
	console.log("src/content 下暂无可扫描的库目录;建库 = 创建目录,如 mkdir -p src/content/<库名>。");
	process.exit(0);
}

let created = 0;
let updated = 0;
let unchanged = 0;
let skipped = 0;
let missing = 0;
for (const dir of vaults) {
	const res = ensureVaultIndex(dir);
	switch (res.status) {
		case "created":
			created++;
			console.log(`✔ 已生成 ${res.file}(${res.notes} 条笔记 / ${res.groups} 组)`);
			break;
		case "updated":
			updated++;
			console.log(`✔ 已刷新 ${res.file}(${res.notes} 条笔记 / ${res.groups} 组)`);
			break;
		case "unchanged":
			unchanged++; // 静默:内容没变化(dev/build 每次启动都会跑)
			break;
		case "aborted":
			skipped++;
			console.log(`· 跳过 ${res.file}:${res.message}`);
			break;
		case "missing":
			missing++;
			console.log(`⚠ 跳过 ${res.file}:${res.message}`);
			break;
	}
}

console.log(
	`\n完成:生成 ${created} 个、刷新 ${updated} 个、无变化 ${unchanged} 个、跳过 ${skipped} 个、缺目录 ${missing} 个。`,
);
