/** Loose declaration for the hand-written remark plugin (plain JS module,
 * allowJs: false). Converts parsed :::directive nodes for rehype consumption. */
export function parseDirectiveNode(): (tree: unknown) => void;
