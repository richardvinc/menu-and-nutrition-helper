# Workbook import and normalization contract

## Decision

Treat `Meal plan.xlsx` as a one-time, read-only migration source. It provides household history, menu candidates, ingredient demand, aliases, and legacy quantities. It does not provide authoritative nutrition values.

Build the importer as an offline developer tool with two commands: `dry-run` produces local staging data and a human-readable report; `commit` writes only reviewed rows to SQLite in one transaction. Do not add an import screen to the application. The source workbook and generated local data remain outside Git.

## Workbook findings

The inspected file has SHA-256 `be1b57655d78f761409265e75e4b8f6996a1795757aeb9da95388aba29eac7a1` and contains 26 sheets:

- 22 weekly planning sheets, of which 18 have usable dates from 2024-02-20 through 2026-10-04;
- four weekly sheets (`Week 3`, `Week 4`, `Week 6`, and `Week 7`) whose starting dates are absent, causing their cached date formulas to resolve to 1900 dates;
- `Weekly needs`, with 44 member rows representing 22 paired weekly observations;
- `Nutrition Table`, with 156 named rows;
- `Template` and `Rumus`, which are structural references rather than user history.

Across the weekly sheets there are 1,807 nonzero ingredient-use rows and 107 distinct ingredient labels before normalization. Eight used labels do not exactly match a `Nutrition Table` name. At least 53 nutrition-table names encode a non-100 g basis such as an egg, tablespoon, bowl, bag, or serving even though the weekly quantity header often says `100 gr`.

The workbook formula itself uses the correct male and female Mifflin-St Jeor constants. Its `BMR` column is mislabeled because it already multiplies the resting estimate by `1.2`; import that multiplier as `Custom (1.20)` activity, not as part of Mifflin-St Jeor. A factor such as `0.8` means retaining 80% of estimated maintenance, or a 20% deficit. Historical factors and macro splits may trigger the new advisory warnings and must not silently become recommendations.

## Import boundary

Import:

- member display names, height, sex-code mapping, weight history, and historical target settings;
- resolved ingredient aliases and unit evidence;
- cleaned saved-menu candidates and their default quantities;
- dated historical lunch and dinner schedules when the date and meal boundaries are unambiguous;
- workbook cell references needed to audit every imported value.

Do not import:

- workbook protein, carbohydrate, fat, fiber, or calculated calorie values as catalog nutrition;
- cached formula totals;
- `Template` rows, `Rumus` examples, blank/zero ingredient rows, or formatting-only rows;
- body measurements other than weight and height in v1;
- an inferred birthday, weekend reserve, or activity category;
- 1900 dates produced by formulas whose starting date is blank.

## Staged pipeline

1. **Fingerprint** — record the source filename, hash, workbook modified time, sheet names, and importer version. A previously committed hash is rejected unless `--replace-import` is explicitly used.
2. **Extract** — read values and formulas without modifying or recalculating the workbook. Retain `sheet`, `cell` or row range, original label, original multiplier, and displayed basis text.
3. **Normalize text** — Unicode-normalize, trim, collapse whitespace, and normalize spacing around `+`, `/`, and punctuation. Preserve the original text beside every cleaned value.
4. **Resolve ingredients** — apply exact normalized matches and a reviewed alias map. Fuzzy matching may propose candidates in the report but never links them automatically.
5. **Convert quantities** — convert only when the legacy basis and canonical ingredient unit are compatible. Otherwise stage the row as unresolved.
6. **Reconstruct meals** — group contiguous ingredient rows under the nearest valid member, meal slot, and menu header within one date block. Never carry state across a new date block or a total row.
7. **Deduplicate menus** — collapse only identical normalized menu signatures. Keep conflicting variants separate for review.
8. **Validate** — produce errors and warnings without writing to SQLite.
9. **Commit** — after the resolution file has no errors, write profiles, history, aliases, saved menus, and schedules in one SQLite transaction; then emit the final report.

## Ingredient rules

Each staged label receives one status:

| Status | Meaning | Commit behavior |
|---|---|---|
| `exact` | Normalized label exactly matches one canonical ingredient or reviewed alias | Link and convert its quantity |
| `alias_reviewed` | A human-approved alias maps to one nutritionally equivalent ingredient | Add the alias and link it |
| `candidate` | Fuzzy/name similarity suggests a match | Do not commit the link |
| `basis_conflict` | The likely ingredient matches but the unit or food state differs | Do not commit the quantity |
| `unresolved` | No safe match exists | Keep it in the report only |
| `excluded` | Placeholder or non-food row | Ignore with a recorded reason |

The eight exact-name misses require explicit review:

- `Eggs (white only)` → likely `Eggs, large, white, each`;
- `Egg (whole)` → likely `Eggs, large, whole, each`;
- `Egg Yolk (1 yolk)` → likely the matching large-yolk row;
- `Olive oil (1 tablespoon)` → do not assume it is the `extra light` product;
- `Corn starch` → resolve its mass or tablespoon basis before linking;
- `Lettuce` → do not assume romaine;
- `Pear (1 medium)` → verify the intended piece weight;
- `Ikan rebon` → add a sourced canonical ingredient before linking.

