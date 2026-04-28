# Error Message Unification Implementation Plan

## Steps

1. Add a shared frontend API error extraction utility.
2. Update `DataContext.jsx` to use the shared helper for refresh and mutation failures.
3. Update `AdminAuthGate.jsx` to use the same helper for session-check and login failures.
4. Update `AdminPanel.jsx` and `HsrAdminPanel.jsx` to use the helper for submit/delete failures.
5. Update shared Express error middleware to return both `message` and `error`.
6. Add focused tests for the helper and middleware response shape.
7. Re-run touched frontend tests.

## Acceptance Criteria

- Admin auth and admin CRUD flows display one consistent user-facing error string.
- Shared backend error middleware includes both `message` and `error`.
- Frontend no longer duplicates `response?.data?.message || error.message` logic in the touched files.
- New and existing focused tests pass.
