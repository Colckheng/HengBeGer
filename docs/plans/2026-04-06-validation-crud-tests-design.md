# Validation And CRUD Test Design

## Background

Current backend test coverage already includes auth, health, metrics, and the shared error payload shape. The most obvious remaining gap is the core admin write path:

- request authentication
- input validation
- route-level request handling
- shared error serialization

Testing every resource end-to-end would add a lot of setup and maintenance cost. A narrower representative suite provides better value for this phase.

## Goals

- Cover the most failure-prone validation helpers directly.
- Cover representative authenticated write routes for both ZZZ and HSR.
- Avoid coupling these tests to a real database or model initialization.

## Decision

Use two layers of backend tests:

1. Validation unit tests
   - `validateId`
   - `validateBody`
   - representative validator behavior for `validateAgentData`
   - representative validator behavior for `validateHsrCharacterData`

2. Lightweight route-chain integration tests
   - build a small Express app inside the test
   - reuse real middleware:
     - `createAdminSession`
     - `requireAdmin`
     - `validateBody(...)`
     - shared `errorMiddleware`
   - use simple in-test handlers instead of real DB calls

## Representative Routes

- `POST /api/agents`
- `POST /api/hsr/characters`

Each route should cover:

- authenticated validation failure returns `400`
- authenticated valid payload reaches the handler with normalized values

## Why Not Full App CRUD Here

The real app routes call database-layer functions that depend on model initialization. Mocking the full import graph would make these tests more brittle than the value they add right now.

The lightweight integration app still verifies the important contract:

- admin auth is required
- request bodies are validated and normalized
- failures reach shared error handling

## Testing Notes

- Keep backend tests aligned with the repository’s current Jest setup.
- Reuse `TEST_AUTH.password` for login flows.
- Assert that validation failures include both `message` and `error` now that the shared error payload has been unified.
