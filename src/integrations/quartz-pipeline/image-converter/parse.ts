/**
 * Pure parsing helpers for image alignment tokens, ported faithfully from
 * obsidian-image-converter src/ImageAlignmentMarkdown.ts (v1.4.6) — the
 * `splitPipeSections` / `isSizeToken` / `parseTokenTail` / caption-span logic
 * (lines 91-238, 558-586 of the plugin).
 *
 * The plugin scans raw note text; here the input is instead the mdast text
 * region an embed already reduced to:
 *
 *   - wikilink embeds (`![[…]]`) after OFM's conversion: the trailing size has
 *     been consumed into width/height and the remaining alias text (caption +
 *     tokens, pipe-separated) sits in the img's hProperties.alt — the path
 *     section is gone, so every section of the region may be a token;
 *   - markdown-image alt text (`![…](…)`) and bangless link text: the FULL
 *     bracket region, section 0 being the alt slot which is never a token;
 *   - trailing size (`400` / `400x300`) is present only in these raw regions —
 *     never in the wikilink alt (OFM already consumed it).
 *
 * Grammar (mirrors the plugin):
 *  - a section counts as a SIZE token only when it is the LAST section and
 *    (trimmed) matches /^\d+(?:x\d+)?$/;
 *  - the token tail is the contiguous run of trailing sections that each equal
 *    `wrap` or a position word; scanning stops at the first non-token section,
 *    which together with everything before it is caption/alt content;
 *  - position words: left | center | right; wrap word: wrap (no no-wrap word);
 *  - a lone `wrap` (no position) is NOT alignment data, but is still stripped;
 *  - section 0 is reserved (never a token) when firstSectionReserved — the md
 *    alt slot — and free when not (the wikilink region lost its path section).
 *
 * Deviations from the plugin: this module only STRIPS — it never serializes
 * tokens back into note text, never re-escapes table-row pipes (remark has
 * already resolved escapes by the time we run) and never trims the leftover.
 * Leftover is reconstructed verbatim from the region's raw slice, exactly like
 * the plugin's removeImageEmbedAlignment span cutting.
 *
 * Note on duplicate position words: the plugin overwrites `position` while
 * scanning backwards, so the leftmost position word in the tail wins despite
 * the comment in ImageAlignmentMarkdown.ts claiming the rightmost — mirrored
 * here verbatim. Pathological either way: the plugin's own serialization
 * always writes a single position token.
 */

export type ConverterPosition = "left" | "center" | "right";

export const CONVERTER_POSITION_WORDS: ReadonlySet<string> = new Set([
	"left",
	"center",
	"right",
]);
export const CONVERTER_WRAP_WORD = "wrap";

/** Class set applied to the <img>, mirroring the plugin's appliedAlignmentClasses. */
export function imageConverterClassNames(
	position: ConverterPosition,
	wrap: boolean,
): string[] {
	return [
		"image-converter-aligned",
		`image-position-${position}`,
		wrap ? "image-wrap" : "image-no-wrap",
	];
}

export interface ImageConverterTokens {
	/** null = no alignment (a lone `wrap` still leaves wrap=true). */
	position: ConverterPosition | null;
	wrap: boolean;
	/** any position/wrap section was found and must be stripped */
	hadTokens: boolean;
	/** a trailing size section was found and must be stripped */
	hadSize: boolean;
	/** digits, or "auto" (mirroring OFM's value shape) when only a width was given */
	width: string;
	height: string;
	/**
	 * Region text up to (excluding) the delimiter that opens the first token
	 * section — the alt/caption to keep, character-for-character.
	 */
	leftover: string;
}

interface RegionSection {
	text: string;
	start: number;
	end: number;
}

interface RegionDelimiter {
	/** index of the pipe (or of its backslash when escaped) within the region */
	index: number;
}

/** Splits a region into pipe sections, preserving `\|` delimiters (plugin splitPipeSections). */
function splitRegionSections(region: string): {
	sections: RegionSection[];
	delimiters: RegionDelimiter[];
} {
	const sections: RegionSection[] = [];
	const delimiters: RegionDelimiter[] = [];
	let sectionStart = 0;

	for (const delimiterMatch of region.matchAll(/\\?\|/g)) {
		sections.push({
			text: region.slice(sectionStart, delimiterMatch.index),
			start: sectionStart,
			end: delimiterMatch.index,
		});
		delimiters.push({ index: delimiterMatch.index });
		sectionStart = delimiterMatch.index + delimiterMatch[0].length;
	}
	sections.push({
		text: region.slice(sectionStart),
		start: sectionStart,
		end: region.length,
	});

	return { sections, delimiters };
}

