# Sync Chain Test Design

## Background

As of April 7, 2026, backend coverage already includes:

- auth flow
- health and metrics endpoints
- shared error payload shape
- representative validation and authenticated CRUD route tests

The biggest remaining gap is the storage sync control path. The most important user-visible sync operations are handled by `DataSyncController`, especially:

- `updateAllData()`
- `resetStorage()`

These methods orchestrate validation, batch replacement, storage rebuilds, and response shaping. They are also a common regression surface when sync internals change.

## Goals

- Cover the main sync controller success path.
- Cover validation failure before any batch replacement happens.
- Cover storage rebuild success and failure responses.
- Avoid introducing real database or file system dependencies into the tests.

## Decision

Add focused controller tests that mock:

- `replaceMultipleRecordSets`
- `syncDatabaseToStorage`
- `storageManager`
- `logger`

Then import the real `DataSyncController` and test its public methods directly with mocked `req` and `res` objects.

## Scope

In scope:

- `updateAllData()`
  - rejects invalid payload structure
  - rejects invalid typed items
  - forwards only touched storage types to batch replacement
  - returns per-type counts from the snapshot
- `resetStorage()`
  - returns counts derived from the rebuilt snapshot
  - returns a stable 500 payload when rebuild fails

Out of scope:

- real DB integration
- route wiring through the full server app
- direct file persistence testing
- queue internals already covered by `serialTaskQueue.test.js`

## Why This Layer

Testing the controller layer gives the best coverage-to-cost ratio:

- higher signal than utility-only tests
- lower brittleness than full app + DB setup
- directly exercises the sync API contract used by admin flows

## Testing Notes

- Keep these tests in the backend Jest suite.
- Use ESM module mocks via `jest.unstable_mockModule`.
- Assert response payloads rather than implementation details where possible.
