import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type {
	AppData,
	Ingredient,
	MealSlot,
	MemberId,
	MemberProfile,
	MenuIngredient,
	Nutrition,
	SavedMenu,
	ScheduledMeal,
	TargetPreview,
	TargetPreviewRequest,
	WeeklyTarget,
} from "@piring-kita/shared";
import express, {
	type NextFunction,
	type Request,
	type Response,
} from "express";

const defaultPath = resolve(import.meta.dir, "../data/piring-kita.sqlite");

const seedIngredients: Ingredient[] = [
	{
		id: "rice",
		name: "Jasmine rice",
		aliases: ["beras", "rice"],
		unit: "g",
		basisAmount: 100,
		preparation: "Cooked",
		source: "User-entered (prototype)",
		suggestible: false,
		nutrition: { calories: 130, protein: 2.7, fat: 0.3, carbs: 28, fiber: 0.4 },
	},
	{
		id: "chicken",
		name: "Chicken breast",
		aliases: ["ayam", "chicken"],
		unit: "g",
		basisAmount: 100,
		preparation: "Raw / unspecified",
		source: "User-entered (prototype)",
		suggestible: true,
		nutrition: { calories: 165, protein: 31, fat: 3.6, carbs: 0, fiber: 0 },
	},
	{
		id: "beef",
		name: "Beef",
		aliases: ["daging sapi", "sapi", "beef"],
		unit: "g",
		basisAmount: 100,
		preparation: "Raw / unspecified",
		source: "User-entered (prototype)",
		suggestible: false,
		nutrition: { calories: 250, protein: 26, fat: 15, carbs: 0, fiber: 0 },
	},
	{
		id: "tofu",
		name: "Firm tofu",
		aliases: ["tahu", "tofu"],
		unit: "g",
		basisAmount: 100,
		preparation: "Firm",
		source: "User-entered (prototype)",
		suggestible: true,
		nutrition: { calories: 144, protein: 15, fat: 8, carbs: 3, fiber: 2 },
	},
	{
		id: "broccoli",
		name: "Broccoli",
		aliases: ["brokoli", "broccoli"],
		unit: "g",
		basisAmount: 100,
		preparation: "Raw / unspecified",
		source: "User-entered (prototype)",
		suggestible: true,
		nutrition: { calories: 34, protein: 2.8, fat: 0.4, carbs: 7, fiber: 2.6 },
	},
	{
		id: "egg",
		name: "Egg",
		aliases: ["telur", "egg"],
		unit: "piece",
		basisAmount: 1,
		equivalentGrams: 50,
		preparation: "Whole",
		source: "User-entered (prototype)",
		suggestible: false,
		nutrition: { calories: 78, protein: 6.3, fat: 5.3, carbs: 0.6, fiber: 0 },
	},
	{
		id: "avocado",
		name: "Avocado",
		aliases: ["alpukat", "avocado"],
		unit: "g",
		basisAmount: 100,
		preparation: "Raw",
		source: "User-entered (prototype)",
		suggestible: true,
		nutrition: { calories: 160, protein: 2, fat: 15, carbs: 9, fiber: 7 },
	},
	{
		id: "banana",
		name: "Banana",
		aliases: ["pisang", "banana"],
		unit: "piece",
		basisAmount: 1,
		equivalentGrams: 118,
		preparation: "Raw",
		source: "User-entered (prototype)",
		suggestible: true,
		nutrition: { calories: 105, protein: 1.3, fat: 0.4, carbs: 27, fiber: 3.1 },
	},
	{
		id: "peanut",
		name: "Peanut butter",
		aliases: ["selai kacang", "peanut butter"],
		unit: "g",
		basisAmount: 100,
		preparation: "Smooth",
		source: "User-entered (prototype)",
		suggestible: false,
		nutrition: { calories: 588, protein: 25, fat: 50, carbs: 20, fiber: 6 },
	},
];

const seedMembers: MemberProfile[] = [
	{
		id: "richard",
		name: "Richard",
		birthday: "1987-03-12",
		sex: "male",
		heightCm: 174,
		currentWeightKg: 78,
		activityLevel: "low",
		activityFactor: 1.6,
	},
	{
		id: "michelle",
		name: "Michelle",
		birthday: "1990-07-22",
		sex: "female",
		heightCm: 163,
		currentWeightKg: 62,
		activityLevel: "inactive",
		activityFactor: 1.4,
	},
];

