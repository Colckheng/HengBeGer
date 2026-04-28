# Pixso UI Integration Design

Date: 2026-04-07

## Goal

Apply the Pixso design language from `https://pig-wind-66261931.aisite.pixso.design` to the existing HengBeGer app without changing the current business routes, data contracts, admin auth flow, or CRUD APIs.

## Visual Thesis

Build a unified multi-surface game encyclopedia UI with three deliberate moods:

- home: cinematic portal with bold brand framing and poster-like game entry cards
- public wiki: immersive faction-style surfaces with strong theme separation for ZZZ and HSR
- admin: crisp operations workspace with a left rail, dense content area, compact metrics, and a slide-over editor

The shared system should feel like one product family rather than four unrelated screens.

## Content Plan

### Home

- hero: product name, short descriptor, direct game entry actions
- support: visual cards for ZZZ and HSR
- detail: small operational note that content is live and admin-backed
- final CTA: jump into a wiki or admin surface

### Public Wiki

- hero: world-specific title, short mood copy, total count and active tab context
- support: tab switcher plus compact filter bar
- detail: dense card grid with strong artwork and metadata chips
- final CTA: pagination footer

### Admin

- hero: product title, active game/type state, top-right session actions
- support: metric tiles summarizing current managed content
- detail: searchable list/table area with create action
- final CTA: right-side editor drawer for add/edit flows

## Interaction Thesis

- page entry: staggered fade and lift on hero headings, metric tiles, and list surfaces
- hover: game cards, wiki cards, sidebar entries, and admin rows should sharpen contrast and elevate slightly
- drawer presence: admin editor should slide in with a clear backdrop and keep the list context visible

## Mapping To Existing App

### Kept As-Is

- route paths in `src/App.jsx`
- current data fetching and pagination APIs
- `DataContext` and admin CRUD handlers
- auth session routes and token fallback behavior
- image validation, error extraction, backup/sync logic, and tests

### Reworked

- `src/App.css` and home route visual structure
- `src/ZZZWiki.jsx` and `src/hsr/HsrWiki.jsx` layout and visual hierarchy
- `src/AdminPanel.jsx`, `src/hsr/HsrAdminPanel.jsx`, and `src/components/AdminAuthGate.jsx`
- shared CSS system for theme tokens, panel surfaces, filters, tables, cards, and motion

## Page-Level Design

### Home

- replace the plain card row with a full-screen poster-style landing
- add a dramatic title block, short explanatory copy, and two primary game actions
- use the existing game images as narrative anchors instead of generic placeholders
- keep the existing `/`, `/zzz-wiki`, and `/hsr-wiki` destinations

### ZZZ Public Wiki

- shift from fixed left-sidebar framing to a richer themed shell
- keep the tab model, current filters, and pagination logic
- add a themed masthead with ZZZ color variables and ambient gradients
- cards become taller and more editorial, with clearer rarity/faction/element tags
- detail view gets a dedicated hero layout instead of a plain stacked block

### HSR Public Wiki

- mirror the ZZZ information structure but with its own colder blue visual identity
- preserve current list endpoints and filters
- use the same shared shell patterns where possible to keep maintenance low

### Admin Login

- restyle the current auth gate into a focused login panel matching the Pixso admin tone
- keep existing labels and auth behavior so tests and flows stay stable

### ZZZ / HSR Admin

- keep current data handlers and validation
- replace the full-page form/list split with:
  - left navigation rail
  - top status bar
  - metric strip
  - searchable content list
  - slide-over add/edit form
- preserve file input label, success/error messages, and save/delete actions

## Shared System

- add a shared theme stylesheet with CSS variables for home, ZZZ, HSR, and admin
- normalize buttons, chips, inputs, tables, drawer, and panel surfaces
- use one base body font plus a sharper display accent for headings and numeric highlights
- avoid card spam on landing surfaces, but allow cards where the data itself is the interaction

## Testing Strategy

- keep existing component tests passing by preserving required labels and button text for tested flows
- run frontend tests covering auth gate and admin image upload
- run full project lint and build after the redesign

## Risks And Guardrails

- risk: visual rewrite could accidentally break tested text selectors
  - guardrail: preserve tested labels and semantic actions
- risk: public page rewrite could regress pagination state
  - guardrail: do not change request hooks or list API utilities
- risk: admin redesign could overcomplicate CRUD flow
  - guardrail: keep the current handler calls and data normalization untouched

## Success Criteria

- the app visually matches the Pixso direction across home, public wiki, admin login, and admin workspace
- all current routes still work
- all current CRUD and auth behaviors still work
- tests, lint, and build pass after the redesign
