# Admin Workflow Closure Implementation Plan

## Steps

1. Add a backend Jest test file for the remaining admin maintenance routes.
2. Extend `auth.test.js` to verify logout clears the session.
3. Add a shared frontend admin logout helper and switch both admin panels to use it.
4. Extend frontend admin tests to cover:
   - stale token cleanup on unauthenticated session check
   - token persistence after login
   - best-effort logout cleanup on request failure
5. Remove unreachable fallback branches left in both admin panels.
6. Run targeted backend and frontend suites.

## Acceptance Criteria

- Admin logout returns the client to an unauthenticated state on the next status check.
- Admin maintenance routes return the expected success payloads and reuse the shared error shape on failure.
- `AdminAuthGate` stores the signed session token after successful login.
- `AdminAuthGate` clears stale stored tokens when the backend reports the admin is not authenticated.
- Admin logout clears local token state and reloads the page even if `DELETE /auth/session` fails.
- Both admin panels use the shared logout helper and no longer contain unreachable error-handling code.
