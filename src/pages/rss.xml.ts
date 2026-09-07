import rss from "@astrojs/rss";
import { getFeedEntries } from "@utils/content-utils";
import type { APIContext } from "astro";
import MarkdownIt from "markdown-it";
import sanitizeHtml from "sanitize-html";
import { getSiteConfig } from "@/utils/site-config";

const parser = new MarkdownIt();

function stripInvalidXmlChars(str: string): string {
	// XML 1.0 非法字符:控制区(00–08、0B、0C、0E–1F)、7F–9F、
	// 私有代理区边界 FDD0–FDEF 与非字符 FFFE/FFFF(按码点判断,不引入转义字符)
	let out = "";
	for (const ch of str) {
		// for..of 迭代的字符必有码点;兜底 -1 恒为合法字符
		const c = ch.codePointAt(0) ?? -1;
		const invalid =
			(c >= 0x00 && c <= 0x08) ||
			c === 0x0b ||
			c === 0x0c ||
			(c >= 0x0e && c <= 0x1f) ||
			(c >= 0x7f && c <= 0x9f) ||
			(c >= 0xfdd0 && c <= 0xfdef) ||
			c === 0xfffe ||
			c === 0xffff;
		if (!invalid) out += ch;
	}
	return out;
}

/**
 * Obsidian 链接/嵌入的轻量降级:正文经 markdown-it 渲染前把
 * `[[note|label]]` / `![[embed|alt]]` 折叠为可读文本,避免 RSS 里出现裸语法。
 */
function softenObsidianLinks(str: string): string {
	return str.replace(
		/!?\[\[([^\]|#]+?)(?:#[^\]|]*)?(?:\|([^\]]*?))?\]\]/g,
		(_m, target: string, label: string) =>
			(label ?? "").trim() || target.trim(),
	);
}

export async function GET(context: APIContext): Promise<Response> {
	const siteConfig = getSiteConfig();
	const feed = await getFeedEntries();

	return rss({
		title: siteConfig.title,
		description: siteConfig.subtitle || "No description",
		site: context.site ?? "http://localhost:4321",
		items: feed.map((item) => {
			const content = stripInvalidXmlChars(
				softenObsidianLinks(item.body || ""),
			);
			return {
				title: item.title,
				pubDate: item.published,
				description: item.description || "",
				link: item.url,
				content: sanitizeHtml(parser.render(content), {
					allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img"]),
				}),
			};
		}),
		customData: `<language>${siteConfig.lang}</language>`,
	});
}
