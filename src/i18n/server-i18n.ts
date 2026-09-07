// SSR 文案模块:语言每次调用现取(修改 index.md 保存即热生效)。
// 仅服务端可达;岛组件请保持 import @i18n/translation(客户端版)。

import { getSiteConfig } from "@/utils/site-config";
import type I18nKey from "./i18nKey";
import { getTranslation } from "./translation";

export function i18n(key: I18nKey): string {
	return getTranslation(getSiteConfig().lang)[key];
}
