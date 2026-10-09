import type { Ingredient, MemberId, MenuIngredient, Nutrition, ScheduledMeal } from "@piring-kita/shared";

type Proposal = {
	name: string;
	origin: "saved" | "new";
	savedMenuKey: string;
	justification: string;
	cookingNote: string;
	ingredients: MenuIngredient[];
	removals: string[];
	newIngredients: Ingredient[];
	companionSnacks: { memberId: MemberId; name: string; justification: string; ingredients: MenuIngredient[]; nutrition: Nutrition }[];
	deltas: { member: string; caloriesAfter: number; calorieTarget: number; overCaloriesBy: number; proteinAfter: number; proteinTarget: number; carbsAfter: number; carbsTarget: number; fatAfter: number; fatTarget: number; fiberAfter: number; fiberTarget: number; proteinDelta: number; carbsDelta: number; fatDelta: number; fiberDelta: number; sourceWarning?: string }[];
};

const num = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const rateBuckets = new Map<string, number[]>();
const appRequests: number[] = [];

export function reserveOpenRouterRequest() {
	const now = Date.now();
	while (appRequests.length && now - appRequests[0] >= 86_400_000) appRequests.shift();
	if (appRequests.length >= 40) return false;
	appRequests.push(now);
	return true;
}

export function rateLimit(key: string, limit: number, windowMs: number) {
	const now = Date.now();
	const recent = (rateBuckets.get(key) ?? []).filter((time) => now - time < windowMs);
	if (recent.length >= limit) return false;
	recent.push(now);
	rateBuckets.set(key, recent);
	return true;
}

