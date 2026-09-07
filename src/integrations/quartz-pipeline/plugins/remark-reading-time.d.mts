/** Loose declaration for the hand-written remark plugin (plain JS module,
 * allowJs: false). Writes reading-time into vfile.data.astro.frontmatter. */
export function remarkReadingTime(): (
	tree: unknown,
	file: { data: { astro?: { frontmatter?: Record<string, unknown> } } },
) => void;