function isSizeWord(text: string): boolean {
	const trimmed = text.trim();
	return trimmed !== "" && /^\d+(?:x\d+)?$/.test(trimmed);
}

function parseTokenTail(
	sections: RegionSection[],
	sizeIndex: number | null,
	minTokenIndex: number,
): {
	firstTokenIndex: number;
	position: ConverterPosition | null;
	hasWrap: boolean;
} {
	const tailEnd = sizeIndex !== null ? sizeIndex : sections.length;
	let firstTokenIndex = tailEnd;
	let position: ConverterPosition | null = null;
	let hasWrap = false;

	for (let i = tailEnd - 1; i >= minTokenIndex; i--) {
		const word = sections[i].text.trim();
		if (word === CONVERTER_WRAP_WORD) {
			hasWrap = true;
		} else if (CONVERTER_POSITION_WORDS.has(word)) {
			// overwritten per hit while scanning backwards — see note above
			position = word as ConverterPosition;
		} else {
			break;
		}
		firstTokenIndex = i;
	}

	return { firstTokenIndex, position, hasWrap };
}

/**
 * Parses an embed text region for alignment tokens.
 *
 * @param region - mdast text region to parse (see module docblock).
 * @param firstSectionReserved - true for markdown-image alt / bangless link
 *   text (section 0 is the alt slot); false for the wikilink alt OFM left in
 *   hProperties.alt (its path section is already gone).
 */
export function parseImageConverterTokens(
	region: string,
	firstSectionReserved: boolean,
): ImageConverterTokens {
	const minTokenIndex = firstSectionReserved ? 1 : 0;
	const { sections, delimiters } = splitRegionSections(region);
	const lastIndex = sections.length - 1;

	// The trailing size only counts when the region has room for it: for
	// reserved-first-section regions section 0 is the alt slot even when empty,
	// so a lone "300" alt is not a size (plugin: `![300](p)` has no size);
	// for wikilink regions the path section is implicit, so a lone "300" alias
	// IS a size (plugin: `![[p.webp|300]]`).
	const sizeIndex =
		lastIndex >= 0 &&
		(lastIndex > 0 || !firstSectionReserved) &&
		isSizeWord(sections[lastIndex].text)
			? lastIndex
			: null;

	const tailEnd = sizeIndex !== null ? sizeIndex : sections.length;
	const { firstTokenIndex, position, hasWrap } = parseTokenTail(
		sections,
		sizeIndex,
		minTokenIndex,
	);
	// tokens exist only when the scan actually walked below the tail end
	// (firstTokenIndex is initialized to tailEnd and lowered per hit)
	const hadTokens = firstTokenIndex < tailEnd;
	const hadSize = sizeIndex !== null;

	// leftover = region text up to the delimiter that opens the first removed
	// section — token sections when present, otherwise the size section
	// (the plugin only ever removes tokens and keeps the size, but here the
	// size must ALSO leave the alt region: markdown links carry it verbatim).
	const removedStart =
		hadTokens && hadSize
			? Math.min(firstTokenIndex, sizeIndex)
			: hadTokens
				? firstTokenIndex
				: hadSize
					? sizeIndex
					: null;
	let leftover = region;
	if (removedStart !== null && removedStart < sections.length) {
		const openingDelimiter = delimiters[removedStart - 1];
		leftover = openingDelimiter
			? region.slice(0, openingDelimiter.index)
			: region.slice(0, sections[removedStart].start);
	}

	let width = "";
	let height = "";
	if (hadSize) {
		const sizeWord = sections[sizeIndex].text.trim();
		const xBreak = sizeWord.indexOf("x");
		if (xBreak === -1) {
			width = sizeWord;
			height = "auto";
		} else {
			width = sizeWord.slice(0, xBreak);
			height = sizeWord.slice(xBreak + 1);
		}
	}

	return {
		position,
		wrap: hasWrap,
		hadTokens,
		hadSize,
		width,
		height,
		leftover,
	};
}