const seedTargets: WeeklyTarget[] = [
	{
		memberId: "richard",
		weekStart: "2026-10-05",
		deficitPercent: 20,
		weekendReserve: 400,
		proteinPercent: 25,
		carbsPercent: 45,
		fatPercent: 30,
		fiberGrams: 30,
		weeklyCalories: 15030.4,
		weekdayCalories: 2090.057142857143,
		macroGrams: { protein: 130.625, carbs: 235.125, fat: 69.66666666666667 },
	},
	{
		memberId: "michelle",
		weekStart: "2026-10-05",
		deficitPercent: 20,
		weekendReserve: 400,
		proteinPercent: 25,
		carbsPercent: 45,
		fatPercent: 30,
		fiberGrams: 25,
		weeklyCalories: 10174.36,
		weekdayCalories: 1396.337142857143,
		macroGrams: { protein: 87.25, carbs: 157.05, fat: 46.53333333333333 },
	},
];

const seedMenus: SavedMenu[] = [
	{
		id: "chicken-bowl",
		name: "Everyday chicken bowl",
		slot: "lunch",
		memberId: "richard",
		ingredients: [
			{ ingredientId: "chicken", quantity: 150 },
			{ ingredientId: "rice", quantity: 170 },
			{ ingredientId: "broccoli", quantity: 100 },
		],
	},
	{
		id: "tofu-bowl",
		name: "Green tofu bowl",
		slot: "lunch",
		memberId: "michelle",
		ingredients: [
			{ ingredientId: "tofu", quantity: 160 },
			{ ingredientId: "rice", quantity: 120 },
			{ ingredientId: "avocado", quantity: 50 },
		],
	},
];

const meal = (
	id: string,
	date: string,
	slot: MealSlot,
	memberId: MemberId | undefined,
	name: string,
	ingredients: MenuIngredient[],
): ScheduledMeal => ({
	id,
	date,
	slot,
	...(memberId ? { memberId } : {}),
	name,
	notes: "",
	ingredients,
});
const shared = (ingredientId: string, quantity: number): MenuIngredient => ({
	ingredientId,
	quantity,
});
const forMember = (
	ingredientId: string,
	quantity: number,
	memberId: MemberId,
): MenuIngredient => ({ ingredientId, quantity, memberId });
const seedMeals: ScheduledMeal[] = [
	meal(
		"seed-1005-r-lunch",
		"2026-10-05",
		"lunch",
		"richard",
		"Ginger chicken rice",
		[shared("chicken", 150), shared("rice", 180), shared("broccoli", 100)],
	),
	meal(
		"seed-1005-m-lunch",
		"2026-10-05",
		"lunch",
		"michelle",
		"Tofu greens bowl",
		[shared("tofu", 160), shared("rice", 120), shared("broccoli", 120)],
	),
	meal(
		"seed-1005-dinner",
		"2026-10-05",
		"dinner",
		undefined,
		"Miso salmon tray",
		[
			shared("broccoli", 160),
			shared("avocado", 50),
			forMember("rice", 100, "richard"),
			forMember("rice", 60, "michelle"),
		],
	),
	meal(
		"seed-1006-r-lunch",
		"2026-10-06",
		"lunch",
		"richard",
		"Chicken soba bowl",
		[shared("chicken", 140), shared("broccoli", 100), shared("egg", 1)],
	),
	meal(
		"seed-1006-m-lunch",
		"2026-10-06",
		"lunch",
		"michelle",
		"Tofu rice bowl",
		[shared("tofu", 150), shared("rice", 130), shared("avocado", 40)],
	),
	meal(
		"seed-1006-dinner",
		"2026-10-06",
		"dinner",
		undefined,
		"Coconut tofu curry",
		[
			shared("tofu", 180),
			shared("broccoli", 100),
			forMember("rice", 100, "richard"),
			forMember("rice", 60, "michelle"),
		],
	),
	meal(
		"seed-1007-r-lunch",
		"2026-10-07",
		"lunch",
		"richard",
		"Lemongrass chicken",
		[shared("chicken", 160), shared("rice", 170), shared("broccoli", 100)],
	),
	meal(
		"seed-1007-m-lunch",
		"2026-10-07",
		"lunch",
		"michelle",
		"Egg avocado toast",
		[shared("egg", 2), shared("avocado", 70), shared("broccoli", 80)],
	),
	meal(
		"seed-1007-dinner",
		"2026-10-07",
		"dinner",
		undefined,
		"Tomato tofu pasta",
		[
			shared("tofu", 180),
			shared("broccoli", 120),
			forMember("rice", 90, "richard"),
			forMember("rice", 60, "michelle"),
		],
	),
	meal(
		"seed-1007-r-snack",
		"2026-10-07",
		"snack",
		"richard",
		"Banana peanut bite",
		[shared("banana", 1), shared("peanut", 15)],
	),
	meal(
		"seed-1008-r-lunch",
		"2026-10-08",
		"lunch",
		"richard",
		"Sesame chicken bowl",
		[shared("chicken", 150), shared("rice", 170), shared("broccoli", 100)],
	),
	meal(
		"seed-1008-m-lunch",
		"2026-10-08",
		"lunch",
		"michelle",
		"Green tofu bowl",
		[shared("tofu", 160), shared("rice", 120), shared("avocado", 50)],
	),
	meal(
		"seed-1008-dinner",
		"2026-10-08",
		"dinner",
		undefined,
		"Egg fried rice",
		[
			shared("egg", 2),
			shared("broccoli", 100),
			forMember("rice", 110, "richard"),
			forMember("rice", 70, "michelle"),
		],
	),
	meal(
		"seed-1009-r-lunch",
		"2026-10-09",
		"lunch",
		"richard",
		"Chicken avocado salad",
		[shared("chicken", 150), shared("avocado", 70), shared("broccoli", 160)],
	),
	meal(
		"seed-1009-m-lunch",
		"2026-10-09",
		"lunch",
		"michelle",
		"Tofu rice salad",
		[shared("tofu", 160), shared("rice", 120), shared("broccoli", 150)],
	),
	meal(
		"seed-1009-dinner",
		"2026-10-09",
		"dinner",
		undefined,
		"Roasted chicken tray",
		[
			shared("chicken", 180),
			shared("broccoli", 160),
			forMember("rice", 100, "richard"),
			forMember("rice", 60, "michelle"),
		],
	),
	meal(
		"seed-1012-dinner",
		"2026-10-12",
		"dinner",
		undefined,
		"Ginger tofu stir fry",
		[
			shared("tofu", 180),
			shared("broccoli", 150),
			forMember("rice", 100, "richard"),
			forMember("rice", 60, "michelle"),
		],
	),
];

