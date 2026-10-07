# Specify workbook import and normalization

Status: resolved
Type: task
Resolved: 2026-10-07

## Question

How should `Meal plan.xlsx` be converted into canonical ingredient aliases and nutrition bases, cleaned saved menus, default quantities, member history, and an auditable import report without treating spreadsheet nutrient values as authoritative?

## Answer

Use a one-time offline importer with dry-run and transactional commit modes. Stage workbook history with source-cell provenance, link ingredients only through exact or reviewed aliases, convert quantities only when their bases are compatible, and require review for fuzzy matches, menu variants, missing dates, and shared-dinner conversion. Import member and menu history while taking all canonical nutrition from the reviewed ingredient catalog.

Full workbook findings, mappings, pipeline, report contract, and acceptance checks: [workbook import and normalization contract](../research/workbook-import-and-normalization.md).
