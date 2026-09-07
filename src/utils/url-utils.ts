// 纯工具模块(SSR 与客户端 bundle 共用),因此不 import 任何服务端配置
// (config/translation):语言相关判断由调用方把「未分类」标签文本传入。

export function pathsEqual(path1: string, path2: string): boolean {
	const normalizedPath1 = path1.replace(/^\/|\/$/g, "").toLowerCase();
	const normalizedPath2 = path2.replace(/^\/|\/$/g, "").toLowerCase();
	return normalizedPath1 === normalizedPath2;
}

function joinUrl(...parts: string[]): string {
	const joined = parts.join("/");
	return joined.replace(/\/+/g, "/");
}

export function getTagUrl(tag: string): string {
	if (!tag) return url("/archive/");
	return url(`/archive/?tag=${encodeURIComponent(tag.trim())}`);
}

/** uncategorizedLabel:当前语言的「未分类」文案(SSR 调用方传入) */
export function getCategoryUrl(
	category: string | null,
	uncategorizedLabel?: string,
): string {
	if (
		!category ||
		category.trim() === "" ||
		(uncategorizedLabel !== undefined &&
			uncategorizedLabel !== "" &&
			category.trim().toLowerCase() === uncategorizedLabel.trim().toLowerCase())
	)
		return url("/archive/?uncategorized=true");
	return url(`/archive/?category=${encodeURIComponent(category.trim())}`);
}

export function url(path: string): string {
	return joinUrl("", import.meta.env.BASE_URL, path);
}
