import type { AUTO_MODE, DARK_MODE, LIGHT_MODE } from "@constants/constants";

export type SiteLang =
	| "en"
	| "zh_CN"
	| "zh_TW"
	| "ja"
	| "ko"
	| "es"
	| "th"
	| "vi"
	| "tr"
	| "id";

export type SiteConfig = {
	title: string;
	subtitle: string;

	lang: SiteLang;

	themeColor: {
		hue: number;
		fixed: boolean;
	};
	banner: {
		enable: boolean;
		src: string;
		position?: "top" | "center" | "bottom";
		credit: {
			enable: boolean;
			text: string;
			url?: string;
		};
	};
	toc: {
		enable: boolean;
		depth: 1 | 2 | 3;
	};
	graph: {
		enable: boolean;
		localDepth: 1 | 2 | 3;
		showTags: boolean;
	};

	favicon: Favicon[];
};

export type Favicon = {
	src: string;
	theme?: "light" | "dark";
	sizes?: string;
};

export enum LinkPreset {
	Home = 0,
	Archive = 1,
	About = 2,
}

export type NavBarLink = {
	name: string;
	url: string;
	external?: boolean;
};

export type NavBarConfig = {
	links: (NavBarLink | LinkPreset)[];
	/**
	 * Optional insertion point for the auto-generated knowledge-vault links:
	 * the display name of one entry in `links` (a preset's name is its
	 * resolved i18n label, e.g. "About" under the default English UI) — vault
	 * links are inserted right before that entry. Omitted (or no match, e.g.
	 * under a non-English UI with an English anchor) → vault links are
	 * appended after all configured links.
	 */
	vaultLinksBefore?: string;
};

export type ProfileConfig = {
	avatar?: string;
	name: string;
	bio?: string;
	links: {
		name: string;
		url: string;
		icon: string;
	}[];
};

export type LicenseConfig = {
	enable: boolean;
	name: string;
	url: string;
};

export type LIGHT_DARK_MODE =
	| typeof LIGHT_MODE
	| typeof DARK_MODE
	| typeof AUTO_MODE;

/* ---------- index.md 全量配置(src/utils/site-config.ts 合并产物) ---------- */

/** 首页界面文案(ui 节) */
export type UiTexts = {
	statArticles: string;
	statWords: string;
	statCategories: string;
	statTags: string;
	sectionAll: string;
	sectionCategories: string;
	sectionTags: string;
	sectionRecommend: string;
	searchPlaceholder: string;
	found: string; // 含 {n} 占位
	noResult: string;
	wordUnit: string;
	minuteUnit: string;
};

export type SocialItem = { name: string; icon: string; url: string };
export type RecommendItem = { title: string; url: string };

/** index.md → 校验合并后的规范形态(推荐/文章总览来自正文小节,不进 YAML) */
export type SiteMdConfig = {
	site: { title: string; subtitle: string; lang: SiteLang };
	themeColor: { hue: number; fixed: boolean };
	banner: SiteConfig["banner"];
	toc: SiteConfig["toc"];
	graph: SiteConfig["graph"];
	favicon: Favicon[];
	nav: NavBarConfig; // links 已解析为 (LinkPreset | NavBarLink)[]
	license: LicenseConfig;
	profile: {
		name: string;
		tagline: string;
		bio: string;
		avatar: string; // 空字符串 → 首字母头像
		socials: SocialItem[];
	};
	ui: UiTexts;
	recommend: RecommendItem[];
	overviewOrder: RecommendItem[];
};

export type BlogPostData = {
	body: string;
	title: string;
	published: Date;
	description: string;
	tags: string[];
	draft?: boolean;
	image?: string;
	category?: string;
	prevTitle?: string;
	prevSlug?: string;
	nextTitle?: string;
	nextSlug?: string;
};
