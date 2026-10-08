import type { Ingredient, Nutrition, WeeklyTarget } from "@piring-kita/shared";

export function makeMacroRecommendation(member: string, planned: Nutrition, target: WeeklyTarget, ingredients: Ingredient[]) {
  const goals = { protein: target.macroGrams.protein, carbs: target.macroGrams.carbs, fat: target.macroGrams.fat, fiber: target.fiberGrams };
  const nutrient = (Object.keys(goals) as (keyof typeof goals)[])
    .filter(key => goals[key] > 0 && planned[key] < goals[key])
    .sort((a, b) => (goals[b] - planned[b]) / goals[b] - (goals[a] - planned[a]) / goals[a])[0];
  const remainingCalories = target.weekdayCalories - planned.calories;
  if (!nutrient || remainingCalories <= 0) return undefined;
  const ingredient = ingredients.filter(item => item.suggestible && item.nutrition[nutrient] > 0 && item.nutrition.calories > 0)
    .sort((a, b) => b.nutrition[nutrient] / b.nutrition.calories - a.nutrition[nutrient] / a.nutrition.calories)[0];
  if (!ingredient) return undefined;
  const needed = (goals[nutrient] - planned[nutrient]) * ingredient.basisAmount / ingredient.nutrition[nutrient];
  const affordable = remainingCalories * ingredient.basisAmount / ingredient.nutrition.calories;
  const cap = ingredient.unit === "g" ? 200 : 2;
  const step = ingredient.unit === "g" ? 10 : 1;
  const quantity = Math.floor(Math.min(needed, affordable, cap) / step) * step;
  if (quantity < step) return undefined;
  return `Add ${quantity} ${ingredient.unit} ${ingredient.name.toLocaleLowerCase()} to get closer to ${member}’s ${nutrient === "carbs" ? "carbohydrate" : nutrient} target.`;
}
