/** Loose declaration for the hand-written remark plugin (plain JS module,
 * allowJs: false). Writes an excerpt into vfile.data.astro.frontmatter. */
export function remarkExcerpt(): (
	tree: unknown,
	file: { data: { astro?: { frontmatter?: Record<string, unknown> } } },
) => void;
