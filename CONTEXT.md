# Household Meal Planning

This context describes how two household members plan meals and distribute nutrition targets across a week.

## Language

**Member**:
One of the two people whose calorie and nutrient targets are planned.
_Avoid_: User, account

**Member profile**:
A member's birthday, sex, height, and activity level used to calculate weekly targets. Age is derived for the Monday starting each target week.
_Avoid_: Account, login profile

**Weekly calorie budget**:
A member's total calorie target for seven days after applying their chosen deficit target.
_Avoid_: Weekly allowance, calorie limit

**Weekend reserve**:
Calories moved from Monday through Friday into Saturday and Sunday without changing the weekly calorie budget.
_Avoid_: Cheat calories, bonus calories

**Self-managed weekend**:
Saturday and Sunday meals may be planned, but the app assumes the weekend share of the weekly calorie budget is consumed and does not evaluate weekend calories or nutrient targets.
_Avoid_: Cheat day, untracked day

**Weight check-in**:
A member's updated weight measurement used to calculate the following week's calorie budget without changing the current week.
_Avoid_: Weight override

**Activity level**:
A member-controlled setting applied to estimated resting calories to calculate estimated maintenance calories.
_Avoid_: Exercise score

**Calorie budget breakdown**:
The visible calculation from member measurements and activity level through maintenance calories, deficit target, weekly calorie budget, and weekend reserve.
_Avoid_: Hidden formula, calorie score

**Weekly target settings**:
A member's deficit percentage and weekend reserve for one week, copied forward unless changed.
_Avoid_: Household target, shared target

**Macro profile**:
A member's protein, carbohydrate, and fat targets expressed as percentages of their weekday calorie target and displayed as calculated grams. The percentages must total 100%; fiber is a separate gram target.
_Avoid_: Macro score, nutrient ratio

**Fiber target**:
A member's editable daily fiber goal in grams, with an age-and-sex reference recommendation and independent tracking from the calorie-based macro percentages.
_Avoid_: Fiber percentage

**Target review**:
An optional, explainable comparison shown after a weight check-in, covering the recalculated calorie budget, deficit factor, macro profile, and fiber target. Recommendations never apply automatically.
_Avoid_: Automatic adjustment, diet prescription

**Shared dinner**:
One dinner planned for both members using the whole dish's ingredient quantities, with half of every calorie and nutrient total assigned to each member.
_Avoid_: Household meal, duplicated dinner

**Member lunch**:
A lunch planned independently for one member with that member's own ingredient quantities.
_Avoid_: Personal meal

**Saved menu**:
A reusable set of ingredients and default quantities that may be overwritten when a member explicitly chooses Update collection.
_Avoid_: Recipe

**Scheduled meal**:
An independent copy of a saved menu assigned to a date and meal slot. Later changes to the saved menu do not alter it.
_Avoid_: Menu reference, linked meal

**Nutrition basis**:
The amount and unit for which an ingredient's calorie and nutrient values are defined, such as 100 grams, one egg, one tablespoon, or one package.
_Avoid_: Universal serving, quantity multiplier

**Ingredient catalog**:
The canonical collection of ingredients used for menu planning. Workbook entries indicate commonly used ingredients, while reputable nutrition sources supply the preferred nutrient values for merged duplicates.
_Avoid_: Nutrition table, food database

**Ingredient alias**:
An alternative Indonesian, English, brand, or familiar kitchen name that finds the same canonical ingredient in search.
_Avoid_: Duplicate ingredient

**Primary ingredient name**:
The familiar Indonesian or local-market name shown first. An English or brand name is primary when no natural Indonesian name fits.
_Avoid_: Database name

**Suggestible ingredient**:
An ingredient explicitly allowed in rule-based nutrient suggestions because it is sensible to add or eat in the proposed quantity.
_Avoid_: Recommended ingredient, healthy ingredient

**Macro recommendation**:
A one- or two-ingredient quantity proposal that reduces a member's largest weekday nutrient shortage while respecting their remaining calories.
_Avoid_: AI recommendation, meal prescription

**Snack**:
An optional meal belonging to one member whose calories and nutrients count toward that member's weekday totals. Days contain no snack until it is explicitly added.
_Avoid_: Breakfast, default meal

**Dashboard week**:
The Monday-through-Sunday menu shown on the dashboard. It is the current calendar week from Monday through Saturday and the upcoming calendar week on Sunday.
_Avoid_: Rolling seven days

**Meal schedule**:
The open-ended calendar of scheduled meals. A meal can be assigned directly to any date without first creating a week.
_Avoid_: Weekly sheet, week record

**Schedule move**:
A move of a scheduled meal to the same member and meal slot on another date. An occupied destination swaps the two meals; an empty destination receives the moved meal.
_Avoid_: Reschedule copy

**Menu name**:
A concise, recognizable name for a saved menu. Imported spreadsheet labels are cleaned or replaced when they do not clearly identify the meal.
_Avoid_: Recipe title
