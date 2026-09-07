import { type CollectionKey, getCollection, render } from "astro:content";
import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/server-i18n";
import { getCategoryUrl, url } from "@utils/url-utils.ts";
import { kbTitleOf } from "./knowledge-utils";
import { listVaults } from "./vaults";

/**
 * Vault 条目统一宽松视图。vault schema 全开(`z.looseObject({})`)且集合名
 * 是运行时的目录名,而 astro:content 的集合键是 sync 时的静态联合 —— 这里
 * 做一次投影:运行时对象原样保留(仍可 render),静态类型放宽为可用形状。
 */
export type LooseVaultEntry = {
	collection: string;
	id: string;
	body?: string;
	filePath?: string;
	data: Record<string, unknown>;
};

/** 某座库的全部条目(含其根 index.md),按 vault 目录名取集合。 */
export async function vaultEntries(dir: string): Promise<LooseVaultEntry[]> {
	return (await getCollection(
		dir as CollectionKey,
	)) as unknown as LooseVaultEntry[];
}

/**
 * astro:content `render()` 的宽松入口:传给它的始终是真实内容条目,
 * 仅静态签名需要放宽(动态集合无法对上游泛型)。
 */
export async function renderEntry(entry: unknown) {
	return render(entry as never);
}

/** prod 剔除草稿;dev 照单全收 */
function inProdSkipDraft(draft: boolean): boolean {
	return import.meta.env.PROD ? !draft : true;
}

/**
 * 「文章」的唯一定义:带可解析 `published` 日期的 vault 笔记(库首页
 * index.md 除外)。归档 / 首页总览 / RSS / 上一篇下一篇均以本行为准;
 * `draft: true` 仅 dev 可见。
 */
type VaultNoteArticle = {
	/** vault collection name (directory) and URL route root */
	dir: string;
	route: string;
	/** entry id inside the vault */
	id: string;
	/** raw content-layer entry (carries `.data` and `.body`) */
	entry: LooseVaultEntry;
	url: string;
	title: string;
	published: Date;
	category: string | null;
	tags: string[];
	description: string;
	draft: boolean;
	/** 「原创」= `original: true`,或分类为「随笔」(随笔列表置顶,与原型一致) */
	original: boolean;
};

async function collectArticles(): Promise<VaultNoteArticle[]> {
	const out: VaultNoteArticle[] = [];
	for (const vault of listVaults()) {
		const entries = await vaultEntries(vault.dir);
		for (const entry of entries) {
			if (entry.id === "index") continue; // vault home (root index.md)
			const data = entry.data;
			const rawPublished = data.published as string | number | Date | undefined;
			if (rawPublished === undefined) continue; // no date → not an "article"
			const published = new Date(rawPublished);
			if (Number.isNaN(published.getTime())) continue;
			const tags = Array.isArray(data.tags)
				? data.tags
						.filter(
							(t: unknown) => typeof t === "string" || typeof t === "number",
						)
						.map(String)
				: [];
			const category =
				typeof data.category === "string" && data.category.trim() !== ""
					? data.category.trim()
					: null;
			out.push({
				dir: vault.dir,
				route: vault.route,
				id: entry.id,
				entry,
				url: url(`/${vault.route}/${entry.id}/`),
				title: String(data.title || kbTitleOf(entry)),
				published,
				category,
				tags,
				description:
					typeof data.description === "string" ? data.description : "",
				draft: data.draft === true,
				original: category === "随笔" || data.original === true,
			});
		}
	}
	return out;
}

/**
 * A published "article" for listings/archives: a vault note carrying
 * posts-style frontmatter (`published` date, tags/category). Liveness matches
 * the pages: `draft: true` items are excluded in production.
 */
export type ArchiveEntry = {
	/** unique key: "<vault>:<note id>" */
	id: string;
	/** full page URL (base path applied) */
	url: string;
	data: {
		title: string;
		tags: string[];
		category: string | null;
		published: Date;
	};
};

/** All articles (dated vault notes), newest first. */
export async function getArchiveEntries(): Promise<ArchiveEntry[]> {
	const items = (await collectArticles())
		.filter((r) => inProdSkipDraft(r.draft))
		.map((r) => ({
			id: `${r.dir}:${r.id}`,
			url: r.url,
			data: {
				title: r.title,
				tags: r.tags,
				category: r.category,
				published: r.published,
			},
		}));
	return items.sort(
		(a, b) => b.data.published.getTime() - a.data.published.getTime(),
	);
}

/**
 * 首页总览条目：全部带 published 日期的 vault 笔记（dev 含 draft，prod 剔除）。
 * 条目保留原始 collection entry 供页面 `render()` 取字数等。
 * 「原创」= frontmatter `original: true`，或分类为「随笔」（随笔类在总览列表
 * 置顶，与原型一致）。
 */
