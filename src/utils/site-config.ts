// 站点内容配置中心:读 src/content/index.md(正式 YAML frontmatter + 正文小节)。
//
// 热生效:每次调用都重读文件,仅当文件文本变化才重新解析(内容版本 memo)。
// 本模块只能被服务端(SSR)代码 import:gray-matter/js-yaml 一旦进入客户端
// bundle 会显著膨胀体积——客户端需要的少量配置经 ConfigCarrier 的
// data-* 属性(DOM)传递。守卫(import.meta.env?.SSR + getBuiltinModule)
// 保留作纵深防御:误 import 时客户端退化为默认值而非崩溃。
//
// 注意:本文件被 Svelte 岛组件(client:only)的依赖链触达过会导致 YAML 进
// 客户端 bundle —— 客户端可达模块(translation.ts、url-utils.ts …)不得
// import 本模块或 i18n/server-i18n.ts。

import matter from "gray-matter";
import {
	type Favicon,
	type LicenseConfig,
	LinkPreset,
	type NavBarConfig,
	type NavBarLink,
	type ProfileConfig,
	type RecommendItem,
	type SiteConfig,
	type SiteLang,
	type SiteMdConfig,
	type SocialItem,
	type UiTexts,
} from "../types/config";

/* ============================ 默认值 ============================ */

const LANG_WHITELIST: readonly string[] = [
	"en",
	"zh_CN",
	"zh_TW",
	"ja",
	"ko",
	"es",
	"th",
	"vi",
	"tr",
	"id",
];

const BANNER_POSITIONS = ["top", "center", "bottom"] as const;

/* 非中文界面默认文案 */
const EN_UI: UiTexts = {
	statArticles: "Posts",
	statWords: "Words",
	statCategories: "Categories",
	statTags: "Tags",
	sectionAll: "All Posts",
	sectionCategories: "Categories",
	sectionTags: "Tags",
	sectionRecommend: "Recommend",
	searchPlaceholder: "Search titles, tags or categories…",
	found: "Found {n} items",
	noResult: "No matching content — try another keyword",
	wordUnit: "words",
	minuteUnit: "minutes",
};

/* 中文界面默认文案 */
const ZH_UI: UiTexts = {
	statArticles: "篇文章",
	statWords: "字数",
	statCategories: "个分类",
	statTags: "个标签",
	sectionAll: "全部文章",
	sectionCategories: "分类",
	sectionTags: "标签",
	sectionRecommend: "推荐",
	searchPlaceholder: "搜索标题、标签或分类…",
	found: "找到 {n} 篇",
	noResult: "没有匹配的文章，换个关键词试试",
	wordUnit: "字",
	minuteUnit: "分钟",
};

const DEFAULT_SOCIALS: SocialItem[] = [
	{
		name: "GitHub",
		icon: "fa6-brands:github",
		url: "https://github.com/Luciansi/lumen",
	},
];

// index.md 缺省时推荐卡为空(组件自带空态引导文案),不写死仓库内示例链接
const DEFAULT_RECOMMEND: RecommendItem[] = [];

const DEFAULT_NAV_LINKS: (LinkPreset | NavBarLink)[] = [
	LinkPreset.Home,
	LinkPreset.Archive,
	LinkPreset.About,
	{
		name: "GitHub",
		url: "https://github.com/Luciansi/lumen",
		external: true,
	},
];

/** index.md 缺失/不可读时的兜底(与仓库内 index.md 示例保持同源) */
const DEFAULT_CONFIG: SiteMdConfig = {
	site: { title: "Lumen", subtitle: "Blog & Knowledge Base", lang: "en" },
	themeColor: { hue: 250, fixed: false },
	banner: {
		enable: false,
		src: "assets/images/demo-banner.png",
		position: "center",
		credit: { enable: false, text: "", url: "" },
	},
	toc: { enable: true, depth: 2 },
	graph: { enable: true, localDepth: 2, showTags: false },
	favicon: [],
	nav: { links: DEFAULT_NAV_LINKS, vaultLinksBefore: undefined },
	license: {
		enable: true,
		name: "CC BY-NC-SA 4.0",
		url: "https://creativecommons.org/licenses/by-nc-sa/4.0/",
	},
	profile: {
		name: "Lumen",
		tagline:
			"The wind stripped the trees last night. I stand alone up here, looking as far as I can see.",
		bio: "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
		avatar: "assets/images/avatar.jpeg",
		socials: DEFAULT_SOCIALS,
	},
	ui: EN_UI,
	recommend: DEFAULT_RECOMMEND,
	overviewOrder: [],
};

