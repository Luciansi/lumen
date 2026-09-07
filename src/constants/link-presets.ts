import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/server-i18n";
import { LinkPreset, type NavBarLink } from "@/types/config";

// 函数而非模块级 const:预设文案随界面语言(lang 现取),保证改 index.md
// 保存即生效,且 Navbar 每次渲染拿到当前语言的预设。
export function getLinkPresets(): { [key in LinkPreset]: NavBarLink } {
	return {
		[LinkPreset.Home]: {
			name: i18n(I18nKey.home),
			url: "/",
		},
		[LinkPreset.About]: {
			name: i18n(I18nKey.about),
			url: "/about/",
		},
		[LinkPreset.Archive]: {
			name: i18n(I18nKey.archive),
			url: "/archive/",
		},
	};
}
