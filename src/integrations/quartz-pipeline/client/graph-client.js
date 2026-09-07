/**
 * Knowledge-graph view client — ported & adapted from
 * @quartz-community/graph v0.1.0 (its bundled graph.inline.ts) for fuwari.
 *
 * Engine parity: d3@7 + pixi.js@8 lazy-loaded from CDN on first use; same
 * force simulation (charge -100*repelForce / center / link / collide radius
 * 2+sqrt(degree), iterations 3 / optional radial), same rAF draw loop, zoom
 * [0.25, 4], drag with <500ms click → navigation, hover neighbor highlight
 * + label reveal, localStorage visited tracking, local graph BFS (depth from
 * data-cfg) plus a fullscreen "global graph" modal (Ctrl/Cmd+G / Esc /
 * expand icon / click outside).
 *
 * Fuwaari adaptations (see the same section in quartz-interactions.js):
 *  - quartz SPA events (prenav/nav/render/themechange) → swup:contentReplaced
 *    + a MutationObserver on the html `.dark` class
 *  - data source: fetch("/linkgraph.json", site-wide across every knowledge
 *    vault) — canonical ids are pathname-without-slashes, so no quartz-style
 *    slug normalization needed
 *  - quartz theme CSS vars (--secondary/--tertiary/--gray/--lightgray/--dark/
 *    --light/--bodyFont) → fuwari tokens (--graph-*); oklch colors cannot be
 *    parsed by Pixi, so every token is resolved to #rrggbb via a 1px canvas
 *    readback (the mermaid bridge feeds oklch through and fails on it)
 *  - label font: body font stack + explicit CJK fallbacks (Chinese notes)
 *  - click navigation appends a trailing slash (fuwari page URLs)
 *  - idempotent: swup's reloadScripts re-executes this module per page view
 */

const D3_URL = "https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js";
const PIXI_URL = "https://cdn.jsdelivr.net/npm/pixi.js@8/dist/pixi.js";
const DATA_URL = "/linkgraph.json";
const VISITED_KEY = "graph-visited";
const FONT_STACK =
	'"Roboto", "Segoe UI", sans-serif, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", "Helvetica Neue"';

// ---- color bridge: CSS custom property -> #rrggbb (canvas readback) ----

function canvasHex(color, fallback) {
	try {
		const canvas = document.createElement("canvas");
		canvas.width = 1;
		canvas.height = 1;
		const ctx = canvas.getContext("2d");
		if (!ctx) return fallback;
		ctx.fillStyle = color;
		ctx.fillRect(0, 0, 1, 1);
		const px = ctx.getImageData(0, 0, 1, 1).data;
		if (px[3] === 0) return fallback;
		return (
			"#" +
			[px[0], px[1], px[2]].map((v) => v.toString(16).padStart(2, "0")).join("")
		);
	} catch {
		return fallback;
	}
}

function readGraphColors() {
	const cs = getComputedStyle(document.documentElement);
	const read = (prop, fallback) => {
		const value = cs.getPropertyValue(prop).trim();
		return value ? canvasHex(value, fallback) : fallback;
	};
	return {
		current: read("--graph-current", "#4ea1ff"),
		visited: read("--graph-visited", "#7bd88f"),
		node: read("--graph-node", "#9aa0a6"),
		edge: read("--graph-edge", "rgba(0,0,0,0.18)"),
		label: read("--graph-label", "#1f2328"),
		tagFill: read("--graph-tag-fill", "#f2f2f2"),
	};
}

// ---- libs (deduped CDN injection, mirrors quartz) ----

let libsPromise = null;
let libsReady = false;

function loadScript(src) {
	if (document.querySelector(`script[src="${src}"]`)) return Promise.resolve();
	return new Promise((resolve, reject) => {
		const el = document.createElement("script");
		el.src = src;
		el.crossOrigin = "anonymous";
		el.onload = resolve;
		el.onerror = () => reject(new Error(`failed to load ${src}`));
		document.head.appendChild(el);
	});
}

function ensureLibs() {
	if (!libsPromise) {
		libsPromise = Promise.all([loadScript(D3_URL), loadScript(PIXI_URL)])
			.then(() => {
				libsReady = !!window.d3 && !!window.PIXI;
				if (!libsReady) throw new Error("d3/PIXI globals missing after load");
			})
			.catch((err) => {
				libsPromise = null; // allow retry on next call
				throw err;
			});
	}
	return libsPromise;
}