/* ============================ 文件读取 ============================ */

function mdPath(): string | null {
	const proc = (globalThis as { process?: NodeJS.Process }).process;
	return proc?.cwd ? `${proc.cwd()}/src/content/index.md` : null;
}

/* 仅服务端读取 index.md;浏览器端(SSR=false)返回 null */
function readIndexMd(): string | null {
	if (import.meta.env?.SSR !== true) return null;
	const proc = (globalThis as { process?: NodeJS.Process }).process;
	const fs = proc?.getBuiltinModule?.("node:fs") as
		| {
				existsSync(p: string): boolean;
				readFileSync(p: string, enc: string): string;
		  }
		| undefined;
	if (!fs) return null;
	const md = mdPath();
	if (!md) return null;
	try {
		if (!fs.existsSync(md)) return null;
		return fs.readFileSync(md, "utf-8");
	} catch {
		return null;
	}
}

/* ============================ 校验与强转 ============================ */

type RawObject = Record<string, unknown>;

/** 日志警告每个内容版本至多一次(避免每次渲染刷屏) */
function warnOnce(bucket: Set<string>, key: string, msg: string): void {
	if (bucket.has(key)) return;
	bucket.add(key);
	console.error(`[index.md] ${key}: ${msg}`);
}

/** 字符串:非字符串 → 回退默认;empty 可选放行(默认拒绝并回退) */
function asStr(
	bucket: Set<string>,
	key: string,
	v: unknown,
	fallback: string,
	allowEmpty = false,
): string {
	if (typeof v !== "string") {
		if (v === undefined || v === null) return fallback;
		warnOnce(bucket, key, `期望字符串，得到 ${typeof v}，回退默认`);
		return fallback;
	}
	const t = v.trim();
	if (!allowEmpty && t === "") {
		warnOnce(bucket, key, "为空字符串，回退默认");
		return fallback;
	}
	return t;
}

/** 布尔:YAML 原生布尔或 "true"/"false" 字符串 */
function asBool(
	bucket: Set<string>,
	key: string,
	v: unknown,
	fallback: boolean,
): boolean {
	if (typeof v === "boolean") return v;
	if (typeof v === "string") {
		if (v.trim() === "true") return true;
		if (v.trim() === "false") return false;
	}
	if (v === undefined || v === null) return fallback;
	warnOnce(bucket, key, `期望布尔，得到 ${typeof v}，回退 ${fallback}`);
	return fallback;
}

/** 整数区间 */
function intIn(
	bucket: Set<string>,
	key: string,
	v: unknown,
	min: number,
	max: number,
	fallback: number,
): number {
	const n =
		typeof v === "number"
			? v
			: typeof v === "string"
				? Number(v.trim())
				: Number.NaN;
	if (Number.isInteger(n) && n >= min && n <= max) return n;
	if (v !== undefined && v !== null) {
		warnOnce(
			bucket,
			key,
			`期望 ${min}–${max} 的整数，得到 ${String(v)}，回退 ${fallback}`,
		);
	}
	return fallback;
}

/** 枚举之一 */
function oneOf<T extends string>(
	bucket: Set<string>,
	key: string,
	v: unknown,
	allowed: readonly T[],
	fallback: T,
): T {
	if (typeof v === "string") {
		const hit = allowed.find((a) => a === v.trim());
		if (hit) return hit;
	}
	if (v !== undefined && v !== null) {
		warnOnce(
			bucket,
			key,
			`期望 ${allowed.join("/")}，得到 ${String(v)}，回退 ${fallback}`,
		);
	}
	return fallback;
}

/* ============================ 分区合并 ============================ */

function pickObj(raw: unknown): RawObject | null {
	if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
		return raw as RawObject;
	}
	return null;
}

