# Public Pagination And Audit Closure Implementation Plan

## Steps

1. Add DB-layer public list helpers that return normalized `items/total/limit/offset`.
2. Add ZZZ public list routes and refactor HSR list routes onto the same normalized shape.
3. Add an admin audit helper and wire it into successful admin auth, CRUD, storage, and staging actions.
4. Move `BrowserRouter` outside `DataProvider` and make `DataContext` route-aware so it only preloads full main data for admin/detail routes.
5. Add paginated public list fetching utilities and switch `ZZZWiki` and `HsrWiki` to use them.
6. Add focused tests for:
   - public filter param building
   - audit helper payloads
   - public list route query parsing and payload shape
7. Update README and roadmap docs, then run focused backend and frontend suites.

## Acceptance Criteria

- Public ZZZ and HSR list pages fetch paginated items from dedicated endpoints.
- Public list pages show stable loading, empty, and pagination states.
- Normal list pages no longer trigger eager full main-data snapshot loading through `DataContext`.
- Admin login/logout and successful write actions emit structured audit events.
- New public list helpers and audit helpers have targeted automated coverage.
