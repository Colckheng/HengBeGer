# Pixso UI Integration Plan

Date: 2026-04-07

## Step 1

Create a shared visual foundation.

- add global theme variables and layout primitives
- update root app shell styles so the entire app inherits the new surface language

## Step 2

Redesign the home route.

- replace the current minimal card list with a branded portal page
- keep links and asset usage aligned with current routes

## Step 3

Redesign the public wiki pages.

- apply the themed shell to ZZZ and HSR
- preserve filters, pagination, and ZZZ detail route behavior

## Step 4

Redesign admin login and admin workspaces.

- restyle `AdminAuthGate`
- rebuild ZZZ and HSR admin pages around sidebar, header, metrics, searchable list, and editor drawer
- preserve tested labels, file input behavior, and CRUD handlers

## Step 5

Verify and polish.

- run frontend tests
- run full `npm test`
- run `npm run lint`
- run `npm run build`
- fix any selector, layout, or behavior regressions