function socialsOf(
	bucket: Set<string>,
	key: string,
	raw: unknown,
	fallback: SocialItem[],
): SocialItem[] {
	if (raw === undefined || raw === null) return fallback;
	const out: SocialItem[] = [];
	if (!Array.isArray(raw)) {
		warnOnce(bucket, key, "期望列表，已忽略并保持默认");
		return fallback;
	}
	for (const item of raw) {
		const o = pickObj(item);
		const name = o ? asStr(bucket, `${key}[name]`, o.name, "", false) : "";
		const icon = o ? asStr(bucket, `${key}[icon]`, o.icon, "", false) : "";
		const url = o ? asStr(bucket, `${key}[url]`, o.url, "", false) : "";
		if (name && icon && url) {
			out.push({ name, icon, url });
		} else {
			warnOnce(bucket, key, "存在缺 name/icon/url 的社交项，已跳过");
		}
	}
	return out;
}

const PRESET_IDS = ["home", "archive", "about"] as const;

function navLinksOf(
	bucket: Set<string>,
	key: string,
	raw: unknown,
	fallback: (LinkPreset | NavBarLink)[],
): (LinkPreset | NavBarLink)[] {
	// 空/缺省/非法 → 默认导航(空导航无自救 UI,故不随空数组清空)
	if (raw === undefined || raw === null) return fallback;
	if (!Array.isArray(raw) || raw.length === 0) {
		warnOnce(bucket, key, "缺省或为空，回退默认导航");
		return fallback;
	}
	const out: (LinkPreset | NavBarLink)[] = [];
	for (const item of raw) {
		const presetStr = typeof item === "string" ? item : pickObj(item)?.preset;
		if (typeof presetStr === "string") {
			const id = presetStr.trim().toLowerCase() as (typeof PRESET_IDS)[number];
			if (id === "home") out.push(LinkPreset.Home);
			else if (id === "archive") out.push(LinkPreset.Archive);
			else if (id === "about") out.push(LinkPreset.About);
			else warnOnce(bucket, key, `未知预设 "${presetStr}"，已跳过`);
			continue;
		}
		const o = pickObj(item);
		const name = o ? asStr(bucket, `${key}[name]`, o.name, "") : "";
		const url = o ? asStr(bucket, `${key}[url]`, o.url, "") : "";
		if (name && url) {
			out.push({
				name,
				url,
				external: asBool(bucket, `${key}[external]`, o?.external, false),
			});
		} else {
			warnOnce(bucket, key, "存在缺 name/url 的导航项，已跳过");
		}
	}
	return out.length > 0 ? out : fallback;
}

function faviconsOf(bucket: Set<string>, key: string, raw: unknown): Favicon[] {
	if (raw === undefined || raw === null) return [];
	if (!Array.isArray(raw)) {
		warnOnce(bucket, key, "期望列表，已忽略");
		return [];
	}
	const out: Favicon[] = [];
	for (const item of raw) {
		const o = pickObj(item);
		const src = o ? asStr(bucket, `${key}[src]`, o.src, "") : "";
		if (!src) {
			warnOnce(bucket, key, "存在缺 src 的 favicon 项，已跳过");
			continue;
		}
		const themeRaw = o?.theme;
		out.push({
			src,
			theme:
				themeRaw === undefined || themeRaw === null
					? undefined
					: oneOf(
							bucket,
							`${key}[theme]`,
							themeRaw,
							["light", "dark"] as const,
							"light",
						),
			sizes: asStr(bucket, `${key}[sizes]`, o?.sizes, "", true) || undefined,
		});
	}
	return out;
}

function mergeUi(out: UiTexts, raw: unknown, bucket: Set<string>): void {
	const o = pickObj(raw);
	if (!o) return;
	for (const k of Object.keys(o)) {
		if (!(k in out)) {
			warnOnce(bucket, `ui.${k}`, "未知键，已忽略");
			continue;
		}
		const v = o[k];
		if (typeof v === "string" && v.trim() !== "") {
			(out as RawObject)[k] = v.trim();
		} else if (v !== undefined && v !== null) {
			warnOnce(bucket, `ui.${k}`, `期望非空字符串，得到 ${typeof v}，已忽略`);
		}
	}
}

