# Choose nutrition sources and seed catalog

Status: resolved
Type: research
Resolved: 2026-10-07

## Question

Which reputable, legally usable primary nutrition-data sources and precedence rules should populate a locally stored ingredient catalog focused on foods and products commonly used for Indonesian, Japanese, and Korean cooking in Jakarta?

## Answer

Resolve each ingredient by exact identity and preparation state, then prefer: the current package label for a branded local product; TKPI for Indonesian generic foods only when redistribution permission permits it; Japanese and Korean government tables for their respective foods; USDA FoodData Central Foundation or SR Legacy for remaining gaps; and clearly labeled user-entered values last. Store provenance, original measurement basis, nullable unknown nutrients, editable kitchen-unit conversions, aliases, and a curated `can_recommend` flag.

Ship a small reviewed public-safe seed focused on workbook demand, common snacks, and Indonesian, Japanese, and Korean staples. Keep any TKPI-derived bulk data or local package-label additions outside the public repository until licensing permits redistribution. Ingredient search should match normalized Indonesian and English aliases by token prefix without merging nutritionally distinct forms.

Full precedence rules, schema fields, seed method, licensing notes, and primary citations: [nutrition sources and seed catalog](../research/nutrition-sources-and-seed-catalog.md).
