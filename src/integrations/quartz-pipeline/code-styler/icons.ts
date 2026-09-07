/**
 * Language icon/display-name helpers. The generated languages.ts module is
 * keyed by display name ("C++", "Python"); LANGUAGE_NAMES maps shiki code
 * aliases to display names — the plugin's lookup order (languageIcons →
 * getLanguageTag → LANGUAGES) preserved.
 *
 * Server-side only: icons are embedded as data: URIs so no raw SVG fragments
 * ever reach the client bundle.
 */
import { LANGUAGE_NAMES, LANGUAGES, type LanguageIcon } from "./languages.ts";

/** Plugin's getLanguageTag: display name or capitalized code. */
export function displayLanguageName(language: string): string {
	return (
		LANGUAGE_NAMES[language] ??
		(language.charAt(0).toUpperCase() + language.slice(1) || "")
	);
}

/** Plugin's getLanguageIcon: icon entry for a code-language, or undefined. */
export function getLanguageIcon(language: string): LanguageIcon | undefined {
	return LANGUAGES[displayLanguageName(language)];
}

/** Wrap a raw icon fragment in the 32x32 svg the fragments were authored for. */
export function wrapIconSvg(fragment: string): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 32 32" aria-hidden="true">${fragment}</svg>`;
}

export function iconDataUri(svg: string): string {
	return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