/* ============================ 正文小节(推荐 / 文章总览) ============================ */

const LINK_RE = /^\s*-\s*\[([^\]]+)\]\(([^)\s]+)\)/;

function sectionsOf(content: string): {
	recommend: RecommendItem[];
	overviewOrder: RecommendItem[];
} {
	const sections = {
		recommend: [] as RecommendItem[],
		overviewOrder: [] as RecommendItem[],
	};
	let current: "recommend" | "overviewOrder" | null = null;
	for (const line of content.split(/\r?\n/)) {
		const head = /^#{1,4}\s*(.+)$/.exec(line.trim());
		if (head) {
			const t = head[1].toLowerCase();
			if (/推荐|recommend/.test(t)) current = "recommend";
			else if (/文章|总览|order|排序|overview/i.test(t))
				current = "overviewOrder";
			else current = null;
			continue;
		}
		if (!current) continue;
		const m = LINK_RE.exec(line);
		if (m) {
			const title = (m[1] || "").trim();
			const url = (m[2] || "").trim();
			if (title && url) sections[current].push({ title, url });
		}
	}
	return sections;
}

/* ============================ 主流程 ============================ */

/** index.md frontmatter(YAML)解析:语法错误 → 默认值 + 告警,正文仍生效 */
function parseFrontmatter(text: string): { data: RawObject; content: string } {
	try {
		const file = matter(text);
		const data = pickObj(file.data) ?? {};
		return { data, content: file.content };
	} catch {
		// YAML 语法错误:整体回退默认值(正文小节仍照常解析)
		return { data: {}, content: text };
	}
}

