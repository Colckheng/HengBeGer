# Admin Staging Sync Test Design

## Background

The admin publish flow has a separate staging path before data reaches the public storage snapshot:

- initialize admin staging from web storage
- write staged records by type
- publish staged data through `POST /api/dual-storage/sync`

We already have coverage for:

- shared auth
- representative CRUD validation
- sync controller batch replacement and storage rebuild

The missing layer is the admin staging route contract itself.

## Goals

- Verify admin staging session initialization after authentication.
- Verify staged type updates validate and persist the payload shape.
- Verify staged sync publishes staged data through the database replace path and updates admin staging with the resulting snapshot.
- Verify staging sync failures surface through shared error handling.

## Decision

Add a focused backend route test that builds a lightweight Express app and reuses the real middleware:

- `createAdminSession`
- `requireAdmin`
- `validateDataType`
- `catchAsync`
- `errorMiddleware`
- `AppError`

The test app will mock the external collaborators:

- `dualStorageManager`
- `replaceMultipleRecordSets`

This keeps the tests close to the real route wiring without requiring the full server import graph.

## Scope

In scope:

- `POST /api/dual-storage/admin/session`
- `PUT /api/dual-storage/admin/:type`
- `POST /api/dual-storage/sync`

Out of scope:

- real database writes
- real storage files
- full server startup

## Scenarios

1. Authenticated admin session initialization forwards `forceRefresh`.
2. Type-specific staged payload updates call `saveToAdminStorage`.
3. Non-array staged payloads return `400`.
4. Staged sync:
   - reads admin staging
   - passes staged data into `replaceMultipleRecordSets`
   - persists the returned snapshot back into admin storage
   - returns per-type sync counts
5. Staged sync errors propagate through shared error middleware.

## Testing Notes

- Keep the suite in Jest with the existing backend setup.
- Reuse `TEST_AUTH.password` for login.
- Prefer asserting route payloads and collaborator calls over internal implementation details.
