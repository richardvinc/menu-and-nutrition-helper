import type {
	Ingredient,
	MemberId,
	MenuIngredient,
	Nutrition,
	ScheduledMeal,
} from "@piring-kita/shared";

type Proposal = {
	name: string;
	origin: "saved" | "new";
	savedMenuKey: string;
	justification: string;
	cookingNote: string;
	ingredients: MenuIngredient[];
	removals: string[];
	newIngredients: Ingredient[];
	companionSnacks: {
		memberId: MemberId;
		name: string;
		justification: string;
		ingredients: MenuIngredient[];
		nutrition: Nutrition;
	}[];
	deltas: {
		member: string;
		memberId: MemberId;
		caloriesAfter: number;
		calorieTarget: number;
		overCaloriesBy: number;
		proteinAfter: number;
		proteinTarget: number;
		carbsAfter: number;
		carbsTarget: number;
		fatAfter: number;
		fatTarget: number;
		fiberAfter: number;
		fiberTarget: number;
		proteinDelta: number;
		carbsDelta: number;
		fatDelta: number;
		fiberDelta: number;
		sourceWarning?: string;
	}[];
};

const num = (value: unknown): value is number =>
	typeof value === "number" && Number.isFinite(value);
const rateBuckets = new Map<string, number[]>();
const appRequests: number[] = [];

const aiTraceEnabled = () =>
	process.env.AI_DEBUG_LOG === "true" ||
	(process.env.AI_DEBUG_LOG !== "false" &&
		process.env.NODE_ENV !== "production" &&
		process.env.NODE_ENV !== "test");
const secretTraceField =
	/^(authorization|api_?key|access_?token|secret|password)$/i;