function showLibError(container) {
	container.textContent =
		"Graph could not load. Check your network connection.";
	container.className = "graph-container graph-error";
}

// ---- helpers ----

function currentSlug() {
	// location.pathname keeps non-ASCII ids percent-encoded (e.g. a Chinese
	// title -> "%E6%95%B0%E6%8D%AE"), while graph node ids are the decoded
	// form; decode so the BFS start node and visited keys match
	let path = window.location.pathname;
	try {
		path = decodeURIComponent(path);
	} catch {
		/* malformed escape — keep the raw path */
	}
	if (path.endsWith("/")) path = path.slice(0, -1);
	if (path.startsWith("/")) path = path.slice(1);
	return path;
}

function visitedSet() {
	try {
		return new Set(JSON.parse(localStorage.getItem(VISITED_KEY) || "[]"));
	} catch {
		return new Set();
	}
}

function markVisited(slug) {
	try {
		const set = visitedSet();
		set.add(slug);
		localStorage.setItem(VISITED_KEY, JSON.stringify(Array.from(set)));
	} catch {
		/* private mode etc. */
	}
}

function nodeHref(id) {
	if (id.startsWith("tags/")) {
		return `/archive/?tag=${encodeURIComponent(id.slice("tags/".length))}`;
	}
	return `/${id}/`;
}

function nodeRadius(edges, node) {
	let degree = 0;
	for (const edge of edges) {
		if (edge.source.id === node.id || edge.target.id === node.id) degree++;
	}
	return 2 + Math.sqrt(degree);
}

// ---- state ----

let localCleanups = [];
let modalCleanups = [];
let renderId = 0;
let modalOpen = false;
let dataPromise = null;

function fetchData() {
	if (!dataPromise) {
		dataPromise = fetch(DATA_URL).then((r) => {
			if (!r.ok) throw new Error(`linkgraph fetch ${r.status}`);
			return r.json();
		});
	}
	return dataPromise;
}

function disposeAll() {
	for (const fn of localCleanups) fn();
	localCleanups = [];
	for (const fn of modalCleanups) fn();
	modalCleanups = [];
}

// ---- one graph render (container + current slug); returns a cleanup ----

