import { afterEach, expect, test } from "bun:test";
import { ingredientAliases, searchUsda } from "./ai";

const originalFetch = globalThis.fetch;
const originalApiKey = process.env.USDA_API_KEY;

afterEach(() => {
	globalThis.fetch = originalFetch;
	if (originalApiKey === undefined) delete process.env.USDA_API_KEY;
	else process.env.USDA_API_KEY = originalApiKey;
});

test("snake fruit lookup excludes unrelated foods and uses salak identity", async () => {
	process.env.USDA_API_KEY = "test-only";
	const foodNutrients = [
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
					{ fdcId: 1, description: "Chayote, fruit, raw", dataType: "SR Legacy", foodNutrients },
					{ fdcId: 2, description: "Passion-fruit (granadilla), purple, raw", dataType: "SR Legacy", foodNutrients },
				],
			}),
			{ status: 200 },
		)) as typeof fetch;

	expect(await searchUsda("Snake fruit, raw")).toEqual([]);
	expect((await searchUsda("passion fruit, raw")).map((match) => match.fdcId)).toEqual([2]);
	globalThis.fetch = (async () =>
		new Response(
			JSON.stringify({
				foods: [
					{ fdcId: 3, description: "Salak, raw", dataType: "SR Legacy", foodNutrients },
				],
			}),
			{ status: 200 },
		)) as typeof fetch;
	expect((await searchUsda("salak raw")).map((match) => match.fdcId)).toEqual([3]);
	expect(await ingredientAliases("snakefruit")).toEqual({
		aliases: ["salak", "snake fruit", "snakefruit"],
		usdaQuery: "salak",
	});
	expect(await ingredientAliases("Snake fruit", "raw")).toMatchObject({
		usdaQuery: "salak raw",
	});
});