const traceValue = (value: unknown): unknown => {
	if (Array.isArray(value)) return value.map(traceValue);
	if (value && typeof value === "object")
		return Object.fromEntries(
			Object.entries(value).map(([key, item]) => [
				key,
				secretTraceField.test(key)
					? "[redacted]"
					: key === "availableIngredients" && Array.isArray(item)
						? `[${item.length} ingredients omitted]`
						: traceValue(item),
			]),
		);
	if (typeof value === "string" && /^[[{]/.test(value.trim())) {
		try {
			return traceValue(JSON.parse(value));
		} catch {
			return value;
		}
	}
	return value;
};
export const formatAiTraceData = (data: unknown) =>
	JSON.stringify(traceValue(data), null, 2);
const aiTrace = (
	provider: "OpenRouter" | "USDA",
	event: string,
	data: unknown,
) => {
	if (!aiTraceEnabled()) return;
	const color = process.stdout.isTTY && !process.env.NO_COLOR;
	const icon = /prompt|request/.test(event)
		? "→"
		: /error/.test(event)
			? "!"
			: "←";
	const heading = `${icon} ${provider} · ${event.toUpperCase()}`;
	const timestamp = new Date().toISOString();
	console.log(
		`\n${color ? "\x1b[1;36m" : ""}${heading}${color ? "\x1b[0m\x1b[2m" : ""}  ${timestamp}${color ? "\x1b[0m" : ""}`,
	);
	console.log(formatAiTraceData(data));
	console.log(
		color
			? "\x1b[2m────────────────────────────────────────────────────────────────────────\x1b[0m"
			: "------------------------------------------------------------------------",
	);
};

export function reserveOpenRouterRequest() {
	const now = Date.now();
	while (appRequests.length && now - appRequests[0] >= 86_400_000)
		appRequests.shift();
	if (appRequests.length >= 40) return false;
	appRequests.push(now);
	return true;
}

export function rateLimit(key: string, limit: number, windowMs: number) {
	const now = Date.now();
	const recent = (rateBuckets.get(key) ?? []).filter(
		(time) => now - time < windowMs,
	);
	if (recent.length >= limit) return false;
	recent.push(now);
	rateBuckets.set(key, recent);
	return true;
}

export async function recommend(input: {
	meal: ScheduledMeal;
	adjustExisting?: boolean;
	catalog: Ingredient[];
	currentDay: MenuIngredient[];
	savedMenus: {
		key: string;
		name: string;
		ingredients: { catalogKey: string; name: string; quantity: number }[];
	}[];
	targets: {
		member: string;
		memberId: MemberId;
		referenceOnly?: boolean;
		dailyCalories: number;
		currentCalories: number;
		calories: number;
		dailyProtein: number;
		currentProtein: number;
		protein: number;
		dailyCarbs: number;
		currentCarbs: number;
		carbs: number;
		dailyFat: number;
		currentFat: number;
		fat: number;
		dailyFiber: number;
		currentFiber: number;
		fiber: number;
	}[];
	snackLimitCalories?: number;
	settledSnackMembers: string[];
	dailySnackLimits: { member: string; calories: number }[];
	memberLabels: { member: string; memberId: MemberId }[];
	prior: string[][];
}): Promise<Proposal[]> {
	const adjustExisting =
		input.adjustExisting ?? input.meal.ingredients.length > 0;
	const key = process.env.OPENROUTER_API_KEY;
	if (!key)
		throw new Error(
			"AI recommendations are unavailable: OPENROUTER_API_KEY is not configured.",
		);
	const model = process.env.OPENROUTER_MEAL_MODEL?.trim();
	if (!model)
		throw new Error(
			"AI recommendations are unavailable: OPENROUTER_MEAL_MODEL is not configured.",
		);
	if (!reserveOpenRouterRequest())
		throw new Error("Daily AI request limit reached. Try again tomorrow.");
	const existingIds = new Set(
		input.meal.ingredients.map((row) => row.ingredientId),
	);
	const available = input.catalog.filter(
		(item) => item.suggestible || existingIds.has(item.id),
	);
	const byKey = new Map(
		available.map((item, index) => [`ingredient-${index + 1}`, item]),
	);
	const ingredientMemberValues =
		input.meal.slot === "dinner"
			? ["shared", "Member A", "Member B"]
			: ["shared"];
	const memberRule =
		input.meal.slot === "dinner"
			? "For dinner ingredients, use member shared when both people eat an ingredient; use Member A or Member B only for a deliberately individual portion."
			: "This is a single-member meal. Every ingredients entry must use member shared; the meal already identifies its owner.";
	const system =
		"Create exactly five practical meal suggestions. Prioritize cheap ingredients that are easy to find in Indonesian markets, such as tofu, tempeh, eggs, beans, lentils, rice, and common vegetables; Indonesian food is welcome, and basic Japanese, Korean, or Italian dishes are also fine when their ingredients are locally available. Use supplied suggestible catalog keys when they fit, but a recommendation may use no catalog ingredients if suitable options are absent or a better simple dish needs other ingredients. For those ingredients, provide exact USDA food names in usdaQuery and leave catalogKey empty; never invent nutrition values. Ingredient nutrition arrays are ordered as calories, protein, carbs, fat, fiber. Optimize protein first, then calories, allowing at most 5% calorie overage. Keep fat near target; carbs may remain below target; make fiber best-effort after protein and calories. Above 30g protein use at least two sources when catalog permits; keep any one source near 70% or less when alternatives permit. Targets marked referenceOnly are weekday references; weekends remain self-managed. Evaluate meal-only and meal-plus-snack combinations, and include a practical companion snack when it meaningfully improves the member's remaining protein or calorie fit. Keep every snack within the provided daily calorie cap. Leave companionSnacks empty when they do not help. Never add a snack for a member with a settled snack. For an existing meal, keep its identity and name, and return ingredient changes that improve its fit: adjust quantities and add ingredients when useful. Use origin new and an empty savedMenuKey. If current ingredients exist, the first option must use exactly the current catalogKey/member pairs with adjusted quantities only, preserving duplicate rows; it must not add, remove, substitute, or reassign any ingredient. Later options may add ingredients or remove a current ingredient only when necessary. For every removed row, include its exact catalogKey and member label in removals, and do not claim rows that remain. For a blank meal with at least two saved menus, return exactly two adjusted saved-menu choices followed by exactly three genuinely new compositions. Use a supplied savedMenuKey only for a genuinely adjusted version of that saved menu. If fewer than two saved menus are available, use every available saved menu and fill the remaining choices with new compositions. Return complete ingredient lists for each option. Use English names and explanations. Keep each justification under 60 words and each cooking note under 25 words. Quantities use each catalog ingredient's unit; USDA query quantities are grams. " +
		memberRule;
	const requestBody = {
		model,
		temperature: 0.4,
		reasoning: { effort: "none" },
		provider: { require_parameters: true, sort: "throughput" },
		messages: [
			{ role: "system", content: system },
			{
				role: "user",
				content: JSON.stringify({
					slot: input.meal.slot,
					name: input.meal.name,
					adjustExisting,
					current: input.meal.ingredients.map((row) => ({
						catalogKey: [...byKey.entries()].find(
							([, item]) => item.id === row.ingredientId,
						)?.[0],
						ingredient: input.catalog.find(
							(item) => item.id === row.ingredientId,
						)?.name,
						quantity: row.quantity,
						member: row.memberId
							? input.memberLabels.find(
									(member) => member.memberId === row.memberId,
								)?.member
							: "shared",
					})),
					availableIngredients: available.map((item, index) => ({
						catalogKey: `ingredient-${index + 1}`,
						name: item.name,
						unit: item.unit,
						basisAmount: item.basisAmount,
						nutrition: [
							item.nutrition.calories,
							item.nutrition.protein,
							item.nutrition.carbs,
							item.nutrition.fat,
							item.nutrition.fiber,
						],
					})),
					settledMeals: input.currentDay.map((row) => ({
						ingredient: input.catalog.find(
							(item) => item.id === row.ingredientId,
						)?.name,
						quantity: row.quantity,
					})),
					savedMenuChoices: adjustExisting ? [] : input.savedMenus,
					targets: input.targets.map(
						({ memberId: _memberId, ...target }) => target,
					),
					priorCombinations: input.prior,
					settledSnackMembers: input.settledSnackMembers,
					dailySnackLimits: input.dailySnackLimits,
					constraints: {
						recommendations: 5,
						adjustedSavedMenus: adjustExisting
							? 0
							: Math.min(2, input.savedMenus.length),
						newCompositions: adjustExisting
							? 5
							: 5 - Math.min(2, input.savedMenus.length),
						maxProteinDenseGramsPerPersonPerMeal: 250,
						maxCaloriesOverTargetPercent: 5,
						maxCompanionSnacks: input.meal.slot === "dinner" ? 2 : 1,
						sharedDinner: input.meal.slot === "dinner",
					},
				}),
			},
		],
		response_format: {
			type: "json_schema",
			json_schema: {
				name: "meal_recommendations",
				strict: true,
				schema: {
					type: "object",
					additionalProperties: false,
					required: ["recommendations"],
					properties: {
						recommendations: {
							type: "array",
							minItems: 5,
							maxItems: 5,
							items: {
								type: "object",
								additionalProperties: false,
								required: [
									"name",
									"origin",
									"savedMenuKey",
									"justification",
									"cookingNote",
									"ingredients",
									"removals",
									"companionSnacks",
								],
								properties: {
									name: { type: "string" },
									origin: { type: "string", enum: ["saved", "new"] },
									savedMenuKey: { type: "string" },
									justification: { type: "string" },
									cookingNote: { type: "string" },
									removals: {
										type: "array",
										maxItems: 50,
										items: {
											type: "object",
											additionalProperties: false,
											required: ["catalogKey", "member"],
											properties: {
												catalogKey: { type: "string" },
												member: {
													type: "string",
													enum: ["shared", "Member A", "Member B"],
												},
											},
										},
									},
									ingredients: {
										type: "array",
										items: {
											type: "object",
											additionalProperties: false,
											required: [
												"catalogKey",
												"usdaQuery",
												"quantity",
												"member",
											],
											properties: {
												catalogKey: { type: "string" },
												usdaQuery: { type: "string" },
												quantity: {
													type: "number",
													exclusiveMinimum: 0,
													maximum: 100000,
												},
												member: {
													type: "string",
													enum: ingredientMemberValues,
												},
											},
										},
									},
									companionSnacks: {
										type: "array",
										maxItems: 2,
										items: {
											type: "object",
											additionalProperties: false,
											required: [
												"member",
												"name",
												"justification",
												"ingredients",
											],
											properties: {
												member: {
													type: "string",
													enum: ["Member A", "Member B"],
												},
												name: { type: "string" },
												justification: { type: "string" },
												ingredients: {
													type: "array",
													items: {
														type: "object",
														additionalProperties: false,
														required: ["catalogKey", "quantity"],
														properties: {
															catalogKey: { type: "string" },
															quantity: {
																type: "number",
																exclusiveMinimum: 0,
																maximum: 100000,
															},
														},
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
			},
		},
	};
	aiTrace("OpenRouter", "meal prompt", {
		model: requestBody.model,
		messages: requestBody.messages,
		promptCharacters: requestBody.messages.reduce(
			(total, message) => total + message.content.length,
			0,
		),
	});
	const recommendationStartedAt = performance.now();
	const response = await fetch(
		"https://openrouter.ai/api/v1/chat/completions",
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${key}`,
				"Content-Type": "application/json",
				"HTTP-Referer": "https://piring-kita.local",
				"X-Title": "Piring Kita",
			},
			body: JSON.stringify(requestBody),
		},
	);
	const payload = (await response.json()) as any;
	const modelDurationMs = Math.round(
		performance.now() - recommendationStartedAt,
	);
	aiTrace("OpenRouter", "meal response", {
		status: response.status,
		model: payload?.model,
		durationMs: modelDurationMs,
		usage: payload?.usage,
		content: payload?.choices?.[0]?.message?.content ?? null,
	});
	if (!response.ok)
		throw new Error(
			"AI recommendations are temporarily unavailable. Please retry.",
		);
	let parsed: any;
	try {
		parsed = JSON.parse(payload.choices?.[0]?.message?.content ?? "");
	} catch {
		throw new Error("AI returned an unreadable recommendation. Please retry.");
	}
	if (
		!Array.isArray(parsed?.recommendations) ||
		parsed.recommendations.length > 5
	)
		throw new Error("AI returned invalid recommendations. Please retry.");
	if (!adjustExisting) {
		const saved = parsed.recommendations.filter(
			(proposal: any) => proposal?.origin === "saved",
		);
		const fresh = parsed.recommendations.filter(
			(proposal: any) => proposal?.origin === "new",
		);
		if (saved.length > 2 || !fresh.length)
			throw new Error(
				"AI did not return the required mix of saved-menu and new ideas. Please retry.",
			);
	}
	const known = new Map(input.catalog.map((item) => [item.id, item]));
	const proposalResults = await Promise.allSettled<Proposal | null>(
		parsed.recommendations.map(async (proposal: any, index: number) => {
				if (
					!proposal ||
					typeof proposal.name !== "string" ||
					!proposal.name.trim() ||
					proposal.name.length > 120 ||
					!["saved", "new"].includes(proposal.origin) ||
					typeof proposal.savedMenuKey !== "string" ||
					typeof proposal.justification !== "string" ||
					proposal.justification.length > 1000 ||
					typeof proposal.cookingNote !== "string" ||
					proposal.cookingNote.length > 1000 ||
					!Array.isArray(proposal.ingredients) ||
					proposal.ingredients.length === 0 ||
					proposal.ingredients.length > 50 ||
					!Array.isArray(proposal.removals) ||
					proposal.removals.length > 50 ||
					!proposal.removals.every(
						(item: any) =>
							item &&
							typeof item.catalogKey === "string" &&
							["shared", "Member A", "Member B"].includes(item.member),
					)
				)
					throw new Error(
						"AI returned an invalid recommendation. Please retry.",
					);
				if (adjustExisting) {
					proposal.origin = "new";
					proposal.savedMenuKey = "";
				}
				if (!input.meal.ingredients.length && proposal.origin === "saved") {
					const savedMenu = input.savedMenus.find(
						(menu) => menu.key === proposal.savedMenuKey,
					);
					if (
						!savedMenu ||
						!proposal.ingredients.some((row: any) =>
							savedMenu.ingredients.some(
								(entry) =>
									byKey.get(row.catalogKey)?.id ===
									byKey.get(entry.catalogKey)?.id,
							),
						)
					)
						throw new Error(
							"AI returned an invalid saved-menu choice. Please retry.",
						);
				} else if (proposal.origin !== "new" || proposal.savedMenuKey)
					throw new Error(
						"AI returned an invalid recommendation origin. Please retry.",
					);
				const newIngredients: Ingredient[] = [];
				for (const row of proposal.ingredients) {
					let item = row.catalogKey ? byKey.get(row.catalogKey) : undefined;
					if (
						!num(row.quantity) ||
						row.quantity <= 0 ||
						row.quantity > 100000 ||
						!["shared", "Member A", "Member B"].includes(row.member)
					)
						throw new Error(
							"AI returned an unsupported ingredient or quantity. Please retry.",
						);
					if (item) {
						if (!item.suggestible && !existingIds.has(item.id))
							throw new Error(
								"AI returned an unsupported ingredient. Please retry.",
							);
					} else if (
						!row.usdaQuery ||
						typeof row.usdaQuery !== "string" ||
						row.usdaQuery.length > 120 ||
						row.catalogKey
					)
						throw new Error(
							"AI returned an unsupported ingredient. Please retry.",
						);
					else {
						if (input.meal.ingredients.length && index === 0) return null;
						const match = (await searchUsda(row.usdaQuery)).find(
							(candidate) =>
								candidate.description.trim().toLocaleLowerCase() ===
								row.usdaQuery.trim().toLocaleLowerCase(),
						);
						if (!match)
							throw new Error(
								"No exact verified USDA match was found for an external ingredient.",
							);
						const existingMatch = input.catalog.find(
							(candidate) =>
								candidate.id === `fdc-${match.fdcId}` ||
								new RegExp(`\\bFDC ${match.fdcId}\\b`).test(candidate.source) ||
								candidate.name.toLocaleLowerCase() ===
									match.description.toLocaleLowerCase() ||
								candidate.aliases.some(
									(alias) =>
										alias.toLocaleLowerCase() ===
										match.description.toLocaleLowerCase(),
								),
						);
						item = existingMatch ?? {
							id: `fdc-${match.fdcId}`,
							name: match.description,
							aliases: [],
							unit: "g",
							basisAmount: 100,
							preparation: "",
							source: match.source,
							suggestible: true,
							nutrition: match.nutrition,
						};
						if (item.unit !== "g") {
							if (!item.equivalentGrams)
								throw new Error(
									"USDA ingredients must map to grams or a catalog unit with a gram equivalent.",
								);
							row.quantity /= item.equivalentGrams;
						}
						if (
							!existingMatch &&
							!newIngredients.some((entry) => entry.id === item?.id)
						)
							newIngredients.push(item);
					}
					known.set(item.id, item);
					const gramsPerUnit = item.unit === "g" ? 1 : item.equivalentGrams;
					const perPersonQuantity =
						input.meal.slot === "dinner" &&
						!input.meal.ingredients.find(
							(current) => current.ingredientId === item.id,
						)?.memberId
							? row.quantity / 2
							: row.quantity;
					if (
						item.nutrition.protein >= 10 &&
						gramsPerUnit !== undefined &&
						perPersonQuantity * gramsPerUnit > 250
					)
						throw new Error(
							"AI returned an impractical ingredient quantity. Please retry.",
						);
					row.quantity =
						item.unit === "g"
							? Math.max(5, Math.round(row.quantity / 5) * 5)
							: item.unit === "tbsp"
								? Math.max(0.5, Math.round(row.quantity * 2) / 2)
								: Math.max(1, Math.round(row.quantity));
					row.ingredientId = item.id;
					if (input.meal.slot === "dinner" && row.member !== "shared") {
						const member = input.memberLabels.find(
							(entry) => entry.member === row.member,
						);
						if (!member)
							throw new Error(
								"AI returned an invalid shared-dinner portion. Please retry.",
							);
						row.memberId = member.memberId;
					}
					delete row.member;
					delete row.catalogKey;
					delete row.usdaQuery;
				}
				const rowKey = (ingredientId: string, memberId?: MemberId) =>
					JSON.stringify([ingredientId, memberId ?? "shared"]);
				if (index === 0 && input.meal.ingredients.length) {
					const before = JSON.stringify(
						input.meal.ingredients
							.map((row) => rowKey(row.ingredientId, row.memberId))
							.sort(),
					);
					const after = JSON.stringify(
						proposal.ingredients
							.map((row: MenuIngredient) => rowKey(row.ingredientId, row.memberId))
							.sort(),
					);
					if (before !== after) return null;
				}
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
				if (index === 0 && input.meal.ingredients.length && removedRows.length)
					return null;
				proposal.removals = removedRows.map((row) => {
					const name =
						input.catalog.find((item) => item.id === row.ingredientId)?.name ??
						"Ingredient";
					return row.memberId
						? name +
								" (" +
								(input.memberLabels.find(
									(entry) => entry.memberId === row.memberId,
								)?.member ?? "member") +
								")"
						: name;
				});
				if (
					input.meal.slot === "snack" &&
					input.snackLimitCalories !== undefined
				) {
					const calories = proposal.ingredients.reduce(
						(sum: number, row: MenuIngredient) =>
							sum +
							((known.get(row.ingredientId)?.nutrition.calories ?? 0) *
								row.quantity) /
								(known.get(row.ingredientId)?.basisAmount ?? 1),
						0,
					);
					if (calories > input.snackLimitCalories)
						throw new Error(
							"Suggested snack would exceed 25% of the daily calorie target. Please retry.",
						);
				}
				const maxCompanions =
					input.meal.slot === "dinner"
						? 2
						: input.meal.slot === "lunch"
							? 1
							: 0;
				if (
					!Array.isArray(proposal.companionSnacks) ||
					proposal.companionSnacks.length > maxCompanions
				)
					throw new Error(
						"AI returned invalid companion snacks. Please retry.",
					);
				const companionSnacks: Proposal["companionSnacks"] = [];
				const companionMembers = new Set<MemberId>();
				for (const snack of proposal.companionSnacks) {
					if (
						!snack ||
						typeof snack.member !== "string" ||
						typeof snack.name !== "string" ||
						!snack.name.trim() ||
						snack.name.length > 120 ||
						typeof snack.justification !== "string" ||
						!Array.isArray(snack.ingredients) ||
						snack.ingredients.length === 0 ||
						snack.ingredients.length > 20
					)
						throw new Error(
							"AI returned invalid companion snacks. Please retry.",
						);
					const member = input.memberLabels.find(
						(entry) => entry.member === snack.member,
					);
					if (
						!member ||
						companionMembers.has(member.memberId) ||
						input.settledSnackMembers.includes(snack.member) ||
						(input.meal.slot !== "dinner" &&
							member.memberId !== input.meal.memberId)
					)
						continue;
					const limit = input.dailySnackLimits.find(
						(entry) => entry.member === snack.member,
					)?.calories;
					if (!limit) continue;
					const nutrition: Nutrition = {
						calories: 0,
						protein: 0,
						carbs: 0,
						fat: 0,
						fiber: 0,
					};
					const rows: MenuIngredient[] = [];
					for (const row of snack.ingredients) {
						const item = byKey.get(row.catalogKey);
						if (
							!item?.suggestible ||
							!num(row.quantity) ||
							row.quantity <= 0 ||
							row.quantity > 100000
						)
							throw new Error(
								"AI returned an unsupported snack ingredient. Please retry.",
							);
						const gramsPerUnit = item.unit === "g" ? 1 : item.equivalentGrams;
						if (
							item.nutrition.protein >= 10 &&
							gramsPerUnit !== undefined &&
							row.quantity * gramsPerUnit > 250
						)
							throw new Error(
								"AI returned an impractical snack quantity. Please retry.",
							);
						const quantity =
							item.unit === "g"
								? Math.max(5, Math.round(row.quantity / 5) * 5)
								: item.unit === "tbsp"
									? Math.max(0.5, Math.round(row.quantity * 2) / 2)
									: Math.max(1, Math.round(row.quantity));
						rows.push({ ingredientId: item.id, quantity });
						for (const key of [
							"calories",
							"protein",
							"carbs",
							"fat",
							"fiber",
						] as const)
							nutrition[key] +=
								(item.nutrition[key] * quantity) / item.basisAmount;
					}
					if (nutrition.calories <= limit) {
						companionMembers.add(member.memberId);
						companionSnacks.push({
							memberId: member.memberId,
							name: snack.name,
							justification: snack.justification,
							ingredients: rows,
							nutrition,
						});
					}
				}
				const mealNutrition = (rows: MenuIngredient[], memberId: MemberId) =>
					rows.reduce(
						(total, row) => {
							const item = known.get(row.ingredientId);
							if (
								!item ||
								(input.meal.slot !== "dinner" &&
									input.meal.memberId !== memberId) ||
								(input.meal.slot === "dinner" &&
									row.memberId &&
									row.memberId !== memberId)
							)
								return total;
							const factor =
								input.meal.slot === "dinner" && !row.memberId ? 0.5 : 1;
							for (const key of [
								"calories",
								"protein",
								"carbs",
								"fat",
								"fiber",
							] as const)
								total[key] +=
									((item.nutrition[key] * row.quantity) / item.basisAmount) *
									factor;
							return total;
						},
						{ calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
					);
				const deltas = input.targets.map((target) => {
					const oldMeal = mealNutrition(
						input.meal.ingredients,
						target.memberId,
					);
					const newMeal = mealNutrition(proposal.ingredients, target.memberId);
					const companion = companionSnacks
						.filter((snack) => snack.memberId === target.memberId)
						.reduce(
							(total, snack) => {
								for (const key of [
									"calories",
									"protein",
									"carbs",
									"fat",
									"fiber",
								] as const)
									total[key] += snack.nutrition[key];
								return total;
							},
							{ calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
						);
					const caloriesAfter =
						target.currentCalories -
						oldMeal.calories +
						newMeal.calories +
						companion.calories;
					const currentCalories = target.currentCalories;
					if (
						!target.referenceOnly &&
						caloriesAfter > target.dailyCalories * 1.05 &&
						caloriesAfter > currentCalories
					)
						return null;
					const proteinSources = new Map<string, number>();
					proposal.ingredients.forEach((row: MenuIngredient) => {
						const item = known.get(row.ingredientId);
						if (
							!item ||
							(input.meal.slot === "dinner" &&
								row.memberId &&
								row.memberId !== target.memberId)
						)
							return;
						const protein =
							((item.nutrition.protein * row.quantity) / item.basisAmount) *
							(input.meal.slot === "dinner" && !row.memberId ? 0.5 : 1);
						if (protein > 0.5)
							proteinSources.set(
								item.id,
								(proteinSources.get(item.id) ?? 0) + protein,
							);
					});
					const alternatives = available.filter(
						(item) => item.suggestible && item.nutrition.protein > 0,
					).length;
					const sourceWarning =
						newMeal.protein > 30 &&
						alternatives > 1 &&
						(proteinSources.size < 2 ||
							Math.max(...proteinSources.values(), 0) / newMeal.protein > 0.7);
					if (sourceWarning && index > 0) return null;
					return {
						member: target.member,
						memberId: target.memberId,
						caloriesAfter,
						calorieTarget: target.dailyCalories,
						overCaloriesBy: Math.max(0, caloriesAfter - target.dailyCalories),
						proteinAfter:
							target.currentProtein -
							oldMeal.protein +
							newMeal.protein +
							companion.protein,
						proteinTarget: target.dailyProtein,
						carbsAfter:
							target.currentCarbs -
							oldMeal.carbs +
							newMeal.carbs +
							companion.carbs,
						carbsTarget: target.dailyCarbs,
						fatAfter:
							target.currentFat - oldMeal.fat + newMeal.fat + companion.fat,
						fatTarget: target.dailyFat,
						fiberAfter:
							target.currentFiber -
							oldMeal.fiber +
							newMeal.fiber +
							companion.fiber,
						fiberTarget: target.dailyFiber,
						proteinDelta: newMeal.protein - oldMeal.protein + companion.protein,
						carbsDelta: newMeal.carbs - oldMeal.carbs + companion.carbs,
						fatDelta: newMeal.fat - oldMeal.fat + companion.fat,
						fiberDelta: newMeal.fiber - oldMeal.fiber + companion.fiber,
						...(sourceWarning
							? {
									sourceWarning:
										"Protein comes from one main source; consider adding a second source.",
								}
							: {}),
					};
				});
				if (deltas.includes(null)) return null;
				return {
					...proposal,
					newIngredients,
					ingredients: proposal.ingredients as MenuIngredient[],
					companionSnacks,
					deltas,
				} as Proposal;
		}),
	);
	const proposals = proposalResults.flatMap((result) =>
		result.status === "fulfilled" && result.value ? [result.value] : [],
	);
	if (!proposals.length) {
		const rejected = proposalResults.find(
			(result): result is PromiseRejectedResult => result.status === "rejected",
		);
		if (rejected) throw rejected.reason;
		throw new Error(
			"AI could not produce a recommendation within the nutrition limits. Please retry.",
		);
	}
	aiTrace("OpenRouter", "meal complete", {
		durationMs: Math.round(performance.now() - recommendationStartedAt),
		modelDurationMs,
		recommendations: proposals.length,
	});
	return proposals;
}

export async function usdaIngredient(fdcId: number): Promise<Ingredient> {
	const key = process.env.USDA_API_KEY;
	if (!key)
		throw new Error(
			"USDA nutrition lookup is unavailable: USDA_API_KEY is not configured.",
		);
	aiTrace("USDA", "food request", { fdcId });
	const response = await fetch(
		`https://api.nal.usda.gov/fdc/v1/food/${fdcId}?api_key=${encodeURIComponent(key)}`,
	);
	const food = (await response.json()) as any;
	if (!response.ok) {
		aiTrace("USDA", "food response", {
			status: response.status,
			fdcId,
			error: food?.error?.message ?? food?.message ?? null,
		});
		throw new Error("USDA FoodData Central lookup failed. Please retry.");
	}
	const nutrients = new Map(
		(food.foodNutrients ?? []).map((entry: any) => [
			String(
				entry.nutrient?.number ??
					entry.nutrient?.id ??
					entry.nutrientNumber ??
					entry.nutrientId,
			),
			entry.amount ?? entry.value,
		]),
	);
	const value = (...ids: string[]) => {
		for (const id of ids) {
			const found = nutrients.get(id);
			if (typeof found === "number" && Number.isFinite(found)) return found;
		}
		return undefined;
	};
	const calories = value("208", "1008"),
		protein = value("203", "1003"),
		carbs = value("205", "1005"),
		fat = value("204", "1004"),
		fiber = value("291", "1079");
	aiTrace("USDA", "food response", {
		status: response.status,
		fdcId: food.fdcId,
		description: food.description,
		dataType: food.dataType,
		nutrition: { calories, protein, carbs, fat, fiber },
	});
	if (
		food.fdcId !== fdcId ||
		typeof food.description !== "string" ||
		[calories, protein, carbs, fat, fiber].some((x) => x === undefined)
	)
		throw new Error(
			"USDA record does not contain complete verified nutrition.",
		);
	return {
		id: `fdc-${fdcId}`,
		name: food.description,
		aliases: [],
		unit: "g",
		basisAmount: 100,
		preparation: "",
		source: `USDA FoodData Central ${food.dataType}, FDC ${fdcId} (https://fdc.nal.usda.gov/food-details/${fdcId}/nutrients)`,
		suggestible: true,
		nutrition: {
			calories: calories!,
			protein: protein!,
			carbs: carbs!,
			fat: fat!,
			fiber: fiber!,
		},
	};
}

export async function usdaIngredientPortions(
	fdcId: number,
): Promise<{ label: string; amount: number; gramWeight: number }[]> {
	const key = process.env.USDA_API_KEY;
	if (!key)
		throw new Error(
			"USDA nutrition lookup is unavailable: USDA_API_KEY is not configured.",
		);
	const response = await fetch(
		`https://api.nal.usda.gov/fdc/v1/food/${fdcId}?api_key=${encodeURIComponent(key)}`,
	);
	const food = (await response.json()) as any;
	if (!response.ok) {
		aiTrace("USDA", "portion response", {
			status: response.status,
			fdcId,
			error: food?.error?.message ?? food?.message ?? null,
		});
		throw new Error("USDA FoodData Central lookup failed. Please retry.");
	}
	if (!food || typeof food !== "object" || food.fdcId !== fdcId)
		throw new Error("USDA record does not match the requested food.");
	const portions = (Array.isArray(food.foodPortions) ? food.foodPortions : [])
		.map((portion: any) => {
			if (!portion || typeof portion !== "object") return null;
			const amount = portion.amount;
			const gramWeight = portion.gramWeight;
			if (
				typeof amount !== "number" ||
				!Number.isFinite(amount) ||
				amount <= 0 ||
				typeof gramWeight !== "number" ||
				!Number.isFinite(gramWeight) ||
				gramWeight <= 0
			)
				return null;
			const measure = portion.measureUnit?.name ?? portion.measureUnit?.abbreviation;
			const detail = [portion.modifier, portion.portionDescription]
				.filter((value: unknown) => typeof value === "string" && value.trim())
				.join(" ");
			return {
				label: [amount, measure, detail].filter(Boolean).join(" "),
				amount,
				gramWeight,
			};
		})
		.filter(
			(portion: any): portion is { label: string; amount: number; gramWeight: number } =>
				portion !== null,
		);
	if (
		!portions.length &&
		typeof food.servingSizeUnit === "string" &&
		food.servingSizeUnit.toLocaleLowerCase() === "g" &&
		typeof food.servingSize === "number" &&
		Number.isFinite(food.servingSize) &&
		food.servingSize > 0
	)
		portions.push({
			label: `1 serving (${food.servingSize} g)`,
			amount: 1,
			gramWeight: food.servingSize,
		});
	aiTrace("USDA", "portion response", { fdcId, portions });
	return portions;
}

const genericUsdaTypes = ["Foundation", "SR Legacy", "Survey (FNDDS)"];
const riceFallbackQuery = "rice white long grain regular cooked";

export async function searchUsda(
	query: string,
	context: { primaryName?: string; preparation?: string } = {},
) {
	const key = process.env.USDA_API_KEY;
	if (!key)
		throw new Error(
			"USDA nutrition lookup is unavailable: USDA_API_KEY is not configured.",
		);
	const url = new URL("https://api.nal.usda.gov/fdc/v1/foods/search");
	url.searchParams.set("api_key", key);
	const requestedPreparation = context.preparation?.trim() ?? "";
	const searchQuery =
		requestedPreparation &&
		!query
			.toLocaleLowerCase()
			.includes(requestedPreparation.toLocaleLowerCase())
			? `${query} ${requestedPreparation}`
			: query;
	const requestBody = {
		query: searchQuery,
		dataType: genericUsdaTypes,
		pageSize: 10,
	};
	aiTrace("USDA", "search request", requestBody);
	const response = await fetch(url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(requestBody),
	});
	const body = (await response.json()) as any;
	if (!response.ok) {
		aiTrace("USDA", "search response", {
			status: response.status,
			error: body?.error?.message ?? body?.message ?? null,
		});
		throw new Error("USDA FoodData Central lookup failed. Please retry.");
	}
	if (Array.isArray(body.foods) && body.foods.length) {
		const priorities = new Map(
			genericUsdaTypes.map((type, index) => [type, index]),
		);
		const contextText = [
			context.primaryName ?? query,
			context.preparation ?? "",
			query,
		]
			.join(" ")
			.toLocaleLowerCase();
		const explicitPrep = /\b(raw|cooked|dry|uncooked|boiled|steamed)\b/i.test(
			contextText,
		);
		const defaultCookedRice =
			/\bjasmine\s+rice\b/i.test(context.primaryName ?? query) && !explicitPrep;
		const requestedCooked =
			/\b(cooked|boiled|steamed)\b/i.test(context.preparation ?? "") ||
			/\b(cooked|boiled|steamed)\b/i.test(query) ||
			defaultCookedRice;
		const requestedRaw =
			/\b(raw|dry|uncooked)\b/i.test(context.preparation ?? "") ||
			/\b(raw|dry|uncooked)\b/i.test(query);
		const ignoredTokens = new Set([
			"raw",
			"cooked",
			"dry",
			"uncooked",
			"boiled",
			"steamed",
			"fresh",
			"frozen",
			"cubed",
			"sliced",
			"chopped",
			"fruit",
			"juice",
		]);
		const tokens = query
			.toLocaleLowerCase()
			.split(/[^a-z0-9]+/)
			.filter((word) => word.length > 1 && !ignoredTokens.has(word));
		const relevance = (food: any) => {
			const textTokens = new Set(
				String(food.description ?? "")
					.toLocaleLowerCase()
					.split(/[^a-z0-9]+/),
			);
			return tokens.reduce(
				(total, token) => total + (textTokens.has(token) ? 10 : 0),
				0,
			);
		};
		const score = (food: any) => {
			const text = String(food.description ?? "")
				.toLocaleLowerCase()
				.replace(/[^a-z0-9]+/g, " ");
			const cooked = /\b(cooked|boiled|steamed)\b/.test(text);
			const raw = /\b(raw|dry|uncooked)\b/.test(text);
			const prepScore = requestedCooked
				? cooked
					? 100
					: raw
						? -100
						: 0
				: requestedRaw
					? raw
						? 100
						: cooked
							? -100
							: 0
					: 0;
			return prepScore + relevance(food);
		};
		const foods = body.foods
			.filter((food: any) => genericUsdaTypes.includes(food.dataType))
			.filter((food: any) => !tokens.length || relevance(food) > 0)
			.sort(
				(a: any, b: any) =>
					score(b) - score(a) ||
					(priorities.get(a.dataType) ?? 99) -
						(priorities.get(b.dataType) ?? 99),
			)
			.slice(0, 3);
		const results = foods
			.map((food: any) => {
				const nutrients = new Map(
					(food.foodNutrients ?? []).map((n: any) => [
						n.nutrientNumber ?? String(n.nutrientId),
						n.value,
					]),
				);
				const value = (...ids: string[]) => {
					for (const id of ids) {
						const found = nutrients.get(id);
						if (typeof found === "number" && Number.isFinite(found))
							return found;
					}
					return undefined;
				};
				const calorie = value("208", "1008"),
					protein = value("203", "1003"),
					carbs = value("205", "1005"),
					fat = value("204", "1004"),
					fiber = value("291", "1079");
				if (
					[calorie, protein, carbs, fat, fiber].some(
						(item) => item === undefined,
					)
				)
					return null;
				const nutrition: Nutrition = {
					calories: calorie!,
					protein: protein!,
					carbs: carbs!,
					fat: fat!,
					fiber: fiber!,
				};
				return {
					fdcId: food.fdcId,
					description: food.description,
					dataType: food.dataType,
					source: `USDA FoodData Central ${food.dataType}, FDC ${food.fdcId} (https://fdc.nal.usda.gov/food-details/${food.fdcId}/nutrients)`,
					nutrition,
				};
			})
			.filter(Boolean);
		const primaryName = context.primaryName ?? query;
		const noPrepSpecified =
			!/\b(raw|cooked|dry|uncooked|boiled|steamed)\b/i.test(
				[primaryName, context.preparation ?? "", query].join(" "),
			);
		aiTrace("USDA", "search response", {
			status: response.status,
			totalHits: body.totalHits,
			results,
		});
		if (
			/\bjasmine\s+rice\b/i.test(primaryName) &&
			noPrepSpecified &&
			!results.some(
				(item: any) =>
					/rice/i.test(item.description) &&
					/cooked/i.test(item.description) &&
					/(white|long[- ]grain)/i.test(item.description),
			)
		)
			return searchUsda(riceFallbackQuery, {
				primaryName,
				preparation: "cooked",
			});
		return results;
	}
	aiTrace("USDA", "search response", {
		status: response.status,
		totalHits: body.totalHits ?? 0,
		results: [],
	});
	const primaryName = context.primaryName ?? query;
	const noPrepSpecified = !/\b(raw|cooked|dry|uncooked|boiled|steamed)\b/i.test(
		[primaryName, context.preparation ?? "", query].join(" "),
	);
	if (/\bjasmine\s+rice\b/i.test(primaryName) && noPrepSpecified)
		return searchUsda(riceFallbackQuery, {
			primaryName,
			preparation: "cooked",
		});
	return [];
}

export async function ingredientAliases(name: string, preparation = "") {
	if (/^snake\s*fruit$/i.test(name.trim()))
		return {
			aliases: ["salak", "snake fruit", "snakefruit"],
			usdaQuery: ["salak", preparation.trim()].filter(Boolean).join(" "),
		};
	const key = process.env.OPENROUTER_API_KEY;
	const model = process.env.OPENROUTER_ALIAS_MODEL?.trim();
	if (!key || !model) return { aliases: [], usdaQuery: name };
	try {
		const requestBody = {
			model,
			provider: { require_parameters: true },
			messages: [
				{
					role: "system",
					content:
						"Translate the food name into concise English and Indonesian aliases. Return a generic USDA-style food description in English as usdaQuery, including preparation. Preserve explicitly supplied preparation and raw-versus-cooked wording. If preparation is absent, prefer cooked for foods normally logged cooked, including rice, pasta, beans, and lentils. Never include brand names or marketing language. Nutrition values must never be generated; USDA FoodData Central is the only nutrition source.",
				},
				{ role: "user", content: JSON.stringify({ name, preparation }) },
			],
			response_format: {
				type: "json_schema",
				json_schema: {
					name: "ingredient_aliases",
					strict: true,
					schema: {
						type: "object",
						additionalProperties: false,
						required: ["aliases", "usdaQuery"],
						properties: {
							aliases: {
								type: "array",
								maxItems: 8,
								items: { type: "string" },
							},
							usdaQuery: { type: "string" },
						},
					},
				},
			},
		};
		aiTrace("OpenRouter", "alias prompt", {
			model: requestBody.model,
			messages: requestBody.messages,
		});
		const response = await fetch(
			"https://openrouter.ai/api/v1/chat/completions",
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${key}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(requestBody),
			},
		);
		const body = (await response.json()) as any;
		aiTrace("OpenRouter", "alias response", {
			status: response.status,
			model: body?.model,
			usage: body?.usage,
			content: body?.choices?.[0]?.message?.content ?? null,
		});
		if (!response.ok) return { aliases: [], usdaQuery: name };
		const result = JSON.parse(body.choices?.[0]?.message?.content ?? "{}");
		const aliases = Array.isArray(result.aliases)
			? result.aliases
					.filter((item: unknown) => typeof item === "string")
					.flatMap((item: string) =>
						item.replace(/^(English|Indonesian)\s*:\s*/i, "").split(/[,;]/),
					)
					.map((item: string) => item.trim())
					.filter(
						(item: string) =>
							item &&
							item.toLocaleLowerCase() !== name.trim().toLocaleLowerCase(),
					)
					.filter(
						(item: string, index: number, list: string[]) =>
							list.findIndex(
								(other) =>
									other.toLocaleLowerCase() === item.toLocaleLowerCase(),
							) === index,
					)
					.slice(0, 8)
			: [];
		return {
			aliases,
			usdaQuery:
				typeof result.usdaQuery === "string" && result.usdaQuery.trim()
					? result.usdaQuery.trim()
					: name,
		};
	} catch (error) {
		aiTrace("OpenRouter", "alias error", {
			message: error instanceof Error ? error.message : "Unknown error",
		});
		return { aliases: [], usdaQuery: name };
	}
}
