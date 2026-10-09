import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createApp, createDatabase } from "../app/backend/src/server.ts";

const sourceDb = resolve("app/backend/data/piring-kita.sqlite");
const counterPath = resolve(".scratch/live-openrouter-counts.json");
const captureDir = resolve(".scratch/live-ai-captures");
const scenario = process.argv[2];
const deepseek = process.argv.includes("--deepseek");
const replay = process.argv.includes("--replay");
const approvedDeepseek = "deepseek/deepseek-v4.1-flash";
const model = deepseek ? approvedDeepseek : process.env.OPENROUTER_MEAL_MODEL?.trim();
const budgetName = deepseek ? "deepseek" : "current";
const limit = deepseek ? 3 : 5;
process.env.AI_DEBUG_LOG = "false";
if (!model || !["prepare", "dinner", "a", "b"].includes(scenario))
	throw new Error("Usage: bun .scratch/live-recommendations.ts prepare|dinner|a|b [--deepseek]");
if (deepseek && scenario === "prepare") throw new Error("DeepSeek is only enabled for live cases.");

const sourceHash = () => createHash("sha256").update(readFileSync(sourceDb)).digest("hex");
const sourceHashBefore = sourceHash();
const replayCapturePath = replay
	? join(captureDir, readdirSync(captureDir).filter((name) => name.startsWith("baseline-current-dinner-")).sort().at(-1)!)
	: null;
const replayCapture = replayCapturePath ? JSON.parse(readFileSync(replayCapturePath, "utf8")) : null;
const tempDir = mkdtempSync(join(tmpdir(), "piring-ai-check-"));
const tempDb = join(tempDir, "copy.sqlite");
copyFileSync(replay ? resolve(".scratch/live-replay.sqlite") : sourceDb, tempDb);
const db = createDatabase(tempDb, false);
const getRows = <T>(table: string): T[] =>
	(db.query(`SELECT data FROM ${table} ORDER BY rowid`).all() as { data: string }[]).map((row) => JSON.parse(row.data));
const data = {
	meals: getRows<any>("scheduled_meals"),
	menus: getRows<any>("saved_menus"),
	}
const dinner = data.meals.find((meal) => meal.date === "2026-10-09" && meal.slot === "dinner");
if (!dinner) throw new Error("No scheduled dinner exists for 2026-10-09.");
const chosenMeal = scenario === "dinner" ? dinner : scenario === "a" || scenario === "b"
	? { id: `live-check-${scenario}`, date: "2026-10-09", slot: "lunch", memberId: scenario === "a" ? "richard" : "michelle", name: "Live recommendation draft", notes: "", ingredients: [] }
	: null;
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

if (scenario === "prepare") {
	copyFileSync(sourceDb, resolve(".scratch/live-replay.sqlite"));
	console.log(JSON.stringify({
		apiKeyConfigured: Boolean(process.env.OPENROUTER_API_KEY),
		model,
		dinner: { name: dinner.name, id: dinner.id, ingredients: dinner.ingredients.map((row: any) => ({ ...row, name: getRows<any>("ingredients").find((item) => item.id === row.ingredientId)?.name })) },
		octoberNinth: data.meals.filter((meal) => meal.date === "2026-10-09").map(({ id, slot, memberId, name, ingredients }: any) => ({ id, slot, memberId, name, ingredientCount: ingredients.length })),
		savedLunchMenuCounts: ["richard", "michelle"].map((memberId) => ({ memberId, count: data.menus.filter((menu) => menu.slot === "lunch" && (!menu.memberId || menu.memberId === memberId)).length })),
		databaseHash: sourceHashBefore,
	}, null, 2));
	db.close();
	rmSync(tempDir, { recursive: true, force: true });
	process.exit(0);
}