export async function recommend(input: {
	meal: ScheduledMeal;
	catalog: Ingredient[];
	currentDay: MenuIngredient[];
	savedMenus: { key: string; name: string; ingredients: { catalogKey: string; name: string; quantity: number }[] }[];
	targets: { member: string; memberId: MemberId; referenceOnly?: boolean; dailyCalories: number; currentCalories: number; calories: number; dailyProtein: number; currentProtein: number; protein: number; dailyCarbs: number; currentCarbs: number; carbs: number; dailyFat: number; currentFat: number; fat: number; dailyFiber: number; currentFiber: number; fiber: number }[];
	snackLimitCalories?: number;
	settledSnackMembers: string[];
	dailySnackLimits: { member: string; calories: number }[];
	memberLabels: { member: string; memberId: MemberId }[];
	prior: string[][];
}): Promise<Proposal[]> {
	const key = process.env.OPENROUTER_API_KEY;
	if (!key) throw new Error("AI recommendations are unavailable: OPENROUTER_API_KEY is not configured.");
	if (!reserveOpenRouterRequest()) throw new Error("Daily AI request limit reached. Try again tomorrow.");
	const existingIds = new Set(input.meal.ingredients.map((row) => row.ingredientId));
	const available = input.catalog.filter((item) => item.suggestible || existingIds.has(item.id));
	const byKey = new Map(available.map((item, index) => [`ingredient-${index + 1}`, item]));
	const system = "Create up to three practical Indonesian meal suggestions using cheap, easy sources such as tofu, tempeh, eggs, beans and lentils. Use supplied suggestible catalog keys first. Use a USDA query only when the supplied catalog cannot sensibly fit; never supply nutrition values. Optimize protein first, then calories, allowing at most 5% calorie overage. Keep fat near target; carbs may remain below target; make fiber best-effort after protein and calories. Above 30g protein use at least two sources when catalog permits; keep any one source near 70% or less when alternatives permit. Targets marked referenceOnly are weekday references; weekends remain self-managed. Add a companion snack only when portions would otherwise be impractical, and never for a member with a settled snack. Keep each snack below its daily calorie cap. For an existing draft, the first option returns exactly its current ingredient set with adjusted quantities only. Later options may remove a current ingredient only when necessary; for every removed row, include its exact catalogKey and member label in removals, and do not claim rows that remain. For a blank meal, label each option origin as saved or new; use a supplied savedMenuKey only for a genuinely adjusted version of that saved menu. Include up to two saved-menu choices and at least one genuinely new composition when saved menus are available. Return complete ingredient lists for each option. Use English names and explanations. Quantities use each catalog ingredient's unit; USDA query quantities are grams.";
	const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
		method: "POST",
		headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "HTTP-Referer": "https://piring-kita.local", "X-Title": "Piring Kita" },
		body: JSON.stringify({
			model: "openrouter/free",
			temperature: 0.4,
			provider: { require_parameters: true },
			messages: [
				{ role: "system", content: system },
				{ role: "user", content: JSON.stringify({
					slot: input.meal.slot,
					current: input.meal.ingredients.map((row) => ({ ingredient: input.catalog.find((item) => item.id === row.ingredientId)?.name, quantity: row.quantity, member: row.memberId ? input.memberLabels.find((member) => member.memberId === row.memberId)?.member : "shared" })),
					availableIngredients: available.map((item, index) => ({ catalogKey: `ingredient-${index + 1}`, name: item.name, unit: item.unit, basisAmount: item.basisAmount, suggestible: item.suggestible, nutrition: item.nutrition })),
					settledMeals: input.currentDay.map((row) => ({ ingredient: input.catalog.find((item) => item.id === row.ingredientId)?.name, quantity: row.quantity })),
					savedMenuChoices: input.savedMenus,
					targets: input.targets.map(({ memberId: _memberId, ...target }) => target),
					priorCombinations: input.prior,
					settledSnackMembers: input.settledSnackMembers,
					dailySnackLimits: input.dailySnackLimits,
					constraints: { maxRecommendations: 3, maxProteinDenseGramsPerPersonPerMeal: 250, maxCaloriesOverTargetPercent: 5, maxCompanionSnacks: input.meal.slot === "dinner" ? 2 : 1, sharedDinner: input.meal.slot === "dinner" },
				}) },
			],
			response_format: { type: "json_schema", json_schema: { name: "meal_recommendations", strict: true, schema: {
				type: "object", additionalProperties: false, required: ["recommendations"], properties: { recommendations: { type: "array", maxItems: 3, items: {
						type: "object", additionalProperties: false, required: ["name", "origin", "savedMenuKey", "justification", "cookingNote", "ingredients", "removals", "companionSnacks"], properties: {
						name: { type: "string" }, origin: { type: "string", enum: ["saved", "new"] }, savedMenuKey: { type: "string" }, justification: { type: "string" }, cookingNote: { type: "string" }, removals: { type: "array", maxItems: 50, items: { type: "object", additionalProperties: false, required: ["catalogKey", "member"], properties: { catalogKey: { type: "string" }, member: { type: "string", enum: ["shared", "Member A", "Member B"] } } } }, ingredients: { type: "array", items: { type: "object", additionalProperties: false, required: ["catalogKey", "usdaQuery", "quantity", "member"], properties: { catalogKey: { type: "string" }, usdaQuery: { type: "string" }, quantity: { type: "number", exclusiveMinimum: 0, maximum: 100000 }, member: { type: "string", enum: ["shared", "Member A", "Member B"] } } } }, companionSnacks: { type: "array", maxItems: 2, items: { type: "object", additionalProperties: false, required: ["member", "name", "justification", "ingredients"], properties: { member: { type: "string", enum: ["Member A", "Member B"] }, name: { type: "string" }, justification: { type: "string" }, ingredients: { type: "array", items: { type: "object", additionalProperties: false, required: ["catalogKey", "quantity"], properties: { catalogKey: { type: "string" }, quantity: { type: "number", exclusiveMinimum: 0, maximum: 100000 } } } } } } }
					}
				} } }
			} } },
		}),
	});
	if (!response.ok) throw new Error("AI recommendations are temporarily unavailable. Please retry.");
	const payload = await response.json() as any;
	let parsed: any;
	try { parsed = JSON.parse(payload.choices?.[0]?.message?.content ?? ""); } catch { throw new Error("AI returned an unreadable recommendation. Please retry."); }
	if (!Array.isArray(parsed?.recommendations) || parsed.recommendations.length > 3) throw new Error("AI returned invalid recommendations. Please retry.");
	if (!input.meal.ingredients.length) {
		const saved = parsed.recommendations.filter((proposal: any) => proposal?.origin === "saved");
		const fresh = parsed.recommendations.filter((proposal: any) => proposal?.origin === "new");
		if (saved.length > 2 || !fresh.length) throw new Error("AI did not return the required mix of saved-menu and new ideas. Please retry.");
	}
	const known = new Map(input.catalog.map((item) => [item.id, item]));
	return Promise.all(parsed.recommendations.map(async (proposal: any, index: number) => {
		if (!proposal || typeof proposal.name !== "string" || !proposal.name.trim() || proposal.name.length > 120 || !["saved", "new"].includes(proposal.origin) || typeof proposal.savedMenuKey !== "string" || typeof proposal.justification !== "string" || proposal.justification.length > 1000 || typeof proposal.cookingNote !== "string" || proposal.cookingNote.length > 1000 || !Array.isArray(proposal.ingredients) || proposal.ingredients.length > 50 || !Array.isArray(proposal.removals) || proposal.removals.length > 50 || !proposal.removals.every((item: any) => item && typeof item.catalogKey === "string" && ["shared", "Member A", "Member B"].includes(item.member))) throw new Error("AI returned an invalid recommendation. Please retry.");
		if (!input.meal.ingredients.length && proposal.origin === "saved") {
			const savedMenu = input.savedMenus.find((menu) => menu.key === proposal.savedMenuKey);
			if (!savedMenu || !proposal.ingredients.some((row: any) => savedMenu.ingredients.some((entry) => byKey.get(row.catalogKey)?.id === byKey.get(entry.catalogKey)?.id))) throw new Error("AI returned an invalid saved-menu choice. Please retry.");
		} else if (proposal.origin !== "new" || proposal.savedMenuKey) throw new Error("AI returned an invalid recommendation origin. Please retry.");
		const newIngredients: Ingredient[] = [];
		for (const row of proposal.ingredients) {
			let item = row.catalogKey ? byKey.get(row.catalogKey) : undefined;
			if (!num(row.quantity) || row.quantity <= 0 || row.quantity > 100000 || !["shared", "Member A", "Member B"].includes(row.member)) throw new Error("AI returned an unsupported ingredient or quantity. Please retry.");
			if (item) {
				if (!item.suggestible && !existingIds.has(item.id)) throw new Error("AI returned an unsupported ingredient. Please retry.");
			} else if (!row.usdaQuery || typeof row.usdaQuery !== "string" || row.usdaQuery.length > 120 || row.catalogKey) throw new Error("AI returned an unsupported ingredient. Please retry.");
			else {
				if (input.meal.ingredients.length && index === 0) throw new Error("AI changed ingredients in the quantity-only option. Please retry.");
				const match = (await searchUsda(row.usdaQuery)).find((candidate) => candidate.description.trim().toLocaleLowerCase() === row.usdaQuery.trim().toLocaleLowerCase());
				if (!match) throw new Error("No exact verified USDA match was found for an external ingredient.");
				const existingMatch = input.catalog.find((candidate) => candidate.source.includes(`FDC ${match.fdcId}`) || candidate.name.toLocaleLowerCase() === match.description.toLocaleLowerCase() || candidate.aliases.some((alias) => alias.toLocaleLowerCase() === match.description.toLocaleLowerCase()));
				item = existingMatch ?? { id: `fdc-${match.fdcId}`, name: match.description, aliases: [], unit: "g", basisAmount: 100, preparation: "", source: match.source, suggestible: true, nutrition: match.nutrition };
				if (!existingMatch && !newIngredients.some((entry) => entry.id === item!.id)) newIngredients.push(item);
			}
			known.set(item.id, item);
			const gramsPerUnit = item.unit === "g" ? 1 : item.equivalentGrams;
			const perPersonQuantity = input.meal.slot === "dinner" && !input.meal.ingredients.find((current) => current.ingredientId === item.id)?.memberId ? row.quantity / 2 : row.quantity;
			if (item.nutrition.protein >= 10 && gramsPerUnit !== undefined && perPersonQuantity * gramsPerUnit > 250) throw new Error("AI returned an impractical ingredient quantity. Please retry.");
			row.quantity = item.unit === "g" ? Math.max(5, Math.round(row.quantity / 5) * 5) : item.unit === "tbsp" ? Math.max(0.5, Math.round(row.quantity * 2) / 2) : Math.max(1, Math.round(row.quantity));
			row.ingredientId = item.id;
			if (input.meal.slot === "dinner" && row.member !== "shared") {
				const member = input.memberLabels.find((entry) => entry.member === row.member);
				if (!member) throw new Error("AI returned an invalid shared-dinner portion. Please retry.");
				row.memberId = member.memberId;
			} else if (row.member !== "shared") throw new Error("AI returned a member-specific portion outside shared dinner. Please retry.");
			delete row.member;
			delete row.catalogKey;
			delete row.usdaQuery;
		}
		if (index === 0 && input.meal.ingredients.length) {
			const key = (row: MenuIngredient) => `${row.ingredientId}:${row.memberId ?? "shared"}`;
			const before = input.meal.ingredients.map(key).sort().join("|");
			const after = proposal.ingredients.map(key).sort().join("|");
			if (before !== after) throw new Error("AI changed ingredients in the quantity-only option. Please retry.");
		}
		const rowKey = (ingredientId: string, memberId?: MemberId) => JSON.stringify([ingredientId, memberId ?? "shared"]);
		const retainedCounts = new Map<string, number>();
		for (const row of proposal.ingredients as MenuIngredient[]) {
			const key = rowKey(row.ingredientId, row.memberId);
			retainedCounts.set(key, (retainedCounts.get(key) ?? 0) + 1);
		}
		const removedRows: MenuIngredient[] = [];
		for (const row of input.meal.ingredients) {
			const key = rowKey(row.ingredientId, row.memberId);
			const count = retainedCounts.get(key) ?? 0;
			if (count) retainedCounts.set(key, count - 1);
			else removedRows.push(row);
		}
		if (index === 0 && input.meal.ingredients.length && removedRows.length) throw new Error("AI changed ingredients in the quantity-only option. Please retry.");
		if (!input.meal.ingredients.length && proposal.removals.length) throw new Error("AI claimed to remove an ingredient from a blank meal.");
		const catalogKeyById = new Map([...byKey.entries()].map(([catalogKey, item]) => [item.id, catalogKey]));
		const expectedRemovals = removedRows.map((row) => ({ catalogKey: catalogKeyById.get(row.ingredientId), member: row.memberId ? input.memberLabels.find((entry) => entry.memberId === row.memberId)?.member : "shared", row }));
		const disclosedRemovals = proposal.removals.map((removal: any) => ({ catalogKey: removal.catalogKey, member: removal.member }));
		const removalKey = (removal: { catalogKey?: string; member: string }) => JSON.stringify([removal.catalogKey, removal.member]);
		if (expectedRemovals.length !== disclosedRemovals.length || expectedRemovals.some((expected) => !expected.catalogKey) || expectedRemovals.map(removalKey).sort().join("|") !== disclosedRemovals.map(removalKey).sort().join("|")) throw new Error("AI removal disclosure did not match the changed ingredient list. Please retry.");
		if (index === 0 && proposal.removals.length) throw new Error("The quantity-only option cannot remove ingredients.");
		proposal.removals = expectedRemovals.map(({ row }) => {
			const name = input.catalog.find((item) => item.id === row.ingredientId)?.name ?? "Ingredient";
			return row.memberId ? name + " (" + (input.memberLabels.find((entry) => entry.memberId === row.memberId)?.member ?? "member") + ")" : name;
		});
		if (input.meal.slot === "snack" && input.snackLimitCalories !== undefined) {
			const calories = proposal.ingredients.reduce((sum: number, row: MenuIngredient) => sum + (known.get(row.ingredientId)?.nutrition.calories ?? 0) * row.quantity / (known.get(row.ingredientId)?.basisAmount ?? 1), 0);
			if (calories > input.snackLimitCalories) throw new Error("Suggested snack would exceed 25% of the daily calorie target. Please retry.");
		}
		const maxCompanions = input.meal.slot === "dinner" ? 2 : input.meal.slot === "lunch" ? 1 : 0;
		if (!Array.isArray(proposal.companionSnacks) || proposal.companionSnacks.length > maxCompanions) throw new Error("AI returned invalid companion snacks. Please retry.");
		const companionSnacks: Proposal["companionSnacks"] = [];
		for (const snack of proposal.companionSnacks) {
			if (!snack || typeof snack.member !== "string" || typeof snack.name !== "string" || !snack.name.trim() || snack.name.length > 120 || typeof snack.justification !== "string" || !Array.isArray(snack.ingredients) || snack.ingredients.length === 0 || snack.ingredients.length > 20) throw new Error("AI returned invalid companion snacks. Please retry.");
			const member = input.memberLabels.find((entry) => entry.member === snack.member);
			if (!member || input.settledSnackMembers.includes(snack.member) || (input.meal.slot !== "dinner" && member.memberId !== input.meal.memberId)) continue;
			const limit = input.dailySnackLimits.find((entry) => entry.member === snack.member)?.calories;
			if (!limit) continue;
			let nutrition: Nutrition = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
			const rows: MenuIngredient[] = [];
			for (const row of snack.ingredients) {
				const item = byKey.get(row.catalogKey);
				if (!item?.suggestible || !num(row.quantity) || row.quantity <= 0 || row.quantity > 100000) throw new Error("AI returned an unsupported snack ingredient. Please retry.");
				const gramsPerUnit = item.unit === "g" ? 1 : item.equivalentGrams;
				if (item.nutrition.protein >= 10 && gramsPerUnit !== undefined && row.quantity * gramsPerUnit > 250) throw new Error("AI returned an impractical snack quantity. Please retry.");
				const quantity = item.unit === "g" ? Math.max(5, Math.round(row.quantity / 5) * 5) : item.unit === "tbsp" ? Math.max(0.5, Math.round(row.quantity * 2) / 2) : Math.max(1, Math.round(row.quantity));
				rows.push({ ingredientId: item.id, quantity });
				for (const key of ["calories", "protein", "carbs", "fat", "fiber"] as const) nutrition[key] += item.nutrition[key] * quantity / item.basisAmount;
			}
			if (nutrition.calories <= limit) companionSnacks.push({ memberId: member.memberId, name: snack.name, justification: snack.justification, ingredients: rows, nutrition });
		}
		const mealNutrition = (rows: MenuIngredient[], memberId: MemberId) => rows.reduce((total, row) => {
			const item = known.get(row.ingredientId);
			if (!item || (input.meal.slot !== "dinner" && input.meal.memberId !== memberId) || (input.meal.slot === "dinner" && row.memberId && row.memberId !== memberId)) return total;
			const factor = input.meal.slot === "dinner" && !row.memberId ? 0.5 : 1;
			for (const key of ["calories", "protein", "carbs", "fat", "fiber"] as const) total[key] += item.nutrition[key] * row.quantity / item.basisAmount * factor;
			return total;
		}, { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
		const deltas = input.targets.map((target) => {
			const oldMeal = mealNutrition(input.meal.ingredients, target.memberId);
			const newMeal = mealNutrition(proposal.ingredients, target.memberId);
			const companion = companionSnacks.filter((snack) => snack.memberId === target.memberId).reduce((total, snack) => {
				for (const key of ["calories", "protein", "carbs", "fat", "fiber"] as const) total[key] += snack.nutrition[key];
				return total;
			}, { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
			const caloriesAfter = target.currentCalories - oldMeal.calories + newMeal.calories + companion.calories;
			const currentCalories = target.currentCalories;
			if (!target.referenceOnly && caloriesAfter > target.dailyCalories * 1.05 && caloriesAfter > currentCalories) throw new Error("Suggested meal exceeds the 5% calorie tolerance. Please retry.");
			const proteinSources = new Map<string, number>();
			proposal.ingredients.forEach((row: MenuIngredient) => {
				const item = known.get(row.ingredientId);
				if (!item || (input.meal.slot === "dinner" && row.memberId && row.memberId !== target.memberId)) return;
				const protein = item.nutrition.protein * row.quantity / item.basisAmount * (input.meal.slot === "dinner" && !row.memberId ? 0.5 : 1);
				if (protein > 0.5) proteinSources.set(item.id, (proteinSources.get(item.id) ?? 0) + protein);
			});
			const alternatives = available.filter((item) => item.suggestible && item.nutrition.protein > 0).length;
			const sourceWarning = newMeal.protein > 30 && alternatives > 1 && (proteinSources.size < 2 || Math.max(...proteinSources.values(), 0) / newMeal.protein > 0.7);
			if (sourceWarning && index > 0) throw new Error("Use at least two protein sources and avoid one source contributing over 70% when alternatives are available.");
			return { member: target.member, caloriesAfter, calorieTarget: target.dailyCalories, overCaloriesBy: Math.max(0, caloriesAfter - target.dailyCalories), proteinAfter: target.currentProtein - oldMeal.protein + newMeal.protein + companion.protein, proteinTarget: target.dailyProtein, carbsAfter: target.currentCarbs - oldMeal.carbs + newMeal.carbs + companion.carbs, carbsTarget: target.dailyCarbs, fatAfter: target.currentFat - oldMeal.fat + newMeal.fat + companion.fat, fatTarget: target.dailyFat, fiberAfter: target.currentFiber - oldMeal.fiber + newMeal.fiber + companion.fiber, fiberTarget: target.dailyFiber, proteinDelta: newMeal.protein - oldMeal.protein + companion.protein, carbsDelta: newMeal.carbs - oldMeal.carbs + companion.carbs, fatDelta: newMeal.fat - oldMeal.fat + companion.fat, fiberDelta: newMeal.fiber - oldMeal.fiber + companion.fiber, ...(sourceWarning ? { sourceWarning: "Protein comes from one main source; consider adding a second source." } : {}) };
		});
		return { ...proposal, newIngredients, ingredients: proposal.ingredients as MenuIngredient[], companionSnacks, deltas } as Proposal;
	}));
}

export async function usdaIngredient(fdcId: number): Promise<Ingredient> {
	const key = process.env.USDA_API_KEY;
	if (!key) throw new Error("USDA nutrition lookup is unavailable: USDA_API_KEY is not configured.");
	const response = await fetch(`https://api.nal.usda.gov/fdc/v1/food/${fdcId}?api_key=${encodeURIComponent(key)}`);
	if (!response.ok) throw new Error("USDA FoodData Central lookup failed. Please retry.");
	const food = await response.json() as any;
	const nutrients = new Map((food.foodNutrients ?? []).map((entry: any) => [String(entry.nutrient?.number ?? entry.nutrient?.id ?? entry.nutrientNumber ?? entry.nutrientId), entry.amount ?? entry.value]));
	const value = (...ids: string[]) => { for (const id of ids) { const found = nutrients.get(id); if (typeof found === "number" && Number.isFinite(found)) return found; } return undefined; };
	const calories = value("208", "1008"), protein = value("203", "1003"), carbs = value("205", "1005"), fat = value("204", "1004"), fiber = value("291", "1079");
	if (food.fdcId !== fdcId || typeof food.description !== "string" || [calories, protein, carbs, fat, fiber].some((x) => x === undefined)) throw new Error("USDA record does not contain complete verified nutrition.");
	return { id: `fdc-${fdcId}`, name: food.description, aliases: [], unit: "g", basisAmount: 100, preparation: "", source: `USDA FoodData Central ${food.dataType}, FDC ${fdcId} (https://fdc.nal.usda.gov/food/${fdcId})`, suggestible: true, nutrition: { calories: calories!, protein: protein!, carbs: carbs!, fat: fat!, fiber: fiber! } };
}

export async function searchUsda(query: string) {
	const key = process.env.USDA_API_KEY;
	if (!key) throw new Error("USDA nutrition lookup is unavailable: USDA_API_KEY is not configured.");
	const url = new URL("https://api.nal.usda.gov/fdc/v1/foods/search");
	url.searchParams.set("api_key", key);
	const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, dataType: ["Foundation", "SR Legacy", "Survey (FNDDS)", "Branded"], pageSize: 10 }) });
	if (!response.ok) throw new Error("USDA FoodData Central lookup failed. Please retry.");
	const body = await response.json() as any;
	if (Array.isArray(body.foods) && body.foods.length) {
		const priorities = ["Foundation", "SR Legacy", "Survey (FNDDS)", "Branded"];
		const foods = body.foods.sort((a: any, b: any) => priorities.indexOf(a.dataType) - priorities.indexOf(b.dataType)).slice(0, 3);
		return foods.map((food: any) => {
			const nutrients = new Map((food.foodNutrients ?? []).map((n: any) => [n.nutrientNumber ?? String(n.nutrientId), n.value]));
			const value = (...ids: string[]) => { for (const id of ids) { const found = nutrients.get(id); if (typeof found === "number" && Number.isFinite(found)) return found; } return undefined; };
			const calorie = value("208", "1008"), protein = value("203", "1003"), carbs = value("205", "1005"), fat = value("204", "1004"), fiber = value("291", "1079");
			if ([calorie, protein, carbs, fat, fiber].some((item) => item === undefined)) return null;
			const nutrition: Nutrition = { calories: calorie!, protein: protein!, carbs: carbs!, fat: fat!, fiber: fiber! };
			return { fdcId: food.fdcId, description: food.description, dataType: food.dataType, source: `USDA FoodData Central ${food.dataType}, FDC ${food.fdcId} (https://fdc.nal.usda.gov/food/${food.fdcId})`, nutrition };
		}).filter(Boolean);
	}
	return [];
}

export async function ingredientAliases(name: string) {
	const key = process.env.OPENROUTER_API_KEY;
	if (!key) return { aliases: [], usdaQuery: name };
	try {
		const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
			method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
			body: JSON.stringify({ model: "openrouter/free", provider: { require_parameters: true }, messages: [{ role: "system", content: "Translate the given food name into concise English and Indonesian search aliases. Never provide nutrition values." }, { role: "user", content: name }], response_format: { type: "json_schema", json_schema: { name: "ingredient_aliases", strict: true, schema: { type: "object", additionalProperties: false, required: ["aliases", "usdaQuery"], properties: { aliases: { type: "array", maxItems: 8, items: { type: "string" } }, usdaQuery: { type: "string" } } } } } }),
		});
		if (!response.ok) return { aliases: [], usdaQuery: name };
		const body = await response.json() as any;
		const result = JSON.parse(body.choices?.[0]?.message?.content ?? "{}");
		return { aliases: Array.isArray(result.aliases) ? result.aliases.filter((x: unknown) => typeof x === "string").slice(0, 8) : [], usdaQuery: typeof result.usdaQuery === "string" ? result.usdaQuery : name };
	} catch { return { aliases: [], usdaQuery: name }; }
}
