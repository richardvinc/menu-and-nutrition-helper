# Meal Planning UI Usability Redesign

Status: ready-for-agent

## Problem Statement

The prototype contains the required meal-planning, nutrition, and target-setting capabilities, but its information hierarchy makes routine tasks harder than necessary. The dashboard shows detailed meals but does not turn today's and tomorrow's ingredients into a clear preparation view. The weekly planner displays every day, meal slot, action, and nutrient measure at once, producing a long and crowded experience on phones. The scheduled-meal editor recalculates nutrition correctly, but it does not clearly explain how the edited meal changes the member's complete planned day. The Targets page exposes profile fields, safety guidance, formulas, sources, check-in history, and independent review decisions before the member can complete the common task of preparing next week's targets.

The result is a prototype that is functionally capable but requires members to scan, interpret, and dismiss too much information. Warnings and supporting explanations compete with the primary actions. On mobile, repeated cards and nested scrolling make the weekly plan and scheduled-meal editor particularly difficult to use. The application also risks implying that planned nutrition is consumed nutrition, even though it only evaluates scheduled meals.

## Solution

Redesign the prototype around four routine tasks: preparing today's and tomorrow's meals, planning one day within the dashboard week, composing a scheduled meal while seeing its nutritional effect, and staging next week's targets before applying them.

The dashboard will prioritize Today and Tomorrow, provide an aggregated preparation list, and show compact planned-versus-target summaries for each member. The full dashboard week will move behind a clear navigation action instead of duplicating the weekly planner.

The weekly planner will retain the Weekly planning board on larger screens and use the Pocket agenda on phones. The Pocket agenda will show a compact seven-day selector and one selected day's meal slots and planned-target summaries. Move and swap actions will be explicit on touch devices; drag-and-drop may remain as a desktop enhancement.

The scheduled-meal editor will use clear ingredient rows, live meal totals, and an "After this meal" summary that includes the other scheduled meals for the affected member and date. When useful, it will show one explainable macro recommendation. Shared dinners will continue to show their effect on both members.

The Targets page will become a staged next-week workflow. Weight check-in, activity level, and deficit target will be the primary controls. The member will see a concise comparison between the current targets and the proposed next-week targets before applying all approved changes with one action. Macro profile, fiber target, weekend reserve, member profile details, formulas, safety guidance, sources, and history will remain available through progressive disclosure.

## User Stories