async function renderGraph(container, slug, rid) {
	container.replaceChildren();
	if (rid !== undefined && rid !== renderId) {
		return () => {};
	}
	const cfg = JSON.parse(container.dataset.cfg || "{}");
	const drag = cfg.drag;
	const zoom = cfg.zoom;
	const depth = cfg.depth;
	const scale = cfg.scale || 1;
	const repelForce = cfg.repelForce || 0.5;
	const centerForce = cfg.centerForce || 0.3;
	const linkDistance = cfg.linkDistance || 30;
	const fontSize = cfg.fontSize || 0.6;
	const opacityScale = cfg.opacityScale || 1;
	const removeTags = cfg.removeTags || [];
	const showTags = cfg.showTags;
	const focusOnHover = cfg.focusOnHover;
	const enableRadial = cfg.enableRadial;
	const page = slug === "" ? "index" : slug;

	// graph data
	let index;
	try {
		const raw = await fetchData();
		index = new Map(Object.entries(raw));
	} catch (err) {
		console.error("[Graph] Error loading data:", err);
		return () => {};
	}
	if (rid !== undefined && rid !== renderId) return () => {};

	const width = container.offsetWidth;
	// square containers size themselves via CSS aspect-ratio; 250 only as a
	// last-resort floor when the container reports no height yet
	const height = container.offsetHeight || 250;

	// directed page links become undirected edges (keep endpoints present)
	const edges = [];
	const tagNodes = [];
	const nodeIds = new Set(index.keys());
	for (const [id, entry] of index) {
		for (const target of entry.links || []) {
			if (nodeIds.has(target)) edges.push({ source: id, target });
		}
		if (showTags) {
			for (const tag of entry.tags || []) {
				if (removeTags.includes(tag)) continue;
				const tagId = `tags/${tag}`;
				if (!tagNodes.includes(tagId)) tagNodes.push(tagId);
				edges.push({ source: id, target: tagId });
			}
		}
	}

	// BFS subset (local) or everything (global)
	const keep = new Set();
	if (depth >= 0) {
		// index.md pages never become nodes (see graph-data.ts) — when the
		// current page is one of them the local graph has no center, so render
		// nothing instead of a phantom lone node.
		const frontier = index.has(page) ? [page] : [];
		const seen = new Set([page]);
		for (let level = 0; level <= depth && frontier.length > 0; level++) {
			const next = [];
			for (const id of frontier) {
				keep.add(id);
				for (const edge of edges) {
					if (edge.source === id && !seen.has(edge.target)) {
						seen.add(edge.target);
						next.push(edge.target);
					}
					if (edge.target === id && !seen.has(edge.source)) {
						seen.add(edge.source);
						next.push(edge.source);
					}
				}
			}
			frontier.length = 0;
			frontier.push(...next);
		}
	} else {
		for (const id of index.keys()) keep.add(id);
		for (const tagId of tagNodes) keep.add(tagId);
	}

	const nodes = [];
	const nodeById = new Map();
	for (const id of keep) {
		const isTag = id.startsWith("tags/");
		const text = isTag ? `#${id.slice(5)}` : index.get(id)?.title || id;
		const tags = isTag ? [] : index.get(id)?.tags || [];
		const node = {
			id,
			text,
			tags,
			x: Math.random() * width - width / 2,
			y: Math.random() * height - height / 2,
			vx: 0,
			vy: 0,
		};
		nodes.push(node);
		nodeById.set(id, node);
	}

	const subEdges = [];
	for (const edge of edges) {
		if (keep.has(edge.source) && keep.has(edge.target)) {
			const source = nodeById.get(edge.source);
			const target = nodeById.get(edge.target);
			if (source && target) subEdges.push({ source, target });
		}
	}

	// theme colors (re-resolved per render so dark-mode re-renders pick them up)
	const colors = readGraphColors();
	const fontStack = getComputedStyle(document.body).fontFamily || FONT_STACK;
	const labelFont =
		fontStack === "inherit" || !fontStack
			? FONT_STACK
			: fontStack.includes("PingFang")
				? fontStack
				: `${fontStack}, ${FONT_STACK.split(", ").slice(1).join(", ")}`;

	const d3 = window.d3;
	const PIXI = window.PIXI;

	// ---- Pixi scene ----
	const app = new PIXI.Application();
	await app.init({
		width,
		height,
		antialias: true,
		backgroundAlpha: 0,
		resolution: window.devicePixelRatio || 1,
		autoDensity: true,
		eventMode: "static",
	});
	if (rid !== undefined && rid !== renderId) {
		app.destroy(true);
		return () => {};
	}
	container.appendChild(app.canvas);

	const world = new PIXI.Container(); // receives the zoom transform
	app.stage.addChild(world);
	const edgeLayer = new PIXI.Container();
	const nodeLayer = new PIXI.Container();
	const labelLayer = new PIXI.Container();
	world.addChild(edgeLayer);
	world.addChild(nodeLayer);
	world.addChild(labelLayer);

	// forces
	const simulation = d3
		.forceSimulation(nodes)
		.force("charge", d3.forceManyBody().strength(-100 * repelForce))
		.force("center", d3.forceCenter().strength(centerForce))
		.force("link", d3.forceLink(subEdges).distance(linkDistance))
		.force(
			"collide",
			d3
				.forceCollide()
				.radius((n) => nodeRadius(subEdges, n))
				.iterations(3),
		);
	if (enableRadial) {
		simulation.force(
			"radial",
			d3.forceRadial((Math.min(width, height) / 2) * 0.8).strength(0.2),
		);
	}

	// ---- render info ----
	const hoveredNodeRef = { id: null }; // {id} shared with interactivity below
	const nodeInfos = [];
	const edgeInfos = [];
	let activeSet = new Set();
	let suppressRestyle = false; // set while dragging

	const visited = visitedSet();

	function colorOf(node) {
		if (node.id === page) return colors.current;
		if (visited.has(node.id) || node.id.startsWith("tags/"))
			return colors.visited;
		return colors.node;
	}

	function setHover(nodeId) {
		hoveredNodeRef.id = nodeId;
		activeSet = new Set();
		if (nodeId === null) {
			for (const info of edgeInfos) info.active = false;
			for (const info of nodeInfos) info.active = false;
			return;
		}
		for (const info of edgeInfos) {
			const edge = info.edge;
			if (edge.source.id === nodeId || edge.target.id === nodeId) {
				activeSet.add(edge.source.id);
				activeSet.add(edge.target.id);
				info.active = true;
			} else {
				info.active = false;
			}
		}
		activeSet.add(nodeId);
		for (const info of nodeInfos) {
			info.active = activeSet.has(info.node.id);
		}
	}

	function styleEdges() {
		for (const info of edgeInfos) {
			const dimmed = hoveredNodeRef.id !== null;
			info.alpha = dimmed && !info.active ? 0.2 : 1;
			info.color = info.active ? colors.node : colors.edge;
		}
	}

	function styleLabels() {
		const baseScale = 1 / scale;
		const hoverScale = baseScale * 1.1;
		for (const info of nodeInfos) {
			if (info.node.id === hoveredNodeRef.id) {
				info.label.alpha = 1;
				info.label.scale.set(hoverScale);
			} else {
				info.label.scale.set(baseScale);
			}
		}
	}

	function styleNodes() {
		for (const info of nodeInfos) {
			const dimmed = hoveredNodeRef.id !== null && focusOnHover;
			info.gfx.alpha = dimmed && !info.active ? 0.2 : 1;
		}
	}

	function restyle() {
		styleNodes();
		styleEdges();
		styleLabels();
	}

	for (const node of nodes) {
		const isTag = node.id.startsWith("tags/");
		const label = new PIXI.Text({
			text: node.text,
			style: {
				fontSize: fontSize * 15,
				fill: colors.label,
				fontFamily: labelFont,
			},
			resolution: (window.devicePixelRatio || 1) * 4,
		});
		label.anchor.set(0.5, 1.2);
		label.alpha = 0;
		label.scale.set(1 / scale);
		labelLayer.addChild(label);

		const gfx = new PIXI.Graphics();
		const radius = nodeRadius(subEdges, node);
		gfx.circle(0, 0, radius);
		gfx.fill({ color: isTag ? colors.tagFill : colorOf(node) });
		if (isTag) gfx.stroke({ width: 2, color: colors.visited });
		gfx.eventMode = "static";
		gfx.cursor = "pointer";
		gfx.label = node.id;
		nodeLayer.addChild(gfx);

		let labelAlphaAtHover = 0;
		gfx.on("pointerover", () => {
			setHover(node.id);
			labelAlphaAtHover = label.alpha;
			if (!suppressRestyle) restyle();
		});
		gfx.on("pointerleave", () => {
			setHover(null);
			label.alpha = labelAlphaAtHover;
			if (!suppressRestyle) restyle();
		});
		if (!drag) {
			gfx.on("click", () => {
				window.location.href = nodeHref(node.id);
			});
		}

		nodeInfos.push({
			node,
			gfx,
			label,
			color: colorOf(node),
			alpha: 1,
			active: false,
		});
	}

	for (const edge of subEdges) {
		const gfx = new PIXI.Graphics();
		gfx.eventMode = "none";
		edgeLayer.addChild(gfx);
		edgeInfos.push({ edge, gfx, color: colors.edge, alpha: 1, active: false });
	}

	// ---- drag / click ----
	let zoomTransform = d3.zoomIdentity;
	if (drag) {
		let dragStartTime = 0;
		let dragOffset = null;
		const toSimX = (px) => (px - zoomTransform.x) / zoomTransform.k - width / 2;
		const toSimY = (py) =>
			(py - zoomTransform.y) / zoomTransform.k - height / 2;
		const hitTest = (px, py) => {
			const x = toSimX(px);
			const y = toSimY(py);
			for (const node of nodes) {
				const dx = x - node.x;
				const dy = y - node.y;
				if (Math.sqrt(dx * dx + dy * dy) < nodeRadius(subEdges, node) + 5) {
					return node;
				}
			}
			return null;
		};
		const dragBehavior = d3
			.drag()
			.container(app.canvas)
			.subject((event) => hitTest(event.x, event.y))
			.on("start", (event) => {
				const node = event.subject;
				if (!event.active) simulation.alphaTarget(1).restart();
				node.fx = node.x;
				node.fy = node.y;
				const simX = toSimX(event.x);
				const simY = toSimY(event.y);
				dragOffset = { x: simX - node.x, y: simY - node.y };
				dragStartTime = Date.now();
				suppressRestyle = true;
				setHover(node.id);
			})
			.on("drag", (event) => {
				const node = event.subject;
				if (dragOffset) {
					node.fx = toSimX(event.x) - dragOffset.x;
					node.fy = toSimY(event.y) - dragOffset.y;
				}
			})
			.on("end", (event) => {
				const node = event.subject;
				if (!event.active) simulation.alphaTarget(0);
				node.fx = null;
				node.fy = null;
				dragOffset = null;
				suppressRestyle = false;
				setHover(null);
				restyle();
				if (Date.now() - dragStartTime < 500) {
					window.location.href = nodeHref(node.id);
				}
			});
		d3.select(app.canvas).call(dragBehavior);
	}

	// ---- zoom ----
	let zoomBehavior = null;
	let fitToNodes = null;
	let fitCount = 0;
	let userGestured = false;
	if (zoom) {
		const onZoom = (event) => {
			// programmatic fit transforms have no sourceEvent; only real
			// wheel/pointer gestures count as the user taking over the view
			if (event.sourceEvent) userGestured = true;
			zoomTransform = event.transform;
			world.scale.set(zoomTransform.k, zoomTransform.k);
			world.position.set(zoomTransform.x, zoomTransform.y);
			const fade = Math.max((zoomTransform.k * opacityScale - 1) / 3.75, 0);
			for (const info of nodeInfos) {
				if (!info.active) info.label.alpha = fade;
			}
		};
		zoomBehavior = d3
			.zoom()
			.extent([
				[0, 0],
				[width, height],
			])
			.scaleExtent([0.25, 4])
			.on("zoom", onZoom);
		d3.select(app.canvas).call(zoomBehavior);

		// auto-fit the node cluster so the whole graph fits the viewport —
		// many nodes shrink the view, a lone node zooms to the 2x cap and
		// sits centered. Labels follow the zoom fade: a fit-out view keeps
		// them hidden until the user zooms in, a fit-in view reveals them
		// faintly (fade = (k*opacityScale-1)/3.75). Runs twice: once while
		// the layout is still cooling (snappy frame) and once more when the
		// simulation truly ends (nodes have stopped drifting, so the frame
		// stays accurate) — unless the user already took over with a gesture.
		fitToNodes = () => {
			if (userGestured || fitCount >= 2) return;
			fitCount++;
			let minX = Number.POSITIVE_INFINITY;
			let minY = Number.POSITIVE_INFINITY;
			let maxX = Number.NEGATIVE_INFINITY;
			let maxY = Number.NEGATIVE_INFINITY;
			for (const info of nodeInfos) {
				const n = info.node;
				const r = nodeRadius(subEdges, n);
				minX = Math.min(minX, n.x - r);
				minY = Math.min(minY, n.y - r);
				maxX = Math.max(maxX, n.x + r);
				maxY = Math.max(maxY, n.y + r);
			}
			const spanX = maxX - minX;
			const spanY = maxY - minY;
			const centerX = (minX + maxX) / 2 + width / 2; // draw coords
			const centerY = (minY + maxY) / 2 + height / 2;
			const pad = 20;
			let k = 1;
			if (spanX >= 1 || spanY >= 1) {
				k = Math.min(
					(width - 2 * pad) / Math.max(spanX, 1),
					(height - 2 * pad) / Math.max(spanY, 1),
				);
				k = Math.max(0.25, Math.min(2, k));
			}
			const t = d3.zoomIdentity
				.translate(width / 2 - centerX * k, height / 2 - centerY * k)
				.scale(k);
			d3.select(app.canvas)
				.transition()
				.duration(450)
				.call(zoomBehavior.transform, t);
		};
	}

	// ---- draw loop ----
	let drawing = true;
	function draw() {
		if (!drawing) return;
		for (const info of nodeInfos) {
			const { x, y } = info.node;
			if (x != null && y != null) {
				info.gfx.position.set(x + width / 2, y + height / 2);
				info.label.position.set(x + width / 2, y + height / 2);
			}
		}
		for (const info of edgeInfos) {
			const { source, target } = info.edge;
			if (source.x != null && target.x != null) {
				info.gfx.clear();
				info.gfx.moveTo(source.x + width / 2, source.y + height / 2);
				info.gfx.lineTo(target.x + width / 2, target.y + height / 2);
				info.gfx.stroke({ alpha: info.alpha, width: 1, color: info.color });
			}
		}
		requestAnimationFrame(draw);
	}

	simulation.on("tick", () => {
		// first crossing of alpha < 0.06 -> one early frame while cooling
		if (fitToNodes && fitCount === 0 && simulation.alpha() < 0.06) {
			fitToNodes();
		}
	});
	simulation.on("end", () => {
		// simulation truly stopped -> final precise frame
		if (fitToNodes && fitCount === 1) fitToNodes();
	});
	simulation.restart();
	restyle();
	draw();

	return () => {
		drawing = false;
		simulation.stop();
		try {
			app.destroy(true);
		} catch {
			/* already destroyed */
		}
	};
}

