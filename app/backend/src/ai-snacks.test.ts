import { afterEach, expect, test } from "bun:test";
import { recommend } from "./ai";

const oldFetch = globalThis.fetch;
const oldKey = process.env.OPENROUTER_API_KEY;
const oldModel = process.env.OPENROUTER_MEAL_MODEL;

afterEach(() => {
	globalThis.fetch = oldFetch;
	if (oldKey === undefined) delete process.env.OPENROUTER_API_KEY;
	else process.env.OPENROUTER_API_KEY = oldKey;
	if (oldModel === undefined) delete process.env.OPENROUTER_MEAL_MODEL;
	else process.env.OPENROUTER_MEAL_MODEL = oldModel;
});

test("meal recommendation accepts an optional sub-10% companion and drops duplicate member snacks", async () => {
	process.env.OPENROUTER_API_KEY = "test-only";
	process.env.OPENROUTER_MEAL_MODEL = "test-meal-model";
	let requestBody: { messages: { content: string }[] } | undefined;
	const snack = {
		member: "Member A",
		name: "Small banana snack",
		justification: "A small, practical fiber boost.",
		ingredients: [{ catalogKey: "ingredient-2", quantity: 20 }],
	};
	const proposal = (companionSnacks: typeof snack[]) => ({
		name: "Tofu plate",
		origin: "new",
		savedMenuKey: "",
		justification: "A practical protein-focused meal.",
		cookingNote: "",
		ingredients: [{ catalogKey: "ingredient-1", usdaQuery: "", quantity: 150, member: "shared" }],
		removals: [],
		companionSnacks,
	});
	globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
		requestBody = JSON.parse(String(init?.body));
		return new Response(JSON.stringify({
			choices: [{ message: { content: JSON.stringify({ recommendations: [
				proposal([snack, snack]),
				proposal([{ ...snack, ingredients: [{ catalogKey: "ingredient-2", quantity: 400 }] }]),
				proposal([]), proposal([]), proposal([]),
			] }) } }],
		}), { status: 200 });
	}) as typeof fetch;

	const tofu = {
		id: "tofu",
		name: "Tofu",
		aliases: [],
		unit: "g" as const,
		basisAmount: 100,
		preparation: "",
		source: "test",
		suggestible: true,
		nutrition: { calories: 80, protein: 15, carbs: 2, fat: 4, fiber: 1 },
	};
	const banana = {
		id: "banana",
		name: "Banana",
		aliases: [],
		unit: "g" as const,
		basisAmount: 100,
		preparation: "",
		source: "test",
		suggestible: true,
		nutrition: { calories: 89, protein: 1.1, carbs: 22.8, fat: 0.3, fiber: 2.6 },
	};
	const results = await recommend({
		meal: {
			id: "current",
			date: "2026-10-06",
			slot: "dinner",
			name: "Tofu",
			notes: "",
			ingredients: [{ ingredientId: "tofu", quantity: 100 }],
		},
		catalog: [tofu, banana],
		currentDay: [],
		savedMenus: [],
		targets: [{
			member: "Member A", memberId: "richard",
			dailyCalories: 1000, currentCalories: 100, calories: 100,
			dailyProtein: 80, currentProtein: 15, protein: 15,
			dailyCarbs: 250, currentCarbs: 2, carbs: 2,
			dailyFat: 70, currentFat: 4, fat: 4,
			dailyFiber: 25, currentFiber: 1, fiber: 1,
		}],
		dailySnackLimits: [{ member: "Member A", calories: 250 }],
		settledSnackMembers: [],
		memberLabels: [{ member: "Member A", memberId: "richard" }],
		prior: [],
	});

	expect(results[0].companionSnacks).toHaveLength(1);
	expect(results[0].companionSnacks[0].nutrition.calories).toBeLessThan(100);
	expect(results[0].deltas[0].caloriesAfter).toBeCloseTo(137.8);
	expect(results[1].companionSnacks).toHaveLength(0);
	expect(results[1].deltas[0].caloriesAfter).toBeCloseTo(120);
	expect(results[0].deltas[0].memberId).toBe("richard");
	expect(requestBody?.messages[0].content).toContain("Evaluate meal-only and meal-plus-snack combinations");
});