1. As a household planner, I want the dashboard to show today's scheduled meals first, so that I immediately know what must be prepared.
2. As a household planner, I want the dashboard to show tomorrow's scheduled meals, so that I can prepare ingredients in advance.
3. As a household planner, I want each dashboard meal to identify its member and meal slot, so that I know who the food is for.
4. As a household planner, I want shared dinners to be visually distinct from member lunches, so that I understand which ingredients are shared.
5. As a household planner, I want to expand a meal to see its ingredient quantities, so that the default dashboard remains concise.
6. As a household planner, I want an aggregated preparation list for a day, so that I do not have to manually combine ingredients from several meals.
7. As a household planner, I want compatible quantities of the same catalog ingredient combined in the preparation list, so that the list reflects the total amount to prepare.
8. As a household planner, I want incompatible nutrition bases or units kept separate, so that aggregation never produces a misleading quantity.
9. As a household planner, I want to mark preparation items complete without changing the scheduled meal, so that preparation tracking does not alter nutrition calculations.
10. As a household planner, I want a direct action from the dashboard to the weekly planner, so that I can change a meal without searching through navigation.
11. As a member, I want my dashboard summary labelled as planned nutrition, so that I do not confuse scheduled meals with actual intake.
12. As a member, I want to see planned calories and protein against my weekday targets, so that I can quickly judge whether the plan is broadly suitable.
13. As a member, I want detailed carbohydrate, fat, and fiber progress available on demand, so that the default summary is not crowded.
14. As a household planner, I want the dashboard to use the current dashboard week from Monday through Saturday and the upcoming dashboard week on Sunday, so that the displayed plan follows the established scheduling rule.
15. As a household planner, I want the phone dashboard to switch between Today and Tomorrow without a long page, so that both days remain easy to reach with one hand.
16. As a household planner, I want the phone navigation to prioritize Today, Week, Library, and Targets, so that the most common destinations fit without wrapping.
17. As a household planner, I want saved menus and the ingredient catalog grouped under Library on phones, so that secondary catalog management does not crowd primary navigation.
18. As a household planner, I want to select any day in the dashboard week from a compact day strip, so that I can move through the week without scrolling past other days.
19. As a household planner, I want the selected day to show Richard lunch, Michelle lunch, shared dinner, and optional snacks, so that all supported meal slots are available in one place.
20. As a household planner, I want empty meal slots to appear as compact add actions, so that unplanned slots do not consume unnecessary space.
21. As a household planner, I want each scheduled meal to have a single actions menu, so that Edit, Move, and Delete do not visually compete with meal content.
22. As a household planner, I want to move a scheduled meal to another compatible date, so that I can reorganize the meal schedule.
23. As a household planner, I want moving onto an occupied matching member-and-slot destination to swap the scheduled meals, so that schedule changes remain predictable.
24. As a household planner, I want moving onto an empty matching member-and-slot destination to move the scheduled meal, so that the source becomes empty.
25. As a household planner using a pointer, I want optional drag-and-drop for whole-day or compatible meal movement, so that frequent desktop planning remains efficient.
26. As a household planner using touch or assistive technology, I want an explicit Move or Swap action, so that drag-and-drop is never required.
27. As a household planner, I want each selected day to show compact planned-target summaries for both members, so that I can evaluate the day without opening another page.
28. As a household planner, I want weekend days to identify self-managed weekend status without evaluating targets, so that weekend numbers are not presented as failures.
29. As a household planner, I want to create a member lunch from a saved menu or from an empty ingredient list, so that both reuse and one-off planning are supported.
30. As a household planner, I want to create a shared dinner from a saved menu or from an empty ingredient list, so that shared meals are as easy to plan as member lunches.
31. As a household planner, I want each ingredient row to show the canonical ingredient, quantity, and unit, so that I can verify exactly what will be prepared.
32. As a household planner, I want ingredient search to match primary names and ingredient aliases, so that familiar Indonesian, English, and brand terms find the same catalog ingredient.
33. As a household planner, I want to adjust an ingredient quantity directly, so that I can tune the meal without recreating it.
34. As a household planner, I want to add and remove ingredient rows, so that the scheduled meal reflects the intended food.
35. As a household planner, I want live calorie, protein, carbohydrate, fat, and fiber totals while editing, so that the effect of each quantity change is immediate.
36. As a member, I want an "After this meal" comparison against my weekday targets, so that I understand the edited meal in the context of the complete planned day.
37. As a member, I want shared-dinner editing to show the resulting nutrition for both members, so that shared ingredients and member carbohydrate portions can be adjusted responsibly.
38. As a member, I want a single macro recommendation only when a sensible change is available, so that the application helps without creating decision overload.
39. As a member, I want a macro recommendation to name one or two suggestible ingredients and exact quantities, so that I can act on it without interpreting a general instruction.
40. As a member, I want recommendations to respect remaining calories, so that improving one nutrient does not knowingly exceed the calorie target.
41. As a member, I want recommendations to be optional and never applied automatically, so that I retain control of the scheduled meal.
42. As a household planner on a phone, I want the scheduled-meal editor to occupy the screen with one scroll container, so that fields and actions are not clipped by nested scrolling.
43. As a household planner on a phone, I want Save and Cancel to remain reachable in a sticky footer, so that I can finish editing without scrolling to find the actions.
44. As a household planner, I want copying a saved menu presented as an optional starting action, so that it does not distract when I am adjusting an existing scheduled meal.
45. As a household planner, I want day-only cooking notes to stay with the scheduled meal, so that preparation instructions do not overwrite the saved menu.
46. As a household planner, I want scheduled meals to remain independent snapshots of saved menus, so that later library edits do not unexpectedly change the meal schedule.
47. As a member, I want to select myself on the Targets page, so that I see only the controls and proposal relevant to me.
48. As a member, I want to enter a weight check-in for next Monday, so that the current week's targets remain unchanged.
49. As a member, I want to choose my activity level using understandable labels, so that I do not need to interpret an activity factor.
50. As a member, I want the custom activity factor hidden unless I choose Custom, so that irrelevant inputs do not add noise.
51. As a member, I want to adjust my deficit target quickly, so that I can preview a different next-week calorie budget.
52. As a member, I want weight, activity level, and deficit changes staged together, so that no partial edit applies before I review it.
53. As a member, I want a current-versus-proposed comparison for weekday calories, weekly calorie budget, and macro grams, so that I understand the practical change.
54. As a member, I want the effective week clearly named, so that I know when proposed targets will begin.
55. As a member, I want one concise target recommendation, so that I do not have to make several independent Apply or Keep decisions.
56. As a member, I want one Apply action for the reviewed next-week targets, so that committing a coherent target set is simple.
57. As a member, I want closing or leaving the preview to discard uncommitted changes, so that experimentation is safe.
58. As a member, I want macro profile, fiber target, and weekend reserve available under Advanced settings, so that I can adjust them without crowding the default workflow.
59. As a member, I want the macro profile percentages validated to total 100%, so that calculated gram targets are coherent.
60. As a member, I want the calorie budget breakdown available on demand, so that the calculation remains transparent without dominating the page.
61. As a member, I want safety guidance shown when a value or situation requires attention, so that warnings remain meaningful.
62. As a member, I want general safety information and sources available through a disclosure, so that I can inspect the basis without repeatedly reading it.
63. As a member, I want warnings placed beside the field or proposal that caused them, so that I understand what requires action.
64. As a member, I want advisory warnings to avoid blocking an otherwise valid review unless a value is structurally invalid, so that I retain control within the established guardrails.
65. As a household planner, I want controls to have comfortable touch targets and readable text, so that routine planning works on a phone.
66. As a household planner using a keyboard or screen reader, I want every navigation, edit, move, disclosure, and commit action to be operable without drag gestures, so that the application remains accessible.
67. As a household planner, I want destructive actions to require confirmation, so that an accidental tap does not remove a scheduled meal or saved menu.
68. As a household planner, I want production pages to omit prototype-only controls and explanatory labels, so that the interface contains only useful application actions.
69. As a household planner, I want background dashboard refresh to stay unobtrusive unless it fails or data becomes stale, so that technical status does not compete with meal information.