Composite labels such as `Shirataki + white rice` remain distinct local ingredients until their composition and basis are reviewed. Medical or specialty entries such as CAPD products are never suggestible and require an exact current label before their nutrition can be used.

For a plain legacy food whose source row is per 100 g, multiplier `q` becomes `q × 100 g`. For labels explicitly based on an egg, tablespoon, piece, bowl, bag, pack, cube, or slice, `q` remains a count of that ingredient-specific unit. Never apply a global tablespoon or piece conversion. Preserve the legacy multiplier if conversion is blocked.

## Saved-menu reconstruction

A meal occurrence is scoped by `date + member + slot + menu label`. Map `Siang` to lunch and `Malam` to dinner. The importer supports the earlier `Week 1` column layout and the later layout by header meaning, not fixed column letters.

Create a menu signature from the cleaned name plus the ordered canonical ingredient IDs, units, and quantities. Exact signatures collapse into one saved menu candidate with usage count and most-recent-use date. When the same cleaned name has different ingredients, units, or quantities, stage separate variants and require an explicit `merge`, `rename`, `keep both`, or `exclude` resolution. Do not choose the most recent variant silently.

Blank labels and placeholders such as `Menu` are errors for saved menus. The report may propose a name from the principal ingredients, but a reviewed name is required before commit. Spelling and capitalization cleanup is safe; semantic renames are review items.

Lunch occurrences remain member-specific. For historical dinners, pair the two member entries only when their date and cleaned menu name agree. The combined saved-menu candidate uses the sum of both members' ingredient quantities as the whole dish and is marked `converted_to_shared_50_50`. A mismatch remains two review candidates. This conversion affects only the reusable candidate; historical nutrient totals are never recomputed from workbook values.

Scheduled meals are snapshots independent of the resulting saved menu. Import dated schedule history only from the 18 sheets with valid dates. The four undated sheets contribute saved-menu candidates and usage counts but no scheduled meals unless a date is supplied in the resolution file. Weekend schedules may be retained, with no weekend calorie or macro evaluation. The workbook has only lunch and dinner, so it creates no snacks.

## Member and target history

Normalize `Richard (-2 kg)` to member `Richard`; the parenthetical text is a note, not part of the name. Map workbook sex codes `L` and `P` to male and female only after they are confirmed during setup. Seed the latest valid height and weight, but require birthdays because ages in the workbook cannot reconstruct exact birth dates.

Map each weekly observation to its Monday using a real dated plan sheet or an unambiguous week label. When several rows target the same member and Monday, the last workbook row is the correction used for that week; earlier rows remain in the report as superseded evidence. The repeated `Feb week 4 (23 - 1 Mar)` observations and the `Nov week 3`/dated-sheet naming mismatch must be called out explicitly.

Store historical deficit factors, macro percentages, and fiber values as imported settings with their original row references. Do not derive an activity category from `1.2`; use `Custom (1.20)`. Do not infer a weekend reserve. On first setup, show the latest imported values beside the rule-based recommendations and require explicit Apply or Keep choices before generating future targets.

## Resolution file

The dry run produces a local `resolutions.json` template containing only decisions that require human review:

- ingredient alias, food-state, source record, and unit decisions;
- menu merge, rename, keep-both, or exclude decisions;
- dates for undated sheets if their schedules should be retained;
- member identity and sex-code confirmation;
- same-week weight correction choices.

Re-running a dry run with the same workbook and resolution file must produce byte-equivalent staged domain data apart from timestamps.

## Audit report

Generate both `report.json` and a readable `report.md` under a Git-ignored local import directory. The report contains:

- source hash, sheet inventory, importer version, start/end time, and dry-run/commit status;
- extracted, skipped, resolved, unresolved, warned, and committed counts by entity type;
- every ingredient mapping with original basis, canonical basis, conversion, source record, and workbook cells;
- every menu deduplication or conflict and the occurrences behind it;
- every imported or skipped scheduled meal with its reason;
- each member-history row, inferred Monday, duplicate correction, and formula warning;
- before/after comparisons between workbook macro values and authoritative catalog totals for review only;
- all blocking errors and nonblocking warnings.

The report must never describe a missing nutrient as zero. A committed import is successful only when all scheduled ingredients have canonical nutrition and compatible quantities, every saved menu has a reviewed name, and the SQLite transaction completes.

## Acceptance checks

- The original workbook hash is unchanged after dry run and commit.
- Running the same committed hash twice cannot duplicate members, history, aliases, menus, or schedules.
- No workbook nutrient value becomes canonical nutrition.
- Every imported quantity can be traced to its original cell and an explicit basis conversion.
- No 1900 date, formula total, blank/zero ingredient row, or template row is imported.
- Same-name menu conflicts and fuzzy ingredient matches require review.
- Shared-dinner conversion is visible in the report and never changes lunch ownership.
- A failed validation or database write leaves SQLite unchanged.
- The application can use all committed data with the network disconnected.
