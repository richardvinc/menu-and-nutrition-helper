# Piring Kita meal planner prototype

Dependency-free prototype with Dashboard, Plan the week, Menus, and Ingredients pages. All data is dummy in-memory data and resets on reload.

Run from PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .scratch\meal-planning-app\prototypes\dashboard-prototype\run.ps1
```

The dashboard shows today's and tomorrow's menus with ingredient quantities and calories, protein, carbs, fat, and fiber. The weekly view fits all seven days without a horizontal scrollbar and includes Richard lunch, Michelle lunch, shared dinner, and planned snacks. It refreshes the displayed time every 60 seconds. Use “Simulate Sunday” to preview the next-week dashboard behavior.

Plan the week supports this and next week, separate lunch/dinner/snack slots, and whole-day drag-and-drop swapping with touch auto-scroll. Each weekday shows both members’ planned macros against daily targets; weekend intake is shown without target evaluation. Shared dinners split shared ingredients equally and provide a separate Carbohydrate section for Richard and Michelle portions. Individual menus remain editable, movable by date, and deletable, but are not draggable. Scheduled and master-menu editors show inline ingredient suggestions for partial matches in canonical names and aliases. Nutrition is entered per 100 g for gram ingredients and per one custom unit for other units; optional equivalent grams appear in quantities and never convert the nutrition values.