## Implementation Decisions

- Preserve the existing required stack and domain calculations. This redesign is primarily an information-architecture and interaction change and does not require a new UI dependency.
- Use four primary phone destinations: Today, Week, Library, and Targets. Library contains Saved menus and Ingredient catalog views. Larger screens may expose Saved menus and Ingredient catalog separately when space permits, while preserving the same destinations and terminology.
- The dashboard defaults to Today. Tomorrow is equally prominent on larger screens and one tap away on phones.
- The dashboard displays scheduled-meal summaries by default. Ingredient details are progressively disclosed, while the aggregated preparation list is a first-class daily view.
- Preparation-list aggregation uses canonical ingredient identity. Quantities are combined only when their units and nutrition bases are compatible; otherwise they remain separate entries.
- Preparation completion is presentation state and does not mutate scheduled meals, saved menus, ingredient quantities, or nutrient totals.
- Dashboard nutrient summaries are labelled "Planned" and never claim to represent actual intake or achieved nutrition.
- The dashboard week retains the established Sunday rule: the current calendar week is shown Monday through Saturday, and the upcoming calendar week is shown on Sunday.
- The existing Daily spotlight remains the large-screen dashboard pattern. The phone implementation uses Today/Tomorrow switching and removes the duplicated full-week card list.
- The existing Weekly planning board remains the desktop scheduling pattern. The phone implementation uses the Pocket agenda with a seven-day selector and one selected day at a time.
- The seven-day selector communicates planned, incomplete, and selected states without relying on color alone.
- Empty slots use a compact add action. Populated slots show the menu name and essential summary; secondary actions are placed in a single actions menu.
- The established schedule move contract remains unchanged: destinations must match the member and meal slot; an occupied destination swaps; an empty destination moves.
- Drag-and-drop is optional enhancement behavior. Every drag operation has an equivalent explicit Move or Swap flow usable with touch, keyboard, and assistive technology.
- Scheduled-meal editing uses one full-screen surface on phones and avoids nested page-and-modal scroll containers. Save and Cancel remain visible in a sticky action area.
- Ingredient rows use the existing ingredient catalog and alias search. Each row exposes ingredient selection, quantity, the applicable unit, and remove.
- Nutrition recalculates as ingredient quantities change. The editor displays both the edited meal totals and the resulting planned day totals.
- The "After this meal" calculation replaces the scheduled meal's previous contribution when editing and adds the proposed contribution when creating, preventing double counting.
- A member lunch or snack shows one member's planned-day impact. A shared dinner shows both members' planned-day impact, preserving the rule that shared ingredient totals are split equally and member carbohydrate portions are assigned separately.
- The macro recommendation uses the established rule-based macro recommendation behavior: one or two suggestible ingredients, explicit quantities, the largest weekday nutrient shortage, and the member's remaining calories. It never applies automatically.
- Only one recommendation is displayed at a time. No recommendation is shown when no sensible proposal exists.
- Saved-menu copying remains optional. A scheduled meal remains an independent snapshot, and day-only notes never update the saved menu.
- The Targets page separates the common next-week review from Advanced settings and Methodology disclosures.
- The common next-week review stages weight check-in, activity level, and deficit target together. It calculates a proposed weekly calorie budget, weekday calorie target, and macro grams without changing the current week.
- The current and proposed target sets are displayed in a concise comparison. The comparison names the Monday on which the proposal becomes effective.
- The target review provides one rule-based recommendation and one final Apply action. The proposal is committed as a coherent next-week target set rather than through independent per-section Apply or Keep controls.
- Macro profile, fiber target, weekend reserve, and other weekly target settings remain editable under Advanced settings and participate in the same staged preview and final Apply action.
- Member profile details, calorie budget breakdown, formulas, target history, safety guidance, and sources remain available through progressive disclosure.
- The custom activity factor is rendered only when Custom activity level is selected.
- Structural validation remains immediate and local to the affected field. Advisory nutrition guidance is contextual and does not become a permanent page-level warning.
- General planning and medical-safety context is presented as a short neutral statement with a disclosure for full details. Prominent warning treatment is reserved for an actionable condition.
- Prototype-only controls, including simulated dates, are excluded from production UI. The 60-second dashboard refresh remains, but refresh status appears only when stale, failed, or manually requested.
- Mobile body text and interactive controls meet readable sizing and minimum touch-target expectations. Focus states, accessible names, keyboard operation, and non-color status cues are required.
- Destructive actions use an explicit confirmation step and are visually de-emphasized until invoked.