// ---- page-level orchestration ----

function renderAllLocal() {
	const id = ++renderId;
	markVisited(currentSlug());
	for (const cleanup of localCleanups) cleanup();
	localCleanups = [];
	for (const container of document.querySelectorAll(".graph-container")) {
		if (!container.offsetWidth || !container.offsetHeight) continue; // hidden (rail < lg)
		renderGraph(container, currentSlug(), id)
			.then((cleanup) => {
				if (id === renderId) localCleanups.push(cleanup);
			})
			.catch((err) => {
				console.error("[Graph] Local render error:", err);
			});
	}
}

function closeGlobal() {
	modalOpen = false;
	for (const outer of document.querySelectorAll(".global-graph-outer")) {
		outer.classList.remove("active");
		outer.setAttribute("aria-hidden", "true");
	}
	for (const cleanup of modalCleanups) cleanup();
	modalCleanups = [];
}

function openGlobal() {
	modalOpen = true;
	const slug = currentSlug();
	for (const outer of document.querySelectorAll(".global-graph-outer")) {
		outer.classList.add("active");
		outer.setAttribute("aria-hidden", "false");
	}
	for (const cleanup of modalCleanups) cleanup();
	modalCleanups = [];
	for (const outer of document.querySelectorAll(".global-graph-outer")) {
		const container = outer.querySelector(".global-graph-container");
		if (container) {
			renderGraph(container, slug)
				.then((cleanup) => modalCleanups.push(cleanup))
				.catch((err) => {
					console.error("[Graph] Global render error:", err);
				});
		}
	}
}

