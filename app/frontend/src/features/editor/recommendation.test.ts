import { describe, expect, test } from "bun:test";
import type { Ingredient, WeeklyTarget } from "@piring-kita/shared";
import { makeMacroRecommendation } from "./recommendation";

const target: WeeklyTarget = { memberId: "richard", weekStart: "2026-10-05", deficitPercent: 20, weekendReserve: 0, proteinPercent: 25, carbsPercent: 45, fatPercent: 30, fiberGrams: 30, weeklyCalories: 14000, weekdayCalories: 2000, macroGrams: { protein: 125, carbs: 225, fat: 67 } };
const chicken: Ingredient = { id: "chicken", name: "Chicken breast", aliases: [], unit: "g", basisAmount: 100, preparation: "", source: "test", suggestible: true, nutrition: { calories: 165, protein: 31, carbs: 0, fat: 3.6, fiber: 0 } };

describe("macro recommendation", () => {
  test("proposes an exact suggestible quantity within remaining calories", () => {
    expect(makeMacroRecommendation("Richard", { calories: 1500, protein: 80, carbs: 220, fat: 65, fiber: 29 }, target, [chicken])).toBe("Add 140 g chicken breast to get closer to Richard’s protein target.");
  });

  test("stays quiet when no calories remain", () => {
    expect(makeMacroRecommendation("Richard", { calories: 2000, protein: 80, carbs: 220, fat: 65, fiber: 29 }, target, [chicken])).toBeUndefined();
  });
});
