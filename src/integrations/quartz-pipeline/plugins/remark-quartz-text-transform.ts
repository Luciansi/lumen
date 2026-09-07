/**
 * Applies a raw-text transformation (quartz's `textTransform` stage, e.g.
 * OFM's callout "> " fix-up) before parsing, by wrapping the unified parser.
 * Astro applies plugins via `.use()` and never freezes the processor, so
 * replacing `this.parser` inside the attacher is safe — the wrapped parser
 * is then used for every subsequent parse of the shared processor.
 *
 * Used as a tuple plugin: `[quartzTextTransform, transformFn]` — unified calls
 * this function with `this` = processor and the options as parameters, so the
 * function itself is the attacher.
 */
export function quartzTextTransform(
	this: { parser: (doc: string) => unknown },
	transformFn: (src: string) => string,
): void {
	const parser = this.parser;
	this.parser = function (doc: string) {
		return parser.call(this, transformFn(String(doc)));
	};
}
