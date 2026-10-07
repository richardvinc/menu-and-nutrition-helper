# Nutrition sources and seed-catalog policy

## Decision

Ship a small, curated static catalog. Use the workbook to decide **which foods matter**, but never as the authority for nutrient values. Resolve each ingredient to one exact food state and one authoritative source; do not average sources.

Recommended precedence:

1. **The current package label** for an exact branded product sold in Jakarta. A label applies only to that brand, variant and package formulation. Indonesia's current BPOM rule is PerBPOM 10/2026; BPOM says processed-food labels generally require nutrition information, with listed exemptions. Record the package name, serving basis and the date the label was read. ([BPOM rule record](https://jdih.pom.go.id/view/slide/1758/10/2026/bef9c8684ee3fe041b8be023084e4012), [BPOM nutrition-label FAQ](https://tabel-gizi.pom.go.id/informasi/detail?id=3))
2. **TKPI 2020** for unbranded Indonesian foods and Indonesian preparation states, once redistribution permission is confirmed. Kemenkes publishes the 2020 revised edition as a 140-page book and launched the TKPI database as a public education resource. ([Kemenkes repository](https://repository.kemkes.go.id/book/668), [Kemenkes launch notice](https://kemkes.go.id/eng/%20peluncuran-hasil-psg-2017-awali-peringatan-hgn-2018))
3. **Country-of-origin government tables** for cuisine-specific generic foods when TKPI has no close match: Japan's MEXT table for Japanese foods, then Korea's integrated government database for Korean foods.
4. **USDA FoodData Central Foundation Foods**, then SR Legacy, for remaining generic-food gaps. Use USDA Branded Foods only when it exactly matches the product available locally; an American product with a similar name is not a substitute for an Indonesian package.
5. **User-entered label values** for remaining Jakarta products. Mark them `source_type: package_label`, never silently merge them into a generic food.

Exact food identity outranks the country order. Raw chicken does not replace cooked chicken; firm tofu does not replace silken tofu; lean minced beef does not replace unspecified-fat mince. When two authoritative rows are plausible, keep them separate until the user chooses the intended one.

## Reuse and attribution

| Source | What it contributes | Reuse status for a bundled static catalog | Required handling |
|---|---|---|---|
| TKPI 2020 / Kemenkes | Indonesian staples, local varieties and preparation states | **Unresolved for redistribution.** The official repository makes the book downloadable, but the repository page also displays “All Rights Reserved” and supplies no dataset license. Publication is not permission to redistribute a derived bulk dataset. ([official record](https://repository.kemkes.go.id/book/668)) | Use for private local verification now. Do not commit a bulk TKPI extract or TKPI-derived seed rows to a public GitHub repository until Kemenkes/Panganku gives written reuse terms. Preserve the TKPI food code and edition in local provenance. |
| Standard Tables of Food Composition in Japan 2020/2023, MEXT | Japanese generic foods and preparation states | MEXT explicitly says the food-composition data may be used freely and asks secondary works/apps to identify the 2023 table as their source. ([MEXT use statement](https://www.mext.go.jp/a_menu/syokuhinseibun/index.htm), [2023 downloads](https://www.mext.go.jp/a_menu/syokuhinseibun/mext_00001.html)) | Bundle selected rows, store the MEXT food code, edition and attribution: `Source: Standard Tables of Food Composition in Japan (Eighth Revised Edition), Supplement 2023.` |
| Korea integrated food-nutrition database, MFDS/RDA/NIFS | Korean ingredients, dishes and processed foods | The Korean public-data catalog describes the dataset as supplied by government agencies and the MFDS API record states `이용허락범위 제한 없음` (no limitation on permitted use). ([integrated dataset](https://www.data.go.kr/data/15100064/standard.do), [MFDS dataset metadata](https://www.data.go.kr/catalog/15127578/openapi.json)) | Bundle only reviewed rows; retain food code, contributing agency/source name, basis, generation method and reference date. Credit the named Korean source agency. |
| USDA FoodData Central | Generic gaps and exact US-branded matches | Public domain, published under CC0; USDA requests source credit. Downloadable CSV/JSON releases support offline snapshots. ([license/API guide](https://fdc.nal.usda.gov/api-guide/), [downloads](https://fdc.nal.usda.gov/download-datasets/)) | Bundle selected rows and retain FDC ID, data type and release date. Credit `U.S. Department of Agriculture, Agricultural Research Service. FoodData Central.` |

The app makes no runtime external calls. Source downloads are an explicit maintainer task; reviewed values become a versioned seed snapshot. A data refresh must produce a reviewable diff and must not overwrite user-edited ingredients.

## Canonical row and provenance

Store the minimum fields needed to explain every number:

- identity: `id`, Indonesian-first `name`, optional `english_name`, aliases, food state (`raw`, `boiled`, `fried`, etc.), optional brand and variant;
- nutrition: kcal, protein g, carbohydrate g, fat g and fiber g; use `null` for unavailable values, never zero;
- source basis: basis amount/unit exactly as published, edible-portion flag or percentage where supplied;
- kitchen unit: display unit plus an ingredient-specific conversion to the source basis (for example `1 egg = 50 g edible portion`); conversions must be editable;
- provenance: `source_name`, `source_record_id`, `source_url`, edition/release, source date, import date, attribution text, and `source_type` (`government_table`, `package_label`, or `manual`);
- review: `verified_at`, optional note, and `can_recommend` (default false).

Normalize calculations to a hidden per-gram or per-millilitre factor, while preserving the original source basis for display and audit. Natural units remain ingredient-specific: one egg, slice, tablespoon, cube or pack requires its own gram/ml conversion. Do not use a global “1 tablespoon = 15 g” for solids or oils. A branded label may remain per serving when its serving size has no reliable mass conversion.

Keep cooked and raw rows separate. Nutrient changes caused by water gain/loss make them different ingredients for calculation. For TKPI, preserve the edible-portion basis rather than treating purchase weight as edible weight. For product labels, enter values “as sold” and do not infer missing fiber.

## Names, aliases and search

Show the familiar Indonesian/local-market name first and English underneath. Search all aliases with case-insensitive, accent-insensitive prefix matching per token, so `be` can find `beef` and `sa` can find `sapi`.

Aliases identify the same nutrient row only when the food state and composition are equivalent. `daging sapi cincang`, `ground beef`, and `beef mince` may be aliases; `lean beef` should be a separate row unless the fat class is known to match. Include common spellings and market names, but do not add translations that imply a different cut, species, preparation, or fat percentage.

## Practical initial seed

1. Extract distinct workbook ingredient names as a demand list; import no workbook nutrition values automatically.
2. Add the household's obvious snack staples (`roti`, `bubur kacang hijau`, `ubi rebus`) and recurring Indonesian, Japanese and Korean pantry items missing from the workbook.
3. Resolve only those demanded foods, plus a small recommendation set of sensible protein/fiber additions. This should be tens of reviewed rows, not an entire national database.
4. Prefer locally representative rows: TKPI/local labels for rice, tempe, tofu, eggs, chicken cuts, beef cuts, fish, vegetables, fruit, oils, bread and Indonesian snacks; MEXT for Japanese-specific generic items; Korean government data for Korean-specific items; USDA only for gaps.
5. For Astro, Segari and supermarket products, use their listings to identify what is available, then transcribe nutrition from the physical/current package label. Do not scrape retailer descriptions into the catalog or treat a retailer's marketing text as nutrition evidence.
6. Mark only ordinary add-on foods as `can_recommend`; review that flag manually. Exclude oils, sauces, seasonings, stock cubes and meal-like dishes by default even when they have valid nutrition rows.
7. Store the public-safe seed separately from local TKPI/package-label additions. The deployed SQLite database can contain both; JSON/SQLite backups preserve provenance. If the GitHub repository is public, keep the local seed and database ignored until every included source is redistributable.

## Acceptance checks

- Every seeded row has a source record ID or a package-label note, a source basis, and a source date/edition.
- No duplicate merge crosses brand, food state, edible portion, cut/species, or material fat-content differences.
- A nonzero nutrient is never invented when a source reports blank/trace/unavailable.
- Searching Indonesian or English aliases reaches the same canonical row where equivalence was verified.
- The application can render its full catalog and calculate meals with the network disconnected.

