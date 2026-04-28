# Public Pagination And Audit Closure Design

## Background

After the earlier hardening pass, the remaining high-value gaps are:

- public list pages still rely heavily on eager full-snapshot loading
- structured audit events are still missing for important admin write actions

The project already has:

- stable admin auth and CRUD
- storage sync queue
- backup restore and cleanup tooling
- validation, CRUD, sync, and admin workflow tests

At this point, the best way to finish the repo is to reduce unnecessary public-page data loading and add an audit trail for operator actions.

## Goals

- Move public ZZZ and HSR list views onto paginated APIs.
- Keep detail/admin flows working without regressing existing behavior.
- Stop eagerly loading the full public snapshot for ordinary list pages.
- Add structured audit events for key admin actions:
  - login/logout
  - CRUD writes
  - storage rebuilds
  - legacy staging publish and maintenance

## Decision

Use one completion pass with three coordinated changes:

1. Add normalized paginated list helpers in the DB API layer and expose public list routes for every public tab.
2. Refactor the frontend so list pages fetch paginated data directly, while `DataContext` only preloads full main data when the route actually needs it.
3. Add a small audit helper on top of the logger and call it from successful admin mutation paths.

## Scope

In scope:

- ZZZ public list routes:
  - `/api/agents/list`
  - `/api/sound-engines/list`
  - `/api/bumbos/list`
  - `/api/drive-disks/list`
- HSR public list routes:
  - `/api/hsr/characters/list`
  - `/api/hsr/cones/list`
  - `/api/hsr/relics/list`
- route-aware `DataContext` loading
- paginated ZZZ and HSR public pages
- structured admin audit logging
- focused tests and doc updates

Out of scope:

- redesigning the site UI
- full browser E2E coverage
- multi-instance distributed locking
- replacing the historical query optimizer module

## Data Flow

### Public Pages

For public list pages:

1. `DataContext` loads base data only.
2. The page builds filter params for the active tab.
3. The page requests the matching paginated list endpoint.
4. The page renders cards plus page controls from `items + total + limit + offset`.

For admin and detail routes:

1. `DataContext` still preloads the full main dataset.
2. Existing CRUD and detail behavior stays intact.

### Audit Trail

Successful admin actions emit structured audit events with:

- event name
- HTTP method and path
- request id
- IP
- auth mode
- resource identifiers or counts where relevant

These events sit on top of the existing logger so they reuse current masking and output behavior.

## Why This Shape

- It removes the biggest remaining public-page inefficiency without rewriting the whole app.
- It keeps admin code changes incremental and low-risk.
- It creates a practical audit trail using the logging system that already exists.
- It avoids coupling public list pages to the heavy full-snapshot context path.

## Testing Notes

- Add focused backend tests for public list query parsing and response shape.
- Add focused frontend tests for request filter helpers and audit helper behavior.
- Keep full-page UI tests light; most correctness should sit in pure helpers and route-level tests.
