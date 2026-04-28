# Admin Workflow Closure Design

## Background

As of April 7, 2026, the admin workflow already has coverage for:

- cookie and bearer-token authentication success
- authenticated CRUD route validation
- admin staging initialization, staged updates, and staged publish
- sync controller behavior used by admin write flows

The main remaining gap is the rest of the admin management surface:

- logging out of an admin session
- web storage initialization
- reading staged admin data
- reading dual-storage status
- cleaning up staged admin session files
- frontend handling of login token storage and logout cleanup

These are not the biggest code paths, but together they complete the operator-facing admin workflow and remove the remaining blind spots around session lifecycle and legacy staging maintenance.

## Goals

- Cover the remaining admin-only backend routes with focused tests.
- Cover frontend admin session lifecycle behavior:
  - clear stale stored tokens
  - persist signed session tokens after login
  - clear local tokens during logout even if the server request fails
- Remove obvious dead branches in the admin panels while touching the logout flow.

## Decision

Use a small, low-risk completion pass with three pieces:

1. Add a focused backend test file for the remaining admin maintenance routes.
2. Extend existing auth and auth-gate tests to cover logout and token persistence.
3. Extract shared logout behavior into a tiny frontend helper so both admin panels use the same best-effort cleanup logic.

## Scope

In scope:

- `DELETE /api/auth/session`
- `POST /api/dual-storage/initialize`
- `GET /api/dual-storage/admin/data`
- `GET /api/dual-storage/status`
- `DELETE /api/dual-storage/admin/session`
- `AdminAuthGate` login and stale-token handling
- shared admin logout helper
- small cleanup of unreachable admin panel code left after earlier error-message unification

Out of scope:

- redesigning the admin UI
- adding new admin features
- replacing legacy staging routes
- broad end-to-end browser automation

## Why This Shape

This approach finishes the admin surface without widening the blast radius:

- backend route tests stay lightweight and avoid real DB/filesystem work
- frontend logout logic becomes consistent across both admin panels
- the work is additive and mostly test-oriented, which fits the current hardening phase

## Testing Notes

- Keep backend coverage in the existing Jest suite with lightweight Express apps and real auth middleware.
- Keep frontend coverage in Vitest with `jsdom`.
- Prefer response-payload assertions and token side effects over brittle implementation-detail assertions.
