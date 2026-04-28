# Sync Chain Test Implementation Plan

## Steps

1. Add a Jest test file for `DataSyncController`.
2. Mock the DB sync functions and storage manager before importing the controller.
3. Add `updateAllData()` tests for:
   - invalid payload shape
   - validation failure
   - successful batch sync with per-type counts
4. Add `resetStorage()` tests for:
   - successful rebuild
   - failed rebuild
5. Run the focused backend Jest suite.

## Acceptance Criteria

- Invalid batch payloads return `400`.
- Validation failures return `400` with a type-specific message and no batch replacement call.
- Successful batch sync returns counts for the touched types and passes only touched data to the batch replacement function.
- Storage rebuild success returns aggregated counts.
- Storage rebuild failure returns `500` with stable `message` and `error` fields.
