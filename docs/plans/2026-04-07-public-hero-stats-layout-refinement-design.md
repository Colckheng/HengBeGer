# Public Hero Stats Layout Refinement Design

## Goal

Make the public hero stat cards feel intentionally designed by giving different information types different layouts.

## Problem

The current cards still force category, count, and filter status into one shared pattern. That makes the filter card especially awkward because a state phrase is being treated like a headline-sized KPI.

## Design Direction

- Keep the count card as the numeric anchor.
- Render the category card like a compact identity card.
- Render the filter card like a status card with a chip and a short summary sentence.
- Preserve the three-card row and the existing page logic.

## Card Rules

- `当前分类`: title + calmer supporting line
- `总条目`: large number + short summary
- `筛选条件`: status chip + one-line summary + one-line helper text

## Scope

- `src/ZZZWiki.jsx`
- `src/hsr/HsrWiki.jsx`
- `src/ZZZWiki.css`

## Verification

- Run `npm run build`
- Run `npm run lint`