## Testing Decisions

- Good tests assert externally observable behavior: what a member can see, change, preview, save, move, or discard. They do not assert component names, internal state shape, CSS class names, or implementation-specific rendering structure.
- The primary seam is a browser-level responsive workflow covering Dashboard, Week, scheduled-meal editing, and Targets at representative desktop and phone viewport sizes.
- The secondary seam is the existing deterministic nutrition-calculation boundary covering ingredient totals, shared-dinner allocation, planned-day replacement calculations, target projections, and macro recommendations.
- Browser tests will verify that Today and Tomorrow expose scheduled meals and preparation quantities, that phone navigation does not require horizontal page scrolling, and that the full dashboard week is not duplicated on the phone dashboard.
- Browser tests will verify that the Pocket agenda changes the selected day without rendering seven expanded daily planners, and that all supported meal slots remain reachable.
- Browser tests will verify move to an empty compatible destination, swap with an occupied compatible destination, and rejection of an incompatible member or meal-slot destination through the explicit Move flow.
- Browser tests will verify that drag-and-drop is not required to complete any scheduling workflow.
- Browser tests will verify that creating or editing a scheduled meal supports ingredient search, quantity changes, row addition and removal, live totals, cancellation, and save.
- Browser tests will verify that changing a quantity updates both meal totals and the affected member's "After this meal" planned-day comparison without double counting the previous scheduled meal.
- Browser tests will verify that editing a shared dinner updates both members' planned-day comparisons according to shared and member-specific quantities.
- Browser tests will verify that a macro recommendation is absent when no sensible proposal exists and, when present, names no more than two suggestible ingredients with explicit quantities.
- Browser tests will verify that the scheduled-meal editor has one usable scroll surface on a phone and that Save and Cancel remain reachable.
- Browser tests will verify that a next-week target review stages weight, activity level, deficit target, and Advanced setting changes without changing current-week targets.
- Browser tests will verify the current-versus-proposed preview, effective Monday, discard behavior, and single final Apply action.
- Browser tests will verify that the custom activity factor is hidden for predefined activity levels and displayed for Custom.
- Browser tests will verify that general guidance is collapsed by default and that actionable validation appears beside the responsible field.
- Browser accessibility checks will cover keyboard navigation, focus visibility, accessible names, disclosure state, non-color status cues, and touch-target sizing.
- Calculation-boundary tests will use fixed member profiles, weekly target settings, scheduled meals, and ingredient nutrition bases to produce deterministic expected calorie and nutrient results.
- Calculation-boundary tests will cover compatible preparation-list aggregation and separation of incompatible units or nutrition bases.
- Calculation-boundary tests will cover the current-week immutability rule and creation of the following week's target set after Apply.
- Existing prior art is the runnable dashboard prototype and its responsive dashboard and scheduling decision record. These define the established Daily spotlight, Weekly planning board, Pocket agenda, Sunday dashboard-week behavior, and move-or-swap contract to preserve while simplifying presentation.

