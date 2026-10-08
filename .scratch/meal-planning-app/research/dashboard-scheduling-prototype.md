# Dashboard and scheduling prototype decision

## Decision

Use **Piring Kita** as the working product name and combine the strongest parts of the three prototype variants:

- The main dashboard uses **A — Daily spotlight** on monitors and desktop: Today is dominant, Tomorrow remains visible, both members' nutrition progress sits beside the meals, and a compact Monday–Sunday strip anchors the week.
- The schedule page uses **B — Weekly planning board** on desktop because all compatible move and swap destinations remain visible.
- Both dashboard editing and scheduling collapse to **C — Pocket agenda** on phone: one day and one member at a time, with horizontal day tabs and a vertical lunch/dinner/snack flow.

Do not force one layout to serve all three screen contexts. They share data and behavior, while their information hierarchy changes at the responsive boundary.

Runnable throwaway source: [dashboard prototype](../prototypes/dashboard-prototype/index.html). Launch instructions: [prototype README](../prototypes/dashboard-prototype/README.md).

## What the variants established

### A — Daily spotlight

Best for a household monitor and the default dashboard route. Today, Tomorrow, and daily nutrition are readable without scrolling at a 1200 px-wide display. The weekly strip provides orientation without competing with today's decision.

On phone, the two-column hierarchy becomes too long and repeated meal cards become harder to scan. Use the Pocket agenda structure there instead of merely stacking every desktop card.

### B — Weekly planning board

Best for scheduling on desktop. Seven date columns make move and swap consequences visible, and lunch ownership, shared dinner, and member-specific snacks are clear lanes.

It is intentionally dense and horizontally scrollable. It should not be the monitor dashboard or the primary phone editor. On narrow screens, replace it with the Pocket agenda rather than shrinking the columns.

### C — Pocket agenda

Best for phone editing. The member toggle affects member lunch, snack, and nutrition; shared dinner stays visibly outside that ownership. Day tabs make a one-handed move target understandable, and the vertical timeline leaves enough room for touch targets.

On a monitor it wastes space and hides the household overview, so it is a responsive structure rather than the universal layout.

## Dashboard behavior

The dashboard receives one response containing Today, Tomorrow, the Dashboard week, both members' weekday nutrition progress, and `generated_at`. It polls the same read endpoint every 60 seconds while visible. A refresh replaces displayed data without clearing an open move sheet or changing the selected member/day; show a quiet updated timestamp rather than a toast.

From Monday through Saturday, the Dashboard week is the calendar week containing Today. On Sunday:

- Today still shows Sunday;
- Tomorrow shows Monday;
- the weekly strip or board shows the upcoming Monday–Sunday week;
- Today displays `Weekend is self-managed` and does not judge calories, macros, or fiber.

An unplanned weekend meal is a valid visible state, not an error or missing-data warning. A planned weekend meal may still be opened and edited, but its nutrition is excluded from target evaluation.

Each weekday Today/Tomorrow section shows:

- Richard's member lunch;
- Michelle's member lunch;
- one shared dinner labeled `50/50`;
- member-specific snacks only when present, plus a small `+ Snack` action when absent;
- calories, protein, carbohydrate, fat, and fiber for each meal;
- each member's consumed/planned amount beside the day's target.

The main dashboard is read-first. Editing a meal opens its editor; broad scheduling belongs on the schedule page.

## Move and swap contract

A schedule destination is compatible only when its owner and slot match the source:

| Source | Valid destinations |
|---|---|
| Richard lunch | Richard lunch on another date |
| Michelle lunch | Michelle lunch on another date |
| Shared dinner | Shared dinner on another date |
| Richard snack | Richard snack on another date |
| Michelle snack | Michelle snack on another date |

Dropping on an empty compatible destination moves the scheduled-meal snapshot. Dropping on an occupied compatible destination swaps the two snapshots. Incompatible destinations reject the operation and explain why. A move never changes the underlying saved menu.

Desktop supports pointer drag/drop with compatible targets highlighted before drop. Every meal also has a visible Move action. On touch screens, tapping Move or long-pressing for roughly 500 ms opens the same bottom sheet listing only compatible dates and whether each destination is empty or will swap. The explicit Move action remains the accessible fallback.

The client sends the source schedule key, destination date, expected source revision, and expected destination revision. The backend performs move/swap atomically and returns both resulting slots. Revision mismatch shows `Schedule changed—review and try again`; it never guesses. This light guard also protects a stale page after the 60-second refresh even though simultaneous household editing is not a target use case.

## Responsive structure

- **Monitor / wide desktop:** Daily spotlight dashboard; weekly board scheduler; nutrition panels remain beside meals.
- **Tablet / narrow desktop:** Daily spotlight stacks Today above Tomorrow/nutrition; weekly board remains horizontally scrollable.
- **Phone:** Pocket agenda replaces both dense structures; member toggle, day tabs, bottom-sheet move action, and at least 44×44 px interactive targets.

The selected date and member persist while navigating between dashboard and schedule during one session. Refreshing the page may return to Today and the first member; URL persistence is unnecessary for v1.

## Visual direction

Use rounded white surfaces on a very pale cool-gray background with deep violet as the primary action color, coral/pink for one member, cyan and yellow accents, thin navy details, and soft shadows. Keep illustrations decorative and subordinate to meal information. Their alt text describes the scene; repeated decorative instances may use empty alt text.

Three original transparent assets were generated for the prototype:

- `assets/broccoli-hero.png` — person holding oversized broccoli;
- `assets/cooking-hero.png` — person cooking vegetables;
- `assets/shared-dinner-hero.png` — couple sharing a meal.

They use the supplied images only as style references. No characters, composition, text, or branded elements were copied. Production may optimize their dimensions and file sizes without changing the art direction.

## Accessibility and motion

- Every drag operation has the Move-button path and keyboard-readable destination labels.
- Member identity never relies on color alone; display names and initials remain visible.
- Progress bars include text values and targets.
- Animated progress changes use transforms or width transitions and honor `prefers-reduced-motion`.
- Long press is optional enhancement, not the only way to act.
- Focus returns to the moved meal after the bottom sheet closes in production.

## Acceptance checks

- At monitor width, Today, Tomorrow, both members' daily progress, and the week are visible without ambiguity.
- At 360 px width, one member/day can be planned without horizontal page scrolling.
- Sunday shows current Sunday as Today, Monday as Tomorrow, and the upcoming Monday–Sunday Dashboard week.
- Weekend cards never show deficiency or over-target judgments.
- Lunches and snacks cannot move across members; dinner cannot move into a lunch or snack slot.
- Occupied compatible destinations swap and empty compatible destinations move.
- Move controls work without drag/drop or long press.
- Adding a snack creates it only for the selected member and immediately affects that member's weekday totals.
- A 60-second refresh preserves transient editing context and exposes its timestamp.
- Original illustrations remain crisp, unobtrusive, and optional when network access is absent.

## Prototype status

The prototype is intentionally dependency-free and keeps state in memory. It demonstrates variant switching, Sunday behavior, move-to-empty, swap choices, snack creation, member/day selection, and a visible state dump. It is not production frontend code and should be rewritten in the React application after the implementation specification is complete.
