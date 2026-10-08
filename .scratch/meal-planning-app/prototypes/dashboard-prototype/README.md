# Piring Kita meal planner prototype

Dependency-free prototype with Dashboard, Plan the week, Menus, Ingredients, and Targets pages. All data is dummy in-memory data and resets on reload.

Run from PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .scratch\meal-planning-app\prototypes\dashboard-prototype\run.ps1
```

The dashboard shows today's and tomorrow's menus with ingredient quantities and calories, protein, carbs, fat, and fiber. The weekly view fits all seven days without a horizontal scrollbar and includes Richard lunch, Michelle lunch, shared dinner, and planned snacks. It refreshes the displayed time every 60 seconds. Use “Simulate Sunday” to preview the next-week dashboard behavior.

Plan the week supports this and next week, separate lunch/dinner/snack slots, and whole-day drag-and-drop swapping with touch auto-scroll. Each weekday shows both members’ planned macros against calculated daily targets; weekend intake is shown without target evaluation. Shared dinners split shared ingredients equally and provide a separate Carbohydrate section for Richard and Michelle portions. Scheduled meal add/edit supports day-only cooking notes and an opt-in master-menu overwrite; shared-dinner carbohydrate defaults copy with the saved menu, and scheduled copies remain independent snapshots. The Targets page contains editable member profiles, read-only current weights with check-in history, Mifflin-St Jeor/activity/deficit calculations, weekly budget and weekend allocation, macro percentage and gram targets, fiber reference, safety guidance, citations, and a next-week review with editable deficit, macro, and fiber proposals plus separate Apply/Keep choices. Only approved review choices override targets for next week; the current week stays on its existing settings. Master menus can be deleted with confirmation. Ingredient editing includes preparation state and nutrition source/provenance. Ingredient search matches names and aliases inline. Nutrition is entered per 100 g for gram ingredients and per one custom unit for other units; optional equivalent grams appear in quantities and never convert the nutrition values.

Everything is dummy in-memory data. Review controls illustrate product behavior only: no backend, health advice, source verification, or persistence is provided.