function toggleGlobal() {
	if (modalOpen) closeGlobal();
	else openGlobal();
}

function pageReady() {
	if (!libsReady) return;
	renderAllLocal();
	// rebind to the freshly-morphed modal markup
	if (modalOpen) openGlobal();
}

// ---- boot (once per page load; swup events drive subsequent views) ----

if (typeof document !== "undefined" && !window.__graphClientInstalled) {
	window.__graphClientInstalled = true;

	const boot = () => {
		ensureLibs()
			.then(() => {
				pageReady();
			})
			.catch((err) => {
				console.error("[Graph] Failed to load libraries:", err);
				for (const container of document.querySelectorAll(".graph-container")) {
					showLibError(container);
				}
			});
	};

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", boot, { once: true });
	} else {
		boot();
	}

	// view transitions: leave graph mode first (a navigation while the global
	// graph is open would otherwise re-cover every page you land on, trapping
	// the reader behind the overlay), then render the fresh containers
	document.addEventListener("swup:contentReplaced", () => {
		disposeAll();
		closeGlobal();
		pageReady();
	});

	// theme: re-render (colors re-read) when .dark toggles on <html>
	const themeObserver = new MutationObserver(() => {
		disposeAll();
		pageReady();
		if (modalOpen) openGlobal();
	});
	themeObserver.observe(document.documentElement, {
		attributes: true,
		attributeFilter: ["class"],
	});

	// rail is hidden below lg: containers get rendered when they become visible
	let resizeTimer = null;
	window.addEventListener("resize", () => {
		clearTimeout(resizeTimer);
		resizeTimer = setTimeout(() => {
			const hidden = [...document.querySelectorAll(".graph-container")].some(
				(c) => !c.childElementCount && c.offsetWidth > 0,
			);
			if (hidden) pageReady();
		}, 250);
	});

	// global graph modal controls (document-level, bound once)
	document.addEventListener("click", (event) => {
		const target = event.target;
		if (target instanceof Element && target.closest(".global-graph-icon")) {
			toggleGlobal();
			return;
		}
		if (target instanceof Element && target.closest(".global-graph-close")) {
			closeGlobal();
			return;
		}
		// clicks on the graph itself or on the floating header label keep the
		// modal open; anywhere else dismisses it
		if (
			modalOpen &&
			!(
				target instanceof Element &&
				(target.closest(".global-graph-container") ||
					target.closest(".global-graph-head"))
			)
		) {
			closeGlobal();
		}
	});
	document.addEventListener("keydown", (event) => {
		if (event.key === "Escape") {
			if (modalOpen) closeGlobal();
			return;
		}
		if (
			event.key === "g" &&
			(event.ctrlKey || event.metaKey) &&
			!event.shiftKey
		) {
			event.preventDefault();
			toggleGlobal();
		}
	});
}
