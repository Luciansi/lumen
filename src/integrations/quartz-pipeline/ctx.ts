/**
 * Minimal BuildCtx shim for the @quartz-community transformer packages.
 * Verified against the dist bundles: of the full Quartz BuildCtx, only
 * `allSlugs` (mutable array; note-properties pushes aliases into it) and
 * `argv.directory` (created-modified-date's git date source) are read.
 */
export interface QuartzCtx {
	allSlugs: string[];
	argv: {
		directory: string;
	};
}

export function createQuartzCtx(opts: {
	directory: string;
	allSlugs?: string[];
}): QuartzCtx {
	return {
		allSlugs: opts.allSlugs ? [...opts.allSlugs] : [],
		argv: { directory: opts.directory },
	};
}
