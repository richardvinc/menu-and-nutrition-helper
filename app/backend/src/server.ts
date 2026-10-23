import { Database } from "bun:sqlite";
import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { existsSync, mkdirSync } from "node:fs";
import { isIP } from "node:net";
import { dirname, resolve } from "node:path";
import type {
	AppData,
	AgendaItem,
	CalendarSource,
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
import ICAL from "ical.js";
import {
	ingredientAliases,
	rateLimit,
	recommend,
	reserveOpenRouterRequest,
	searchUsda,
	usdaIngredientPortions,
	usdaIngredient,
} from "./ai";

const defaultPath = resolve(import.meta.dir, "../data/piring-kita.sqlite");

const seedIngredients: Ingredient[] = [
	{
		id: "rice",
		name: "Nasi putih",
		aliases: ["beras", "white rice", "rice"],
		unit: "g",
		basisAmount: 100,
		preparation: "Cooked",
		source: "USDA FoodData Central SR Legacy, FDC 168878, April 2018",
		suggestible: false,
		nutrition: {
			calories: 130,
			protein: 2.69,
			fat: 0.28,
			carbs: 28.17,
			fiber: 0.4,
		},
	},
	{
		id: "chicken",
		name: "Dada ayam tanpa kulit",
		aliases: ["ayam", "chicken", "chicken breast"],
		unit: "g",
		basisAmount: 100,
		preparation: "Cooked, braised",
		source: "USDA FoodData Central SR Legacy, FDC 171140, April 2018",
		suggestible: true,
		nutrition: { calories: 157, protein: 32.06, fat: 3.24, carbs: 0, fiber: 0 },
	},
	{
		id: "beef",
		name: "Daging sapi cincang 90/10",
		aliases: ["daging sapi", "sapi", "beef", "ground beef", "beef mince"],
		unit: "g",
		basisAmount: 100,
		preparation: "Raw, 90% lean / 10% fat",
		source: "USDA FoodData Central SR Legacy, FDC 174030, April 2018",
		suggestible: false,
		nutrition: { calories: 176, protein: 20, fat: 10, carbs: 0, fiber: 0 },
	},
	{
		id: "tofu",
		name: "Tahu firm",
		aliases: ["tahu", "tofu", "firm tofu"],
		unit: "g",
		basisAmount: 100,
		preparation: "Raw, firm, calcium-set",
		source: "USDA FoodData Central SR Legacy, FDC 172475, April 2018",
		suggestible: true,
		nutrition: {
			calories: 144,
			protein: 17.27,
			fat: 8.72,
			carbs: 2.78,
			fiber: 2.3,
		},
	},
	{
		id: "broccoli",
		name: "Brokoli",
		aliases: ["brokoli", "broccoli"],
		unit: "g",
		basisAmount: 100,
		preparation: "Raw",
		source: "USDA FoodData Central SR Legacy, FDC 170379, April 2018",
		suggestible: true,
		nutrition: {
			calories: 34,
			protein: 2.82,
			fat: 0.37,
			carbs: 6.64,
			fiber: 2.6,
		},
	},
	{
		id: "egg",
		name: "Telur ayam besar",
		aliases: ["telur", "egg", "whole egg"],
		unit: "piece",
		basisAmount: 1,
		equivalentGrams: 50,
		preparation: "Whole",
		source: "USDA FoodData Central SR Legacy, FDC 171287, April 2018",
		suggestible: false,
		nutrition: {
			calories: 71.5,
			protein: 6.28,
			fat: 4.76,
			carbs: 0.36,
			fiber: 0,
		},
	},
	{
		id: "avocado",
		name: "Alpukat",
		aliases: ["alpukat", "avocado"],
		unit: "g",
		basisAmount: 100,
		preparation: "Raw",
		source: "USDA FoodData Central SR Legacy, FDC 171705, April 2018",
		suggestible: true,
		nutrition: {
			calories: 160,
			protein: 2,
			fat: 14.66,
			carbs: 8.53,
			fiber: 6.7,
		},
	},
	{
		id: "banana",
		name: "Pisang sedang",
		aliases: ["pisang", "banana"],
		unit: "piece",
		basisAmount: 1,
		equivalentGrams: 118,
		preparation: "Raw",
		source: "USDA FoodData Central SR Legacy, FDC 173944, April 2018",
		suggestible: true,
		nutrition: {
			calories: 105.02,
			protein: 1.29,
			fat: 0.39,
			carbs: 26.95,
			fiber: 3.07,
		},
	},
	{
		id: "peanut",
		name: "Selai kacang halus",
		aliases: ["selai kacang", "peanut butter"],
		unit: "g",
		basisAmount: 100,
		preparation: "Smooth",
		source: "USDA FoodData Central SR Legacy, FDC 174294, April 2018",
		suggestible: false,
		nutrition: {
			calories: 588,
			protein: 21.93,
			fat: 49.54,
			carbs: 23.98,
			fiber: 5.7,
		},
	},
	{
		id: "egg-white",
		name: "Putih telur besar",
		aliases: ["putih telur", "egg white"],
		unit: "piece",
		basisAmount: 1,
		equivalentGrams: 33,
		preparation: "Raw, large egg white",
		source: "USDA FoodData Central SR Legacy, FDC 172183, April 2018",
		suggestible: true,
		nutrition: {
			calories: 17.16,
			protein: 3.6,
			fat: 0.06,
			carbs: 0.24,
			fiber: 0,
		},
	},
	{
		id: "olive-oil",
		name: "Minyak zaitun",
		aliases: ["olive oil", "extra light olive oil", "extra virgin olive oil"],
		unit: "g",
		basisAmount: 100,
		preparation: "Salad or cooking oil",
		source: "USDA FoodData Central SR Legacy, FDC 171413, April 2018",
		suggestible: false,
		nutrition: { calories: 884, protein: 0, fat: 100, carbs: 0, fiber: 0 },
	},
	{
		id: "chinese-cabbage",
		name: "Sawi putih",
		aliases: ["chinese cabbage", "napa cabbage", "pe-tsai"],
		unit: "g",
		basisAmount: 100,
		preparation: "Raw",
		source: "USDA FoodData Central SR Legacy, FDC 169979, April 2018",
		suggestible: true,
		nutrition: {
			calories: 16,
			protein: 1.2,
			fat: 0.2,
			carbs: 3.23,
			fiber: 1.2,
		},
	},
	{
		id: "pak-choi",
		name: "Pakcoy",
		aliases: ["pak choi", "bok choy", "pakcoy"],
		unit: "g",
		basisAmount: 100,
		preparation: "Raw",
		source: "USDA FoodData Central SR Legacy, FDC 170390, April 2018",
		suggestible: true,
		nutrition: { calories: 13, protein: 1.5, fat: 0.2, carbs: 2.18, fiber: 1 },
	},
	{
		id: "white-mushroom",
		name: "Jamur kancing putih",
		aliases: ["white mushroom", "button mushroom", "champignon"],
		unit: "g",
		basisAmount: 100,
		preparation: "Raw",
		source: "USDA FoodData Central SR Legacy, FDC 169251, April 2018",
		suggestible: true,
		nutrition: {
			calories: 22,
			protein: 3.09,
			fat: 0.34,
			carbs: 3.26,
			fiber: 1,
		},
	},
	{
		id: "shimeji",
		name: "Jamur shimeji",
		aliases: ["shimeji", "beech mushroom"],
		unit: "g",
		basisAmount: 100,
		preparation: "Raw",
		source:
			"USDA FoodData Central Foundation, FDC 2003603, published 2021-10-28",
		suggestible: true,
		nutrition: {
			calories: 33,
			protein: 2.18,
			fat: 0.45,
			carbs: 6.76,
			fiber: 3.14,
		},
	},
	{
		id: "carrot",
		name: "Wortel",
		aliases: ["carrot", "wortel"],
		unit: "g",
		basisAmount: 100,
		preparation: "Raw",
		source: "USDA FoodData Central SR Legacy, FDC 170393, April 2018",
		suggestible: true,
		nutrition: {
			calories: 41,
			protein: 0.93,
			fat: 0.24,
			carbs: 9.58,
			fiber: 2.8,
		},
	},
	{
		id: "silken-tofu",
		name: "Tahu sutra",
		aliases: ["tahu sutera", "silken tofu", "soft tofu"],
		unit: "g",
		basisAmount: 100,
		preparation: "Soft, nigari-set",
		source: "USDA FoodData Central SR Legacy, FDC 172449, April 2018",
		suggestible: true,
		nutrition: {
			calories: 61,
			protein: 7.17,
			fat: 3.69,
			carbs: 1.18,
			fiber: 0.2,
		},
	},
	{
		id: "tomato",
		name: "Tomat merah",
		aliases: ["tomat", "tomato"],
		unit: "g",
		basisAmount: 100,
		preparation: "Raw",
		source: "USDA FoodData Central SR Legacy, FDC 170457, April 2018",
		suggestible: true,
		nutrition: {
			calories: 18,
			protein: 0.88,
			fat: 0.2,
			carbs: 3.89,
			fiber: 1.2,
		},
	},
	{
		id: "whole-milk",
		name: "Susu full cream",
		aliases: ["whole milk", "full fat milk", "susu full fat"],
		unit: "g",
		basisAmount: 100,
		preparation: "3.25% milkfat",
		source: "USDA FoodData Central SR Legacy, FDC 171265, April 2018",
		suggestible: false,
		nutrition: { calories: 61, protein: 3.15, fat: 3.25, carbs: 4.8, fiber: 0 },
	},
	{
		id: "apple",
		name: "Apel sedang",
		aliases: ["apel", "apple"],
		unit: "piece",
		basisAmount: 1,
		equivalentGrams: 182,
		preparation: "Raw, with skin",
		source: "USDA FoodData Central SR Legacy, FDC 171688, April 2018",
		suggestible: true,
		nutrition: {
			calories: 94.64,
			protein: 0.47,
			fat: 0.31,
			carbs: 25.13,
			fiber: 4.37,
		},
	},
	{
		id: "potato",
		name: "Kentang rebus",
		aliases: ["kentang", "potato", "boiled potato"],
		unit: "g",
		basisAmount: 100,
		preparation: "Boiled without skin or salt",
		source: "USDA FoodData Central SR Legacy, FDC 170440, April 2018",
		suggestible: true,
		nutrition: {
			calories: 86,
			protein: 1.71,
			fat: 0.1,
			carbs: 20.01,
			fiber: 1.8,
		},
	},
	{
		id: "papaya",
		name: "Pepaya",
		aliases: ["pepaya", "papaya"],
		unit: "g",
		basisAmount: 100,
		preparation: "Raw",
		source: "USDA FoodData Central SR Legacy, FDC 169926, April 2018",
		suggestible: true,
		nutrition: {
			calories: 43,
			protein: 0.47,
			fat: 0.26,
			carbs: 10.82,
			fiber: 1.7,
		},
	},
	{
		id: "greek-yogurt",
		name: "Yoghurt Yunani tawar",
		aliases: ["greek yogurt", "plain greek yogurt"],
		unit: "g",
		basisAmount: 100,
		preparation: "Plain, low-fat",
		source: "USDA FoodData Central SR Legacy, FDC 170903, April 2018",
		suggestible: true,
		nutrition: {
			calories: 73,
			protein: 9.95,
			fat: 1.92,
			carbs: 3.94,
			fiber: 0,
		},
	},
	{
		id: "sweet-potato",
		name: "Ubi rebus",
		aliases: ["ubi", "sweet potato", "boiled sweet potato"],
		unit: "g",
		basisAmount: 100,
		preparation: "Boiled without skin",
		source: "USDA FoodData Central SR Legacy, FDC 168484, April 2018",
		suggestible: true,
		nutrition: {
			calories: 76,
			protein: 1.37,
			fat: 0.14,
			carbs: 17.72,
			fiber: 2.5,
		},
	},
	{
		id: "miso",
		name: "Miso",
		aliases: ["miso paste", "pasta miso"],
		unit: "tbsp",
		basisAmount: 1,
		equivalentGrams: 17,
		preparation: "Paste",
		source: "USDA FoodData Central SR Legacy, FDC 172442, April 2018",
		suggestible: false,
		nutrition: {
			calories: 33.66,
			protein: 2.17,
			fat: 1.02,
			carbs: 4.31,
			fiber: 0.92,
		},
	},
	{
		id: "whole-wheat-bread",
		name: "Roti gandum",
		aliases: ["roti", "whole-wheat bread", "whole wheat bread"],
		unit: "piece",
		basisAmount: 1,
		equivalentGrams: 32,
		preparation: "Commercially prepared slice",
		source: "USDA FoodData Central SR Legacy, FDC 172688, April 2018",
		suggestible: true,
		nutrition: {
			calories: 80.64,
			protein: 3.98,
			fat: 1.12,
			carbs: 13.67,
			fiber: 1.92,
		},
	},
	{
		id: "mung-beans",
		name: "Kacang hijau rebus",
		aliases: ["kacang hijau", "mung beans", "boiled mung beans"],
		unit: "g",
		basisAmount: 100,
		preparation: "Boiled without salt",
		source: "USDA FoodData Central SR Legacy, FDC 174257, April 2018",
		suggestible: true,
		nutrition: {
			calories: 105,
			protein: 7.02,
			fat: 0.38,
			carbs: 19.15,
			fiber: 7.6,
		},
	},
	{
		id: "pear",
		name: "Pir",
		aliases: ["pir", "pear"],
		unit: "g",
		basisAmount: 100,
		preparation: "Raw",
		source: "USDA FoodData Central SR Legacy, FDC 169118, April 2018",
		suggestible: true,
		nutrition: {
			calories: 57,
			protein: 0.36,
			fat: 0.14,
			carbs: 15.23,
			fiber: 3.1,
		},
	},
	{
		id: "cornstarch",
		name: "Tepung maizena",
		aliases: ["cornstarch", "corn starch", "maizena"],
		unit: "tbsp",
		basisAmount: 1,
		equivalentGrams: 8,
		preparation: "Dry",
		source: "USDA FoodData Central SR Legacy, FDC 169698, April 2018",
		suggestible: false,
		nutrition: {
			calories: 30.48,
			protein: 0.02,
			fat: 0,
			carbs: 7.3,
			fiber: 0.07,
		},
	},
	{
		id: "onion",
		name: "Bawang bombai",
		aliases: ["onion", "bawang bombai"],
		unit: "g",
		basisAmount: 100,
		preparation: "Raw",
		source: "USDA FoodData Central SR Legacy, FDC 170000, April 2018",
		suggestible: false,
		nutrition: {
			calories: 40,
			protein: 1.1,
			fat: 0.1,
			carbs: 9.34,
			fiber: 1.7,
		},
	},
	{
		id: "romaine",
		name: "Selada romaine",
		aliases: ["romaine lettuce", "cos lettuce", "selada romaine"],
		unit: "g",
		basisAmount: 100,
		preparation: "Raw",
		source: "USDA FoodData Central SR Legacy, FDC 169247, April 2018",
		suggestible: true,
		nutrition: {
			calories: 17,
			protein: 1.23,
			fat: 0.3,
			carbs: 3.29,
			fiber: 2.1,
		},
	},
	{
		id: "sesame-oil",
		name: "Minyak wijen",
		aliases: ["sesame oil", "minyak wijen"],
		unit: "g",
		basisAmount: 100,
		preparation: "Salad or cooking oil",
		source: "USDA FoodData Central SR Legacy, FDC 171016, April 2018",
		suggestible: false,
		nutrition: { calories: 884, protein: 0, fat: 100, carbs: 0, fiber: 0 },
	},
	{
		id: "cabbage",
		name: "Kol",
		aliases: ["cabbage", "kol"],
		unit: "g",
		basisAmount: 100,
		preparation: "Raw",
		source: "USDA FoodData Central SR Legacy, FDC 169975, April 2018",
		suggestible: true,
		nutrition: {
			calories: 25,
			protein: 1.28,
			fat: 0.1,
			carbs: 5.8,
			fiber: 2.5,
		},
	},
	{
		id: "shiitake",
		name: "Jamur shiitake",
		aliases: ["shiitake", "shitake"],
		unit: "g",
		basisAmount: 100,
		preparation: "Raw",
		source: "USDA FoodData Central SR Legacy, FDC 169242, April 2018",
		suggestible: true,
		nutrition: {
			calories: 34,
			protein: 2.24,
			fat: 0.49,
			carbs: 6.79,
			fiber: 2.5,
		},
	},
	{
		id: "salmon",
		name: "Salmon Atlantik",
		aliases: ["salmon", "atlantic salmon"],
		unit: "g",
		basisAmount: 100,
		preparation: "Raw, farmed",
		source: "USDA FoodData Central SR Legacy, FDC 175167, April 2018",
		suggestible: true,
		nutrition: {
			calories: 208,
			protein: 20.42,
			fat: 13.42,
			carbs: 0,
			fiber: 0,
		},
	},
];

const seedMembers: MemberProfile[] = [
	{
		id: "richard",
		name: "Richard",
		birthday: "1993-05-22",
		sex: "male",
		heightCm: 165,
		currentWeightKg: 68,
		activityLevel: "low",
		activityFactor: 1.6,
	},
	{
		id: "michelle",
		name: "Michelle",
		birthday: "1995-01-30",
		sex: "female",
		heightCm: 159,
		currentWeightKg: 54.65,
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
		weeklyCalories: 13899.2,
		weekdayCalories: 1928.4571428571428,
		macroGrams: { protein: 120.5, carbs: 216.9, fat: 64.26666666666667 },
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
		weeklyCalories: 9598.12,
		weekdayCalories: 1314.017142857143,
		macroGrams: { protein: 82.125, carbs: 147.825, fat: 43.8 },
	},
];

const seedMenus: SavedMenu[] = [
	{
		id: "workbook-r-nasi-telur-miso",
		name: "Nasi telur miso",
		slot: "lunch",
		memberId: "richard",
		ingredients: [
			{ ingredientId: "egg", quantity: 3 },
			{ ingredientId: "rice", quantity: 150 },
			{ ingredientId: "miso", quantity: 1 },
			{ ingredientId: "chinese-cabbage", quantity: 50 },
			{ ingredientId: "olive-oil", quantity: 17 },
		],
	},
	{
		id: "workbook-r-telur-tahu-apel",
		name: "Telur tahu dan apel",
		slot: "lunch",
		memberId: "richard",
		ingredients: [
			{ ingredientId: "egg", quantity: 3 },
			{ ingredientId: "tofu", quantity: 195 },
			{ ingredientId: "apple", quantity: 1 },
		],
	},
	{
		id: "workbook-r-ayam-bakar",
		name: "Ayam bakar dan nasi",
		slot: "lunch",
		memberId: "richard",
		ingredients: [
			{ ingredientId: "rice", quantity: 250 },
			{ ingredientId: "chicken", quantity: 200 },
			{ ingredientId: "olive-oil", quantity: 17 },
		],
	},
	{
		id: "workbook-r-telur-tomat",
		name: "Telur tomat",
		slot: "lunch",
		memberId: "richard",
		ingredients: [
			{ ingredientId: "egg", quantity: 1 },
			{ ingredientId: "egg-white", quantity: 4 },
			{ ingredientId: "rice", quantity: 180 },
			{ ingredientId: "pear", quantity: 125 },
			{ ingredientId: "olive-oil", quantity: 17 },
			{ ingredientId: "tomato", quantity: 123 },
			{ ingredientId: "banana", quantity: 1 },
		],
	},
	{
		id: "workbook-m-nasi-telur",
		name: "Nasi telur",
		slot: "lunch",
		memberId: "michelle",
		ingredients: [
			{ ingredientId: "rice", quantity: 130 },
			{ ingredientId: "egg", quantity: 2 },
			{ ingredientId: "olive-oil", quantity: 17 },
			{ ingredientId: "whole-milk", quantity: 100 },
		],
	},
	{
		id: "workbook-m-chicken-potato",
		name: "Ayam kentang dan pir",
		slot: "lunch",
		memberId: "michelle",
		ingredients: [
			{ ingredientId: "chicken", quantity: 50 },
			{ ingredientId: "potato", quantity: 150 },
			{ ingredientId: "pear", quantity: 250 },
		],
	},
	{
		id: "workbook-m-telur-balado",
		name: "Telur balado",
		slot: "lunch",
		memberId: "michelle",
		ingredients: [
			{ ingredientId: "egg-white", quantity: 2 },
			{ ingredientId: "rice", quantity: 100 },
			{ ingredientId: "olive-oil", quantity: 8.5 },
			{ ingredientId: "pear", quantity: 250 },
		],
	},
	{
		id: "workbook-m-nasi-goreng",
		name: "Nasi goreng",
		slot: "lunch",
		memberId: "michelle",
		ingredients: [
			{ ingredientId: "egg", quantity: 2 },
			{ ingredientId: "rice", quantity: 150 },
			{ ingredientId: "olive-oil", quantity: 17 },
			{ ingredientId: "whole-milk", quantity: 100 },
		],
	},
	{
		id: "workbook-d-hotpot-mala",
		name: "Hotpot mala",
		slot: "dinner",
		ingredients: [
			{ ingredientId: "chicken", quantity: 300 },
			{ ingredientId: "rice", quantity: 230 },
			{ ingredientId: "olive-oil", quantity: 34 },
			{ ingredientId: "white-mushroom", quantity: 200 },
		],
	},
	{
		id: "workbook-d-nasi-bakar",
		name: "Nasi bakar",
		slot: "dinner",
		ingredients: [
			{ ingredientId: "rice", quantity: 300 },
			{ ingredientId: "white-mushroom", quantity: 200 },
			{ ingredientId: "chicken", quantity: 330 },
			{ ingredientId: "olive-oil", quantity: 34 },
		],
	},
	{
		id: "workbook-d-ayam-saus-inggris",
		name: "Ayam saus Inggris",
		slot: "dinner",
		ingredients: [
			{ ingredientId: "chicken", quantity: 166 },
			{ ingredientId: "rice", quantity: 280 },
			{ ingredientId: "chinese-cabbage", quantity: 200 },
			{ ingredientId: "olive-oil", quantity: 34 },
			{ ingredientId: "onion", quantity: 100 },
		],
	},
	{
		id: "workbook-d-mun-tahu",
		name: "Mun tahu",
		slot: "dinner",
		ingredients: [
			{ ingredientId: "silken-tofu", quantity: 300 },
			{ ingredientId: "rice", quantity: 280 },
			{ ingredientId: "white-mushroom", quantity: 100 },
			{ ingredientId: "beef", quantity: 83.33 },
		],
	},
	{
		id: "workbook-d-nasi-chahan-telur-tomat",
		name: "Nasi chahan telur tomat",
		slot: "dinner",
		ingredients: [
			{ ingredientId: "egg", quantity: 4 },
			{ ingredientId: "rice", quantity: 260 },
			{ ingredientId: "romaine", quantity: 100 },
			{ ingredientId: "olive-oil", quantity: 34 },
			{ ingredientId: "tomato", quantity: 246 },
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
    CREATE TABLE IF NOT EXISTS calendars (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS agenda_items (id TEXT PRIMARY KEY, calendar_id TEXT NOT NULL, data TEXT NOT NULL);
  `);
	if (!db.query("SELECT 1 FROM calendars WHERE id = 'personal'").get())
		put(db, "calendars", "personal", { id: "personal", name: "Personal", color: "#4f7cff", visible: true, kind: "personal" } satisfies CalendarSource);
	if (seed && !db.query("SELECT 1 FROM members LIMIT 1").get())
		seedDatabase(db);
	migrateIngredientSnapshots(db);
	migrateLegacyWeekendReserves(db);
	migrateWeightHistory(db);
	return db;
}

function snapshotRows(
	rows: MenuIngredient[],
	catalog: Ingredient[],
): MenuIngredient[] {
	const byId = new Map(catalog.map((item) => [item.id, item]));
	return rows.map((row) => {
		const ingredient = row.ingredient ?? byId.get(row.ingredientId);
		if (!ingredient || ingredient.id !== row.ingredientId)
			throw new Error(`ingredient snapshot is missing for ${row.ingredientId}`);
		return { ...row, ingredient: structuredClone(ingredient) };
	});
}

function snapshotMeal(value: ScheduledMeal, catalog: Ingredient[]): ScheduledMeal {
	return { ...value, ingredients: snapshotRows(value.ingredients, catalog) };
}

function snapshotMenu(value: SavedMenu, catalog: Ingredient[]): SavedMenu {
	return { ...value, ingredients: snapshotRows(value.ingredients, catalog) };
}

function migrateIngredientSnapshots(db: Database) {
	const catalog = rows<Ingredient>(db, "ingredients");
	db.transaction(() => {
		for (const menu of rows<SavedMenu>(db, "saved_menus")) {
			if (menu.ingredients.every((row) => row.ingredient)) continue;
			put(db, "saved_menus", menu.id, snapshotMenu(menu, catalog));
		}
		for (const meal of rows<ScheduledMeal>(db, "scheduled_meals")) {
			if (meal.ingredients.every((row) => row.ingredient)) continue;
			putMeal(db, snapshotMeal(meal, catalog));
		}
	})();
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

function migrateWeightHistory(db: Database) {
	const targets = rows<WeeklyTarget>(db, "targets");
	const members = rows<MemberProfile>(db, "members");
	db.transaction(() => {
		for (const member of members) {
			const memberTargets = targets.filter((target) => target.memberId === member.id);
			for (const point of member.weightHistory ?? []) {
				const target = memberTargets.find((item) => item.weekStart === point.date);
				if (target && !finite(target.weightKg)) {
					target.weightKg = point.weightKg;
					put(db, "targets", `${target.memberId}|${target.weekStart}`, target, target.memberId, target.weekStart);
				}
			}
			if (!memberTargets.some((target) => finite(target.weightKg)) && memberTargets.length) {
				const latest = memberTargets.sort((a, b) => b.weekStart.localeCompare(a.weekStart))[0];
				latest.weightKg = member.currentWeightKg;
				put(db, "targets", `${latest.memberId}|${latest.weekStart}`, latest, latest.memberId, latest.weekStart);
			}
		}
	})();
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
	table: "members" | "ingredients" | "saved_menus" | "targets" | "calendars" | "agenda_items",
	id: string,
	value: unknown,
	memberId?: string,
	weekStart?: string,
) {
	if (table === "agenda_items")
		db.query("INSERT OR REPLACE INTO agenda_items(id, calendar_id, data) VALUES (?, ?, ?)").run(id, (value as AgendaItem).calendarId, JSON.stringify(value));
	else if (table === "targets")
		db.query(
			"INSERT OR REPLACE INTO targets(member_id, week_start, data) VALUES (?, ?, ?)",
		).run(memberId ?? "", weekStart ?? "", JSON.stringify(value));
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
		| "targets"
		| "calendars"
		| "agenda_items",
): T[] {
	return db
		.query(
			`SELECT data FROM ${table}${table === "scheduled_meals" ? " ORDER BY date, slot, member_id" : table === "targets" ? " ORDER BY week_start, member_id" : " ORDER BY id"}`,
		)
		.all()
		.map((row: any) => JSON.parse(row.data));
}
function publicCalendar(calendar: CalendarSource) {
	const { sourceUrl, ...safe } = calendar;
	return { ...safe, subscribed: !!sourceUrl };
}

function dataFromDb(db: Database, includeSubscriptionUrls = false): AppData {
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
		calendars: rows<CalendarSource>(db, "calendars").map((calendar) => includeSubscriptionUrls ? calendar : publicCalendar(calendar)),
		agendaItems: rows<AgendaItem>(db, "agenda_items"),
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
		const snapshot = row && typeof row === "object" ? row.ingredient : undefined;
		if (
			!row ||
			typeof row !== "object" ||
			typeof row.ingredientId !== "string" ||
			(!available.has(row.ingredientId) && !snapshot) ||
			!finite(row.quantity) ||
			row.quantity <= 0 ||
			row.quantity > 100000 ||
			(row.memberId !== undefined && !members.has(row.memberId)) ||
			(snapshot !== undefined &&
				(!validIngredient(snapshot) || snapshot.id !== row.ingredientId))
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
		typeof x.unit === "string" &&
		!!x.unit.trim() &&
		x.unit.trim().length <= 32 &&
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
		!Array.isArray(x.targets) ||
		!Array.isArray(x.calendars) ||
		!Array.isArray(x.agendaItems)
	)
		return false;
	const ingredientIds = new Set<string>(x.ingredients.map((i: any) => i?.id as string));
	if (
		x.members.length !== 2 ||
		x.members.some(
			(m: any) =>
				!members.has(m?.id) ||
				typeof m.name !== "string" ||
				!m.name.trim() ||
				!validDate(m.birthday) ||
				!["male", "female", "other"].includes(m.sex) ||
				!finite(m.heightCm) ||
				m.heightCm < 100 ||
				m.heightCm > 250 ||
				!finite(m.currentWeightKg) ||
				m.currentWeightKg < 30 ||
				m.currentWeightKg > 300 ||
				(m.weightHistory !== undefined &&
					(!Array.isArray(m.weightHistory) ||
						m.weightHistory.length > 500 ||
						m.weightHistory.some(
							(point: any) =>
								!point ||
								!validDate(point.date) ||
								!finite(point.weightKg) ||
								point.weightKg < 30 ||
								point.weightKg > 300,
							) ||
						new Set(m.weightHistory.map((point: any) => point.date)).size !==
							m.weightHistory.length)) ||
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
		new Set(targetKeys).size === targetKeys.length &&
		x.calendars.length > 0 &&
		x.calendars.every((c: any) => c && typeof c.id === "string" && !!c.id && typeof c.name === "string" && !!c.name.trim() && typeof c.color === "string" && /^#[\da-f]{6}$/i.test(c.color) && typeof c.visible === "boolean" && ["personal", "ics"].includes(c.kind) && (c.kind !== "ics" || typeof c.sourceFileName === "string") && (c.sourceUrl === undefined || (c.kind === "ics" && isCalendarFeedUrl(c.sourceUrl))) && (c.subscribed === undefined || typeof c.subscribed === "boolean") && (c.lastRefreshedAt === undefined || validCalendarTimestamp(c.lastRefreshedAt)) && (c.lastRefreshAttemptAt === undefined || validCalendarTimestamp(c.lastRefreshAttemptAt)) && (c.refreshError === undefined || (typeof c.refreshError === "string" && c.refreshError.length <= 500)) && (c.timeZones === undefined || (!!c.timeZones && typeof c.timeZones === "object" && Object.values(c.timeZones).every((definition: any) => typeof definition === "string")))) &&
		new Set(x.calendars.map((c: CalendarSource) => c.id)).size === x.calendars.length &&
		x.calendars.some((c: CalendarSource) => c.id === "personal" && c.kind === "personal") &&
		x.agendaItems.every((a: any) => validAgendaItem(a, new Set(x.calendars.map((c: CalendarSource) => c.id)))) &&
		new Set(x.agendaItems.map((a: AgendaItem) => a.id)).size === x.agendaItems.length
	);
}

const validAgendaDateTime = (value: unknown, allDay: boolean) => allDay
	? validDate(value)
	: typeof value === "string" && /^\d{4}-\d\d-\d\dT/.test(value) && !Number.isNaN(Date.parse(value));
function validAgendaItem(a: any, calendarIds: Set<string>): a is AgendaItem {
	if (!a || typeof a !== "object" || typeof a.id !== "string" || !a.id || !calendarIds.has(a.calendarId) || typeof a.title !== "string" || !a.title.trim() || a.title.length > 300 || (a.description !== undefined && (typeof a.description !== "string" || a.description.length > 2000)) || typeof a.allDay !== "boolean" || !validAgendaDateTime(a.start, a.allDay) || !validAgendaDateTime(a.end, a.allDay) || (a.allDay ? a.end <= a.start : Date.parse(a.end) <= Date.parse(a.start)) || (a.timeZone !== undefined && typeof a.timeZone !== "string") || (a.recurrenceRule !== undefined && typeof a.recurrenceRule !== "string") || (a.recurrenceDates !== undefined && (!Array.isArray(a.recurrenceDates) || a.recurrenceDates.some((d: any) => !validAgendaDateTime(d, a.allDay)))) || (a.excludedDates !== undefined && (!Array.isArray(a.excludedDates) || a.excludedDates.some((d: any) => !validAgendaDateTime(d, a.allDay)))) || (a.exceptions !== undefined && (!a.exceptions || typeof a.exceptions !== "object"))) return false;
	try { if (a.recurrenceRule) ICAL.Recur.fromString(a.recurrenceRule); } catch { return false; }
	if (a.exceptions) for (const [rid, ex] of Object.entries(a.exceptions) as [string, any][]) {
		const allDay = ex?.allDay ?? a.allDay;
		const occurrenceStart = ex?.start ?? a.start;
		const occurrenceEnd = ex?.end ?? a.end;
		if (!validAgendaDateTime(rid, a.allDay) || !ex || typeof ex !== "object" || (ex.cancel !== undefined && ex.cancel !== true) || (ex.cancel !== true && Object.keys(ex).length === 0) || (ex.title !== undefined && typeof ex.title !== "string") || (ex.description !== undefined && (typeof ex.description !== "string" || ex.description.length > 2000)) || (ex.start !== undefined && !validAgendaDateTime(ex.start, allDay)) || (ex.end !== undefined && !validAgendaDateTime(ex.end, allDay)) || (ex.allDay !== undefined && typeof ex.allDay !== "boolean") || (ex.timeZone !== undefined && typeof ex.timeZone !== "string") || (allDay ? occurrenceEnd <= occurrenceStart : Date.parse(occurrenceEnd) <= Date.parse(occurrenceStart))) return false;
	}
	return true;
}

const validCalendarTimestamp = (value: unknown) => typeof value === "string" && !Number.isNaN(Date.parse(value));

function calendarFeedUrl(value: unknown): URL {
	if (typeof value !== "string" || !value.trim() || value.length > 2048) throw new Error("Enter a valid HTTPS calendar URL.");
	let url: URL;
	try { url = new URL(value.trim()); } catch { throw new Error("Enter a valid HTTPS calendar URL."); }
	if (url.protocol !== "https:" || !url.hostname || url.username || url.password || (url.port && url.port !== "443") || isIP(url.hostname)) throw new Error("Calendar subscriptions require an HTTPS URL on port 443 without credentials or an IP address.");
	url.hash = "";
	return url;
}

function isCalendarFeedUrl(value: unknown) {
	try { calendarFeedUrl(value); return true; } catch { return false; }
}

class CalendarFeedError extends Error {
	constructor(message: string, readonly status = 502) { super(message); }
}

function publicIpv4(address: string) {
	const octets = address.split(".").map(Number);
	if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
	const [a, b, c] = octets;
	return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 0 && (c === 0 || c === 2) || b === 88 && c === 99 || b === 168)) || (a === 198 && (b === 18 || b === 19 || b === 51 && c === 100)) || (a === 203 && b === 0 && c === 113));
}

// shortcut: feeds must use HTTPS on port 443 and public IPv4; add pinned IPv6 support if a public feed requires it.
async function fetchCalendarFeed(value: unknown, redirects = 0): Promise<string> {
	const url = calendarFeedUrl(value);
	let addresses: Awaited<ReturnType<typeof dnsLookup>>[];
	try { addresses = await dnsLookup(url.hostname, { family: 4, all: true, verbatim: true }); }
	catch { throw new CalendarFeedError("Could not resolve the calendar host."); }
	if (!addresses.length || addresses.some(({ address }) => !publicIpv4(address))) throw new CalendarFeedError("Calendar URL must resolve only to public IPv4 addresses.", 400);
	const address = addresses[0];
	return new Promise((resolve, reject) => {
		let timeout: ReturnType<typeof setTimeout>;
		let followingRedirect = false;
		const request = httpsRequest(url, {
			family: 4,
			autoSelectFamily: false,
			headers: { accept: "text/calendar, application/ics, text/plain;q=0.9, */*;q=0.1", "user-agent": "PiringKita calendar subscription" },
			lookup: (_hostname, _options, callback) => callback(null, address.address, address.family),
		}, (response) => {
			if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0)) {
				const location = response.headers.location;
				if (!location || redirects >= 3) {
					response.destroy();
					clearTimeout(timeout);
					return reject(new CalendarFeedError("Calendar feed redirected too many times or without a location."));
				}
				let target: string;
				try { target = new URL(location, url).toString(); } catch {
					response.destroy();
					clearTimeout(timeout);
					return reject(new CalendarFeedError("Calendar feed returned an invalid redirect."));
				}
				followingRedirect = true;
				response.destroy();
				clearTimeout(timeout);
				void fetchCalendarFeed(target, redirects + 1).then(resolve, reject);
				return;
			}
			if (response.statusCode !== 200) {
				response.destroy();
				clearTimeout(timeout);
				return reject(new CalendarFeedError(`Calendar host returned HTTP ${response.statusCode ?? "error"}.`));
			}
			response.once("close", () => clearTimeout(timeout));
			const chunks: Buffer[] = [];
			let size = 0;
			response.on("data", (chunk: Buffer | string) => {
				const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
				size += bytes.length;
				if (size > 10 * 1024 * 1024) {
					const error = new CalendarFeedError("iCalendar feed exceeds the 10 MB limit.", 413);
					response.destroy(error);
					request.destroy(error);
					return;
				}
				chunks.push(bytes);
			});
			response.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
			response.on("error", reject);
		});
		timeout = setTimeout(() => request.destroy(new CalendarFeedError("Calendar feed request timed out.")), 15_000);
		request.on("error", (error) => { clearTimeout(timeout); if (!followingRedirect) reject(error); });
		request.end();
	});
}

function nextCalendarColor(db: Database) {
	const colors = ["#ef4444", "#8b5cf6", "#ec4899", "#f97316", "#14b8a6", "#eab308", "#06b6d4", "#84cc16", "#a855f7", "#0f766e"];
	const used = new Set(rows<CalendarSource>(db, "calendars").map((calendar) => calendar.color.toLowerCase()));
	let color = colors.find((candidate) => !used.has(candidate));
	let colorIndex = rows<CalendarSource>(db, "calendars").length;
	while (!color) {
		const generated = extraCalendarColor(colorIndex++);
		if (!used.has(generated)) color = generated;
	}
	return color;
}

async function refreshDueCalendars(db: Database) {
	const now = Date.now();
	const due = rows<CalendarSource>(db, "calendars").filter((calendar) => {
		if (!calendar.sourceUrl) return false;
		const lastAttempt = Date.parse(calendar.lastRefreshAttemptAt ?? calendar.lastRefreshedAt ?? "");
		const retryAfter = calendar.refreshError ? 60 * 60_000 : 7 * 24 * 60 * 60_000;
		return !Number.isFinite(lastAttempt) || now - lastAttempt >= retryAfter;
	});
	const claimed = due.map((calendar) => {
		const current = { ...calendar, lastRefreshAttemptAt: new Date(now).toISOString() };
		put(db, "calendars", calendar.id, current);
		return current;
	});
	await Promise.all(claimed.map(async (calendar) => {
		try {
			const ics = await fetchCalendarFeed(calendar.sourceUrl);
			const imported = importIcs(ics, calendar.sourceFileName ?? "online-calendar.ics", calendar.id, calendar.color, calendar.sourceUrl);
			const oldByUid = new Map(rows<AgendaItem>(db, "agenda_items").filter((item) => item.calendarId === calendar.id).map((item) => [item.sourceUid, item.id]));
			const reusedIds = new Set<string>();
			for (const item of imported.items) {
				const previousId = item.sourceUid ? oldByUid.get(item.sourceUid) : undefined;
				if (previousId && !reusedIds.has(previousId)) { item.id = previousId; reusedIds.add(previousId); }
			}
			const current = rows<CalendarSource>(db, "calendars").find((item) => item.id === calendar.id);
			if (!current || current.sourceUrl !== calendar.sourceUrl) return;
			const refreshed: CalendarSource = { ...current, name: imported.calendar.name, timeZones: imported.calendar.timeZones, lastRefreshedAt: new Date().toISOString() };
			delete refreshed.refreshError;
			const calendarIds = new Set(rows<CalendarSource>(db, "calendars").map((item) => item.id));
			if (imported.items.some((item) => !validAgendaItem(item, calendarIds))) throw new Error("iCalendar contains invalid event data");
			db.transaction(() => {
				db.query("DELETE FROM agenda_items WHERE calendar_id = ?").run(calendar.id);
				put(db, "calendars", refreshed.id, refreshed);
				imported.items.forEach((item) => put(db, "agenda_items", item.id, item));
			})();
		} catch (error) {
			const current = rows<CalendarSource>(db, "calendars").find((item) => item.id === calendar.id);
			if (current) put(db, "calendars", calendar.id, { ...current, refreshError: (error instanceof Error ? error.message : "Calendar refresh failed.").slice(0, 500) });
		}
	}));
}

function newCalendarId() {
	return `calendar-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function importIcs(text: string, fileName: string, id: string, color: string, sourceUrl?: string) {
	const root = new ICAL.Component(ICAL.parse(text));
	const timezoneComponents = root.getAllSubcomponents("vtimezone");
	for (const component of timezoneComponents) {
		const zone = new ICAL.Timezone(component);
		ICAL.TimezoneService.register(zone, zone.tzid);
	}
	const name = root.getFirstPropertyValue("x-wr-calname")?.toString().trim();
	const timeZones = Object.fromEntries(timezoneComponents.map((component: any) => [component.getFirstPropertyValue("tzid")?.toString(), JSON.stringify(component.toJSON())]).filter(([tzid]) => !!tzid));
	const calendars: CalendarSource = { id, name: name || fileName, color, visible: true, kind: "ics", sourceFileName: fileName, ...(sourceUrl ? { sourceUrl } : {}), ...(Object.keys(timeZones).length ? { timeZones } : {}) };
	const components = root.getAllSubcomponents("vevent");
	if (!components.length) throw new Error("iCalendar file contains no events");
	const items: AgendaItem[] = [];
	const exceptions: Array<{ uid: string; rid: string; value: any }> = [];
	for (const component of components) {
		const event = new ICAL.Event(component);
		const value = (time: any) => time.isDate ? time.toString() : time.toJSDate().toISOString();
		const start = value(event.startDate);
		const end = value(event.endDate);
		if (event.isRecurrenceException()) {
			const cancelled = component.getFirstPropertyValue("status")?.toString().toUpperCase() === "CANCELLED";
			exceptions.push({ uid: event.uid, rid: value(component.getFirstPropertyValue("recurrence-id")), value: cancelled ? { cancel: true } : { title: event.summary, start, end, allDay: event.startDate.isDate, timeZone: event.startDate.zone?.tzid } });
			continue;
		}
		const rule = component.getFirstPropertyValue("rrule")?.toString();
		const recurrenceDates = component.getAllProperties("rdate").flatMap((p: any) => p.getValues().map((x: any) => x.startDate ? value(x.startDate) : value(x)));
		const excludedDates = component.getAllProperties("exdate").flatMap((p: any) => p.getValues().map((x: any) => value(x)));
		items.push({ id: `${id}-${items.length}`, calendarId: id, title: event.summary || "Untitled event", start, end, allDay: event.startDate.isDate, timeZone: event.startDate.zone?.tzid, recurrenceRule: rule || undefined, recurrenceDates: recurrenceDates.length ? recurrenceDates : undefined, excludedDates: excludedDates.length ? excludedDates : undefined, sourceUid: event.uid, exceptions: {} });
	}
	for (const exception of exceptions) {
		const master = items.find((item) => item.sourceUid === exception.uid);
		if (master) master.exceptions![exception.rid] = exception.value;
	}
	if (!items.length) throw new Error("iCalendar file contains no master events");
	return { calendar: calendars, items };
}

function calendarOccurrences(db: Database, start: string, end: string) {
	const calendars = rows<CalendarSource>(db, "calendars").filter((calendar) => calendar.visible);
	const calendarById = new Map(calendars.map((calendar) => [calendar.id, calendar]));
	const lower = new Date(`${start}T00:00:00.000Z`);
	const upper = new Date(`${end}T23:59:59.999Z`);
	const occurrences: any[] = [];
	for (const item of rows<AgendaItem>(db, "agenda_items")) {
		const calendar = calendarById.get(item.calendarId);
		if (!calendar) continue;
		const baseStart = item.allDay ? new Date(`${item.start}T00:00:00Z`) : new Date(item.start);
		const duration = item.allDay ? (Date.parse(`${item.end}T00:00:00Z`) - baseStart.getTime()) : Date.parse(item.end) - baseStart.getTime();
		const push = (recurrenceId: string, date: Date) => {
			if (item.excludedDates?.includes(recurrenceId)) return;
			const exception = item.exceptions?.[recurrenceId];
			if (exception?.cancel) return;
			const startValue = exception?.start ?? (item.allDay ? date.toISOString().slice(0, 10) : date.toISOString());
			const endValue = exception?.end ?? (item.allDay ? new Date(date.getTime() + duration).toISOString().slice(0, 10) : new Date(date.getTime() + duration).toISOString());
			const visibleStart = item.allDay ? new Date(`${startValue}T00:00:00Z`) : new Date(startValue);
			const visibleEnd = item.allDay ? new Date(`${endValue}T00:00:00Z`) : new Date(endValue);
			if (visibleStart <= upper && (item.allDay ? visibleEnd > lower : visibleEnd >= lower)) occurrences.push({ id: item.id, calendarId: item.calendarId, title: exception?.title ?? item.title, description: exception?.description ?? item.description, start: startValue, end: endValue, allDay: exception?.allDay ?? item.allDay, timeZone: exception?.timeZone ?? item.timeZone, recurrenceId, recurring: !!item.recurrenceRule || !!item.recurrenceDates?.length, calendarName: calendar.name, color: calendar.color });
		};
		const ids = new Set<string>();
		if (baseStart <= upper && new Date(baseStart.getTime() + duration) >= lower) { const rid = item.start; ids.add(rid); push(rid, baseStart); }
		if (item.recurrenceRule) {
			const definition = item.timeZone ? calendar.timeZones?.[item.timeZone] : undefined;
			const zone = definition ? new ICAL.Timezone(new ICAL.Component(JSON.parse(definition))) : null;
			const parts = item.timeZone && !item.allDay && !zone ? zonedTimeParts(baseStart, item.timeZone) : null;
			const dtstart = parts ? ICAL.Time.fromData({ ...parts, isDate: false }, ICAL.Timezone.utcTimezone) : ICAL.Time.fromJSDate(baseStart, true);
			if (zone) ICAL.Timezone.convert_time(dtstart, ICAL.Timezone.utcTimezone, zone);
			const iterator = new ICAL.RecurIterator({ rule: ICAL.Recur.fromString(item.recurrenceRule), dtstart });
			for (let count = 0; count < 20000; count++) {
				const next = iterator.next();
				if (!next) break;
				const wallDate = next.toJSDate();
				const date = zone ? new Date(wallDate.getTime() - zone.utcOffset(next) * 1000) : item.timeZone && parts ? wallTimeToInstant(wallDate, item.timeZone) : wallDate;
				if (!date) continue;
				if (date > upper) break;
				const rid = item.allDay ? `${next.year}-${String(next.month).padStart(2, "0")}-${String(next.day).padStart(2, "0")}` : date.toISOString();
				if (!ids.has(rid)) { ids.add(rid); push(rid, date); }
			}
		}
		for (const dateValue of item.recurrenceDates ?? []) {
			const date = item.allDay ? new Date(`${dateValue}T00:00:00Z`) : new Date(dateValue);
			if (!ids.has(dateValue) && date <= upper && new Date(date.getTime() + duration) >= lower) { ids.add(dateValue); push(dateValue, date); }
		}
	}
	return occurrences.sort((a, b) => a.start.localeCompare(b.start));
}

function zonedTimeParts(date: Date, timeZone: string) {
	let parts: Intl.DateTimeFormatPart[];
	try { parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(date); }
	catch { parts = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(date); }
	const values = Object.fromEntries(parts.map((part) => [part.type, Number(part.value)]));
	return { year: values.year, month: values.month, day: values.day, hour: values.hour, minute: values.minute, second: values.second };
}

function wallTimeToInstant(wallDate: Date, timeZone: string) {
	const target = { year: wallDate.getUTCFullYear(), month: wallDate.getUTCMonth() + 1, day: wallDate.getUTCDate(), hour: wallDate.getUTCHours(), minute: wallDate.getUTCMinutes(), second: wallDate.getUTCSeconds() };
	const wallTimestamp = wallDate.getTime();
	let candidate = wallTimestamp;
	for (let index = 0; index < 3; index++) {
		const local = zonedTimeParts(new Date(candidate), timeZone);
		const localTimestamp = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
		candidate += wallTimestamp - localTimestamp;
	}
	const resolved = zonedTimeParts(new Date(candidate), timeZone);
	return Object.keys(target).every((key) => target[key as keyof typeof target] === resolved[key as keyof typeof resolved]) ? new Date(candidate) : null;
}

function extraCalendarColor(index: number) {
	const hue = (index * 137.508) % 360;
	const chroma = 0.72;
	const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
	const [r, g, b] = hue < 60 ? [chroma, x, 0] : hue < 120 ? [x, chroma, 0] : hue < 180 ? [0, chroma, x] : hue < 240 ? [0, x, chroma] : hue < 300 ? [x, 0, chroma] : [chroma, 0, x];
	return `#${[r, g, b].map((value) => Math.round((value + 0.12) * 255).toString(16).padStart(2, "0")).join("")}`;
}
function validTarget(t: any): t is WeeklyTarget {
	return (
		!!t &&
		members.has(t.memberId) &&
		validDate(t.weekStart) &&
		isMonday(t.weekStart) &&
		(t.weightKg === undefined || (finite(t.weightKg) && t.weightKg >= 30 && t.weightKg <= 300)) &&
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
		input.heightCm,
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
		input.heightCm < 100 ||
		input.heightCm > 250 ||
		!["male", "female", "other"].includes(input.sex) ||
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
	if (input.sex === "other")
		throw new Error(
			"manual targets are required when the resting-calorie equation does not apply",
		);
	const ree =
		10 * input.weightKg +
		6.25 * input.heightCm -
		5 * age +
		(input.sex === "male" ? 5 : -161);
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
		calculation: {
			age,
			bmrCalories: ree,
			maintenanceCalories: maintenance,
		},
		recommendation:
			weekday < 1200
				? "This creates a low weekday calorie target. Consider qualified guidance, or choose a smaller deficit or weekend reserve."
				: input.deficitPercent > 30 || maintenance - weeklyCalories / 7 > 750
					? "This creates a larger calorie deficit than the suggested starting point. You can keep it or adjust it before applying."
					: "This proposal is close to the suggested starting point. You can keep it or adjust any target before applying.",
	};
}

function replaceData(db: Database, data: AppData, normalizeTargets = true) {
	db.transaction(() => {
		db.exec(
			"DELETE FROM agenda_items; DELETE FROM calendars; DELETE FROM scheduled_meals; DELETE FROM saved_menus; DELETE FROM ingredients; DELETE FROM targets; DELETE FROM members;",
		);
		data.members.forEach((x) => put(db, "members", x.id, x));
		data.ingredients.forEach((x) => put(db, "ingredients", x.id, x));
		data.savedMenus.forEach((x) =>
			put(db, "saved_menus", x.id, snapshotMenu(x, data.ingredients)),
		);
		data.scheduledMeals.forEach((x) =>
			putMeal(db, snapshotMeal(x, data.ingredients)),
		);
		data.targets.forEach((x) => {
			const target = normalizeTargets ? normalizeWeekendReserve(x) : x;
			put(
				db,
				"targets",
				`${target.memberId}|${target.weekStart}`,
				target,
				target.memberId,
				target.weekStart,
			);
		});
		data.calendars.forEach((x) => put(db, "calendars", x.id, x));
		data.agendaItems.forEach((x) => put(db, "agenda_items", x.id, x));
	})();
	migrateWeightHistory(db);
}

function validateSQLiteBackup(bytes: Uint8Array): AppData {
	const backup = Database.deserialize(bytes);
	try {
		const reference = createDatabase(":memory:", false);
		const schema = (database: Database) => database
			.query("SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name")
			.all() as { type: string; name: string; sql: string }[];
			const normalizeSchema = (rows: ReturnType<typeof schema>) =>
			rows.map((x) => `${x.type}|${x.name}|${x.sql.toLowerCase().replace(/\s+/g, " ").trim()}`).join("\n");
		let sameSchema: boolean;
		try {
			const backupSchema = schema(backup);
			const referenceSchema = schema(reference);
			const backupHasCalendarSchema = backupSchema.some((row) => row.name === "calendars");
			sameSchema = normalizeSchema(backupSchema) === normalizeSchema(referenceSchema) || (!backupHasCalendarSchema && normalizeSchema(backupSchema) === normalizeSchema(referenceSchema.filter((row) => !["calendars", "agenda_items"].includes(row.name))));
		} finally {
			reference.close();
		}
		if (!sameSchema) throw new Error("SQLite backup schema does not match this app");
		if (backup.query("PRAGMA integrity_check").get()?.integrity_check !== "ok")
			throw new Error("SQLite backup failed its integrity check");
		if ((backup.query("PRAGMA foreign_key_check").all() as unknown[]).length)
			throw new Error("SQLite backup contains invalid foreign keys");
		const hasCalendarTables = (backup.query("SELECT name FROM sqlite_master WHERE type='table' AND name='calendars'").get() !== null);
		const data: AppData = {
			members: rows<MemberProfile>(backup, "members"),
			ingredients: rows<Ingredient>(backup, "ingredients"),
			savedMenus: rows<SavedMenu>(backup, "saved_menus").map((menu) => ({
				...menu,
				slot: menu.slot ?? "lunch",
			})),
			scheduledMeals: rows<ScheduledMeal>(backup, "scheduled_meals"),
			targets: rows<WeeklyTarget>(backup, "targets"),
			calendars: hasCalendarTables ? rows<CalendarSource>(backup, "calendars") : [{ id: "personal", name: "Personal", color: "#4f7cff", visible: true, kind: "personal" }],
			agendaItems: hasCalendarTables ? rows<AgendaItem>(backup, "agenda_items") : [],
		};
		const rowsWithIds = [
			...backup.query("SELECT id, data FROM members").all() as { id: string; data: string }[],
			...backup.query("SELECT id, data FROM ingredients").all() as { id: string; data: string }[],
			...backup.query("SELECT id, data FROM saved_menus").all() as { id: string; data: string }[],
			...backup.query("SELECT id, data FROM scheduled_meals").all() as { id: string; data: string }[],
			...(hasCalendarTables ? backup.query("SELECT id, data FROM calendars").all() as { id: string; data: string }[] : []),
			...(hasCalendarTables ? backup.query("SELECT id, data FROM agenda_items").all() as { id: string; data: string }[] : []),
		];
		if (rowsWithIds.some(({ id, data: json }) => id !== JSON.parse(json).id))
			throw new Error("SQLite backup data is invalid");
		if ((backup.query("SELECT id, date, slot, member_id, data FROM scheduled_meals").all() as { id: string; date: string; slot: string; member_id: string; data: string }[]).some((row) => {
			const meal = JSON.parse(row.data);
			return row.id !== meal.id || row.date !== meal.date || row.slot !== meal.slot || row.member_id !== (meal.memberId ?? "");
		})) throw new Error("SQLite backup data is invalid");
		if ((backup.query("SELECT member_id, week_start, data FROM targets").all() as { member_id: string; week_start: string; data: string }[]).some((row) => {
			const target = JSON.parse(row.data);
			return row.member_id !== target.memberId || row.week_start !== target.weekStart;
		})) throw new Error("SQLite backup data is invalid");
		if (!validAppData(data)) throw new Error("SQLite backup data is invalid");
		return data;
	} finally {
		backup.close();
	}
}

export function createApp(db = createDatabase()) {
	const app = express();
	app.use(express.json({ limit: "21mb" }));
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
		table: "scheduled_meals" | "saved_menus" | "ingredients" | "agenda_items",
		id: string,
	) =>
		db.query(`SELECT data FROM ${table} WHERE id = ?`).get(id) as {
			data: string;
		} | null;

	app.get("/api/health", (_req, res) => res.json({ ok: true }));
	app.get("/api/config", (_req, res) => {
		const configuredInterval = Number(process.env.DASHBOARD_REFRESH_INTERVAL_MS);
		res.json({
			dashboardRefreshIntervalMs:
				Number.isFinite(configuredInterval) && configuredInterval > 0
					? configuredInterval
					: 60_000,
		});
	});
	app.get("/api/data", async (_req, res) => {
		try { await refreshDueCalendars(db); return res.json(dataFromDb(db)); }
		catch (error) { return fail(res, error); }
	});
	app.post("/api/calendars/import", (req, res) => {
		const { fileName, ics } = req.body ?? {};
		if (typeof fileName !== "string" || !fileName.trim() || fileName.length > 255 || typeof ics !== "string" || !ics.trim()) return fail(res, "fileName and iCalendar text are required");
		if (Buffer.byteLength(ics, "utf8") > 10 * 1024 * 1024) return fail(res, "iCalendar file exceeds the 10 MB limit", 413);
		try {
			const id = newCalendarId();
			const imported = importIcs(ics, fileName.trim(), id, nextCalendarColor(db));
			const calendarIds = new Set([...rows<CalendarSource>(db, "calendars").map((x) => x.id), id]);
			if (imported.items.some((item) => !validAgendaItem(item, calendarIds))) throw new Error("iCalendar contains invalid event data");
			db.transaction(() => { put(db, "calendars", id, imported.calendar); imported.items.forEach((item) => put(db, "agenda_items", item.id, item)); })();
			return res.status(201).json(publicCalendar(imported.calendar));
		} catch (e) { return fail(res, e); }
	});
	app.post("/api/calendars/subscribe", async (req, res) => {
		let url: URL;
		try { url = calendarFeedUrl(req.body?.url); }
		catch (error) { return fail(res, error); }
		const ip = req.ip || req.socket.remoteAddress || "unknown";
		if (!rateLimit(`calendar-subscribe:${ip}`, 5, 60_000)) return fail(res, "Calendar subscription limit reached. Try again in a minute.", 429);
		try {
			const ics = await fetchCalendarFeed(url.toString());
			const id = newCalendarId();
			const feedName = url.pathname.split("/").filter(Boolean).at(-1) || url.hostname;
			const imported = importIcs(ics, feedName, id, nextCalendarColor(db), url.toString());
			const now = new Date().toISOString();
			imported.calendar.lastRefreshedAt = now;
			imported.calendar.lastRefreshAttemptAt = now;
			const calendarIds = new Set([...rows<CalendarSource>(db, "calendars").map((calendar) => calendar.id), id]);
			if (imported.items.some((item) => !validAgendaItem(item, calendarIds))) throw new Error("iCalendar contains invalid event data");
			db.transaction(() => { put(db, "calendars", id, imported.calendar); imported.items.forEach((item) => put(db, "agenda_items", item.id, item)); })();
			return res.status(201).json(publicCalendar(imported.calendar));
		} catch (error) {
			return fail(res, error, error instanceof CalendarFeedError ? error.status : 400);
		}
	});
	app.patch("/api/calendars/:id", (req, res) => {
		const calendar = rows<CalendarSource>(db, "calendars").find((x) => x.id === req.params.id);
		if (!calendar) return fail(res, "calendar not found", 404);
		if (typeof req.body?.visible !== "boolean") return fail(res, "visible must be a boolean");
		calendar.visible = req.body.visible;
		put(db, "calendars", calendar.id, calendar);
		return res.json(publicCalendar(calendar));
	});
	app.delete("/api/calendars/:id", (req, res) => {
		const calendar = rows<CalendarSource>(db, "calendars").find((x) => x.id === req.params.id);
		if (!calendar) return fail(res, "calendar not found", 404);
		if (calendar.kind !== "ics") return fail(res, "Personal calendar cannot be deleted", 403);
		db.transaction(() => { db.query("DELETE FROM agenda_items WHERE calendar_id = ?").run(calendar.id); db.query("DELETE FROM calendars WHERE id = ?").run(calendar.id); })();
		return res.json({ ok: true });
	});
	app.post("/api/agendas", (req, res) => {
		const item = req.body;
		if (!validAgendaItem(item, new Set(["personal"]))) return fail(res, "invalid agenda item");
		if (existing("agenda_items", item.id)) return fail(res, "agenda id already exists", 409);
		put(db, "agenda_items", item.id, item);
		return res.status(201).json(item);
	});
	app.put("/api/agendas/:id", (req, res) => {
		const stored = rows<AgendaItem>(db, "agenda_items").find((x) => x.id === req.params.id);
		if (!stored) return fail(res, "agenda item not found", 404);
		if (stored.calendarId !== "personal") return fail(res, "imported calendar events are read-only", 403);
		if (req.body?.scope === "occurrence") {
			const recurrenceId = req.body.recurrenceId;
			const changes = req.body.changes;
			if (!stored.recurrenceRule || !validAgendaDateTime(recurrenceId, stored.allDay) || !changes || typeof changes !== "object") return fail(res, "invalid occurrence update");
			const updated = { ...stored, exceptions: { ...(stored.exceptions ?? {}), [recurrenceId]: { ...changes } } };
			if (!validAgendaItem(updated, new Set(["personal"]))) return fail(res, "invalid occurrence update");
			put(db, "agenda_items", stored.id, updated);
			return res.json(updated);
		}
		const item = req.body;
		if (!validAgendaItem(item, new Set(["personal"])) || item.id !== stored.id) return fail(res, "invalid agenda item");
		put(db, "agenda_items", item.id, item);
		return res.json(item);
	});
	app.delete("/api/agendas/:id", (req, res) => {
		const stored = rows<AgendaItem>(db, "agenda_items").find((x) => x.id === req.params.id);
		if (!stored) return fail(res, "agenda item not found", 404);
		if (stored.calendarId !== "personal") return fail(res, "imported calendar events are read-only", 403);
		if (req.body?.scope === "occurrence") {
			const recurrenceId = req.body.recurrenceId;
			if (!stored.recurrenceRule || !validAgendaDateTime(recurrenceId, stored.allDay)) return fail(res, "invalid occurrence deletion");
			stored.exceptions = { ...(stored.exceptions ?? {}), [recurrenceId]: { cancel: true } };
			put(db, "agenda_items", stored.id, stored);
		} else db.query("DELETE FROM agenda_items WHERE id = ?").run(stored.id);
		return res.json({ ok: true });
	});
	app.get("/api/calendar/occurrences", async (req, res) => {
		const { start, end } = req.query;
		if (!validDate(start) || !validDate(end) || (start as string) > (end as string)) return fail(res, "start and end must be valid ordered dates");
		try { await refreshDueCalendars(db); return res.json({ occurrences: calendarOccurrences(db, start as string, end as string) }); } catch (e) { return fail(res, e); }
	});
	app.get("/api/ai/status", (_req, res) =>
		res.json({
			recommendations: Boolean(
				process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_MEAL_MODEL,
			),
			ingredientLookup: Boolean(process.env.USDA_API_KEY),
		}),
	);
	app.post("/api/ai/recommendations", async (req, res) => {
		const ip = req.ip || req.socket.remoteAddress || "unknown";
		if (!rateLimit(`openrouter:${ip}`, 10, 600_000))
			return fail(
				res,
				"AI request limit reached. Try again in a few minutes.",
				429,
			);
		const catalog = rows<Ingredient>(db, "ingredients");
		const pending: Ingredient[] = [];
		if (req.body?.pendingIngredients !== undefined) {
			if (
				!Array.isArray(req.body.pendingIngredients) ||
				req.body.pendingIngredients.length > 50
			)
				return fail(res, "invalid pending ingredients");
			try {
				for (const item of req.body.pendingIngredients) {
					const fdc =
						typeof item?.id === "string" ? /^fdc-(\d+)$/.exec(item.id) : null;
					if (!fdc || !validIngredient(item))
						return fail(res, "invalid pending USDA ingredient");
					const verified = await usdaIngredient(Number(fdc[1]));
					if (
						JSON.stringify(verified.nutrition) !==
							JSON.stringify(item.nutrition) ||
						verified.source !== item.source
					)
						return fail(
							res,
							"USDA ingredient values changed; look up the ingredient again.",
							409,
						);
					pending.push(verified);
				}
			} catch (error) {
				return fail(res, error, 503);
			}
		}
		const meal = req.body?.meal;
		const baseAvailable = [
			...catalog,
			...pending.filter(
				(item) => !catalog.some((existingItem) => existingItem.id === item.id),
			),
		];
		const baseIds = new Set(baseAvailable.map((item) => item.id));
		if (!validMeal(meal, baseIds))
			return fail(res, "invalid meal draft");
		const companions = req.body?.companions ?? [];
		if (
			!Array.isArray(companions) ||
			companions.length > 2 ||
			companions.some(
				(item: any) =>
					!validMeal(item, baseIds) ||
					item.date !== meal.date ||
					item.slot !== "snack" ||
					!item.memberId,
			)
		)
			return fail(res, "invalid companion snack draft");
		const existingDay = rows<ScheduledMeal>(db, "scheduled_meals").filter(
			(item) => item.date === meal.date && item.id !== meal.id,
		);
		const available = [
			...baseAvailable,
			...[
				...meal.ingredients,
				...existingDay.flatMap((item) => item.ingredients),
				...companions.flatMap((item: ScheduledMeal) => item.ingredients),
			].flatMap((row) =>
				row.ingredient &&
					!catalog.some(
						(item) =>
							item.id === row.ingredientId &&
							JSON.stringify(item) === JSON.stringify(row.ingredient),
					)
					? [row.ingredient]
					: [],
			),
		];
		const occupiedSnackMembers = new Set(
			existingDay
				.filter((item) => item.slot === "snack")
				.map((item) => item.memberId),
		);
		for (const snack of companions) {
			if (occupiedSnackMembers.has(snack.memberId))
				return fail(
					res,
					"a companion snack cannot replace an existing snack",
					409,
				);
			occupiedSnackMembers.add(snack.memberId);
		}
		const day = [...existingDay, ...companions, meal];
		const memberTargets = rows<WeeklyTarget>(db, "targets")
			.map((target) => {
				const current = day.reduce(
					(sum, scheduled) => {
						const total = scheduled.ingredients.reduce(
							(part, row) => {
								const ingredient =
									row.ingredient ??
									available.find((entry) => entry.id === row.ingredientId);
								if (
									!ingredient ||
									(scheduled.slot !== "dinner" &&
										scheduled.memberId &&
										scheduled.memberId !== target.memberId) ||
									(scheduled.slot === "dinner" &&
										row.memberId &&
										row.memberId !== target.memberId)
								)
									return part;
								const amount = row.quantity / ingredient.basisAmount;
								for (const key of [
									"calories",
									"protein",
									"carbs",
									"fat",
									"fiber",
								] as const)
									part[key] +=
										ingredient.nutrition[key] *
										amount *
										(scheduled.slot === "dinner" && !row.memberId ? 0.5 : 1);
								return part;
							},
							{ calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
						);
						return {
							calories: sum.calories + total.calories,
							protein: sum.protein + total.protein,
							carbs: sum.carbs + total.carbs,
							fat: sum.fat + total.fat,
							fiber: sum.fiber + total.fiber,
						};
					},
					{ calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
				);
				return { target, current };
			})
			.filter(({ target }) => target.weekStart <= meal.date)
			.reduce((latest, entry) => {
				const previous = latest.get(entry.target.memberId);
				if (!previous || previous.target.weekStart < entry.target.weekStart)
					latest.set(entry.target.memberId, entry);
				return latest;
			}, new Map<MemberId, { target: WeeklyTarget; current: Nutrition }>());
		const targets = [...memberTargets]
			.filter(([member]) => meal.slot === "dinner" || member === meal.memberId)
			.map(([member, { target, current }]) => {
				const hasDinner = existingDay.some((item) => item.slot === "dinner");
				const hasLunch = existingDay.some(
					(item) => item.slot === "lunch" && item.memberId === member,
				);
				const targetFactor =
					(meal.slot === "lunch" && !hasDinner) ||
					(meal.slot === "dinner" && !hasLunch)
						? 0.5
						: 1;
				return {
					member: member === "richard" ? "Member A" : "Member B",
					memberId: member,
					referenceOnly: [0, 6].includes(
						new Date(`${meal.date}T12:00:00Z`).getUTCDay(),
					),
					dailyCalories: target.weekdayCalories * targetFactor,
					currentCalories: current.calories,
					calories: Math.max(
						0,
						target.weekdayCalories * targetFactor - current.calories,
					),
					dailyProtein: target.macroGrams.protein * targetFactor,
					currentProtein: current.protein,
					protein: Math.max(
						0,
						target.macroGrams.protein * targetFactor - current.protein,
					),
					dailyCarbs: target.macroGrams.carbs * targetFactor,
					currentCarbs: current.carbs,
					carbs: Math.max(
						0,
						target.macroGrams.carbs * targetFactor - current.carbs,
					),
					dailyFat: target.macroGrams.fat * targetFactor,
					currentFat: current.fat,
					fat: Math.max(0, target.macroGrams.fat * targetFactor - current.fat),
					dailyFiber: target.fiberGrams * targetFactor,
					currentFiber: current.fiber,
					fiber: Math.max(0, target.fiberGrams * targetFactor - current.fiber),
				};
			});
		const prior = Array.isArray(req.body?.prior)
			? req.body.prior
					.filter(
						(list: unknown) =>
							Array.isArray(list) && list.every((id) => typeof id === "string"),
					)
					.slice(-5)
			: [];
		try {
			const memberLabels = dataFromDb(db).members.map((member, index) => ({
				member: `Member ${index === 0 ? "A" : "B"}`,
				memberId: member.id,
			}));
			const dailySnackLimits = [...memberTargets]
				.filter(
					([member]) => meal.slot === "dinner" || member === meal.memberId,
				)
				.map(([member, item]) => ({
					member: member === "richard" ? "Member A" : "Member B",
					calories: item.target.weekdayCalories * 0.25,
				}));
			const settledSnackMembers = [
				...existingDay.filter((item) => item.slot === "snack"),
				...companions,
			].map((item) => (item.memberId === "richard" ? "Member A" : "Member B"));
			const savedMenuRows = rows<SavedMenu>(db, "saved_menus").filter(
				(menu) => menu.slot === meal.slot,
			);
			for (const menu of savedMenuRows)
				for (const row of menu.ingredients)
					if (
						row.ingredient &&
						!available.some(
							(item) =>
								item.id === row.ingredientId &&
								JSON.stringify(item) === JSON.stringify(row.ingredient),
						)
					)
						available.push(row.ingredient);
			const suggestibleCatalog = available.filter(
				(item) =>
					item.suggestible ||
					meal.ingredients.some((row) => row.ingredientId === item.id),
			);
			const savedMenus = savedMenuRows
				.map((menu, index) => ({
					key: `saved-menu-${index + 1}`,
					name: menu.name,
					ingredients: menu.ingredients.flatMap((row) => {
						const item =
							row.ingredient ??
							available.find((entry) => entry.id === row.ingredientId);
						const catalogIndex = suggestibleCatalog.findIndex(
							(entry) => JSON.stringify(entry) === JSON.stringify(item),
						);
						return catalogIndex < 0 || !item
							? []
							: [
									{
									catalogKey: `ingredient-${catalogIndex + 1}`,
									name: item.name,
									quantity: row.quantity,
									},
								];
					}),
				}))
				.filter((menu) => menu.ingredients.length > 0);
			const proposals = await recommend({
				meal,
				adjustExisting:
					meal.ingredients.length > 0 ||
					(meal.slot !== "snack" && req.body?.adjustExisting === true),
				catalog: available,
				currentDay: [
					...existingDay.filter((item) => item.slot === "snack"),
					...companions,
				].flatMap((item) => item.ingredients),
				savedMenus,
				targets,
				dailySnackLimits,
				settledSnackMembers,
				memberLabels,
				snackLimitCalories:
					meal.slot === "snack" && meal.memberId
						? (memberTargets.get(meal.memberId)?.target.weekdayCalories ?? 0) *
							0.25
						: undefined,
				prior,
			});
			const recommendations = proposals.map((proposal) => {
				const ingredients = proposal.ingredients;
				const proposalCatalog = [
					...available,
					...proposal.newIngredients.filter(
						(item) =>
							!available.some((existingItem) => existingItem.id === item.id),
					),
				];
				const nutrition = ingredients.reduce(
					(total, row) => {
						const ingredient =
							row.ingredient ??
							proposalCatalog.find((item) => item.id === row.ingredientId)!;
						for (const key of [
							"calories",
							"protein",
							"carbs",
							"fat",
							"fiber",
						] as const)
							total[key] +=
								(ingredient.nutrition[key] * row.quantity) /
								ingredient.basisAmount;
						return total;
					},
					{ calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
				);
				return {
					...proposal,
					nutrition,
					ingredientDetails: ingredients.map((row) => ({
						...row,
						name:
							row.ingredient?.name ??
							proposalCatalog.find((item) => item.id === row.ingredientId)?.name,
					})),
					priorKey: proposal.ingredients
						.map(
							(row) =>
								(row.ingredient?.name ??
									proposalCatalog.find((item) => item.id === row.ingredientId)?.name
								)?.toLocaleLowerCase() ?? "",
						)
						.sort(),
				};
			});
			return res.json({ recommendations });
		} catch (error) {
			return fail(
				res,
				error,
				error instanceof Error &&
					error.message.toLocaleLowerCase().includes("limit")
					? 429
					: 503,
			);
		}
	});
	app.get("/api/ai/ingredient-portions/:fdcId", async (req, res) => {
		const ip = req.ip || req.socket.remoteAddress || "unknown";
		const fdcId = Number(req.params.fdcId);
		if (!/^\d+$/.test(req.params.fdcId) || !Number.isSafeInteger(fdcId) || fdcId <= 0)
			return fail(res, "invalid USDA food id");
		if (!process.env.USDA_API_KEY)
			return fail(
				res,
				"USDA nutrition lookup is unavailable: USDA_API_KEY is not configured.",
				503,
			);
		if (!rateLimit(`usda:${ip}`, 30, 60_000))
			return fail(res, "USDA lookup limit reached. Try again in a minute.", 429);
		try {
			return res.json({ portions: await usdaIngredientPortions(fdcId) });
		} catch (error) {
			return fail(res, error, 503);
		}
	});
	app.post("/api/ai/ingredient-lookup", async (req, res) => {
		const ip = req.ip || req.socket.remoteAddress || "unknown";
		const name = req.body?.name;
		if (typeof name !== "string" || !name.trim() || name.length > 120)
			return fail(res, "ingredient name is required");
		const preparation = req.body?.preparation ?? "";
		if (typeof preparation !== "string" || preparation.length > 120)
			return fail(res, "invalid ingredient preparation");
		const checkExisting = req.body?.checkExisting === true;
		const all = rows<Ingredient>(db, "ingredients");
		const findCatalogMatch = (terms: string[], includeAliases = true) => {
			const normalized = new Set(
				terms.map((term) => term.trim().toLocaleLowerCase()).filter(Boolean),
			);
			return all.find((item) =>
				[item.name, ...(includeAliases ? item.aliases : [])].some((term) =>
					normalized.has(term.trim().toLocaleLowerCase()),
				),
			);
		};
		const directMatch = findCatalogMatch([name]);
		if (directMatch && !checkExisting)
			return res.json({
				query: name.trim(),
				aliases: [],
				existing: directMatch.id,
				matches: [],
			});
		if (!process.env.USDA_API_KEY)
			return fail(
				res,
				"USDA nutrition lookup is unavailable: USDA_API_KEY is not configured.",
				503,
			);
		if (!rateLimit(`usda:${ip}`, 30, 60_000))
			return fail(
				res,
				"USDA lookup limit reached. Try again in a minute.",
				429,
			);
		if (
			process.env.OPENROUTER_API_KEY &&
			process.env.OPENROUTER_ALIAS_MODEL &&
			(!rateLimit(`openrouter:${ip}`, 10, 600_000) ||
				!reserveOpenRouterRequest())
		)
			return fail(res, "AI request limit reached. Try again later.", 429);
		const aliasResult = await ingredientAliases(
			name.trim(),
			preparation.trim(),
		);
		const query =
			aliasResult && "usdaQuery" in aliasResult
				? aliasResult.usdaQuery
				: name.trim();
		const aliases =
			aliasResult && "aliases" in aliasResult ? aliasResult.aliases : [];
		const translatedMatch = findCatalogMatch(aliases, false);
		if (translatedMatch && !checkExisting)
			return res.json({
				query,
				aliases,
				existing: translatedMatch.id,
				matches: [],
			});
		try {
			const matches = await searchUsda(query, {
				primaryName: name.trim(),
				preparation: preparation.trim(),
			});
			if (!matches.length)
				return res.json({
					query,
					aliases:
						aliasResult && "aliases" in aliasResult ? aliasResult.aliases : [],
					existing: directMatch?.id ?? translatedMatch?.id,
					matches: [],
				});
			const exact = all.find(
				(item) =>
					item.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase() ||
					item.aliases.some(
						(alias) =>
							alias.toLocaleLowerCase() === name.trim().toLocaleLowerCase(),
					) ||
					matches.some((match) => item.source.includes(`FDC ${match.fdcId}`)),
			);
			return res.json({
				query,
				aliases,
				existing: directMatch?.id ?? translatedMatch?.id ?? exact?.id,
				similar: !exact
					? all
							.filter((item) =>
								item.name
									.toLocaleLowerCase()
									.includes(name.trim().toLocaleLowerCase()),
							)
							.map((item) => item.name)
							.slice(0, 3)
					: [],
				matches,
			});
		} catch (error) {
			return fail(
				res,
				error,
				error instanceof Error &&
					error.message.toLocaleLowerCase().includes("limit")
					? 429
					: 503,
			);
		}
	});
	app.post("/api/meals/save", async (req, res) => {
		const { meal, menu, menuExists = false, exists: update } = req.body ?? {};
		const companions = req.body?.companions ?? [];
		const pendingIngredients: Ingredient[] = [];
		const currentIngredients = rows<Ingredient>(db, "ingredients");
		if (req.body?.pendingIngredients !== undefined) {
			if (
				!Array.isArray(req.body.pendingIngredients) ||
				req.body.pendingIngredients.length > 50
			)
				return fail(res, "invalid pending ingredients");
			try {
				for (const item of req.body.pendingIngredients) {
					const fdc =
						typeof item?.id === "string" ? /^fdc-(\d+)$/.exec(item.id) : null;
					if (!fdc || !validIngredient(item))
						return fail(res, "invalid pending USDA ingredient");
					if (
						currentIngredients.some(
							(existingItem) => existingItem.id === item.id,
						)
					)
						continue;
					const verified = await usdaIngredient(Number(fdc[1]));
					if (
						JSON.stringify(verified.nutrition) !==
							JSON.stringify(item.nutrition) ||
						verified.source !== item.source
					)
						return fail(
							res,
							"USDA ingredient values changed; look up the ingredient again.",
							409,
						);
					pendingIngredients.push(verified);
				}
			} catch (error) {
				return fail(res, error, 503);
			}
		}
		const ids = new Set(
			[...currentIngredients, ...pendingIngredients].map((item) => item.id),
		);
		if (typeof update !== "boolean" || !validMeal(meal, ids))
			return fail(res, "invalid scheduled meal");
		if (
			!Array.isArray(companions) ||
			companions.length > 2 ||
			companions.some(
				(item: any) =>
					!validMeal(item, ids) ||
					item.date !== meal.date ||
					item.slot !== "snack" ||
					!item.memberId,
			) ||
			(meal.slot === "snack" && companions.length)
		)
			return fail(res, "invalid companion snack draft");
		const existingDay = rows<ScheduledMeal>(db, "scheduled_meals").filter(
			(item) => item.date === meal.date && item.id !== meal.id,
		);
		const snackMembers = new Set(
			existingDay
				.filter((item) => item.slot === "snack")
				.map((item) => item.memberId),
		);
		for (const snack of companions) {
			if (snackMembers.has(snack.memberId))
				return fail(
					res,
					"a companion snack cannot replace an existing snack",
					409,
				);
			snackMembers.add(snack.memberId);
			const target = rows<WeeklyTarget>(db, "targets")
				.filter(
					(item) =>
						item.memberId === snack.memberId && item.weekStart <= snack.date,
				)
				.sort((a, b) => b.weekStart.localeCompare(a.weekStart))[0];
			const calories = snack.ingredients.reduce((total, row) => {
				const ingredient = row.ingredient ??
					[...currentIngredients, ...pendingIngredients].find(
						(item) => item.id === row.ingredientId,
					)!;
				return (
					total +
					(ingredient.nutrition.calories * row.quantity) /
						ingredient.basisAmount
				);
			}, 0);
			if (!target || calories > target.weekdayCalories * 0.25)
				return fail(
					res,
					"companion snack exceeds 25% of the daily calorie target",
					400,
				);
		}
		if (update && !existing("scheduled_meals", meal.id))
			return fail(res, "meal not found", 404);
		if (!update && existing("scheduled_meals", meal.id))
			return fail(res, "meal id already exists", 409);
		if (menu !== undefined && !validMenu(menu, ids))
			return fail(res, "invalid saved menu");
		if (menu !== undefined && typeof menuExists !== "boolean")
			return fail(res, "invalid saved menu update flag");
		if (menu && menuExists && !existing("saved_menus", menu.id))
			return fail(res, "saved menu not found", 404);
		if (menu && !menuExists && existing("saved_menus", menu.id))
			return fail(res, "saved menu id already exists", 409);
		try {
			const availableIngredients = [...currentIngredients, ...pendingIngredients];
			const storedMeal = snapshotMeal(meal, availableIngredients);
			const storedCompanions = companions.map((item: ScheduledMeal) =>
				snapshotMeal(item, availableIngredients),
			);
			const storedMenu = menu ? snapshotMenu(menu, availableIngredients) : undefined;
			db.transaction(() => {
				pendingIngredients.forEach((item) =>
					put(db, "ingredients", item.id, item),
				);
				putMeal(db, storedMeal);
				storedCompanions.forEach((item) => putMeal(db, item));
				if (storedMenu) put(db, "saved_menus", storedMenu.id, storedMenu);
			})();
			return res.json(storedMeal);
		} catch (error) {
			return fail(res, error, 409);
		}
	});
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
			const stored = snapshotMeal(value, rows<Ingredient>(db, "ingredients"));
			putMeal(db, stored);
			return res.status(201).json(stored);
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
			const stored = snapshotMeal(value, rows<Ingredient>(db, "ingredients"));
			putMeal(db, stored);
			return res.json(stored);
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
		const stored = snapshotMenu(value, rows<Ingredient>(db, "ingredients"));
		put(db, "saved_menus", stored.id, stored);
		return res.status(201).json(stored);
	});
	app.post("/api/menus/recommendations", async (req, res) => {
		const menus: SavedMenu[] = req.body?.menus;
		const requestedIngredients: Ingredient[] = req.body?.pendingIngredients ?? [];
		if (
			!Array.isArray(menus) ||
			menus.length < 1 ||
			menus.length > 5 ||
			!Array.isArray(requestedIngredients) ||
			requestedIngredients.length > 50
		)
			return fail(res, "invalid recommended menus");
		const currentIngredients = rows<Ingredient>(db, "ingredients");
		const pendingIngredients: Ingredient[] = [];
		try {
			for (const item of requestedIngredients) {
				const fdc = typeof item?.id === "string" ? /^fdc-(\d+)$/.exec(item.id) : null;
				if (!fdc || !validIngredient(item))
					return fail(res, "invalid pending USDA ingredient");
				if (currentIngredients.some((existingItem) => existingItem.id === item.id))
					continue;
				if (pendingIngredients.some((existingItem) => existingItem.id === item.id))
					continue;
				const verified = await usdaIngredient(Number(fdc[1]));
				if (
					JSON.stringify(verified.nutrition) !== JSON.stringify(item.nutrition) ||
					verified.source !== item.source
				)
					return fail(res, "USDA ingredient values changed; look up the ingredient again.", 409);
				pendingIngredients.push(verified);
			}
		} catch (error) {
			return fail(res, error, 503);
		}
		const ids = new Set([...currentIngredients, ...pendingIngredients].map((item) => item.id));
		const menuIds = new Set<string>();
		for (const menu of menus) {
			if (!validMenu(menu, ids) || menuIds.has(menu.id))
				return fail(res, "invalid recommended menus");
			menuIds.add(menu.id);
		}
		try {
			const storedMenus = menus.map((menu) =>
				snapshotMenu(menu, [...currentIngredients, ...pendingIngredients]),
			);
			db.transaction(() => {
				if (menus.some((menu) => existing("saved_menus", menu.id)))
					throw new Error("menu id already exists");
				pendingIngredients.forEach((item) => put(db, "ingredients", item.id, item));
				storedMenus.forEach((menu) => put(db, "saved_menus", menu.id, menu));
			})();
			return res.json(storedMenus);
		} catch (error) {
			return fail(res, error, 409);
		}
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
		const stored = snapshotMenu(value, rows<Ingredient>(db, "ingredients"));
		put(db, "saved_menus", stored.id, stored);
		return res.json(stored);
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
	app.post("/api/targets/weight-check-in", (req, res) => {
		const { memberId, date, weightKg } = req.body ?? {};
		if (
			!members.has(memberId) ||
			!validDate(date) ||
			!finite(weightKg) ||
			weightKg < 30 ||
			weightKg > 300
		)
			return fail(
				res,
				"enter a valid check-in date and weight from 30 to 300 kg",
			);
		const member = rows<MemberProfile>(db, "members").find(
			(item) => item.id === memberId,
		);
		if (!member) return fail(res, "member not found", 404);
		const history = member.weightHistory ?? [];
		if (!history.some((point) => point.date === date) && history.length >= 500)
			return fail(res, "weight history is full");
		member.currentWeightKg = weightKg;
		member.weightHistory = [
			...history.filter((point) => point.date !== date),
			{ date, weightKg },
		].sort((a, b) => a.date.localeCompare(b.date));
		put(db, "members", member.id, member);
		return res.status(204).end();
	});
	app.post("/api/targets/apply", (req, res) => {
		try {
			const preview = targetForRequest(db, req.body as TargetPreviewRequest);
			// shortcut: targets are weekly, so "today" updates the current week; add dated target periods if daily history matters.
			const target =
				req.query.start === "today"
					? { ...preview.proposed, weekStart: preview.current.weekStart }
					: preview.proposed;
			target.weightKg = req.body.weightKg;
			const member = JSON.parse(
				(
					db
						.query("SELECT data FROM members WHERE id = ?")
						.get(preview.proposed.memberId) as any
				).data,
			) as MemberProfile;
			member.currentWeightKg = req.body.weightKg;
			member.heightCm = req.body.heightCm;
			member.sex = req.body.sex;
			member.activityLevel = req.body.activityLevel;
			member.activityFactor = req.body.activityFactor;
			db.transaction(() => {
				put(db, "members", member.id, member);
				put(
					db,
					"targets",
					`${target.memberId}|${target.weekStart}`,
					target,
					target.memberId,
					target.weekStart,
				);
			})();
			return res.json(target);
		} catch (e) {
			return fail(res, e);
		}
	});
	app.get("/api/backup.json", (_req, res) =>
		res
			.type("application/json")
			.attachment("piring-kita-backup.json")
			.send(JSON.stringify(dataFromDb(db, true), null, 2)),
	);
	app.post("/api/restore", (req, res) => {
		const raw = req.body;
		const value = raw && typeof raw === "object" ? {
			...raw,
			calendars: raw.calendars ?? [{ id: "personal", name: "Personal", color: "#4f7cff", visible: true, kind: "personal" }],
			agendaItems: raw.agendaItems ?? [],
			savedMenus: Array.isArray(raw.savedMenus) ? raw.savedMenus.map((menu: any) => ({ ...menu, slot: menu.slot ?? "lunch" })) : raw.savedMenus,
		} : raw;
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
				.send(Buffer.from(db.serialize()));
		} catch (e) {
			return fail(res, e);
		}
	});
	app.post(
		"/api/database.sqlite",
		express.raw({ type: ["application/vnd.sqlite3", "application/octet-stream"], limit: "50mb" }),
		(req, res) => {
			try {
				if (!Buffer.isBuffer(req.body) || req.body.length === 0)
					return fail(res, "SQLite backup file is required");
				const data = validateSQLiteBackup(req.body);
				replaceData(db, data, false);
				return res.json({ ok: true });
			} catch (e) {
				return fail(res, e);
			}
		},
	);

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
