# Validation And CRUD Test Implementation Plan

## Steps

1. Add backend unit tests for `validateId`, `validateBody`, and representative validator failures.
2. Add a lightweight Express test app for authenticated write-route coverage.
3. Cover representative ZZZ and HSR create routes with one invalid and one valid payload each.
4. Align the shared backend error payload test with the repository’s Jest conventions.
5. Run targeted backend Jest tests.

## Acceptance Criteria

- Invalid IDs and empty bodies are rejected in unit tests.
- Representative validator failures are covered for both ZZZ and HSR payloads.
- `POST /api/agents` and `POST /api/hsr/characters` reject invalid authenticated payloads with `400`.
- Valid authenticated payloads reach the route handler with normalized numeric IDs.
- Targeted backend tests pass under the existing Jest setup.