export type OverviewEntry = {
	/** 原始 collection entry，供 render() 使用 */
	entry: LooseVaultEntry;
	url: string;
	title: string;
	published: Date;
	category: string | null;
	tags: string[];
	description: string;
	draft: boolean;
	original: boolean;
};

export async function getOverviewEntries(): Promise<OverviewEntry[]> {
	const entries = (await collectArticles())
		.filter((r) => inProdSkipDraft(r.draft))
		.map((r) => ({
			entry: r.entry,
			url: r.url,
			title: r.title,
			published: r.published,
			category: r.category,
			tags: r.tags,
			description: r.description,
			draft: r.draft,
			original: r.original,
		}));

	/* 原创优先（组内按 published 倒序）；其后按日期倒序 */
	return entries.sort((a, b) => {
		if (a.original !== b.original) return a.original ? -1 : 1;
		return b.published.getTime() - a.published.getTime();
	});
}

/**
 * RSS/feed 素材：全部带 published 的 vault 笔记（与首页总览/归档同一口径），
 * 草稿 prod 剔除。`body` 为原始 Markdown 源码，由 feed 端点自行渲染。
 */
export type FeedEntry = {
	url: string;
	title: string;
	published: Date;
	description: string;
	body: string;
};

export async function getFeedEntries(): Promise<FeedEntry[]> {
	const items = (await collectArticles())
		.filter((r) => inProdSkipDraft(r.draft))
		.map((r) => ({
			url: r.url,
			title: r.title,
			published: r.published,
			description: r.description,
			body: r.entry.body ?? "",
		}));
	return items.sort((a, b) => b.published.getTime() - a.published.getTime());
}

/**
 * 上一篇 / 下一篇（与 feed 同序：新 → 旧）。next = 更新的前一篇，
 * prev = 更旧的下一篇；条目不在列表中（如草稿缺失）时返回空。
 */
export async function getAdjacentEntries(entryUrl: string): Promise<{
	prev?: { title: string; url: string };
	next?: { title: string; url: string };
}> {
	const feed = await getFeedEntries();
	const i = feed.findIndex((e) => e.url === entryUrl);
	if (i === -1) return {};
	return {
		next:
			i > 0 ? { title: feed[i - 1].title, url: feed[i - 1].url } : undefined,
		prev:
			i < feed.length - 1
				? { title: feed[i + 1].title, url: feed[i + 1].url }
				: undefined,
	};
}

export type Tag = {
	name: string;
	count: number;
};

export async function getTagList(): Promise<Tag[]> {
	const entries = await getArchiveEntries();

	const countMap: { [key: string]: number } = {};
	entries.forEach((entry) => {
		entry.data.tags.forEach((tag: string) => {
			if (!countMap[tag]) countMap[tag] = 0;
			countMap[tag]++;
		});
	});

	// sort tags
	const keys: string[] = Object.keys(countMap).sort((a, b) => {
		return a.toLowerCase().localeCompare(b.toLowerCase());
	});

	return keys.map((key) => ({ name: key, count: countMap[key] }));
}

export type Category = {
	name: string;
	count: number;
	url: string;
};

export async function getCategoryList(): Promise<Category[]> {
	const entries = await getArchiveEntries();

	const count: { [key: string]: number } = {};
	entries.forEach((entry) => {
		if (!entry.data.category) {
			const ucKey = i18n(I18nKey.uncategorized);
			count[ucKey] = count[ucKey] ? count[ucKey] + 1 : 1;
			return;
		}
		const categoryName = entry.data.category.trim();
		count[categoryName] = count[categoryName] ? count[categoryName] + 1 : 1;
	});

	const lst = Object.keys(count).sort((a, b) => {
		return a.toLowerCase().localeCompare(b.toLowerCase());
	});

	const ret: Category[] = [];
	const uncategorizedLabel = i18n(I18nKey.uncategorized);
	for (const c of lst) {
		ret.push({
			name: c,
			count: count[c],
			url: getCategoryUrl(c, uncategorizedLabel),
		});
	}
	return ret;
}

/* 全站内容总字数（首页 hero 统计用）。render 一次后缓存，多次页面共用。 */
let totalWordsCache: Promise<number> | null = null;
export function getTotalWords(): Promise<number> {
	if (!totalWordsCache) {
		totalWordsCache = (async () => {
			let sum = 0;
			for (const e of await getOverviewEntries()) {
				try {
					const fm = (await renderEntry(e.entry)).remarkPluginFrontmatter ?? {};
					if (typeof fm.words === "number") sum += fm.words;
				} catch {
					/* 渲染失败不参与统计 */
				}
			}
			return sum;
		})();
	}
	return totalWordsCache;
}
