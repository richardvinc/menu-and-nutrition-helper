# Define nutrition calculation guardrails

Status: resolved
Type: research
Resolved: 2026-10-07

## Question

Which primary-source-backed activity multipliers, calorie-deficit recommendations, intake warnings, macronutrient ranges, fiber targets, and citation metadata should the app implement and explain in its rule-based Target review?

## Answer

Use the Mifflin-St Jeor equation as an explicitly labeled resting-calorie estimate for adults, then show the selected activity factor and every subsequent calculation. Preserve the workbook's `1.20` multiplier as a custom imported setting. Start new profiles at an editable 20% deficit, warn at deficits above 30% or 750 kcal/day and weekday targets below 1,200 kcal/day, and require acknowledgment rather than blocking changes.

Use an editable 25% protein / 45% carbohydrate / 30% fat starting profile, show the AMDR ranges, calculate grams with the 4/4/9 factors, and flag percentages outside those ranges. Recommend fiber by age and sex using the adult Adequate Intake values, while keeping it editable. A Target review must show old and new inputs, formulas, weekly and weekday effects, warnings, sources, and separate Apply or Keep choices for calories, macros, and fiber.

Full rules, boundary copy, source metadata, and primary citations: [nutrition calculation guardrails](../research/nutrition-calculation-guardrails.md).
