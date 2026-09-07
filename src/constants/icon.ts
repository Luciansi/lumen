import type { Favicon } from "@/types/config.ts";

// 内置默认 favicon:public/favicon/ 下的明暗双 SVG
// (浏览器按 prefers-color-scheme 自动二选一)。需要自定义图标时,
// 在 src/content/index.md 的 favicon 节覆盖即可。
export const defaultFavicons: Favicon[] = [
	{
		src: "/favicon/favicon-light.svg",
		theme: "light",
	},
	{
		src: "/favicon/favicon-dark.svg",
		theme: "dark",
	},
];
