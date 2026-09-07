/**
 * Client-side interactions for the quartz pipeline, vendored and adapted from:
 *  - @quartz-community/obsidian-flavored-markdown (callout fold, checkbox, mermaid)
 *  - @quartz-community/syntax-highlighting (clipboard)
 *
 * Adaptations for fuwari:
 *  - quartz's "nav"/"render" SPA events → DOMContentLoaded + astro:page-load
 *    (@swup/astro dispatches it after each content swap; swup v4 no longer
 *    emits v3's swup:contentReplaced DOM event and script bundles are not
 *    re-executed per view)
 *  - window.addCleanup → DOM-scoped guards (swup replaces content nodes)
 *  - checkbox storage key: body[data-slug] → location.pathname
 *  - mermaid theme detection: saved-theme attribute → .dark class + MutationObserver
 *  - mermaid scope: .center → whole document
 */

if (typeof document === "undefined") {
	// SSR: this module is imported by Layout.astro and also evaluated
	// server-side — skip everything when there is no DOM.
} else if (!window.__quartzInteractionsInstalled) {
	window.__quartzInteractionsInstalled = true;

	// ---- callout folding (OFM callout_inline) ----

	function calloutFoldInit() {
		for (const callout of document.querySelectorAll(
			".callout.is-collapsible",
		)) {
			if (callout.dataset.qBound) continue;
			callout.dataset.qBound = "1";
			const title = callout.querySelector(":scope > .callout-title");
			const content = callout.querySelector(":scope > .callout-content");
			if (!title || !content) continue;
			const collapsed = callout.classList.contains("is-collapsed");
			content.style.gridTemplateRows = collapsed ? "0fr" : "1fr";
			title.addEventListener("click", () => {
				callout.classList.toggle("is-collapsed");
				content.style.gridTemplateRows = callout.classList.contains(
					"is-collapsed",
				)
					? "0fr"
					: "1fr";
			});
		}
	}

	// ---- task checkbox persistence (OFM checkbox_inline) ----

	function checkboxInit() {
		document
			.querySelectorAll("input.checkbox-toggle")
			.forEach((input, index) => {
				if (input.dataset.qBound) return;
				input.dataset.qBound = "1";
				const key = `${location.pathname}-checkbox-${index}`;
				input.addEventListener("change", (e) => {
					localStorage.setItem(key, e.target?.checked ? "true" : "false");
				});
				if (localStorage.getItem(key) === "true") input.checked = true;
			});
	}

	// ---- code copy (syntax-highlighting clipboard_inline) ----

	const CLIPBOARD_COPY_SVG =
		'<svg aria-hidden="true" height="16" viewBox="0 0 16 16" version="1.1" width="16"><path fill-rule="evenodd" d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 010 1.5h-1.5a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-1.5a.75.75 0 011.5 0v1.5A1.75 1.75 0 019.25 16h-7.5A1.75 1.75 0 010 14.25v-7.5z"></path><path fill-rule="evenodd" d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0114.25 11h-7.5A1.75 1.75 0 015 9.25v-7.5zm1.75-.25a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-7.5a.25.25 0 00-.25-.25h-7.5z"></path></svg>';
	const CLIPBOARD_SUCCESS_SVG =
		'<svg aria-hidden="true" height="16" viewBox="0 0 16 16" version="1.1" width="16"><path fill-rule="evenodd" fill="rgb(63, 185, 80)" d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"></path></svg>';

	function clipboardInit() {
		for (const pre of document.querySelectorAll("pre")) {
			if (pre.dataset.qClip) continue; // placed (possibly into the header)
			if (pre.querySelector(":scope > .clipboard-button")) continue;
			const code = pre.querySelector("code");
			if (!code) continue;
			// code-styler decorated blocks: copy from the row text (code.innerText
			// would include the gutter line numbers)
			const decorated =
				pre.classList.contains("code-styler-standalone") ||
				Boolean(pre.closest("figure.code-styler-decorated"));
			let text;
			if (decorated) {
				text = Array.from(
					pre.querySelectorAll(":scope > code .code-styler-line-text"),
					(el) => el.innerText,
				).join("\n");
			} else {
				text = code.dataset.clipboard
					? JSON.parse(code.dataset.clipboard)
					: code.innerText;
			}
			text = String(text).replace(/\n\n/g, "\n");
			const button = document.createElement("button");
			button.className = "clipboard-button";
			button.type = "button";
			button.innerHTML = CLIPBOARD_COPY_SVG;
			button.setAttribute("aria-label", "Copy source");
			button.addEventListener("click", (event) => {
				event.stopPropagation(); // never trigger the header fold toggle
				navigator.clipboard.writeText(text).then(
					() => {
						button.blur();
						button.innerHTML = CLIPBOARD_SUCCESS_SVG;
						setTimeout(() => {
							button.innerHTML = CLIPBOARD_COPY_SVG;
							button.style.borderColor = "";
						}, 2000);
					},
					(err) => console.error(err),
				);
			});
			// decorated blocks with a header: the button lives in the header bar
			// (top-right of the figure is occupied); otherwise today's behavior.
			const header = decorated
				? (pre.querySelector(":scope > .code-styler-header-container") ??
					pre
						.closest("figure.code-styler-decorated")
						?.querySelector(":scope > .code-styler-header-container") ??
					null)
				: null;
			if (header) header.append(button);
			else pre.prepend(button);
			pre.dataset.qClip = "1";
		}
	}

	// ---- code-styler fold (header click toggles pre.code-styler-folded) ----

	function toggleCodeStylerFold(pre) {
		const code = pre.querySelector(":scope > code");
		if (!code) return;
		const folded = pre.classList.contains("code-styler-folded");
		if (folded) {
			code.style.maxHeight = `${code.scrollHeight}px`;
			void code.offsetHeight; // force reflow so the transition starts from the real height
			pre.classList.remove("code-styler-folded");
		} else {
			code.style.maxHeight = `${code.scrollHeight}px`;
			void code.offsetHeight;
			pre.classList.add("code-styler-folded");
		}
		window.setTimeout(() => {
			code.style.maxHeight = "";
		}, 260);
	}

	function codeStylerFoldInit() {
		for (const header of document.querySelectorAll(
			".code-styler-header-container",
		)) {
			if (header.dataset.qBound) continue;
			header.dataset.qBound = "1";
			const figure = header.closest("figure.code-styler-decorated");
			const pre = figure
				? figure.querySelector("pre.code-styler-pre")
				: header.parentElement;
			if (!pre?.classList.contains("code-styler-pre")) continue;
			if (pre.dataset.qFoldBound) continue;
			pre.dataset.qFoldBound = "1";
			header.addEventListener("click", (event) => {
				if (
					event.target instanceof Element &&
					event.target.closest("a, button")
				)
					return;
				toggleCodeStylerFold(pre);
			});
		}
	}

	// ---- mermaid (OFM mermaid_inline) ----

	const MERMAID_THEME_VARS = [
		"--primary",
		"--card-bg",
		"--page-bg",
		"--btn-content",
		"--line-divider",
		"--codeblock-bg",
	];
	let mermaidModule;

	class MermaidOverlay {
		constructor(container, content) {
			this.container = container;
			this.content = content;
			this.isDragging = false;
			this.startPan = { x: 0, y: 0 };
			this.currentPan = { x: 0, y: 0 };
			this.scale = 1;
			this.MIN_SCALE = 0.5;
			this.MAX_SCALE = 3;
			this.cleanups = [];
			this.setupEventListeners();
			this.setupNavigationControls();
			this.resetTransform();
		}
		setupEventListeners() {
			const onMouseDown = this.onMouseDown.bind(this);
			const onMouseMove = this.onMouseMove.bind(this);
			const onMouseUp = this.onMouseUp.bind(this);
			const onTouchStart = this.onTouchStart.bind(this);
			const onTouchMove = this.onTouchMove.bind(this);
			const onTouchEnd = this.onTouchEnd.bind(this);
			const onResize = this.resetTransform.bind(this);
			this.container.addEventListener("mousedown", onMouseDown);
			document.addEventListener("mousemove", onMouseMove);
			document.addEventListener("mouseup", onMouseUp);
			this.container.addEventListener("touchstart", onTouchStart, {
				passive: false,
			});
			document.addEventListener("touchmove", onTouchMove, { passive: false });
			document.addEventListener("touchend", onTouchEnd);
			window.addEventListener("resize", onResize);
			this.cleanups.push(
				() => this.container.removeEventListener("mousedown", onMouseDown),
				() => document.removeEventListener("mousemove", onMouseMove),
				() => document.removeEventListener("mouseup", onMouseUp),
				() => this.container.removeEventListener("touchstart", onTouchStart),
				() => document.removeEventListener("touchmove", onTouchMove),
				() => document.removeEventListener("touchend", onTouchEnd),
				() => window.removeEventListener("resize", onResize),
			);
		}
		cleanup() {
			for (const fn of this.cleanups) fn();
		}
		setupNavigationControls() {
			const controls = document.createElement("div");
			controls.className = "mermaid-controls";
			const zoomIn = this.createButton("+", () => this.zoom(0.1));
			const zoomOut = this.createButton("-", () => this.zoom(-0.1));
			const reset = this.createButton("Reset", () => this.resetTransform());
			controls.appendChild(zoomOut);
			controls.appendChild(reset);
			controls.appendChild(zoomIn);
			this.container.appendChild(controls);
		}
		createButton(text, onClick) {
			const button = document.createElement("button");
			button.textContent = text;
			button.className = "mermaid-control-button";
			button.addEventListener("click", onClick);
			return button;
		}
		onMouseDown(e) {
			if (e.button === 0) {
				this.isDragging = true;
				this.startPan = {
					x: e.clientX - this.currentPan.x,
					y: e.clientY - this.currentPan.y,
				};
				this.container.style.cursor = "grabbing";
			}
		}
		onMouseMove(e) {
			if (this.isDragging) {
				e.preventDefault();
				this.currentPan = {
					x: e.clientX - this.startPan.x,
					y: e.clientY - this.startPan.y,
				};
				this.updateTransform();
			}
		}
		onMouseUp() {
			this.isDragging = false;
			this.container.style.cursor = "grab";
		}
		onTouchStart(e) {
			if (e.touches.length !== 1) return;
			this.isDragging = true;
			const t = e.touches[0];
			this.startPan = {
				x: t.clientX - this.currentPan.x,
				y: t.clientY - this.currentPan.y,
			};
		}
		onTouchMove(e) {
			if (!this.isDragging || e.touches.length !== 1) return;
			e.preventDefault();
			const t = e.touches[0];
			this.currentPan = {
				x: t.clientX - this.startPan.x,
				y: t.clientY - this.startPan.y,
			};
			this.updateTransform();
		}
		onTouchEnd() {
			this.isDragging = false;
		}
		zoom(delta) {
			const scale = Math.min(
				Math.max(this.scale + delta, this.MIN_SCALE),
				this.MAX_SCALE,
			);
			const rect = this.content.getBoundingClientRect();
			const cx = rect.width / 2;
			const cy = rect.height / 2;
			const change = scale - this.scale;
			this.currentPan.x -= cx * change;
			this.currentPan.y -= cy * change;
			this.scale = scale;
			this.updateTransform();
		}
		updateTransform() {
			this.content.style.transform = `translate(${this.currentPan.x}px, ${this.currentPan.y}px) scale(${this.scale})`;
		}
		resetTransform() {
			const svg = this.content.querySelector("svg");
			if (!svg) return;
			const rect = svg.getBoundingClientRect();
			const w = rect.width / this.scale;
			const h = rect.height / this.scale;
			this.scale = 1;
			this.currentPan = {
				x: (this.container.clientWidth - w) / 2,
				y: (this.container.clientHeight - h) / 2,
			};
			this.updateTransform();
		}
	}

	function closeOverlay(overlayEl, handler) {
		function onClick(e) {
			if (e.target !== overlayEl) return;
			e.preventDefault();
			e.stopPropagation();
			handler();
		}
		function onKeydown(e) {
			if (e.key.startsWith("Esc")) {
				e.preventDefault();
				handler();
			}
		}
		overlayEl.addEventListener("click", onClick);
		document.addEventListener("keydown", onKeydown);
		return [onClick, onKeydown];
	}

	const mermaidSourceCache = new WeakMap();
	let mermaidOverlayCleanup = [];

	// fuwari theme colors are oklch()/translucent values that mermaid's color
	// parser rejects — resolve any CSS color to a #rrggbb hex via a 1px canvas
	// readback (same technique as graph-client.js). Translucent colors are
	// composited over the page background first so they don't collapse to solid.
	function cssColorToHex(value, backdrop) {
		try {
			const canvas = document.createElement("canvas");
			canvas.width = 1;
			canvas.height = 1;
			const ctx = canvas.getContext("2d");
			if (!ctx) return value;
			ctx.fillStyle = backdrop;
			ctx.fillRect(0, 0, 1, 1);
			ctx.fillStyle = value;
			ctx.fillRect(0, 0, 1, 1);
			const px = ctx.getImageData(0, 0, 1, 1).data;
			if (px[3] === 0) return value;
			return (
				"#" +
				[px[0], px[1], px[2]]
					.map((v) => v.toString(16).padStart(2, "0"))
					.join("")
			);
		} catch {
			return value; // not parseable as a color — keep mermaid's default path
		}
	}

	async function mermaidInit() {
		const codeEls = document.querySelectorAll("code.mermaid");
		if (codeEls.length === 0) return;
		if (!mermaidModule) {
			mermaidModule = await import(
				"https://cdnjs.cloudflare.com/ajax/libs/mermaid/11.4.0/mermaid.esm.min.mjs"
			);
		}
		const mermaid = mermaidModule.default;

		for (const codeEl of codeEls) {
			if (!mermaidSourceCache.has(codeEl))
				mermaidSourceCache.set(codeEl, codeEl.innerText);
		}

		async function renderAll() {
			for (const codeEl of codeEls) {
				codeEl.removeAttribute("data-processed");
				const src = mermaidSourceCache.get(codeEl);
				if (src) codeEl.innerHTML = src;
			}
			const vars = {};
			const isDark = document.documentElement.classList.contains("dark");
			const backdrop = isDark ? "#1b1b1f" : "#ffffff";
			for (const name of MERMAID_THEME_VARS) {
				vars[name] = cssColorToHex(
					getComputedStyle(document.documentElement)
						.getPropertyValue(name)
						.trim(),
					backdrop,
				);
			}
			mermaid.initialize({
				startOnLoad: false,
				securityLevel: "loose",
				theme: isDark ? "dark" : "base",
				themeVariables: {
					fontFamily: "'JetBrains Mono Variable', ui-monospace, monospace",
					primaryColor: vars["--card-bg"],
					primaryTextColor: vars["--btn-content"],
					primaryBorderColor: vars["--line-divider"],
					lineColor: vars["--btn-content"],
					secondaryColor: vars["--primary"],
					tertiaryColor: vars["--primary"],
					clusterBkg: vars["--page-bg"],
					edgeLabelBackground: vars["--card-bg"],
				},
			});
			// per-diagram render with individual error handling: mermaid.run's
			// batch mode rejects the whole list on one diagram's internal bug
			// (e.g. "Cannot read properties of null (reading 'firstChild')")
			// even after every svg was produced — isolate each render instead
			let renderSeq = 0;
			for (const codeEl of codeEls) {
				const src = mermaidSourceCache.get(codeEl);
				if (!src) continue;
				try {
					const { svg } = await mermaid.render(
						`mermaid-${codeEl.dataset.slug ?? "doc"}-${Date.now()}-${renderSeq++}`,
						src,
					);
					codeEl.innerHTML = svg;
					codeEl.setAttribute("data-processed", "");
				} catch (err) {
					console.warn("[mermaid] diagram render failed:", err);
				}
			}
		}

		await renderAll();

		// expand-to-overlay wiring
		for (const cleanup of mermaidOverlayCleanup) cleanup();
		mermaidOverlayCleanup = [];
		for (const codeEl of codeEls) {
			const pre = codeEl.parentElement;
			const expandButton = pre.querySelector(":scope > .expand-button");
			const overlay = pre.querySelector(":scope > #mermaid-container");
			if (!expandButton || !overlay) continue;
			const clipboardButton = pre.querySelector(":scope > .clipboard-button");
			if (clipboardButton) {
				const style = getComputedStyle(clipboardButton);
				const offset =
					clipboardButton.offsetWidth +
					Number.parseFloat(style.marginLeft || "0") +
					Number.parseFloat(style.marginRight || "0");
				expandButton.style.right = `calc(${offset}px + 0.3rem)`;
			}
			pre.prepend(expandButton);
			let handler = null;
			const onExpand = () => {
				const space = overlay.querySelector("#mermaid-space");
				const content = overlay.querySelector(".mermaid-content");
				if (!space || !content) return;
				while (content.firstChild) content.removeChild(content.firstChild);
				const svg = codeEl.querySelector("svg");
				if (svg) content.appendChild(svg.cloneNode(true));
				overlay.classList.add("active");
				space.style.cursor = "grab";
				handler = new MermaidOverlay(space, content);
			};
			const onClose = () => {
				overlay.classList.remove("active");
				if (handler) {
					handler.cleanup();
					handler = null;
				}
			};
			expandButton.addEventListener("click", onExpand);
			const [overlayClick, overlayKey] = closeOverlay(overlay, onClose);
			mermaidOverlayCleanup.push(() => {
				expandButton.removeEventListener("click", onExpand);
				overlay.removeEventListener("click", overlayClick);
				document.removeEventListener("keydown", overlayKey);
				onClose();
			});
		}

		// re-render on theme change (html.dark toggling)
		if (!window.__quartzThemeObserver) {
			window.__quartzThemeObserver = new MutationObserver(() => {
				mermaidInit();
			});
			window.__quartzThemeObserver.observe(document.documentElement, {
				attributes: true,
				attributeFilter: ["class"],
			});
		}
	}

	// ---- bootstrap ----

	function initAll() {
		calloutFoldInit();
		checkboxInit();
		clipboardInit();
		codeStylerFoldInit();
		mermaidInit();
	}

	document.addEventListener("DOMContentLoaded", initAll);
	// @swup/astro emulates the Astro load lifecycle with DOM events after each
	// content swap — this is the module's re-init trigger (mermaid renders the
	// diagrams the new page's HTML brought in, clipboard buttons get placed, …)
	document.addEventListener("astro:page-load", initAll);
	initAll();
}
