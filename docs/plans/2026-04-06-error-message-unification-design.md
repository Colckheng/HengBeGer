# Error Message Unification Design

## Background

Current admin-side error handling is inconsistent in two ways:

- Frontend code often reads `response.data.message`, but the shared Express error middleware returns `error`.
- Multiple frontend entry points each implement their own fallback logic, so similar failures can display different messages.

This creates avoidable regressions, especially when a request fails inside shared middleware and the frontend falls back to a generic prompt.

## Goals

- Make backend error responses readable through a single stable field.
- Keep compatibility with existing frontend code that may still read `error`.
- Centralize frontend API error extraction so admin flows show consistent messages.
- Limit scope to the main admin data and auth paths.

## Decision

Use a light full-stack compatibility layer:

1. Backend shared error middleware will return both `message` and `error`, with the same user-facing value.
2. Frontend will use a shared `getApiErrorMessage()` helper.
3. The helper will be adopted in:
   - `src/DataContext.jsx`
   - `src/components/AdminAuthGate.jsx`
   - `src/AdminPanel.jsx`
   - `src/hsr/HsrAdminPanel.jsx`

## Data Flow

1. A route or middleware throws an application error.
2. Shared Express error middleware serializes it as:
   - `success: false`
   - `message: <user message>`
   - `error: <same message>`
3. Axios catches the response on the frontend.
4. `getApiErrorMessage()` resolves the best available message in this order:
   - `response.data.message`
   - `response.data.error`
   - `error.message`
   - provided fallback message
5. The resolved message is displayed in page-level error UI.

## Failure Semantics

- Existing consumers that still read `error` continue to work.
- Updated consumers prefer `message`, but tolerate both shapes.
- Network failures with no JSON payload still resolve to a stable fallback.

## Testing

- Add a unit test for `getApiErrorMessage()`.
- Add a server-side error middleware response test to verify both `message` and `error` are present.
- Re-run the recently added admin panel image validation tests to confirm no regression in the touched pages.