## Out of Scope

- Recording actual food consumption or claiming that planned nutrition was achieved.
- Breakfast planning.
- Changing the established calorie-budget formulas, macro-profile rules, fiber-target rules, weekend reserve behavior, or nutrition source precedence.
- AI-generated advice, free-form nutrition coaching, or runtime calls to external nutrition services.
- Automatic application of meal or target recommendations.
- Changing the saved-menu snapshot model or linking scheduled meals to later saved-menu edits.
- Authentication, multi-household support, cloud synchronization, public internet access, or simultaneous editing.
- Replacing the required React, Vite, TypeScript, Express, Bun, SQLite, Docker Compose, or Raspberry Pi stack.
- A new illustration system, production brand redesign, or broad design-system project.
- Shopping inventory, purchasing, pantry management, or automatic grocery ordering. The preparation list only summarizes ingredients in scheduled meals.
- Medical diagnosis or individualized clinical nutrition advice.

## Further Notes

- This specification refines rather than replaces the resolved responsive dashboard and scheduling decision. Daily spotlight, Weekly planning board, Pocket agenda, Sunday behavior, and the move-or-swap contract remain authoritative.
- The phrase "planned target progress" should be used consistently anywhere scheduled meals are compared with member targets.
- The prototype demonstrates working live nutrient recalculation and shared-dinner allocation. The redesign should reuse those behaviors and simplify their presentation rather than introduce parallel calculation paths.
- The highest-value delivery order is: phone weekly planner, dashboard preparation view, scheduled-meal target feedback, staged Targets workflow, then visual and accessibility polish.