/** YAML → 校验合并 → 规范配置(永不抛错) */
function buildFrom(
	raw: RawObject,
	bucket: Set<string>,
	content: string,
): SiteMdConfig {
	const out: SiteMdConfig = structuredClone(DEFAULT_CONFIG);
	// ui 默认随界面语言:非中文用英文集(下方显式 ui.* 键再覆盖)
	const langRaw = pickObj(raw.site)?.lang;
	out.site.lang = oneOf<SiteLang>(
		bucket,
		"site.lang",
		langRaw,
		LANG_WHITELIST as readonly SiteLang[],
		"en",
	);
	out.ui = /^zh/i.test(out.site.lang) ? { ...ZH_UI } : { ...EN_UI };

	const site = pickObj(raw.site);
	out.site.title = asStr(bucket, "site.title", site?.title, out.site.title);
	out.site.subtitle = asStr(
		bucket,
		"site.subtitle",
		site?.subtitle,
		out.site.subtitle,
		true,
	);

	const themeColor = pickObj(raw.themeColor);
	out.themeColor.hue = intIn(
		bucket,
		"themeColor.hue",
		themeColor?.hue,
		0,
		360,
		out.themeColor.hue,
	);
	out.themeColor.fixed = asBool(
		bucket,
		"themeColor.fixed",
		themeColor?.fixed,
		out.themeColor.fixed,
	);

	const banner = pickObj(raw.banner);
	out.banner.enable = asBool(
		bucket,
		"banner.enable",
		banner?.enable,
		out.banner.enable,
	);
	out.banner.src = asStr(bucket, "banner.src", banner?.src, out.banner.src);
	out.banner.position = oneOf(
		bucket,
		"banner.position",
		banner?.position,
		BANNER_POSITIONS,
		"center",
	);
	const credit = pickObj(banner?.credit);
	out.banner.credit.enable = asBool(
		bucket,
		"banner.credit.enable",
		credit?.enable,
		out.banner.credit.enable,
	);
	out.banner.credit.text = asStr(
		bucket,
		"banner.credit.text",
		credit?.text,
		out.banner.credit.text,
		true,
	);
	out.banner.credit.url = asStr(
		bucket,
		"banner.credit.url",
		credit?.url,
		out.banner.credit.url ?? "",
		true,
	);

	const toc = pickObj(raw.toc);
	out.toc.enable = asBool(bucket, "toc.enable", toc?.enable, out.toc.enable);
	out.toc.depth = intIn(bucket, "toc.depth", toc?.depth, 1, 3, out.toc.depth) as
		| 1
		| 2
		| 3;

	const graph = pickObj(raw.graph);
	out.graph.enable = asBool(
		bucket,
		"graph.enable",
		graph?.enable,
		out.graph.enable,
	);
	out.graph.localDepth = intIn(
		bucket,
		"graph.localDepth",
		graph?.localDepth,
		1,
		3,
		out.graph.localDepth,
	) as 1 | 2 | 3;
	out.graph.showTags = asBool(
		bucket,
		"graph.showTags",
		graph?.showTags,
		out.graph.showTags,
	);

	out.favicon = faviconsOf(bucket, "favicon", raw.favicon);

	const nav = pickObj(raw.nav);
	out.nav.links = navLinksOf(bucket, "nav.links", nav?.links, out.nav.links);
	out.nav.vaultLinksBefore =
		asStr(bucket, "nav.vaultLinksBefore", nav?.vaultLinksBefore, "", true) ||
		undefined;

	const license = pickObj(raw.license);
	out.license.enable = asBool(
		bucket,
		"license.enable",
		license?.enable,
		out.license.enable,
	);
	out.license.name = asStr(
		bucket,
		"license.name",
		license?.name,
		out.license.name,
	);
	out.license.url = asStr(bucket, "license.url", license?.url, out.license.url);

	const profile = pickObj(raw.profile);
	out.profile.name = asStr(
		bucket,
		"profile.name",
		profile?.name,
		out.profile.name,
	);
	out.profile.tagline = asStr(
		bucket,
		"profile.tagline",
		profile?.tagline,
		out.profile.tagline,
		true,
	);
	out.profile.bio = asStr(
		bucket,
		"profile.bio",
		profile?.bio,
		out.profile.bio,
		true,
	);
	// avatar 空字符串有含义(留空 → 首字母渐变色头像)
	out.profile.avatar = asStr(
		bucket,
		"profile.avatar",
		profile?.avatar,
		out.profile.avatar,
		true,
	);
	out.profile.socials = socialsOf(
		bucket,
		"profile.socials",
		profile?.socials,
		out.profile.socials,
	);

	mergeUi(out.ui, raw.ui, bucket);

	const sections = sectionsOf(content);
	if (sections.recommend.length > 0) out.recommend = sections.recommend;
	if (sections.overviewOrder.length > 0)
		out.overviewOrder = sections.overviewOrder;

	return out;
}

/* ---------- 内容版本 memo:文件文本没变就不重解析 ---------- */

let lastText: string | null = null;
let lastConfig: SiteMdConfig | null = null;

export function getSiteMdConfig(): SiteMdConfig {
	const text = readIndexMd();
	if (text === null) return structuredClone(DEFAULT_CONFIG);
	if (text === lastText && lastConfig) return lastConfig;
	const warns = new Set<string>();
	const { data, content } = parseFrontmatter(text);
	lastConfig = buildFrom(data, warns, content);
	lastText = text;
	return lastConfig;
}

/* ============================ 消费视图 ============================ */

/** 站点级配置(layouts/pages 常用视图) */
export function getSiteConfig(): SiteConfig {
	const cfg = getSiteMdConfig();
	return {
		title: cfg.site.title,
		subtitle: cfg.site.subtitle,
		lang: cfg.site.lang,
		themeColor: cfg.themeColor,
		banner: cfg.banner,
		toc: cfg.toc,
		graph: cfg.graph,
		favicon: cfg.favicon,
	};
}

/** 顶部导航配置 */
export function getNavBarConfig(): NavBarConfig {
	return getSiteMdConfig().nav;
}

/** 个人卡配置(avatar 空 → undefined,界面用首字母头像) */
export function getProfileConfig(): ProfileConfig {
	const cfg = getSiteMdConfig().profile;
	return {
		avatar: cfg.avatar || undefined,
		name: cfg.name,
		bio: cfg.bio,
		links: cfg.socials,
	};
}

/** 许可协议配置 */
export function getLicenseConfig(): LicenseConfig {
	return getSiteMdConfig().license;
}
