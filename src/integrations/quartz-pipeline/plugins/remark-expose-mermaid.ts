/**
 * Copies the mermaid flag set by OFM into Astro's frontmatter channel so
 * pages can gate mermaid-related logic (remarkPluginFrontmatter).
 */
export function remarkExposeMermaid() {
	return (_tree: unknown, file: { data: any }): void => {
		if (file.data.hasMermaidDiagram) {
			file.data.astro.frontmatter.hasMermaidDiagram = true;
		}
	};
}
