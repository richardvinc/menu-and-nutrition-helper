# Nutrition calculation guardrails

Research checked 2026-10-07. These rules are for a two-adult hobby planner. They provide transparent planning estimates, not diagnosis or individualized medical nutrition therapy.

## Decisions for v1

### 1. Resting calories: use Mifflin-St Jeor and label the result as an estimate

For adults, calculate **estimated resting energy expenditure (REE)**:

```text
male:   10 × weight_kg + 6.25 × height_cm - 5 × age_years + 5
female: 10 × weight_kg + 6.25 × height_cm - 5 × age_years - 161
```

The original study derived these equations from 498 healthy adults aged 19–78, including normal-weight and obese participants, whose REE was measured by indirect calorimetry. It calls the output REE, not maintenance calories. [[Mifflin et al., 1990](https://pubmed.ncbi.nlm.nih.gov/2305711/)]

Implementation rules:

- UI label: `Estimated resting calories (Mifflin-St Jeor)`.
- Show weight, height, age, sex constant, formula, unrounded result, and rounded display value.
- Derive age on the Monday starting the target week. A birthday during that week affects the following week.
- Restrict the calculation and Target review to members aged 19 or older. The source study does not establish this equation for children.
- The equation supplies only male and female constants. Do not invent another constant; if neither is usable for a member, explain that this estimator cannot calculate their target and allow manual targets.
- Describe all results as estimates. The study population and regression cannot establish an individual's measured metabolism, and it supplies no ethnicity-specific correction.

### 2. Activity: use explicit PAL presets, while preserving custom values

The 2023 National Academies energy DRI defines physical activity level (PAL) as total energy expenditure divided by measured or calculated basal/resting expenditure. For adults it defines inactive as 1.00–<1.53, low active as 1.53–<1.68, active as 1.68–<1.85, and very active as 1.85–<2.50. Its examples use approximate category values 1.4, 1.6, 1.75, and 2.05. [[National Academies, 2023, pp. 2–3](https://nap.nationalacademies.org/resource/26818/DRIs_for_Energy_Highlights.pdf)]

Use these selectable presets:

| Setting | Factor | Explanation shown in the app |
| --- | ---: | --- |
| Inactive | 1.40 | Daily living with little activity beyond it |
| Low active | 1.60 | Some regular walking or comparable activity beyond daily living |
| Active | 1.75 | Regular purposeful moderate activity in addition to daily living |
| Very active | 2.05 | Substantial purposeful activity in addition to daily living |
| Custom | member-entered | An explicit household estimate retained for continuity |

Calculate `estimated maintenance calories = estimated REE × activity factor`. Always show this multiplication in the calorie budget breakdown.

The workbook's `× 1.2` is not part of Mifflin-St Jeor; the original equation estimates REE only. Preserve 1.2 on import as `Custom (1.20)` rather than silently changing existing plans. New profiles should be asked to choose a preset. The National Academies' current EER equations model age, height, weight, sex, and PAL together, so REE × PAL remains a deliberately simple app estimate rather than a claim that the app implements the full DRI EER model. [[Mifflin et al., 1990](https://pubmed.ncbi.nlm.nih.gov/2305711/)] [[National Academies, 2023](https://nap.nationalacademies.org/resource/26818/DRIs_for_Energy_Highlights.pdf)]

Activity is hard to classify and actual requirements may vary considerably; the DRI tells planners to monitor body weight over time and adjust intake. Re-offer the activity setting during Target review, but never change it from a weight check-in alone. [[National Academies, 2023, p. 2](https://nap.nationalacademies.org/resource/26818/DRIs_for_Energy_Highlights.pdf)]

### 3. Deficit: advisory options with two levels of intake warning

Store the member's **deficit factor** as the fraction of estimated maintenance retained: 90% means a 10% deficit; 80% means a 20% deficit. Display both forms plus the equivalent kcal/day difference.

Clinical guidance for adults with overweight or obesity supports several prescription methods: a 500 kcal/day deficit, a 750 kcal/day deficit, or a 30% energy deficit. It also says plans should be individualized. These are clinical methods, not proof that one factor is best for every member. [[AHA/ACC/TOS guideline, 2013](https://www.jacc.org/doi/10.1016/j.jacc.2013.11.004)] Current NICE guidance likewise requires an individualized, nutritionally balanced approach and professional support for energy-deficit diets. [[NICE NG246, updated 2026](https://www.nice.org.uk/guidance/ng246/chapter/Physical-activity-and-diet)]

V1 recommendation behavior:

- Offer `80% (20% deficit)` as the neutral **app starting point**, not a medical standard.
- Also show nearby editable factors and their kcal/day effects. Do not call 15–30% a universal safe or best range.
- Show a caution when the seven-day average deficit exceeds 750 kcal/day or 30% of estimated maintenance; those values reach or exceed the cited clinical methods.
- Show a high-priority warning when any calculated weekday target is below 1,200 kcal/day. NIDDK's Diabetes Prevention Program guidance says intake below 1,200 kcal/day is not advised; this is a conservative warning, not a universal sex-specific prescription. [[NIDDK DPP guidance](https://www.niddk.nih.gov/health-information/diabetes/overview/preventing-type-2-diabetes/game-plan)]
- At 800–1,200 kcal/day, state that current NICE guidance treats this as a low-energy diet for selected people within a supported specialist strategy. Below 800 kcal/day, state that NICE reserves very-low-energy diets for a clinically assessed need within specialist care. Do not present either range as an ordinary app recommendation. [[NICE NG246, updated 2026](https://www.nice.org.uk/guidance/ng246/chapter/Physical-activity-and-diet)]
- Do not block saving. Require an explicit acknowledgement for a weekday target below 1,200, and keep the warning visible in Target review.

Evaluate both `weekly calorie budget ÷ 7` and the lower weekday target. The seven-day average describes the overall deficit; the weekday check catches an unsafe-looking result caused by moving too many calories into the weekend reserve.

### 4. Macro profile: validate AMDR ranges, then show grams

The adult Acceptable Macronutrient Distribution Ranges (AMDRs) are carbohydrate 45–65%, protein 10–35%, and fat 20–35% of energy. AMDRs are population reference ranges associated with adequate essential nutrient intake and reduced chronic-disease risk; they are not one ideal weight-loss ratio. [[National Academies DRI summary, pp. 70–74](https://nap.nationalacademies.org/skim.php?chap=70-81&record_id=11537)]

Implementation rules:

- Require protein + carbohydrate + fat to equal exactly 100% before saving.
- Flag each percentage outside its AMDR, while allowing an explicit save after acknowledgement.
- Offer `25% protein / 45% carbohydrate / 30% fat` as an **in-range app profile**, not as a superior clinical prescription.
- Calculate weekday gram targets live: `protein_g = calories × protein_pct ÷ 4`, `carb_g = calories × carb_pct ÷ 4`, and `fat_g = calories × fat_pct ÷ 9`. The 4/4/9 calorie factors are the standard factors shown by FDA nutrition labeling guidance. [[FDA Nutrition Facts label](https://www.fda.gov/media/99203/download?attachment=)]
- Keep full-precision values for calculation; round displayed calories to whole kcal and grams to one decimal place.

### 5. Fiber: age-and-sex AI, editable and independent of macros

The adult Adequate Intakes (AI) for total fiber are based on about 14 g per 1,000 kcal and resolve to these age-and-sex values: [[National Academies fiber DRI, pp. 110–121](https://nap.nationalacademies.org/skim.php?act=nap&chap=110-121&record_id=11537)]

| Age at target week's Monday | Male | Female |
| --- | ---: | ---: |
| 19–50 | 38 g/day | 25 g/day |
| 51+ | 30 g/day | 21 g/day |

Label this `Fiber reference (Adequate Intake)`. An AI is a reference value, not a precise individual requirement. Keep the fiber target editable and separate from the three macro percentages. Recalculate the reference when a member crosses an age boundary, show old and new values, and require explicit Apply. A weight change alone does not change this lookup.

Pregnancy and lactation have different reference values, but those life stages are outside this app's agreed profile model. The Target review should say it is not designed for pregnancy or breastfeeding rather than applying the table above.

## Target review contract

After a weight check-in, create a review for the following Monday. Freeze the current week's targets. One comparison card should show, in order:

1. old and new weight;
2. birthday-derived age and Mifflin-St Jeor inputs;
3. old and recalculated estimated REE;
4. chosen activity setting and `REE × factor` maintenance estimate;
5. deficit factor as both retained percent and deficit percent, plus kcal/day difference;
6. weekly calorie budget, weekend reserve, and resulting weekday target;
7. current macro percentages, AMDR flags, and calculated grams;
8. current fiber target and age/sex AI.

For every suggested change, show `current → suggested`, the numerical consequence, one-sentence reasoning, and a source link. Present separate `Apply` and `Keep current` actions for deficit factor, macro profile, fiber, and activity. Nothing changes automatically, and dismissing one suggestion must not dismiss the others.

Persist the effective week and the exact inputs, formula identifier, factor, unrounded results, chosen/dismissed recommendations, and source identifiers. This makes later calorie budget breakdowns reproducible after weight or profile changes.

Suggested boundary copy:

> General planning estimates for adults, not medical advice. Energy needs vary between individuals. This planner is not designed for pregnancy, breastfeeding, people under 19, or medically supervised low-energy diets. Discuss medical conditions, medicines, eating-disorder concerns, or very low intake with a qualified health professional.

## Source metadata to store with rules

Use stable rule keys in code/data rather than copying prose into calculations:

| Rule key | Source and version | URL |
| --- | --- | --- |
| `ree.mifflin_st_jeor.1990` | Mifflin et al., *American Journal of Clinical Nutrition* 51(2), 1990; DOI 10.1093/ajcn/51.2.241 | https://pubmed.ncbi.nlm.nih.gov/2305711/ |
| `activity.pal.nasem.2023` | National Academies, *Dietary Reference Intakes for Energy*, January 2023 | https://nap.nationalacademies.org/resource/26818/DRIs_for_Energy_Highlights.pdf |
| `deficit.aha_acc_tos.2013` | AHA/ACC/TOS adult overweight and obesity guideline, 2013 | https://www.jacc.org/doi/10.1016/j.jacc.2013.11.004 |
| `intake.nice.ng246.2026` | NICE NG246, published 2025, updated 2026 | https://www.nice.org.uk/guidance/ng246/chapter/Physical-activity-and-diet |
| `intake.niddk.dpp` | NIDDK Diabetes Prevention Program game plan | https://www.niddk.nih.gov/health-information/diabetes/overview/preventing-type-2-diabetes/game-plan |
| `macro.amdr.nasem.2005` | National Academies adult AMDRs | https://nap.nationalacademies.org/skim.php?chap=70-81&record_id=11537 |
| `fiber.ai.nasem.2005` | National Academies total-fiber AIs | https://nap.nationalacademies.org/skim.php?act=nap&chap=110-121&record_id=11537 |
| `energy.factors.fda` | FDA Nutrition Facts calorie-per-gram factors | https://www.fda.gov/media/99203/download?attachment= |

For each stored citation, retain `rule_key`, title, publisher, URL, publication/update label, and `checked_on: 2026-10-07`. Guidance can change; displaying the checked date is more honest than implying permanence.

## Cautions that must remain visible in implementation

- Mifflin-St Jeor estimates resting expenditure; the activity multiplication is a separate modeling step.
- PAL category choice is uncertain and can dominate the calorie result.
- A calorie deficit appropriate in a clinical guideline is not automatically appropriate for a specific household member.
- Weekend reserve changes meal timing, not the weekly calorie budget; a low weekday can still trigger an intake warning.
- AMDR compliance does not prove nutritional adequacy, and an out-of-range profile is not automatically unsafe.
- Fiber AI is a reference for generally healthy people, not an individualized diagnosis.
- Recommendations are advisory and must never auto-apply after a weight check-in, birthday, or source-data update.
