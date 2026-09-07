// Whole-site link-graph data (every vault note, hub pages excluded) for the
// Graph View. Computed by its own extraction pass (see
// graph-data.ts), independent of page render order. Static file in builds:
// dist/linkgraph.json.
import type { APIRoute } from "astro";
import { buildGraphData } from "../integrations/quartz-pipeline/graph-data.ts";

export const GET: APIRoute = async () => {
	const json = await buildGraphData(import.meta.env.DEV);
	return new Response(JSON.stringify(json), {
		headers: {
			"content-type": "application/json; charset=utf-8",
			"cache-control": import.meta.env.DEV
				? "no-store"
				: "public, max-age=3600",
		},
	});
};