const counts = (() => {
	try { return JSON.parse(readFileSync(counterPath, "utf8")) as Record<string, number>; }
	catch { return { current: 0, deepseek: 0 }; }
})();
if ((counts[budgetName] ?? 0) >= limit) throw new Error(`${budgetName} OpenRouter budget (${limit}) exhausted.`);
process.env.OPENROUTER_MEAL_MODEL = model;
const originalFetch = globalThis.fetch;
let requestCount = 0;
const providerCaptures: any[] = [];
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
	if (String(input).includes("openrouter.ai/api/v1/chat/completions")) {
		if (replay) {
			const baseline = replayCapture.provider[0];
			const payload = { model: baseline.model, usage: baseline.usage, choices: [{ message: { content: baseline.content } }] };
			const response = new Response(JSON.stringify(payload), { status: baseline.status, headers: { "content-type": "application/json" } });
			providerCaptures.push({ status: response.status, model: baseline.model, usage: baseline.usage, requestBody: null, content: baseline.content, error: null });
			return response;
		}
		requestCount++;
		if ((counts[budgetName] ?? 0) + requestCount > limit)
			throw new Error(`Blocked before exceeding ${budgetName} OpenRouter budget (${limit}).`);
		const providerStartedAt = performance.now();
		const result = await originalFetch(input, init);
		const providerDurationMs = Math.round(performance.now() - providerStartedAt);
		const payload = await result.clone().json().catch(() => null) as any;
		let requestBody: any = null;
		try { requestBody = typeof init?.body === "string" ? JSON.parse(init.body) : null; } catch {}
		providerCaptures.push({ status: result.status, model: payload?.model ?? null, providerDurationMs, usage: payload?.usage ?? null, requestBody, content: payload?.choices?.[0]?.message?.content ?? null, error: payload?.error?.message ?? null });
		return result;
	}
	return originalFetch(input, init);
}) as typeof fetch;

const app = createApp(db);
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((resolveListen) => server.once("listening", resolveListen));
const address = server.address();
if (!address || typeof address === "string") throw new Error("Could not bind the test API.");
const started = performance.now();
let routeStatus = 0;
let routeBody: any;
const routeRequest = { meal: chosenMeal, prior: [], pendingIngredients: [], companions: [] };
try {
	const response = await originalFetch(`http://127.0.0.1:${address.port}/api/ai/recommendations`, {
		method: "POST", headers: { "content-type": "application/json" },
		body: JSON.stringify(routeRequest),
	});
	routeStatus = response.status;
	routeBody = await response.json();
} finally {
	await new Promise<void>((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
	db.close();
	globalThis.fetch = originalFetch;
}

counts[budgetName] = (counts[budgetName] ?? 0) + requestCount;
mkdirSync(resolve(".scratch"), { recursive: true });
writeFileSync(counterPath, JSON.stringify(counts, null, 2));
mkdirSync(captureDir, { recursive: true });
const recommendations = Array.isArray(routeBody?.recommendations) ? routeBody.recommendations : [];
const rawRecommendations = providerCaptures.flatMap((provider) => {
	try {
		const decoded = JSON.parse(provider.content ?? "");
		return Array.isArray(decoded?.recommendations) ? decoded.recommendations.map((item: any) => ({ name: item.name, origin: item.origin, removals: item.removals, ingredients: item.ingredients?.map((row: any) => ({ catalogKey: row.catalogKey, member: row.member, quantity: row.quantity })) })) : [];
	} catch { return []; }
});
	const capture = {
	scenario, model, routeStatus, routeError: routeBody?.error ?? null,
	recommendationCount: recommendations.length,
	providerRequests: requestCount,
	rawRecommendationCount: rawRecommendations.length,
	rawOriginCounts: rawRecommendations.reduce((counts: Record<string, number>, item: any) => { counts[item.origin] = (counts[item.origin] ?? 0) + 1; return counts; }, {}),
	rawRecommendations,
	provider: providerCaptures,
	responseSummary: recommendations.map((item: any) => ({ name: item.name, origin: item.origin, ingredientCount: item.ingredients?.length, ingredients: item.ingredientDetails?.map((row: any) => ({ name: row.name, quantity: row.quantity, memberId: row.memberId ?? null })), removals: item.removals, nutrition: item.nutrition, deltas: item.deltas?.map((delta: any) => ({ member: delta.member, caloriesAfter: delta.caloriesAfter, calorieTarget: delta.calorieTarget, overCaloriesBy: delta.overCaloriesBy, proteinAfter: delta.proteinAfter, proteinTarget: delta.proteinTarget, sourceWarning: delta.sourceWarning ?? null })) })),
	elapsedMs: Math.round(performance.now() - started),
	requestMealHash: digest(chosenMeal),
	sourceDatabaseUnchanged: sourceHash() === sourceHashBefore,
	routeRequest,
};
writeFileSync(join(captureDir, `baseline-${budgetName}-${scenario}-${new Date().toISOString().replaceAll(":", "-")}.json`), JSON.stringify(capture, null, 2));
console.log(JSON.stringify({ ...capture, provider: providerCaptures.map(({ content: _content, requestBody: _requestBody, ...provider }) => provider) }, null, 2));
rmSync(tempDir, { recursive: true, force: true });