export function createDatabase(
	path = process.env.DB_PATH ?? defaultPath,
	seed = true,
): Database {
	if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
	const db = new Database(path);
	db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS members (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS ingredients (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS saved_menus (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS scheduled_meals (id TEXT PRIMARY KEY, date TEXT NOT NULL, slot TEXT NOT NULL, member_id TEXT NOT NULL DEFAULT '', data TEXT NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS scheduled_slot ON scheduled_meals(date, slot, member_id);
    CREATE TABLE IF NOT EXISTS targets (member_id TEXT NOT NULL, week_start TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(member_id, week_start));
  `);
	if (seed && !db.query("SELECT 1 FROM members LIMIT 1").get())
		seedDatabase(db);
	migrateLegacyWeekendReserves(db);
	return db;
}

function migrateLegacyWeekendReserves(db: Database) {
	for (const target of rows<WeeklyTarget>(db, "targets")) {
		const migrated = normalizeWeekendReserve(target);
		if (migrated === target) continue;
		put(
			db,
			"targets",
			`${migrated.memberId}|${migrated.weekStart}`,
			migrated,
			migrated.memberId,
			migrated.weekStart,
		);
	}
}

function normalizeWeekendReserve(target: WeeklyTarget) {
	return Math.abs(
		target.weeklyCalories -
			(target.weekdayCalories * 5 + target.weekendReserve),
	) <= 1
		? {
				...target,
				weekendReserve: Math.max(
					0,
					target.weekendReserve - target.weekdayCalories * 2,
				),
			}
		: target;
}

function seedDatabase(db: Database) {
	db.transaction(() => {
		seedMembers.forEach((x) => put(db, "members", x.id, x));
		seedIngredients.forEach((x) => put(db, "ingredients", x.id, x));
		seedMenus.forEach((x) => put(db, "saved_menus", x.id, x));
		seedMeals.forEach((x) => putMeal(db, x));
		seedTargets.forEach((x) =>
			put(
				db,
				"targets",
				`${x.memberId}|${x.weekStart}`,
				x,
				x.memberId,
				x.weekStart,
			),
		);
	})();
}

function put(
	db: Database,
	table: "members" | "ingredients" | "saved_menus" | "targets",
	id: string,
	value: unknown,
	memberId?: string,
	weekStart?: string,
) {
	if (table === "targets")
		db.query(
			"INSERT OR REPLACE INTO targets(member_id, week_start, data) VALUES (?, ?, ?)",
		).run(memberId, weekStart, JSON.stringify(value));
	else
		db.query(`INSERT OR REPLACE INTO ${table}(id, data) VALUES (?, ?)`).run(
			id,
			JSON.stringify(value),
		);
}
function putMeal(db: Database, value: ScheduledMeal) {
	db.query(
		"INSERT OR REPLACE INTO scheduled_meals(id, date, slot, member_id, data) VALUES (?, ?, ?, ?, ?)",
	).run(
		value.id,
		value.date,
		value.slot,
		value.memberId ?? "",
		JSON.stringify(value),
	);
}
function rows<T>(
	db: Database,
	table:
		| "members"
		| "ingredients"
		| "saved_menus"
		| "scheduled_meals"
		| "targets",
): T[] {
	return db
		.query(
			`SELECT data FROM ${table}${table === "scheduled_meals" ? " ORDER BY date, slot, member_id" : table === "targets" ? " ORDER BY week_start, member_id" : " ORDER BY id"}`,
		)
		.all()
		.map((row: any) => JSON.parse(row.data));
}
function dataFromDb(db: Database): AppData {
	const savedMenus = rows<SavedMenu>(db, "saved_menus").map((menu) => ({
		...menu,
		slot: menu.slot ?? "lunch",
	}));
	return {
		members: rows<MemberProfile>(db, "members").sort((a, b) =>
			a.id === "richard" ? -1 : b.id === "richard" ? 1 : 0,
		),
		ingredients: rows<Ingredient>(db, "ingredients"),
		savedMenus,
		scheduledMeals: rows<ScheduledMeal>(db, "scheduled_meals"),
		targets: rows<WeeklyTarget>(db, "targets"),
	};
}

const members = new Set<MemberId>(["richard", "michelle"]);
const slots = new Set<MealSlot>(["lunch", "dinner", "snack"]);
const finite = (x: unknown): x is number =>
	typeof x === "number" && Number.isFinite(x);
const validDate = (value: unknown) =>
	typeof value === "string" &&
	/^\d{4}-\d{2}-\d{2}$/.test(value) &&
	!Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
	new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
function assertMenuIngredients(
	value: unknown,
	available: Set<string>,
): asserts value is MenuIngredient[] {
	if (!Array.isArray(value) || value.length > 100)
		throw new Error("ingredients must be an array with at most 100 items");
	for (const row of value) {
		if (
			!row ||
			typeof row !== "object" ||
			typeof row.ingredientId !== "string" ||
			!available.has(row.ingredientId) ||
			!finite(row.quantity) ||
			row.quantity <= 0 ||
			row.quantity > 100000 ||
			(row.memberId !== undefined && !members.has(row.memberId))
		)
			throw new Error(
				"each ingredient needs a known ingredientId, positive quantity, and optional valid memberId",
			);
	}
}
function validMeal(
	value: any,
	ingredients: Set<string>,
): value is ScheduledMeal {
	if (
		!value ||
		typeof value !== "object" ||
		typeof value.id !== "string" ||
		!value.id ||
		!validDate(value.date) ||
		!slots.has(value.slot) ||
		typeof value.name !== "string" ||
		!value.name.trim() ||
		value.name.length > 120 ||
		typeof (value.notes ?? "") !== "string" ||
		(value.notes ?? "").length > 4000
	)
		return false;
	if (
		value.slot === "dinner"
			? value.memberId !== undefined
			: !members.has(value.memberId)
	)
		return false;
	try {
		assertMenuIngredients(value.ingredients, ingredients);
		return true;
	} catch {
		return false;
	}
}
function validIngredient(x: any): x is Ingredient {
	return (
		!!x &&
		typeof x === "object" &&
		typeof x.id === "string" &&
		!!x.id &&
		typeof x.name === "string" &&
		!!x.name.trim() &&
		x.name.length <= 120 &&
		Array.isArray(x.aliases) &&
		x.aliases.every((a: unknown) => typeof a === "string") &&
		["g", "piece", "tbsp", "package"].includes(x.unit) &&
		finite(x.basisAmount) &&
		x.basisAmount > 0 &&
		(x.equivalentGrams === undefined ||
			(finite(x.equivalentGrams) && x.equivalentGrams > 0)) &&
		typeof x.preparation === "string" &&
		typeof x.source === "string" &&
		typeof x.suggestible === "boolean" &&
		validNutrition(x.nutrition)
	);
}
function validNutrition(x: any): x is Nutrition {
	return (
		!!x &&
		["calories", "protein", "carbs", "fat", "fiber"].every(
			(k) => finite(x[k]) && x[k] >= 0,
		)
	);
}
function validMenu(x: any, ingredients: Set<string>): x is SavedMenu {
	if (
		!x ||
		typeof x !== "object" ||
		typeof x.id !== "string" ||
		!x.id ||
		typeof x.name !== "string" ||
		!x.name.trim() ||
		x.name.length > 120 ||
		!slots.has(x.slot) ||
		(x.memberId !== undefined && !members.has(x.memberId)) ||
		(x.slot === "dinner" && x.memberId !== undefined)
	)
		return false;
	try {
		assertMenuIngredients(x.ingredients, ingredients);
		return true;
	} catch {
		return false;
	}
}
function validAppData(x: any): x is AppData {
	if (
		!x ||
		!Array.isArray(x.members) ||
		!Array.isArray(x.ingredients) ||
		!Array.isArray(x.savedMenus) ||
		!Array.isArray(x.scheduledMeals) ||
		!Array.isArray(x.targets)
	)
		return false;
	const ingredientIds = new Set(x.ingredients.map((i: any) => i?.id));
	if (
		x.members.length !== 2 ||
		x.members.some(
			(m: any) =>
				!members.has(m?.id) ||
				!m.name ||
				!validDate(m.birthday) ||
				!["male", "female", "other"].includes(m.sex) ||
				!finite(m.heightCm) ||
				m.heightCm < 100 ||
				m.heightCm > 250 ||
				!finite(m.currentWeightKg) ||
				m.currentWeightKg < 30 ||
				m.currentWeightKg > 300 ||
				!["inactive", "low", "active", "very", "custom"].includes(
					m.activityLevel,
				) ||
				!finite(m.activityFactor) ||
				m.activityFactor < 1 ||
				m.activityFactor > 2.5,
		)
	)
		return false;
	if (
		new Set(x.members.map((m: MemberProfile) => m.id)).size !== 2 ||
		x.ingredients.some((i: any) => !validIngredient(i)) ||
		new Set(x.ingredients.map((i: Ingredient) => i.id)).size !==
			x.ingredients.length ||
		x.savedMenus.some((m: any) => !validMenu(m, ingredientIds)) ||
		x.scheduledMeals.some((m: any) => !validMeal(m, ingredientIds))
	)
		return false;
	const mealSlots = x.scheduledMeals.map(
		(m: ScheduledMeal) => `${m.date}|${m.slot}|${m.memberId ?? ""}`,
	);
	if (
		new Set(mealSlots).size !== mealSlots.length ||
		new Set(x.scheduledMeals.map((m: ScheduledMeal) => m.id)).size !==
			x.scheduledMeals.length ||
		new Set(x.savedMenus.map((m: SavedMenu) => m.id)).size !==
			x.savedMenus.length
	)
		return false;
	const targetKeys = x.targets.map((t: any) => `${t.memberId}|${t.weekStart}`);
	return (
		x.targets.every((t: any) => validTarget(t)) &&
		new Set(targetKeys).size === targetKeys.length
	);
}
function validTarget(t: any): t is WeeklyTarget {
	return (
		!!t &&
		members.has(t.memberId) &&
		validDate(t.weekStart) &&
		isMonday(t.weekStart) &&
		[
			t.deficitPercent,
			t.weekendReserve,
			t.proteinPercent,
			t.carbsPercent,
			t.fatPercent,
			t.fiberGrams,
			t.weeklyCalories,
			t.weekdayCalories,
			t.macroGrams?.protein,
			t.macroGrams?.carbs,
			t.macroGrams?.fat,
		].every(finite) &&
		t.deficitPercent >= 0 &&
		t.deficitPercent <= 60 &&
		t.weekendReserve >= 0 &&
		[t.proteinPercent, t.carbsPercent, t.fatPercent].every(
			(n: number) => n >= 0 && n <= 100,
		) &&
		t.proteinPercent + t.carbsPercent + t.fatPercent === 100 &&
		t.fiberGrams >= 0 &&
		t.weeklyCalories >= 0 &&
		t.weekdayCalories >= 0 &&
		[t.macroGrams.protein, t.macroGrams.carbs, t.macroGrams.fat].every(
			(n: number) => n >= 0,
		)
	);
}

function isMonday(date: string) {
	return new Date(`${date}T00:00:00Z`).getUTCDay() === 1;
}
function ageOn(birthday: string, date: string) {
	const birth = new Date(`${birthday}T00:00:00Z`),
		day = new Date(`${date}T00:00:00Z`);
	return (
		day.getUTCFullYear() -
		birth.getUTCFullYear() -
		(day.getUTCMonth() < birth.getUTCMonth() ||
		(day.getUTCMonth() === birth.getUTCMonth() &&
			day.getUTCDate() < birth.getUTCDate())
			? 1
			: 0)
	);
}
function targetForRequest(
	db: Database,
	input: TargetPreviewRequest,
): TargetPreview {
	if (
		!input ||
		!members.has(input.memberId) ||
		!validDate(input.effectiveWeek) ||
		!isMonday(input.effectiveWeek)
	)
		throw new Error("memberId and a Monday effectiveWeek are required");
	const m = JSON.parse(
		db.query("SELECT data FROM members WHERE id = ?").get(input.memberId)
			?.data ?? "null",
	) as MemberProfile | null;
	if (!m) throw new Error("member not found");
	const current = db
		.query(
			"SELECT data FROM targets WHERE member_id = ? AND week_start < ? ORDER BY week_start DESC LIMIT 1",
		)
		.get(input.memberId, input.effectiveWeek) as { data: string } | null;
	if (!current)
		throw new Error("no current weekly target exists before effectiveWeek");
	const old = JSON.parse(current.data) as WeeklyTarget;
	const values = [
		input.weightKg,
		input.activityFactor,
		input.deficitPercent,
		input.weekendReserve,
		input.proteinPercent,
		input.carbsPercent,
		input.fatPercent,
		input.fiberGrams,
	];
	if (
		values.some((x) => !finite(x)) ||
		input.weightKg < 30 ||
		input.weightKg > 300 ||
		input.activityFactor < 1 ||
		input.activityFactor > 2.5 ||
		input.deficitPercent < 0 ||
		input.deficitPercent > 60 ||
		input.weekendReserve < 0 ||
		input.proteinPercent < 0 ||
		input.carbsPercent < 0 ||
		input.fatPercent < 0 ||
		input.proteinPercent + input.carbsPercent + input.fatPercent !== 100 ||
		input.fiberGrams < 0 ||
		input.fiberGrams > 200
	)
		throw new Error(
			"target values are outside valid ranges; macro percentages must total 100",
		);
	const age = ageOn(m.birthday, input.effectiveWeek);
	if (age < 19)
		throw new Error("target review is available for adults aged 19 or older");
	if (m.sex === "other")
		throw new Error(
			"manual targets are required when the resting-calorie equation does not apply",
		);
	const ree =
		10 * input.weightKg +
		6.25 * m.heightCm -
		5 * age +
		(m.sex === "male" ? 5 : -161);
	const maintenance = ree * input.activityFactor;
	const weeklyCalories = maintenance * (1 - input.deficitPercent / 100) * 7;
	const weekdayCalories = (weeklyCalories - input.weekendReserve) / 7;
	if (weekdayCalories <= 0)
		throw new Error(
			"weekend reserve must be smaller than the weekly calorie budget",
		);
	const weekday = Math.round(weekdayCalories);
	const proposed: WeeklyTarget = {
		memberId: input.memberId,
		weekStart: input.effectiveWeek,
		deficitPercent: input.deficitPercent,
		weekendReserve: input.weekendReserve,
		proteinPercent: input.proteinPercent,
		carbsPercent: input.carbsPercent,
		fatPercent: input.fatPercent,
		fiberGrams: input.fiberGrams,
		weeklyCalories,
		weekdayCalories,
		macroGrams: {
			protein: (weekday * input.proteinPercent) / 100 / 4,
			carbs: (weekday * input.carbsPercent) / 100 / 4,
			fat: (weekday * input.fatPercent) / 100 / 9,
		},
	};
	return {
		current: old,
		proposed,
		recommendation:
			weekday < 1200
				? "This creates a low weekday calorie target. Consider qualified guidance, or choose a smaller deficit or weekend reserve."
				: input.deficitPercent > 30 || maintenance - weeklyCalories / 7 > 750
					? "This creates a larger calorie deficit than the suggested starting point. You can keep it or adjust it before applying."
					: "This proposal is close to the suggested starting point. You can keep it or adjust any target before applying.",
	};
}

function replaceData(db: Database, data: AppData) {
	db.transaction(() => {
		db.exec(
			"DELETE FROM scheduled_meals; DELETE FROM saved_menus; DELETE FROM ingredients; DELETE FROM targets; DELETE FROM members;",
		);
		data.members.forEach((x) => put(db, "members", x.id, x));
		data.ingredients.forEach((x) => put(db, "ingredients", x.id, x));
		data.savedMenus.forEach((x) => put(db, "saved_menus", x.id, x));
		data.scheduledMeals.forEach((x) => putMeal(db, x));
		data.targets.forEach((x) => {
			const target = normalizeWeekendReserve(x);
			put(
				db,
				"targets",
				`${target.memberId}|${target.weekStart}`,
				target,
				target.memberId,
				target.weekStart,
			);
		});
	})();
}

export function createApp(db = createDatabase()) {
	const app = express();
	app.use(express.json({ limit: "10mb" }));
	const fail = (res: Response, error: unknown, status = 400) =>
		res.status(status).json({
			error:
				error instanceof Error
					? error.message
					: typeof error === "string"
						? error
						: "request failed",
		});
	const existing = <_T>(
		table: "scheduled_meals" | "saved_menus" | "ingredients",
		id: string,
	) =>
		db.query(`SELECT data FROM ${table} WHERE id = ?`).get(id) as {
			data: string;
		} | null;

	app.get("/api/health", (_req, res) => res.json({ ok: true }));
	app.get("/api/data", (_req, res) => res.json(dataFromDb(db)));
	app.post("/api/meals", (req, res) => {
		const value = req.body;
		if (
			!validMeal(
				value,
				new Set(rows<Ingredient>(db, "ingredients").map((x) => x.id)),
			)
		)
			return fail(res, "invalid scheduled meal");
		if (existing("scheduled_meals", value.id))
			return fail(res, "meal id already exists", 409);
		try {
			putMeal(db, value);
			return res.status(201).json(value);
		} catch (e) {
			return fail(res, e, 409);
		}
	});
	app.put("/api/meals/:id", (req, res) => {
		const old = existing("scheduled_meals", req.params.id);
		if (!old) return fail(res, "meal not found", 404);
		const value = { ...req.body, id: req.params.id };
		if (
			!validMeal(
				value,
				new Set(rows<Ingredient>(db, "ingredients").map((x) => x.id)),
			)
		)
			return fail(res, "invalid scheduled meal");
		try {
			putMeal(db, value);
			return res.json(value);
		} catch (e) {
			return fail(res, e, 409);
		}
	});
	app.delete("/api/meals/:id", (req, res) =>
		existing("scheduled_meals", req.params.id)
			? (db
					.query("DELETE FROM scheduled_meals WHERE id = ?")
					.run(req.params.id),
				res.status(204).end())
			: fail(res, "meal not found", 404),
	);
	app.post("/api/meals/:id/move", (req, res) => {
		const source = existing("scheduled_meals", req.params.id);
		if (!source) return fail(res, "meal not found", 404);
		if (!validDate(req.body?.date))
			return fail(res, "date must use YYYY-MM-DD");
		const from = JSON.parse(source.data) as ScheduledMeal;
		if (req.body.date === from.date)
			return res.json({ moved: from, swapped: null });
		const toRow = db
			.query(
				"SELECT data FROM scheduled_meals WHERE date = ? AND slot = ? AND member_id = ?",
			)
			.get(req.body.date, from.slot, from.memberId ?? "") as {
			data: string;
		} | null;
		const destination = toRow
			? (JSON.parse(toRow.data) as ScheduledMeal)
			: null;
		db.transaction(() => {
			db.query("DELETE FROM scheduled_meals WHERE id IN (?, ?)").run(
				from.id,
				destination?.id ?? from.id,
			);
			putMeal(db, { ...from, date: req.body.date });
			if (destination) putMeal(db, { ...destination, date: from.date });
		})();
		return res.json({
			moved: { ...from, date: req.body.date },
			swapped: destination ? { ...destination, date: from.date } : null,
		});
	});
	app.post("/api/days/swap", (req, res) => {
		const { firstDate, secondDate } = req.body ?? {};
		if (
			!validDate(firstDate) ||
			!validDate(secondDate) ||
			firstDate === secondDate
		)
			return fail(res, "two different dates using YYYY-MM-DD are required");
		const meals = rows<ScheduledMeal>(db, "scheduled_meals").filter(
			(meal) => meal.date === firstDate || meal.date === secondDate,
		);
		db.transaction(() => {
			db.query("DELETE FROM scheduled_meals WHERE date IN (?, ?)").run(
				firstDate,
				secondDate,
			);
			meals.forEach((meal) =>
				putMeal(db, {
					...meal,
					date: meal.date === firstDate ? secondDate : firstDate,
				}),
			);
		})();
		return res.json(
			meals.map((meal) => ({
				...meal,
				date: meal.date === firstDate ? secondDate : firstDate,
			})),
		);
	});
	app.post("/api/menus", (req, res) => {
		const value = req.body;
		if (
			!validMenu(
				value,
				new Set(rows<Ingredient>(db, "ingredients").map((x) => x.id)),
			)
		)
			return fail(res, "invalid saved menu");
		if (existing("saved_menus", value.id))
			return fail(res, "menu id already exists", 409);
		put(db, "saved_menus", value.id, value);
		return res.status(201).json(value);
	});
	app.put("/api/menus/:id", (req, res) => {
		if (!existing("saved_menus", req.params.id))
			return fail(res, "menu not found", 404);
		const value = { ...req.body, id: req.params.id };
		if (
			!validMenu(
				value,
				new Set(rows<Ingredient>(db, "ingredients").map((x) => x.id)),
			)
		)
			return fail(res, "invalid saved menu");
		put(db, "saved_menus", value.id, value);
		return res.json(value);
	});
	app.delete("/api/menus/:id", (req, res) =>
		existing("saved_menus", req.params.id)
			? (db.query("DELETE FROM saved_menus WHERE id = ?").run(req.params.id),
				res.status(204).end())
			: fail(res, "menu not found", 404),
	);
	app.post("/api/ingredients", (req, res) => {
		if (!validIngredient(req.body)) return fail(res, "invalid ingredient");
		if (existing("ingredients", req.body.id))
			return fail(res, "ingredient id already exists", 409);
		put(db, "ingredients", req.body.id, req.body);
		return res.status(201).json(req.body);
	});
	app.put("/api/ingredients/:id", (req, res) => {
		if (!existing("ingredients", req.params.id))
			return fail(res, "ingredient not found", 404);
		const value = { ...req.body, id: req.params.id };
		if (!validIngredient(value)) return fail(res, "invalid ingredient");
		put(db, "ingredients", value.id, value);
		return res.json(value);
	});
	app.delete("/api/ingredients/:id", (req, res) => {
		if (!existing("ingredients", req.params.id))
			return fail(res, "ingredient not found", 404);
		const inUse = [
			...rows<SavedMenu>(db, "saved_menus"),
			...rows<ScheduledMeal>(db, "scheduled_meals"),
		].some((item) =>
			item.ingredients.some((row) => row.ingredientId === req.params.id),
		);
		if (inUse)
			return fail(
				res,
				"ingredient is used by a saved menu or scheduled meal",
				409,
			);
		db.query("DELETE FROM ingredients WHERE id = ?").run(req.params.id);
		return res.status(204).end();
	});
	app.post("/api/targets/preview", (req, res) => {
		try {
			return res.json(targetForRequest(db, req.body as TargetPreviewRequest));
		} catch (e) {
			return fail(res, e);
		}
	});
	app.post("/api/targets/apply", (req, res) => {
		try {
			const preview = targetForRequest(db, req.body as TargetPreviewRequest);
			const member = JSON.parse(
				(
					db
						.query("SELECT data FROM members WHERE id = ?")
						.get(preview.proposed.memberId) as any
				).data,
			) as MemberProfile;
			member.currentWeightKg = req.body.weightKg;
			member.activityLevel = req.body.activityLevel;
			member.activityFactor = req.body.activityFactor;
			db.transaction(() => {
				put(db, "members", member.id, member);
				put(
					db,
					"targets",
					`${preview.proposed.memberId}|${preview.proposed.weekStart}`,
					preview.proposed,
					preview.proposed.memberId,
					preview.proposed.weekStart,
				);
			})();
			return res.json(preview.proposed);
		} catch (e) {
			return fail(res, e);
		}
	});
	app.get("/api/backup.json", (_req, res) =>
		res
			.type("application/json")
			.attachment("piring-kita-backup.json")
			.send(JSON.stringify(dataFromDb(db), null, 2)),
	);
	app.post("/api/restore", (req, res) => {
		const value = Array.isArray(req.body?.savedMenus)
			? {
					...req.body,
					savedMenus: req.body.savedMenus.map((menu: any) => ({
						...menu,
						slot: menu.slot ?? "lunch",
					})),
				}
			: req.body;
		if (!validAppData(value)) return fail(res, "backup data is invalid");
		try {
			replaceData(db, value);
			return res.json({ ok: true });
		} catch (e) {
			return fail(res, e);
		}
	});
	app.get("/api/database.sqlite", (_req, res) => {
		try {
			res
				.attachment("piring-kita.sqlite")
				.setHeader("Content-Type", "application/vnd.sqlite3")
				.send(db.serialize());
		} catch (e) {
			return fail(res, e);
		}
	});

	const frontend = resolve(import.meta.dir, "../../frontend/dist");
	if (existsSync(resolve(frontend, "index.html"))) {
		app.use(express.static(frontend));
		app.use((req, res, next) =>
			req.method !== "GET" || req.path.startsWith("/api/")
				? next()
				: res.sendFile(resolve(frontend, "index.html")),
		);
	}
	app.use((req, res, next) =>
		req.path.startsWith("/api/")
			? fail(res, "API route not found", 404)
			: next(),
	);
	app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) =>
		fail(res, err),
	);
	return app;
}

if (import.meta.main) {
	const db = createDatabase();
	createApp(db).listen(Number(process.env.PORT ?? 3001), "0.0.0.0");
}
