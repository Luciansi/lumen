// 客户端(岛组件)文案模块:语言从 DOM 读取(index.md 经 ConfigCarrier 的
// data-lang 透出),不 import 任何服务端配置模块 —— 否则 gray-matter/yaml
// 会进客户端 bundle。SSR 代码必须改用 @i18n/server-i18n(本文件的 i18n
// 在 SSR 环境直接抛错,漏迁移会响亮失败而不是悄悄用错语言)。

import type I18nKey from "./i18nKey";
import { en } from "./languages/en";
import { es } from "./languages/es";
import { id } from "./languages/id";
import { ja } from "./languages/ja";
import { ko } from "./languages/ko";
import { th } from "./languages/th";
import { tr } from "./languages/tr";
import { vi } from "./languages/vi";
import { zh_CN } from "./languages/zh_CN";
import { zh_TW } from "./languages/zh_TW";

export type Translation = {
	[K in I18nKey]: string;
};

const defaultTranslation = en;

const map: { [key: string]: Translation } = {
	es: es,
	en: en,
	en_us: en,
	en_gb: en,
	en_au: en,
	zh_cn: zh_CN,
	zh_tw: zh_TW,
	ja: ja,
	ja_jp: ja,
	ko: ko,
	ko_kr: ko,
	th: th,
	th_th: th,
	vi: vi,
	vi_vn: vi,
	id: id,
	tr: tr,
	tr_tr: tr,
};

export function getTranslation(lang: string): Translation {
	return map[lang.toLowerCase()] || defaultTranslation;
}

/** 客户端语言:ConfigCarrier data-lang(下划线形式)→ <html lang> → en */
function clientLang(): string {
	if (typeof document === "undefined") return "en";
	const carrier = document.getElementById("config-carrier");
	const lang = carrier?.getAttribute("data-lang");
	if (lang) return lang;
	return (document.documentElement.getAttribute("lang") || "en").replace(
		/-/g,
		"_",
	);
}

export function i18n(key: I18nKey): string {
	if (import.meta.env.SSR) {
		throw new Error(
			"translation.ts 的 i18n() 仅供客户端岛组件使用;SSR 代码请 import @i18n/server-i18n",
		);
	}
	return getTranslation(clientLang())[key];
}
