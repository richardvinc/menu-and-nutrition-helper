# Prototype responsive dashboard and scheduling

Status: resolved
Type: prototype
Resolved: 2026-10-07

## Question

Which responsive dashboard and calendar interaction best presents Today, Tomorrow, the dashboard week, per-member nutrition progress, optional snacks, and touch-friendly move-or-swap scheduling on monitor, desktop, and phone?

## Answer

Use the Daily spotlight structure for the monitor/desktop dashboard, the Weekly planning board for desktop scheduling, and the Pocket agenda structure for phone dashboard editing and scheduling. All three share one move/swap contract: only matching owner-and-slot destinations are allowed, occupied destinations swap, empty destinations move, and a Move bottom sheet provides the touch and accessibility fallback.

Full rationale, responsive behavior, Sunday rules, visual direction, and acceptance checks: [dashboard and scheduling prototype decision](../research/dashboard-scheduling-prototype.md). Runnable artifact: [Piring Kita dashboard prototype](../prototypes/dashboard-prototype/index.html).
