# Admin Staging Sync Test Implementation Plan

## Steps

1. Add a lightweight Express test app for admin staging routes.
2. Reuse the real auth, validation, async wrapper, and error middleware.
3. Mock the staging and replace collaborators.
4. Add tests for:
   - admin session initialization
   - staged type update success
   - staged type update payload rejection
   - staged sync success
   - staged sync error handling
5. Run the focused backend Jest suite.

## Acceptance Criteria

- Admin staging session initialization forwards `forceRefresh`.
- `PUT /api/dual-storage/admin/:type` rejects non-array payloads with `400`.
- Valid staged type updates call `saveToAdminStorage(type, data)`.
- `POST /api/dual-storage/sync` calls `getAllAdminData`, `replaceMultipleRecordSets`, and `saveAllToAdminStorage` in order.
- Sync success returns per-type counts.
- Sync failure returns a shared error payload with matching `message` and `error`.
