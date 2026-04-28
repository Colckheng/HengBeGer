# Admin Dashboard Polish Design

## Goal

Improve the visual quality of the admin dashboard without changing routes, data flow, or CRUD behavior. The immediate trigger is the metric-card strip, which currently has weak hierarchy and treats status copy as if it were a primary KPI.

## Problems Observed

- All metric cards use the same composition, so the eye cannot tell which value matters most.
- The filter-status card gives a text state the same visual weight as numeric KPIs.
- The top bar, metric strip, search region, table shell, and drawer header are styled with similar surfaces but not a shared rhythm.
- The admin view feels functional, but not yet intentional or premium.

## Design Direction

Use a "data cockpit" direction instead of equal-size summary cards.

- One primary card should emphasize the current editing category.
- Numeric KPIs should feel dense and compact, not oversized by default.
- Status cards should show context and helper copy instead of shouting the status text.
- The surrounding admin UI should reinforce the same language through stronger spacing, softer layering, and clearer section separation.

## Planned UI Changes

### Metric Area

- Introduce card variants: active category, total records, filter status, and visible-results summary.
- Add helper text and small badges so cards read as mini status panels rather than empty boxes.
- Use more deliberate spans, gradients, and highlight treatments so the first card anchors the row.

### Shared Admin Surface

- Tighten the top-bar hierarchy with a calmer title stack and utility chips.
- Improve table and search containers so they feel connected to the metric strip.
- Polish drawer header/footer surfaces to match the cockpit language.

## Constraints

- No route changes.
- No API or data model changes.
- No changes to existing tested labels that admin tests depend on.
- Keep the implementation mostly in the current admin components and shared CSS.

## Verification

- Run focused frontend tests for admin pages and auth gate.
- Run a production build.
- Do a final local visual sanity check against the current admin flow.
