import type { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AppData, TargetPreviewRequest } from "@piring-kita/shared";
import { formatAiTraceData, rateLimit, recommend, searchUsda } from "./ai";
import { createApp, createDatabase } from "./server";

process.env.OPENROUTER_MEAL_MODEL = "test-meal-model";
process.env.OPENROUTER_ALIAS_MODEL = "test-alias-model";

describe("backend API", () => {
	let db: Database;
	let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
	let base: string;
	const addMeal = async (meal: AppData["scheduledMeals"][number]) => {
		const response = await fetch(`${base}/api/meals`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(meal),
		});
		expect(response.status).toBe(201);
	};

	test("AI logs expand embedded JSON and redact credentials", () => {
		const output = formatAiTraceData({
			content:
				'{"meal":"tofu","availableIngredients":[{"name":"large catalog item"}]}',
			api_key: "private",
			usage: { completion_tokens: 12 },
		});
		expect(output).toContain('"meal": "tofu"');
		expect(output).toContain(
			'"availableIngredients": "[1 ingredients omitted]"',
		);
		expect(output).not.toContain("large catalog item");
		expect(output).toContain('"api_key": "[redacted]"');
		expect(output).toContain('"completion_tokens": 12');
		expect(output).not.toContain("private");
	});

	test("USDA ingredient portions expose only verified positive gram weights", async () => {
		const oldFetch = globalThis.fetch;
		const oldUsda = process.env.USDA_API_KEY;
		process.env.USDA_API_KEY = "test-only";
		globalThis.fetch = (async (input: RequestInfo | URL) => {
			const url = String(input);
			if (!url.includes("api.nal.usda.gov")) return oldFetch(input);
			if (url.includes("/food/555?"))
				return new Response(JSON.stringify({
					fdcId: 555,
					foodPortions: [
						{ amount: 2, gramWeight: 270, measureUnit: { name: "large" }, modifier: "apple", portionDescription: "with skin" },
						{ amount: 0, gramWeight: 100, measureUnit: { name: "cup" } },
						{ amount: 1, gramWeight: Number.NaN, measureUnit: { name: "piece" } },
						{ gramWeight: 50, measureUnit: { name: "slice" } },
					],
				}), { status: 200 });
			if (url.includes("/food/556?"))
				return new Response(JSON.stringify({ fdcId: 556, foodPortions: [] }), { status: 200 });
			return new Response(JSON.stringify({ message: "USDA unavailable" }), { status: 503 });
		}) as typeof fetch;
		try {
			const response = await fetch(`${base}/api/ai/ingredient-portions/555`);
			expect({ status: response.status, body: await response.json() }).toEqual({ status: 200, body: { portions: [{ label: "2 large apple with skin", amount: 2, gramWeight: 270 }] } });
			expect(await fetch(`${base}/api/ai/ingredient-portions/556`).then((r) => r.json())).toEqual({ portions: [] });
			expect((await fetch(`${base}/api/ai/ingredient-portions/nope`)).status).toBe(400);
		expect(
			(
				await fetch(
					`${base}/api/ai/ingredient-portions/999999999999999999999999`,
				)
			).status,
		).toBe(400);
			expect((await fetch(`${base}/api/ai/ingredient-portions/557`)).status).toBe(503);
		} finally {
			globalThis.fetch = oldFetch;
			if (oldUsda === undefined) delete process.env.USDA_API_KEY;
			else process.env.USDA_API_KEY = oldUsda;
		}
	});

	beforeEach(async () => {
		db = createDatabase(":memory:");
		server = createApp(db).listen(0);
		await new Promise<void>((resolve) => server.once("listening", resolve));
		const address = server.address();
		if (!address || typeof address === "string")
			throw new Error("test server did not bind a TCP port");
		base = `http://127.0.0.1:${address.port}`;
	});

	afterEach(async () => {
		await new Promise<void>((resolve, reject) =>
			server.close((error) => (error ? reject(error) : resolve())),
		);
		db.close();
	});

	test("returns the production seed in the shared AppData shape", async () => {
		const data = (await (await fetch(`${base}/api/data`)).json()) as AppData;
		expect(data.members.map((x) => x.id)).toEqual(["richard", "michelle"]);
		expect(data.ingredients.find((x) => x.id === "rice")?.aliases).toContain(
			"beras",
		);
		expect(data.ingredients).toHaveLength(35);
		expect(
			data.ingredients.every((x) => x.source.includes("FoodData Central")),
		).toBe(true);
		expect(data.savedMenus).toHaveLength(13);
		expect(
			data.savedMenus.find((x) => x.id === "workbook-r-nasi-telur-miso"),
		).toMatchObject({ name: "Nasi telur miso", memberId: "richard" });
		expect(
			data.savedMenus.find((x) => x.id === "workbook-d-hotpot-mala"),
		).toMatchObject({ name: "Hotpot mala", slot: "dinner" });
		expect(data.members).toMatchObject([
			{
				id: "richard",
				birthday: "1993-05-22",
				heightCm: 165,
				currentWeightKg: 68,
			},
			{
				id: "michelle",
				birthday: "1995-01-30",
				heightCm: 159,
				currentWeightKg: 54.65,
			},
		]);
		expect(
			data.scheduledMeals.filter(
				(x) => x.date >= "2026-10-05" && x.date <= "2026-10-11",
			),
		).toEqual([]);
		expect(data.targets.every((x) => x.weekdayCalories > 0)).toBe(true);
	});

	test("returns JSON errors for unknown API routes", async () => {
		const response = await fetch(`${base}/api/missing`);
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ error: "API route not found" });
	});

	test("AI routes report missing keys without fabricating nutrition", async () => {
		const oldOpenRouter = process.env.OPENROUTER_API_KEY;
		const oldUsda = process.env.USDA_API_KEY;
		delete process.env.OPENROUTER_API_KEY;
		delete process.env.USDA_API_KEY;
		try {
			const recommendation = await fetch(`${base}/api/ai/recommendations`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					meal: {
						id: "draft",
						date: "2026-10-08",
						slot: "lunch",
						memberId: "richard",
						name: "Meal",
						notes: "",
						ingredients: [],
					},
				}),
			});
			expect(recommendation.status).toBe(503);
			expect((await recommendation.json()).error).toContain(
				"OPENROUTER_API_KEY",
			);
			const lookup = await fetch(`${base}/api/ai/ingredient-lookup`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ name: "ingredient nowhere" }),
			});
			expect(lookup.status).toBe(503);
			expect((await lookup.json()).error).toContain("USDA_API_KEY");
		} finally {
			if (oldOpenRouter === undefined) delete process.env.OPENROUTER_API_KEY;
			else process.env.OPENROUTER_API_KEY = oldOpenRouter;
			if (oldUsda === undefined) delete process.env.USDA_API_KEY;
			else process.env.USDA_API_KEY = oldUsda;
		}
	});

	test("AI request limiter accepts the configured count then blocks", () => {
		const key = `limit-test-${Date.now()}`;
		for (let i = 0; i < 10; i++) expect(rateLimit(key, 10, 600_000)).toBe(true);
		expect(rateLimit(key, 10, 600_000)).toBe(false);
	});

	test("AI validation rejects model ingredient IDs and USDA misses stay empty", async () => {
		const oldFetch = globalThis.fetch;
		const oldOpenRouter = process.env.OPENROUTER_API_KEY;
		const oldUsda = process.env.USDA_API_KEY;
		process.env.OPENROUTER_API_KEY = "test-only";
		process.env.USDA_API_KEY = "test-only";
		const catalog = (
			(await (await fetch(`${base}/api/data`)).json()) as AppData
		).ingredients;
		let usdaCalls = 0;
		let openRouterBody: any;
		try {
			globalThis.fetch = (async (
				input: RequestInfo | URL,
				init?: RequestInit,
			) => {
				if (String(input).includes("api.nal.usda.gov")) {
					usdaCalls++;
					return new Response(JSON.stringify({ foods: [] }), { status: 200 });
				}
				openRouterBody = JSON.parse(String(init?.body));
				return new Response(
					JSON.stringify({
						choices: [
							{
								message: {
									content: JSON.stringify({
										recommendations: [
											{
												name: "Unsupported",
												origin: "new",
												savedMenuKey: "",
												justification: "test",
												cookingNote: "",
												ingredients: [
													{
														catalogKey: "made-up",
														usdaQuery: "",
														quantity: 50,
														member: "shared",
													},
												],
												removals: [],
												companionSnacks: [],
											},
										],
									}),
								},
							},
						],
					}),
					{ status: 200 },
				);
			}) as typeof fetch;
			await expect(
				recommend({
					meal: {
						id: "draft",
						date: "2026-10-08",
						slot: "lunch",
						memberId: "richard",
						name: "Meal",
						notes: "",
						ingredients: [],
					},
					catalog,
					currentDay: [],
					savedMenus: [],
					targets: [],
					prior: [],
				}),
			).rejects.toThrow("unsupported ingredient");
			expect(openRouterBody.model).toBe("test-meal-model");
			const prompt = JSON.parse(openRouterBody.messages[1].content);
			expect(openRouterBody.reasoning).toEqual({ effort: "none" });
			expect(openRouterBody.provider).toEqual({
				require_parameters: true,
				sort: "throughput",
			});
			expect(prompt.availableIngredients[0].nutrition).toBeArray();
			expect(prompt.availableIngredients[0]).not.toHaveProperty("suggestible");
			expect(prompt.constraints).toMatchObject({ recommendations: 5, adjustedSavedMenus: 0, newCompositions: 5 });
			expect(openRouterBody.response_format.json_schema.schema.properties.recommendations).toMatchObject({ minItems: 5, maxItems: 5 });
			expect(openRouterBody.messages[1].content).not.toContain("ingredientId");
			expect(openRouterBody.messages[1].content).not.toContain('"id"');
			expect(await searchUsda("food with no match")).toEqual([]);
			expect(usdaCalls).toBe(1);
		} finally {
			globalThis.fetch = oldFetch;
			if (oldOpenRouter === undefined) delete process.env.OPENROUTER_API_KEY;
			else process.env.OPENROUTER_API_KEY = oldOpenRouter;
			if (oldUsda === undefined) delete process.env.USDA_API_KEY;
			else process.env.USDA_API_KEY = oldUsda;
		}
	});

	test("AI recommendations work with only USDA ingredients and convert catalog gram equivalents", async () => {
		const oldFetch = globalThis.fetch;
		const oldOpenRouter = process.env.OPENROUTER_API_KEY;
		const oldUsda = process.env.USDA_API_KEY;
		process.env.OPENROUTER_API_KEY = "test-only";
		process.env.USDA_API_KEY = "test-only";
		const food = {
			fdcId: 777,
			description: "Egg, whole, raw",
			dataType: "Foundation",
			foodNutrients: [
				{ nutrientNumber: "208", value: 143 },
				{ nutrientNumber: "203", value: 12.6 },
				{ nutrientNumber: "205", value: 0.7 },
				{ nutrientNumber: "204", value: 9.5 },
				{ nutrientNumber: "291", value: 0 },
			],
		};
		const proposal = {
			name: "Simple egg plate",
			origin: "new",
			savedMenuKey: "",
			justification: "Uses an affordable, easy-to-find protein.",
			cookingNote: "Boil and serve with rice.",
			ingredients: [{ catalogKey: "", usdaQuery: food.description, quantity: 100, member: "shared" }],
			removals: [],
			companionSnacks: [],
		};
		const requests: any[] = [];
		globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
			if (String(input).includes("openrouter.ai")) {
				requests.push(JSON.parse(String(init?.body)));
				return new Response(
					JSON.stringify({ choices: [{ message: { content: JSON.stringify({ recommendations: [proposal] }) } }] }),
					{ status: 200 },
				);
			}
			if (String(input).includes("api.nal.usda.gov/fdc/v1/foods/search"))
				return new Response(JSON.stringify({ foods: [food] }), { status: 200 });
			return oldFetch(input, init);
		}) as typeof fetch;
		const input = {
			meal: {
				id: "external-only",
				date: "2026-10-08",
				slot: "lunch" as const,
				memberId: "richard" as const,
				name: "Meal",
				notes: "",
				ingredients: [],
			},
			currentDay: [],
			savedMenus: [],
			targets: [],
			dailySnackLimits: [],
			settledSnackMembers: [],
			memberLabels: [],
			prior: [],
		};
		try {
			const externalOnly = await recommend({ ...input, catalog: [] });
			expect(externalOnly[0].newIngredients[0].id).toBe("fdc-777");
			expect(externalOnly[0].ingredients[0].quantity).toBe(100);
			expect(requests[0].messages[0].content).toContain("Japanese, Korean, or Italian");
			expect(requests[0].messages[0].content).toContain("may use no catalog ingredients");
			const piece = {
				id: "egg-piece",
				name: food.description,
				aliases: [],
				unit: "piece" as const,
				basisAmount: 1,
				equivalentGrams: 50,
				preparation: "",
				source: "workbook",
				suggestible: true,
				nutrition: { calories: 72, protein: 6, carbs: 0, fat: 5, fiber: 0 },
			};
			const converted = await recommend({ ...input, catalog: [piece] });
			expect(converted[0].ingredients[0]).toMatchObject({ ingredientId: piece.id, quantity: 2 });
		} finally {
			globalThis.fetch = oldFetch;
			if (oldOpenRouter === undefined) delete process.env.OPENROUTER_API_KEY;
			else process.env.OPENROUTER_API_KEY = oldOpenRouter;
			if (oldUsda === undefined) delete process.env.USDA_API_KEY;
			else process.env.USDA_API_KEY = oldUsda;
		}
	});

	test("AI recommendations keep usable options when a later protein mix is rejected", async () => {
		const oldFetch = globalThis.fetch;
		const oldOpenRouter = process.env.OPENROUTER_API_KEY;
		process.env.OPENROUTER_API_KEY = "test-only";
		const catalog = (
			(await (await fetch(`${base}/api/data`)).json()) as AppData
		).ingredients;
		const tofuKey = `ingredient-${catalog.filter((item) => item.suggestible).findIndex((item) => item.id === "tofu") + 1}`;
		const proposal = {
			name: "Tofu lunch",
			origin: "new",
			savedMenuKey: "",
			justification: "High-protein lunch.",
			cookingNote: "",
			ingredients: [
				{
					catalogKey: tofuKey,
					usdaQuery: "",
					quantity: 200,
					member: "shared",
				},
			],
			removals: [],
			companionSnacks: [],
		};
		try {
			globalThis.fetch = (async () =>
				new Response(
					JSON.stringify({
						choices: [
							{
								message: {
									content: JSON.stringify({
										recommendations: [proposal, proposal],
									}),
								},
							},
						],
					}),
					{ status: 200 },
				)) as typeof fetch;
			const results = await recommend({
				meal: {
					id: "protein-mix",
					date: "2026-10-08",
					slot: "lunch",
					memberId: "richard",
					name: "",
					notes: "",
					ingredients: [],
				},
				catalog,
				currentDay: [],
				savedMenus: [],
				targets: [
					{
						member: "Member A",
						memberId: "richard",
						dailyCalories: 1000,
						currentCalories: 0,
						calories: 1000,
						dailyProtein: 80,
						currentProtein: 0,
						protein: 80,
						dailyCarbs: 100,
						currentCarbs: 0,
						carbs: 100,
						dailyFat: 40,
						currentFat: 0,
						fat: 40,
						dailyFiber: 20,
						currentFiber: 0,
						fiber: 20,
					},
				],
				dailySnackLimits: [],
				settledSnackMembers: [],
				memberLabels: [
					{ member: "Member A", memberId: "richard" },
					{ member: "Member B", memberId: "michelle" },
				],
				prior: [],
			});
			expect(results).toHaveLength(1);
			expect(results[0].deltas[0].sourceWarning).toContain("second source");
		} finally {
			globalThis.fetch = oldFetch;
			if (oldOpenRouter === undefined) delete process.env.OPENROUTER_API_KEY;
			else process.env.OPENROUTER_API_KEY = oldOpenRouter;
		}
	});

	test("AI recommendations keep calorie-compliant options and fail when none remain", async () => {
		const oldFetch = globalThis.fetch;
		const oldOpenRouter = process.env.OPENROUTER_API_KEY;
		process.env.OPENROUTER_API_KEY = "test-only";
		const catalog = (
			(await (await fetch(`${base}/api/data`)).json()) as AppData
		).ingredients;
		const keyFor = (id: string) =>
			`ingredient-${catalog.filter((item) => item.suggestible).findIndex((item) => item.id === id) + 1}`;
		const proposal = (name: string, catalogKey: string, quantity: number) => ({
			name,
			origin: "new",
			savedMenuKey: "",
			justification: "Fits the meal.",
			cookingNote: "",
			ingredients: [{ catalogKey, usdaQuery: "", quantity, member: "shared" }],
			removals: [],
			companionSnacks: [],
		});
		const target = {
			member: "Member A",
			memberId: "richard" as const,
			dailyCalories: 1000,
			currentCalories: 0,
			calories: 1000,
			dailyProtein: 80,
			currentProtein: 0,
			protein: 80,
			dailyCarbs: 100,
			currentCarbs: 0,
			carbs: 100,
			dailyFat: 40,
			currentFat: 0,
			fat: 40,
			dailyFiber: 20,
			currentFiber: 0,
			fiber: 20,
		};
		const meal = {
			id: "calorie-filter",
			date: "2026-10-08",
			slot: "dinner" as const,
			name: "",
			notes: "",
			ingredients: [],
		};
		const run = () =>
			recommend({
				meal,
				catalog,
				currentDay: [],
				savedMenus: [],
				targets: [
					target,
					{
						...target,
						member: "Member B",
						memberId: "michelle",
						dailyCalories: 100,
						calories: 100,
					},
				],
				dailySnackLimits: [],
				settledSnackMembers: [],
				memberLabels: [
					{ member: "Member A", memberId: "richard" },
					{ member: "Member B", memberId: "michelle" },
				],
				prior: [],
			});
		try {
			const highCalorie = proposal("Tofu-heavy", keyFor("tofu"), 200);
			const usable = proposal("Tofu", keyFor("tofu"), 50);
			globalThis.fetch = (async () =>
				new Response(
					JSON.stringify({
						choices: [
							{
								message: {
									content: JSON.stringify({ recommendations: [usable, highCalorie] }),
								},
							},
						],
					}),
					{ status: 200 },
				)) as typeof fetch;
			const results = await run();
			expect(results.map((result) => result.name)).toEqual(["Tofu"]);
			expect(
				results[0].deltas.every(
					({ caloriesAfter, calorieTarget }) =>
						caloriesAfter <= calorieTarget * 1.05,
				),
			).toBe(true);

			globalThis.fetch = (async () =>
				new Response(
					JSON.stringify({
						choices: [
							{
								message: {
									content: JSON.stringify({ recommendations: [highCalorie] }),
								},
							},
						],
					}),
					{ status: 200 },
				)) as typeof fetch;
			await expect(run()).rejects.toThrow("within the nutrition limits");
		} finally {
			globalThis.fetch = oldFetch;
			if (oldOpenRouter === undefined) delete process.env.OPENROUTER_API_KEY;
			else process.env.OPENROUTER_API_KEY = oldOpenRouter;
		}
	});

	test("later meal ideas accept only accurate, explicit ingredient removals", async () => {
		const oldFetch = globalThis.fetch;
		const oldOpenRouter = process.env.OPENROUTER_API_KEY;
		process.env.OPENROUTER_API_KEY = "test-only";
		const catalog = (
			(await (await fetch(`${base}/api/data`)).json()) as AppData
		).ingredients;
		const existing = catalog.find((item) => item.id === "rice")!;
		const replacement = catalog.find((item) => item.id === "tofu")!;
		const eligible = catalog.filter(
			(item) => item.suggestible || item.id === existing.id,
		);
		const keyFor = (id: string) =>
			`ingredient-${eligible.findIndex((item) => item.id === id) + 1}`;
		const first = {
			name: "Rice quantity adjustment",
			origin: "saved",
			savedMenuKey: "saved-menu-1",
			justification: "Keeps the draft.",
			cookingNote: "",
			ingredients: [
				{
					catalogKey: keyFor(existing.id),
					usdaQuery: "",
					quantity: 100,
					member: "shared",
				},
			],
			removals: [],
			companionSnacks: [],
		};
		const later = {
			name: "Egg alternative",
			origin: "new",
			savedMenuKey: "",
			justification: "Changes the main ingredient.",
			cookingNote: "",
			ingredients: [
				{
					catalogKey: keyFor(replacement.id),
					usdaQuery: "",
					quantity: 100,
					member: "shared",
				},
			],
			removals: [{ catalogKey: keyFor(existing.id), member: "shared" }],
			companionSnacks: [],
		};
		const meal = {
			id: "removal-draft",
			date: "2026-10-08",
			slot: "lunch" as const,
			memberId: "richard" as const,
			name: "Draft",
			notes: "",
			ingredients: [{ ingredientId: existing.id, quantity: 100 }],
		};
		try {
			globalThis.fetch = (async () =>
				new Response(
					JSON.stringify({
						choices: [
							{
								message: {
									content: JSON.stringify({ recommendations: [first, later] }),
								},
							},
						],
					}),
					{ status: 200 },
				)) as typeof fetch;
			const results = await recommend({
				meal,
				catalog,
				currentDay: [],
				savedMenus: [],
				targets: [],
				dailySnackLimits: [],
				settledSnackMembers: [],
				memberLabels: [
					{ member: "Member A", memberId: "richard" },
					{ member: "Member B", memberId: "michelle" },
				],
				prior: [],
			});
			expect(results[0]).toMatchObject({ origin: "new", savedMenuKey: "" });
			expect(results[0].removals).toEqual([]);
			expect(results[1].removals).toEqual([existing.name]);
			const falseClaim = {
				...later,
				removals: [{ catalogKey: keyFor(replacement.id), member: "shared" }],
			};
			globalThis.fetch = (async () =>
				new Response(
					JSON.stringify({
						choices: [
							{
								message: {
									content: JSON.stringify({
										recommendations: [first, falseClaim],
									}),
								},
							},
						],
					}),
					{ status: 200 },
				)) as typeof fetch;
			const correctedFalseClaim = await recommend({
					meal,
					catalog,
					currentDay: [],
					savedMenus: [],
					targets: [],
					dailySnackLimits: [],
					settledSnackMembers: [],
					memberLabels: [
						{ member: "Member A", memberId: "richard" },
						{ member: "Member B", memberId: "michelle" },
					],
					prior: [],
				});
			expect(correctedFalseClaim[1].removals).toEqual([existing.name]);
			const incorrectFirstDisclosure = { ...first, removals: later.removals };
			globalThis.fetch = (async () =>
				new Response(
					JSON.stringify({
						choices: [
							{
								message: {
									content: JSON.stringify({
										recommendations: [incorrectFirstDisclosure, later],
									}),
								},
							},
						],
					}),
					{ status: 200 },
				)) as typeof fetch;
			const correctedFirstDisclosure = await recommend({
				meal,
				catalog,
				currentDay: [],
				savedMenus: [],
				targets: [],
				dailySnackLimits: [],
				settledSnackMembers: [],
				memberLabels: [
					{ member: "Member A", memberId: "richard" },
					{ member: "Member B", memberId: "michelle" },
				],
				prior: [],
			});
			expect(correctedFirstDisclosure[0].removals).toEqual([]);
		} finally {
			globalThis.fetch = oldFetch;
			if (oldOpenRouter === undefined) delete process.env.OPENROUTER_API_KEY;
			else process.env.OPENROUTER_API_KEY = oldOpenRouter;
		}
	});

	test("normalizes stray model member labels for a single-member meal", async () => {
		const oldFetch = globalThis.fetch;
		const oldOpenRouter = process.env.OPENROUTER_API_KEY;
		process.env.OPENROUTER_API_KEY = "test-only";
		const catalog = (
			(await (await fetch(`${base}/api/data`)).json()) as AppData
		).ingredients;
		const item = catalog.find((ingredient) => ingredient.suggestible)!;
		const catalogKey = `ingredient-${catalog.filter((ingredient) => ingredient.suggestible).findIndex((ingredient) => ingredient.id === item.id) + 1}`;
		let requestBody: any;
		try {
			globalThis.fetch = (async (
				_input: RequestInfo | URL,
				init?: RequestInit,
			) => {
				requestBody = JSON.parse(String(init?.body));
				return new Response(
					JSON.stringify({
						choices: [
							{
								message: {
									content: JSON.stringify({
										recommendations: [
											{
												name: "Lunch",
												origin: "new",
												savedMenuKey: "",
												justification: "Affordable protein.",
												cookingNote: "",
												ingredients: [
													{
														catalogKey,
														usdaQuery: "",
														quantity: 100,
														member: "Member A",
													},
												],
												removals: [],
												companionSnacks: [],
											},
										],
									}),
								},
							},
						],
					}),
					{ status: 200 },
				);
			}) as typeof fetch;
			for (const memberId of ["richard", "michelle"] as const) {
				const result = await recommend({
				meal: {
					id: "single-member",
					date: "2026-10-08",
					slot: "lunch",
					memberId,
					name: "Meal",
					notes: "",
					ingredients: [],
				},
				catalog,
				currentDay: [],
				savedMenus: [],
				targets: [],
				dailySnackLimits: [],
				settledSnackMembers: [],
				memberLabels: [
					{ member: "Member A", memberId: "richard" },
					{ member: "Member B", memberId: "michelle" },
				],
				prior: [],
				});
				expect(
					requestBody.response_format.json_schema.schema.properties
						.recommendations.items.properties.ingredients.items.properties.member
						.enum,
				).toEqual(["shared"]);
				expect(result[0].ingredients[0].memberId).toBeUndefined();
			}
		} finally {
			globalThis.fetch = oldFetch;
			if (oldOpenRouter === undefined) delete process.env.OPENROUTER_API_KEY;
			else process.env.OPENROUTER_API_KEY = oldOpenRouter;
		}
	});

	test("derives dinner removal disclosure from ingredient ownership", async () => {
		const oldFetch = globalThis.fetch;
		const oldOpenRouter = process.env.OPENROUTER_API_KEY;
		process.env.OPENROUTER_API_KEY = "test-only";
		const catalog = (
			(await (await fetch(`${base}/api/data`)).json()) as AppData
		).ingredients;
		const rice = catalog.find((item) => item.id === "rice")!;
		const tofu = catalog.find((item) => item.id === "tofu")!;
		const eligible = catalog.filter(
			(item) => item.suggestible || item.id === rice.id,
		);
		const keyFor = (id: string) =>
			`ingredient-${eligible.findIndex((item) => item.id === id) + 1}`;
		const sharedRice = {
			catalogKey: keyFor(rice.id),
			usdaQuery: "",
			quantity: 100,
			member: "shared",
		};
		const memberRice = { ...sharedRice, member: "Member A" };
		const proposal = (ingredients: unknown[], removals: unknown[]) => ({
			name: "Dinner",
			origin: "new",
			savedMenuKey: "",
			justification: "Keeps portions clear.",
			cookingNote: "",
			ingredients,
			removals,
			companionSnacks: [],
		});
		const first = proposal([sharedRice, memberRice], []);
		const later = proposal(
			[
				sharedRice,
				{
					catalogKey: keyFor(tofu.id),
					usdaQuery: "",
					quantity: 100,
					member: "shared",
				},
			],
			[],
		);
		try {
			globalThis.fetch = (async () =>
				new Response(
					JSON.stringify({
						choices: [
							{
								message: {
									content: JSON.stringify({ recommendations: [first, later] }),
								},
							},
						],
					}),
					{ status: 200 },
				)) as typeof fetch;
			const results = await recommend({
				meal: {
					id: "shared-dinner",
					date: "2026-10-09",
					slot: "dinner",
					name: "Dinner",
					notes: "",
					ingredients: [
						{ ingredientId: rice.id, quantity: 100 },
						{ ingredientId: rice.id, quantity: 100, memberId: "richard" },
					],
				},
				catalog,
				currentDay: [],
				savedMenus: [],
				targets: [],
				dailySnackLimits: [],
				settledSnackMembers: [],
				memberLabels: [
					{ member: "Member A", memberId: "richard" },
					{ member: "Member B", memberId: "michelle" },
				],
				prior: [],
			});
			expect(results[0].removals).toEqual([]);
			expect(results[1].removals).toEqual([`${rice.name} (Member A)`]);
		} finally {
			globalThis.fetch = oldFetch;
			if (oldOpenRouter === undefined) delete process.env.OPENROUTER_API_KEY;
			else process.env.OPENROUTER_API_KEY = oldOpenRouter;
		}
	});

	test("jasmine rice search returns cooked generic rice and never branded records", async () => {
		const oldFetch = globalThis.fetch;
		const oldUsda = process.env.USDA_API_KEY;
		process.env.USDA_API_KEY = "test-only";
		const queries: string[] = [];
		const nutrients = (calories: number) => [
			{ nutrientNumber: "208", value: calories },
			{ nutrientNumber: "203", value: 2.69 },
			{ nutrientNumber: "205", value: 28.17 },
			{ nutrientNumber: "204", value: 0.28 },
			{ nutrientNumber: "291", value: 0.4 },
		];
		globalThis.fetch = (async (
			_input: RequestInfo | URL,
			init?: RequestInit,
		) => {
			const body = JSON.parse(String(init?.body));
			queries.push(body.query);
			const foods =
				body.query === "jasmine rice"
					? [
							{
								fdcId: 123,
								description: "Rice, jasmine, dry",
								dataType: "SR Legacy",
								foodNutrients: nutrients(356),
							},
							{
								fdcId: 1995004,
								description: "Jasmine rice, dry",
								dataType: "Branded",
								foodNutrients: nutrients(356),
							},
						]
					: [
							{
								fdcId: 168878,
								description: "Rice, white, long-grain, regular, cooked",
								dataType: "SR Legacy",
								foodNutrients: nutrients(130),
							},
						];
			return new Response(JSON.stringify({ foods }), { status: 200 });
		}) as typeof fetch;
		try {
			const matches = await searchUsda("jasmine rice");
			expect(queries).toEqual([
				"jasmine rice",
				"rice white long grain regular cooked",
			]);
			expect(matches.map((match) => match.fdcId)).toEqual([168878]);
			expect(matches[0]).toMatchObject({
				dataType: "SR Legacy",
				nutrition: {
					calories: 130,
					protein: 2.69,
					carbs: 28.17,
					fat: 0.28,
					fiber: 0.4,
				},
			});
		} finally {
			globalThis.fetch = oldFetch;
			if (oldUsda === undefined) delete process.env.USDA_API_KEY;
			else process.env.USDA_API_KEY = oldUsda;
		}
	});

	test("USDA search omits unrelated foods that only share a preparation word", async () => {
		const oldFetch = globalThis.fetch;
		const oldUsda = process.env.USDA_API_KEY;
		process.env.USDA_API_KEY = "test-only";
		const nutrients = [
			{ nutrientNumber: "208", value: 30 },
			{ nutrientNumber: "203", value: 1 },
			{ nutrientNumber: "205", value: 1 },
			{ nutrientNumber: "204", value: 1 },
			{ nutrientNumber: "291", value: 1 },
		];
		globalThis.fetch = (async () =>
			new Response(
				JSON.stringify({
					foods: [
						{ fdcId: 123, description: "Watermelon, raw", dataType: "SR Legacy", foodNutrients: nutrients },
						{ fdcId: 172183, description: "Egg, white, raw, fresh", dataType: "SR Legacy", foodNutrients: nutrients },
					],
				}),
				{ status: 200 },
			)) as typeof fetch;
		try {
			expect(
				(await searchUsda("watermelon raw")).map((match) => match.fdcId),
			).toEqual([123]);
		} finally {
			globalThis.fetch = oldFetch;
			if (oldUsda === undefined) delete process.env.USDA_API_KEY;
			else process.env.USDA_API_KEY = oldUsda;
		}
	});

	test("ingredient lookup passes preparation and returns clean aliases with generic match choices", async () => {
		const oldFetch = globalThis.fetch;
		const oldOpenRouter = process.env.OPENROUTER_API_KEY;
		const oldUsda = process.env.USDA_API_KEY;
		process.env.OPENROUTER_API_KEY = "test-only";
		process.env.USDA_API_KEY = "test-only";
		let aliasInput: any;
		let aliasModel: string;
		let usdaBody: any;
		globalThis.fetch = (async (
			input: RequestInfo | URL,
			init?: RequestInit,
		) => {
			if (String(input).includes("openrouter.ai")) {
				const body = JSON.parse(String(init?.body));
				aliasModel = body.model;
				aliasInput = JSON.parse(body.messages[1].content);
				return new Response(
					JSON.stringify({
						choices: [
							{
								message: {
									content: JSON.stringify({
										usdaQuery: "rice white long grain regular cooked",
										aliases: [
											"English: Jasmine rice",
											"Indonesian: nasi, rice",
											"jasmine rice",
										],
									}),
								},
							},
						],
					}),
					{ status: 200 },
				);
			}
			if (String(input).includes("api.nal.usda.gov")) {
				usdaBody = JSON.parse(String(init?.body));
				return new Response(
					JSON.stringify({
						foods: [
							{
								fdcId: 168878,
								description: "Rice, white, long-grain, regular, cooked",
								dataType: "SR Legacy",
								foodNutrients: [
									{ nutrientNumber: "208", value: 130 },
									{ nutrientNumber: "203", value: 2.69 },
									{ nutrientNumber: "205", value: 28.17 },
									{ nutrientNumber: "204", value: 0.28 },
									{ nutrientNumber: "291", value: 0.4 },
								],
							},
							{
								fdcId: 1995004,
								description: "Jasmine rice, dry",
								dataType: "Branded",
								foodNutrients: [
									{ nutrientNumber: "208", value: 356 },
									{ nutrientNumber: "203", value: 7 },
									{ nutrientNumber: "205", value: 80 },
									{ nutrientNumber: "204", value: 1 },
									{ nutrientNumber: "291", value: 2 },
								],
							},
						],
					}),
					{ status: 200 },
				);
			}
			return oldFetch(input, init);
		}) as typeof fetch;
		try {
			const response = await fetch(`${base}/api/ai/ingredient-lookup`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ name: "jasmine rice", preparation: "cooked" }),
			});
			expect(response.status).toBe(200);
			expect(aliasModel!).toBe("test-alias-model");
			expect(aliasInput).toEqual({
				name: "jasmine rice",
				preparation: "cooked",
			});
			expect(usdaBody.query).toBe("rice white long grain regular cooked");
			expect(usdaBody.dataType).toEqual([
				"Foundation",
				"SR Legacy",
				"Survey (FNDDS)",
			]);
			const result = (await response.json()) as any;
			expect(result.aliases).toEqual(["nasi", "rice"]);
			expect(result.matches.map((match: any) => match.fdcId)).toEqual([168878]);
			expect(result.matches[0].source).toContain(
				"https://fdc.nal.usda.gov/food-details/168878/nutrients",
			);
		} finally {
			globalThis.fetch = oldFetch;
			if (oldOpenRouter === undefined) delete process.env.OPENROUTER_API_KEY;
			else process.env.OPENROUTER_API_KEY = oldOpenRouter;
			if (oldUsda === undefined) delete process.env.USDA_API_KEY;
			else process.env.USDA_API_KEY = oldUsda;
		}
	});

	test("ingredient lookup finds a translated catalog name before unrelated USDA matches", async () => {
		const oldFetch = globalThis.fetch;
		const oldOpenRouter = process.env.OPENROUTER_API_KEY;
		const oldUsda = process.env.USDA_API_KEY;
		process.env.OPENROUTER_API_KEY = "test-only";
		process.env.USDA_API_KEY = "test-only";
		let usdaCalls = 0;
		const nutrients = (calories: number) => [
			{ nutrientNumber: "208", value: calories },
			{ nutrientNumber: "203", value: 1 },
			{ nutrientNumber: "205", value: 1 },
			{ nutrientNumber: "204", value: 1 },
			{ nutrientNumber: "291", value: 1 },
		];
		globalThis.fetch = (async (
			input: RequestInfo | URL,
			init?: RequestInit,
		) => {
			if (String(input).includes("openrouter.ai"))
				return new Response(
					JSON.stringify({
						choices: [
							{
								message: {
									content: JSON.stringify({
										usdaQuery: "watermelon raw",
										aliases: ["watermelon"],
									}),
								},
							},
						],
					}),
					{ status: 200 },
				);
			if (!String(input).includes("api.nal.usda.gov"))
				return oldFetch(input, init);
			usdaCalls++;
			return new Response(
				JSON.stringify({
					foods: [
						{
							fdcId: 123,
							description: "Watermelon, raw",
							dataType: "SR Legacy",
							foodNutrients: nutrients(30),
						},
						{
							fdcId: 172183,
							description: "Egg, white, raw, fresh",
							dataType: "SR Legacy",
							foodNutrients: nutrients(52),
						},
					],
				}),
				{ status: 200 },
			);
		}) as typeof fetch;
		try {
			const create = await fetch(`${base}/api/ingredients`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					id: "watermelon",
					name: "Watermelon",
					aliases: [],
					unit: "g",
					basisAmount: 100,
					preparation: "Raw",
					source: "USDA FoodData Central SR Legacy, FDC 123",
					suggestible: true,
					nutrition: { calories: 30, protein: 0.6, carbs: 7.6, fat: 0.2, fiber: 0.4 },
				}),
			});
			expect(create.status).toBe(201);
			const response = await fetch(`${base}/api/ai/ingredient-lookup`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ name: "semangka" }),
			});
			expect(response.status).toBe(200);
			expect(await response.json()).toMatchObject({ existing: "watermelon" });
			expect(usdaCalls).toBe(0);
			const checked = await fetch(`${base}/api/ai/ingredient-lookup`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ name: "semangka", checkExisting: true }),
			});
			expect(checked.status).toBe(200);
			expect(await checked.json()).toMatchObject({
				existing: "watermelon",
				matches: [{ fdcId: 123 }],
			});
			expect(usdaCalls).toBe(1);
		} finally {
			globalThis.fetch = oldFetch;
			if (oldOpenRouter === undefined) delete process.env.OPENROUTER_API_KEY;
			else process.env.OPENROUTER_API_KEY = oldOpenRouter;
			if (oldUsda === undefined) delete process.env.USDA_API_KEY;
			else process.env.USDA_API_KEY = oldUsda;
		}
	});

	test("explicit ingredient check bypasses direct catalog matches for USDA comparison", async () => {
		const oldFetch = globalThis.fetch;
		const oldOpenRouter = process.env.OPENROUTER_API_KEY;
		const oldUsda = process.env.USDA_API_KEY;
		delete process.env.OPENROUTER_API_KEY;
		process.env.USDA_API_KEY = "test-only";
		let usdaCalls = 0;
		globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
			if (String(input).startsWith(base)) return oldFetch(input, init);
			if (!String(input).includes("api.nal.usda.gov"))
				throw new Error(`unexpected fetch: ${String(input)}`);
			usdaCalls++;
			return new Response(JSON.stringify({
				foods: [{
					fdcId: 123,
				description: "Egg, raw",
					dataType: "SR Legacy",
					foodNutrients: [
						{ nutrientNumber: "208", value: 85 },
						{ nutrientNumber: "203", value: 9 },
						{ nutrientNumber: "205", value: 2 },
						{ nutrientNumber: "204", value: 5 },
						{ nutrientNumber: "291", value: 1 },
					],
				}],
			}), { status: 200 });
		}) as typeof fetch;
		try {
			const normal = await fetch(`${base}/api/ai/ingredient-lookup`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ name: "egg" }),
			});
			expect(await normal.json()).toMatchObject({ existing: "egg", matches: [] });
			expect(usdaCalls).toBe(0);
			const checked = await fetch(`${base}/api/ai/ingredient-lookup`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ name: "egg", checkExisting: true }),
			});
			expect(checked.status).toBe(200);
			expect(await checked.json()).toMatchObject({
				existing: "egg",
				matches: [{ fdcId: 123, nutrition: { calories: 85 } }],
			});
			expect(usdaCalls).toBe(1);
		} finally {
			globalThis.fetch = oldFetch;
			if (oldOpenRouter === undefined) delete process.env.OPENROUTER_API_KEY;
			else process.env.OPENROUTER_API_KEY = oldOpenRouter;
			if (oldUsda === undefined) delete process.env.USDA_API_KEY;
			else process.env.USDA_API_KEY = oldUsda;
		}
	});

	test("AI recommendation response calculates and names pending USDA ingredients", async () => {
		const oldFetch = globalThis.fetch;
		const oldOpenRouter = process.env.OPENROUTER_API_KEY;
		const oldUsda = process.env.USDA_API_KEY;
		process.env.OPENROUTER_API_KEY = "test-only";
		process.env.USDA_API_KEY = "test-only";
		const proposal = {
			name: "Verified tofu bowl",
			origin: "new",
			savedMenuKey: "",
			justification: "Adds affordable protein.",
			cookingNote: "",
			ingredients: [
				{
					catalogKey: "",
					usdaQuery: "Verified tofu",
					quantity: 100,
					member: "shared",
				},
			],
			removals: [],
			companionSnacks: [],
		};
		globalThis.fetch = (async (
			input: RequestInfo | URL,
			init?: RequestInit,
		) => {
			if (String(input).includes("openrouter.ai"))
				return new Response(
					JSON.stringify({
						choices: [
							{
								message: {
									content: JSON.stringify({ recommendations: [proposal] }),
								},
							},
						],
					}),
					{ status: 200 },
				);
			if (String(input).includes("api.nal.usda.gov/fdc/v1/foods/search"))
				return new Response(
					JSON.stringify({
						foods: [
							{
								fdcId: 555,
								description: "Verified tofu",
								dataType: "Foundation",
								foodNutrients: [
									{ nutrientNumber: "208", value: 80 },
									{ nutrientNumber: "203", value: 5 },
									{ nutrientNumber: "205", value: 10 },
									{ nutrientNumber: "204", value: 2 },
									{ nutrientNumber: "291", value: 2 },
								],
							},
						],
					}),
					{ status: 200 },
				);
			return oldFetch(input, init);
		}) as typeof fetch;
		try {
			const response = await fetch(`${base}/api/ai/recommendations`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					meal: {
						id: "external-draft",
						date: "2026-10-08",
						slot: "lunch",
						memberId: "richard",
						name: "Meal",
						notes: "",
						ingredients: [],
					},
				}),
			});
			expect(response.status).toBe(200);
			const recommendation = (
				(await response.json()) as { recommendations: any[] }
			).recommendations[0];
			expect(recommendation.nutrition).toEqual({
				calories: 80,
				protein: 5,
				carbs: 10,
				fat: 2,
				fiber: 2,
			});
			expect(recommendation.ingredientDetails[0].name).toBe("Verified tofu");
			expect(recommendation.newIngredients[0].id).toBe("fdc-555");
		} finally {
			globalThis.fetch = oldFetch;
			if (oldOpenRouter === undefined) delete process.env.OPENROUTER_API_KEY;
			else process.env.OPENROUTER_API_KEY = oldOpenRouter;
			if (oldUsda === undefined) delete process.env.USDA_API_KEY;
			else process.env.USDA_API_KEY = oldUsda;
		}
	});

	test("AI budgets attribute owned lunches correctly and reserve a half-day target per missing meal", async () => {
		const oldFetch = globalThis.fetch;
		const oldOpenRouter = process.env.OPENROUTER_API_KEY;
		process.env.OPENROUTER_API_KEY = "test-only";
		let openRouterBody: any;
		globalThis.fetch = (async (
			input: RequestInfo | URL,
			init?: RequestInit,
		) => {
			if (String(input).includes("openrouter.ai")) {
				openRouterBody = JSON.parse(String(init?.body));
				const available = openRouterBody.messages[1].content;
				const key = JSON.parse(available).availableIngredients[0].catalogKey;
				return new Response(
					JSON.stringify({
						choices: [
							{
								message: {
									content: JSON.stringify({
										recommendations: [
											{
												name: "Simple meal",
												origin: "new",
												savedMenuKey: "",
												justification: "A simple option.",
												cookingNote: "",
												ingredients: [
													{
														catalogKey: key,
														usdaQuery: "",
														quantity: 5,
														member: "shared",
													},
												],
												removals: [],
												companionSnacks: [],
											},
										],
									}),
								},
							},
						],
					}),
					{ status: 200 },
				);
			}
			return oldFetch(input, init);
		}) as typeof fetch;
		const requestRecommendation = async (
			meal: AppData["scheduledMeals"][number],
		) => {
			const response = await fetch(`${base}/api/ai/recommendations`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ meal }),
			});
			expect(response.status).toBe(200);
			return JSON.parse(openRouterBody.messages[1].content).targets as any[];
		};
		try {
			const data = (await (await fetch(`${base}/api/data`)).json()) as AppData;
			const richardTarget = data.targets.find(
				(target) => target.memberId === "richard",
			)!;
			const michelleTarget = data.targets.find(
				(target) => target.memberId === "michelle",
			)!;
			await addMeal({
				id: "richard-lunch-budget",
				date: "2026-10-08",
				slot: "lunch",
				memberId: "richard",
				name: "Richard lunch",
				notes: "",
				ingredients: [{ ingredientId: "rice", quantity: 100 }],
			});
			const dinnerTargets = await requestRecommendation({
				id: "dinner-budget",
				date: "2026-10-08",
				slot: "dinner",
				name: "Meal",
				notes: "",
				ingredients: [],
			});
			expect(
				dinnerTargets.find((target) => target.member === "Member A")
					.dailyCalories,
			).toBeCloseTo(richardTarget.weekdayCalories);
			expect(
				dinnerTargets.find((target) => target.member === "Member B")
					.dailyCalories,
			).toBeCloseTo(michelleTarget.weekdayCalories * 0.5);
			expect(
				dinnerTargets.find((target) => target.member === "Member B")
					.currentCalories,
			).toBe(0);
			expect(
				dinnerTargets.find((target) => target.member === "Member A")
					.currentCalories,
			).toBeGreaterThan(0);
			const lunchTargets = await requestRecommendation({
				id: "lunch-budget",
				date: "2026-10-09",
				slot: "lunch",
				memberId: "richard",
				name: "Meal",
				notes: "",
				ingredients: [],
			});
			expect(
				lunchTargets.find((target) => target.member === "Member A")
					.dailyCalories,
			).toBeCloseTo(richardTarget.weekdayCalories * 0.5);
		} finally {
			globalThis.fetch = oldFetch;
			if (oldOpenRouter === undefined) delete process.env.OPENROUTER_API_KEY;
			else process.env.OPENROUTER_API_KEY = oldOpenRouter;
		}
	});

	test("meal and optional menu save as one transaction", async () => {
		const response = await fetch(`${base}/api/meals/save`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				exists: false,
				meal: {
					id: "atomic-meal",
					date: "2026-10-08",
					slot: "lunch",
					memberId: "richard",
					name: "Atomic",
					notes: "",
					ingredients: [{ ingredientId: "rice", quantity: 100 }],
				},
				menu: {
					id: "",
					name: "Bad",
					slot: "lunch",
					memberId: "richard",
					ingredients: [],
				},
			}),
		});
		expect(response.status).toBe(400);
		expect(
			(
				await fetch(`${base}/api/data`).then(
					(r) => r.json() as Promise<AppData>,
				)
			).scheduledMeals.some((meal) => meal.id === "atomic-meal"),
		).toBe(false);
	});

	test("selected recommended menus save together with verified USDA ingredients", async () => {
		const oldFetch = globalThis.fetch;
		const oldUsda = process.env.USDA_API_KEY;
		const food = {
			fdcId: 555,
			description: "Verified soybean food",
			dataType: "Foundation",
			foodNutrients: [
				{ nutrient: { number: "208" }, amount: 80 },
				{ nutrient: { number: "203" }, amount: 5 },
				{ nutrient: { number: "205" }, amount: 10 },
				{ nutrient: { number: "204" }, amount: 2 },
				{ nutrient: { number: "291" }, amount: 2 },
			],
		};
		process.env.USDA_API_KEY = "test-only";
		globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) =>
			String(input).includes("api.nal.usda.gov/fdc/v1/food/555")
				? new Response(JSON.stringify(food), { status: 200 })
				: oldFetch(input, init)) as typeof fetch;
		try {
			const ingredient = {
				id: "fdc-555",
				name: food.description,
				aliases: [],
				unit: "g",
				basisAmount: 100,
				preparation: "",
				source: "USDA FoodData Central Foundation, FDC 555 (https://fdc.nal.usda.gov/food-details/555/nutrients)",
				suggestible: true,
				nutrition: { calories: 80, protein: 5, carbs: 10, fat: 2, fiber: 2 },
			};
			const menus = ["Quick bowl", "Soybean plate"].map((name, index) => ({
				id: `recommended-${index}`,
				name,
				slot: "lunch",
				memberId: "richard",
				ingredients: [{ ingredientId: ingredient.id, quantity: 100 }],
			}));
			const invalidBatch = await fetch(`${base}/api/menus/recommendations`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					pendingIngredients: [ingredient],
					menus: [menus[0], { ...menus[1], ingredients: [{ ingredientId: "missing", quantity: 100 }] }],
				}),
			});
			expect(invalidBatch.status).toBe(400);
			let data = (await fetch(`${base}/api/data`).then((r) => r.json())) as AppData;
			expect(data.ingredients.some((item) => item.id === ingredient.id)).toBe(false);
			expect(data.savedMenus.some((item) => item.id.startsWith("recommended-"))).toBe(false);
			const response = await fetch(`${base}/api/menus/recommendations`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ pendingIngredients: [ingredient], menus }),
			});
			expect(response.status).toBe(200);
			data = (await fetch(`${base}/api/data`).then((r) => r.json())) as AppData;
			expect(data.ingredients.some((item) => item.id === ingredient.id)).toBe(true);
			expect(data.savedMenus.filter((item) => item.id.startsWith("recommended-")).map((item) => item.name)).toEqual(["Quick bowl", "Soybean plate"]);
			const collision = await fetch(`${base}/api/menus/recommendations`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					menus: [{ ...menus[0], name: "Overwritten menu", ingredients: [{ ingredientId: "rice", quantity: 100 }] }],
				}),
			});
			expect(collision.status).toBe(409);
			data = (await fetch(`${base}/api/data`).then((r) => r.json())) as AppData;
			expect(data.savedMenus.find((item) => item.id === "recommended-0")?.name).toBe("Quick bowl");
		} finally {
			globalThis.fetch = oldFetch;
			if (oldUsda === undefined) delete process.env.USDA_API_KEY;
			else process.env.USDA_API_KEY = oldUsda;
		}
	});

	test("USDA ingredient and companion snack persist with the meal after server verification", async () => {
		const oldFetch = globalThis.fetch;
		const oldUsda = process.env.USDA_API_KEY;
		const food = {
			fdcId: 555,
			description: "Verified soybean food",
			dataType: "Foundation",
			foodNutrients: [
				{ nutrient: { number: "208" }, amount: 80 },
				{ nutrient: { number: "203" }, amount: 5 },
				{ nutrient: { number: "205" }, amount: 10 },
				{ nutrient: { number: "204" }, amount: 2 },
				{ nutrient: { number: "291" }, amount: 2 },
			],
		};
		process.env.USDA_API_KEY = "test-only";
		globalThis.fetch = (async (
			input: RequestInfo | URL,
			init?: RequestInit,
		) => {
			if (String(input).includes("api.nal.usda.gov/fdc/v1/food/555"))
				return new Response(JSON.stringify(food), { status: 200 });
			return oldFetch(input, init);
		}) as typeof fetch;
		try {
			const ingredient = {
				id: "fdc-555",
				name: food.description,
				aliases: [],
				unit: "g",
				basisAmount: 100,
				preparation: "",
				source:
					"USDA FoodData Central Foundation, FDC 555 (https://fdc.nal.usda.gov/food-details/555/nutrients)",
				suggestible: true,
				nutrition: { calories: 80, protein: 5, carbs: 10, fat: 2, fiber: 2 },
			};
			const response = await fetch(`${base}/api/meals/save`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					exists: false,
					pendingIngredients: [ingredient],
					meal: {
						id: "verified-meal",
						date: "2026-10-08",
						slot: "dinner",
						name: "Verified dinner",
						notes: "",
						ingredients: [{ ingredientId: "fdc-555", quantity: 100 }],
					},
					companions: [
						{
							id: "verified-snack",
							date: "2026-10-08",
							slot: "snack",
							memberId: "richard",
							name: "Soy snack",
							notes: "",
							ingredients: [{ ingredientId: "fdc-555", quantity: 50 }],
						},
					],
				}),
			});
			expect(response.status).toBe(200);
			const data = (await (await fetch(`${base}/api/data`)).json()) as AppData;
			expect(
				data.ingredients.find((item) => item.id === "fdc-555")?.nutrition,
			).toEqual(ingredient.nutrition);
			expect(
				data.scheduledMeals.filter((item) =>
					["verified-meal", "verified-snack"].includes(item.id),
				),
			).toHaveLength(2);
		} finally {
			globalThis.fetch = oldFetch;
			if (oldUsda === undefined) delete process.env.USDA_API_KEY;
			else process.env.USDA_API_KEY = oldUsda;
		}
	});

	test("moves to an empty slot and swaps with an occupied matching slot", async () => {
		await addMeal({
			id: "move-r-lunch",
			date: "2026-10-08",
			slot: "lunch",
			memberId: "richard",
			name: "Move fixture",
			notes: "",
			ingredients: [{ ingredientId: "rice", quantity: 100 }],
		});
		await addMeal({
			id: "swap-r-lunch",
			date: "2026-10-09",
			slot: "lunch",
			memberId: "richard",
			name: "Swap fixture",
			notes: "",
			ingredients: [{ ingredientId: "rice", quantity: 100 }],
		});
		const first = await fetch(`${base}/api/meals/move-r-lunch/move`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ date: "2026-10-10" }),
		});
		expect(first.status).toBe(200);
		expect((await first.json()).swapped).toBeNull();
		const second = await fetch(`${base}/api/meals/move-r-lunch/move`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ date: "2026-10-09" }),
		});
		expect(second.status).toBe(200);
		const data = (await (await fetch(`${base}/api/data`)).json()) as AppData;
		expect(data.scheduledMeals.find((x) => x.id === "move-r-lunch")?.date).toBe(
			"2026-10-09",
		);
		expect(data.scheduledMeals.find((x) => x.id === "swap-r-lunch")?.date).toBe(
			"2026-10-10",
		);
	});

	test("swaps every scheduled meal between two days atomically", async () => {
		await addMeal({
			id: "first-r-lunch",
			date: "2026-10-05",
			slot: "lunch",
			memberId: "richard",
			name: "First day fixture",
			notes: "",
			ingredients: [{ ingredientId: "rice", quantity: 100 }],
		});
		await addMeal({
			id: "second-m-lunch",
			date: "2026-10-07",
			slot: "lunch",
			memberId: "michelle",
			name: "Second day fixture",
			notes: "",
			ingredients: [{ ingredientId: "rice", quantity: 100 }],
		});
		const response = await fetch(`${base}/api/days/swap`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				firstDate: "2026-10-05",
				secondDate: "2026-10-07",
			}),
		});
		expect(response.status).toBe(200);
		const data = (await (await fetch(`${base}/api/data`)).json()) as AppData;
		expect(
			data.scheduledMeals
				.filter((meal) => meal.date === "2026-10-05")
				.map((meal) => meal.id)
				.sort(),
		).toEqual(["second-m-lunch"]);
		expect(
			data.scheduledMeals
				.filter((meal) => meal.date === "2026-10-07")
				.map((meal) => meal.id)
				.sort(),
		).toEqual(["first-r-lunch"]);
	});

	test("rejects invalid meals and leaves persisted data unchanged", async () => {
		const response = await fetch(`${base}/api/meals`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				id: "bad",
				date: "2026-10-08",
				slot: "dinner",
				memberId: "richard",
				name: "Invalid shared dinner",
				ingredients: [],
			}),
		});
		expect(response.status).toBe(400);
		expect(await response.json()).toHaveProperty("error");
		const data = (await (await fetch(`${base}/api/data`)).json()) as AppData;
		expect(data.scheduledMeals).toHaveLength(1);
	});

	test("only deletes ingredients that are not in use", async () => {
		const used = await fetch(`${base}/api/ingredients/rice`, {
			method: "DELETE",
		});
		expect(used.status).toBe(409);
		const create = await fetch(`${base}/api/ingredients`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				id: "unused",
				name: "Unused",
				aliases: [],
				unit: "g",
				basisAmount: 100,
				preparation: "",
				source: "test",
				suggestible: false,
				nutrition: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
			}),
		});
		expect(create.status).toBe(201);
		const removed = await fetch(`${base}/api/ingredients/unused`, {
			method: "DELETE",
		});
		expect(removed.status).toBe(204);
	});

	test("previews targets without mutation and applies only the effective week", async () => {
		const request: TargetPreviewRequest = {
			memberId: "richard",
			effectiveWeek: "2026-10-12",
			weightKg: 77.5,
			heightCm: 170,
			sex: "female",
			activityLevel: "low",
			activityFactor: 1.6,
			deficitPercent: 20,
			weekendReserve: 400,
			proteinPercent: 25,
			carbsPercent: 45,
			fatPercent: 30,
			fiberGrams: 30,
		};
		const previewResponse = await fetch(`${base}/api/targets/preview`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(request),
		});
		expect(previewResponse.status).toBe(200);
		const preview = await previewResponse.json();
		expect(preview.calculation).toEqual({
			age: 33,
			bmrCalories: 1511.5,
			maintenanceCalories: 2418.4,
		});
		expect(preview.proposed.weekdayCalories * 7 + 400).toBeCloseTo(
			preview.proposed.weeklyCalories,
		);
		expect(preview.recommendation).toContain("suggested starting point");
		let data = (await (await fetch(`${base}/api/data`)).json()) as AppData;
		expect(data.members.find((x) => x.id === "richard")?.currentWeightKg).toBe(
			68,
		);
		expect(
			data.targets.find(
				(x) => x.memberId === "richard" && x.weekStart === "2026-10-05",
			)?.weekdayCalories,
		).toBeGreaterThan(0);
		const apply = await fetch(`${base}/api/targets/apply`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(request),
		});
		expect(apply.status).toBe(200);
		data = (await (await fetch(`${base}/api/data`)).json()) as AppData;
		expect(data.members.find((x) => x.id === "richard")?.currentWeightKg).toBe(
			77.5,
		);
		expect(data.members.find((x) => x.id === "richard")).toMatchObject({
			heightCm: 170,
			sex: "female",
		});
		expect(data.targets).toHaveLength(3);
		expect(
			data.targets.find(
				(x) => x.memberId === "richard" && x.weekStart === "2026-10-05",
			)?.weekdayCalories,
		).toBeGreaterThan(0);
		const currentBefore = data.targets.find(
			(x) => x.memberId === "richard" && x.weekStart === "2026-10-05",
		)?.weeklyCalories;
		const applyToday = await fetch(`${base}/api/targets/apply?start=today`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ ...request, deficitPercent: 10 }),
		});
		expect(applyToday.status).toBe(200);
		data = (await (await fetch(`${base}/api/data`)).json()) as AppData;
		expect(
			data.targets.find(
				(x) => x.memberId === "richard" && x.weekStart === "2026-10-05",
			)?.weeklyCalories,
		).not.toBe(currentBefore);
		expect(data.targets).toHaveLength(3);
	});

	test("exports and validates backups before replacing data", async () => {
		const backup = await fetch(`${base}/api/backup.json`);
		const data = (await backup.json()) as AppData;
		expect(backup.headers.get("content-disposition")).toContain(
			"piring-kita-backup.json",
		);
		const invalid = await fetch(`${base}/api/restore`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ ...data, scheduledMeals: [{ id: "broken" }] }),
		});
		expect(invalid.status).toBe(400);
		expect(
			((await (await fetch(`${base}/api/data`)).json()) as AppData)
				.scheduledMeals,
		).toHaveLength(1);
		const legacy = {
			...data,
			savedMenus: data.savedMenus.map(({ slot: _slot, ...menu }) => menu),
		};
		const restore = await fetch(`${base}/api/restore`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(legacy),
		});
		expect(restore.status).toBe(200);
		expect(
			(
				(await (await fetch(`${base}/api/data`)).json()) as AppData
			).savedMenus.every((menu) => menu.slot === "lunch"),
		).toBe(true);
		const sqlite = await fetch(`${base}/api/database.sqlite`);
		expect(sqlite.headers.get("content-type")).toContain(
			"application/vnd.sqlite3",
		);
		expect((await sqlite.arrayBuffer()).byteLength).toBeGreaterThan(0);
	});

	test("persists API writes across database reopen", async () => {
		const directory = mkdtempSync(join(tmpdir(), "piring-kita-test-"));
		const path = join(directory, "planner.sqlite");
		const persistent = createDatabase(path);
		const listener = createApp(persistent).listen(0);
		await new Promise<void>((resolve) => listener.once("listening", resolve));
		const address = listener.address();
		if (!address || typeof address === "string")
			throw new Error("test server did not bind a TCP port");
		try {
			const response = await fetch(
				`http://127.0.0.1:${address.port}/api/menus`,
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						id: "persist-me",
						name: "Stored menu",
						slot: "lunch",
						memberId: "richard",
						ingredients: [{ ingredientId: "rice", quantity: 100 }],
					}),
				},
			);
			expect(response.status).toBe(201);
		} finally {
			await new Promise<void>((resolve, reject) =>
				listener.close((error) => (error ? reject(error) : resolve())),
			);
			persistent.close();
		}
		const reopened = createDatabase(path, false);
		expect(
			JSON.parse(
				(
					reopened
						.query("SELECT data FROM saved_menus WHERE id = ?")
						.get("persist-me") as { data: string }
				).data,
			).name,
		).toBe("Stored menu");
		reopened.close();
		rmSync(directory, { recursive: true, force: true });
	});

	test("migrates the old total-weekend allocation into an extra weekend reserve", () => {
		const directory = mkdtempSync(join(tmpdir(), "piring-kita-migrate-"));
		const path = join(directory, "planner.sqlite");
		const legacy = createDatabase(path);
		const target = {
			memberId: "richard",
			weekStart: "2026-10-05",
			deficitPercent: 20,
			weekendReserve: 4300,
			proteinPercent: 25,
			carbsPercent: 45,
			fatPercent: 30,
			fiberGrams: 30,
			weeklyCalories: 15030.4,
			weekdayCalories: 2146.08,
			macroGrams: { protein: 134.125, carbs: 241.425, fat: 71.53 },
		};
		legacy
			.query("UPDATE targets SET data = ? WHERE member_id = ?")
			.run(JSON.stringify(target), "richard");
		legacy.close();
		const migrated = createDatabase(path, false);
		const stored = JSON.parse(
			(
				migrated
					.query("SELECT data FROM targets WHERE member_id = ?")
					.get("richard") as { data: string }
			).data,
		) as typeof target;
		expect(stored.weekendReserve).toBeCloseTo(7.84);
		migrated.close();
		rmSync(directory, { recursive: true, force: true });
	});
});
