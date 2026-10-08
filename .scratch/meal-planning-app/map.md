# Meal Planning App Decision Map

Status: open
Type: wayfinder:map

## Destination

Produce an implementation-ready v1 specification for the two-member household meal-planning app, covering product behavior, nutrition rules, responsive interaction design, data/API structure, workbook migration, and Raspberry Pi deployment. Application implementation is outside this map.

## Notes

- Read `CONTEXT.md` and `docs/agents/domain.md` before resolving a ticket.
- Use the `grilling` and `domain-modeling` skills for human decisions.
- Use primary sources for nutrition and ingredient-data claims.
- Source material: `Meal plan.xlsx` and the two supplied flat-illustration references.
- Required stack: React + Vite + TypeScript in `app/frontend`; Express + TypeScript on Bun in `app/backend`; SQLite; Docker Compose on Raspberry Pi.
- This is a two-person hobby app on a trusted local network. No login, cloud service, runtime external calls, or simultaneous editing support.
- Household timezone: Asia/Jakarta. Dashboard polling interval: 60 seconds.

## Decisions so far

- [Define v1 product boundaries](issues/00-define-v1-product-boundaries.md) — Set the calorie-budget, meal-scheduling, reusable-menu, ingredient, recommendation, dashboard, visual, backup, and deployment boundaries for v1.
- [Define nutrition calculation guardrails](issues/01-define-nutrition-calculation-guardrails.md) — Chose transparent Mifflin-St Jeor calculations, editable activity and deficit settings, advisory safety warnings, AMDR-aware macro targets, age/sex fiber targets, and explicit Apply or Keep reviews.
- [Choose nutrition sources and seed catalog](issues/02-choose-nutrition-sources-and-seed-catalog.md) — Set identity-first source precedence, provenance and alias requirements, a small reviewed catalog, and a public-safe boundary for TKPI and package-label data.
- [Specify workbook import and normalization](issues/03-specify-workbook-import-and-normalization.md) — Defined a read-only, auditable one-time migration with reviewed aliases and quantity bases, deterministic menu deduplication, member-history handling, and transactional commit.
- [Prototype responsive dashboard and scheduling](issues/04-prototype-responsive-dashboard-and-scheduling.md) — Chose Daily spotlight for the monitor dashboard, Weekly board for desktop scheduling, Pocket agenda for phones, and one accessible move-or-swap contract across layouts.

## Not yet specified

- The final implementation-ready specification structure and acceptance criteria depend on the research, migration, and prototype decisions.
- Production illustration optimization and final visual-token tuning remain implementation work.
- The exact reviewed seed rows and completed reconciliation report will be produced when the importer and local catalog are implemented.

## Out of scope

- Building or deploying the application during this Wayfinder effort.
- Breakfast planning, recipes, login/accounts, public internet access, cloud sync, and concurrent-edit conflict handling.
- AI recommendations or runtime calls to external nutrition services.
- Automatic backups.
- Production-scale operations, permissions, audit logging, and multi-household support.
