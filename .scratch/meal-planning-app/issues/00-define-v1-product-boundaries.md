# Define v1 product boundaries

Status: resolved
Type: grilling

## Question

What behavior and scope must the implementation-ready v1 specification cover?

## Answer

- Two members share one no-login app. Either person can manage all data.
- Each member has a birthday, sex, height, weight check-ins, and configurable activity level. Age is calculated for the Monday starting each target week in Asia/Jakarta.
- The Mifflin-St Jeor resting-energy estimate feeds an explicit activity multiplier and per-member deficit factor. Every calculation step is visible.
- Each member has independent weekly target settings. A weekend reserve moves calories out of Monday-Friday while preserving the weekly budget. Weekend calories and nutrient adequacy are self-managed.
- Weight check-ins affect the following week only. Target review explains recalculated calories and offers optional rule-based changes to deficit factor, macro percentages, and fiber. Nothing applies automatically.
- Protein, carbohydrate, and fat targets are percentages totaling 100% and are also shown as grams. Fiber is an independently tracked gram target with an age-and-sex reference recommendation.
- Lunch is member-specific. Dinner is one shared whole dish split 50-50. Snacks are optional and member-specific. Breakfast is unsupported.
- Scheduling is open-ended by date. Matching meal slots can move or swap across dates by drag-and-drop, with a mobile fallback action.
- A saved menu contains reusable ingredient defaults. Scheduling it creates an independent snapshot. Update collection explicitly overwrites the saved defaults without changing scheduled snapshots.
- Ingredients use their own nutrition basis and natural unit. Canonical entries merge duplicates using reputable nutrition values, preserve Indonesian and English aliases, and prioritize Indonesian, Japanese, and Korean cooking.
- The workbook seeds commonly used ingredients and historical saved menus. Imported menu names are cleaned into recognizable names.
- Only explicitly suggestible ingredients participate in rule-based recommendations. Suggestions may combine one or two ingredients to reduce the largest nutrient shortage while respecting remaining calories.
- The dashboard shows Today, Tomorrow, and a Monday-Sunday week. On Sunday, the week panel advances to next week. It refreshes every 60 seconds.
- The responsive visual direction uses original food-themed flat illustrations, bright geometric accents, rounded white cards, and airy typography inspired by the supplied references.
- Backups are manual JSON download/restore plus raw SQLite download. Automatic backups are excluded.
- The app is deployed through Docker Compose on Raspberry Pi using React/Vite/TypeScript, Express/TypeScript on Bun, and SQLite.
