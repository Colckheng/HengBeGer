# Public Hero Stats Typography Design

## Goal

Fix the public hero stat cards on the ZZZ and HSR pages so the text hierarchy feels natural in Chinese.

## Problem

The current stat cards give the same oversized treatment to all values. That works for numbers, but it makes category words and status phrases feel clumsy. In Chinese, words like "角色" or "未筛选" become awkward when they are enlarged to poster scale and forced into stacked line breaks.

## Design Direction

- Keep large type only for numeric KPIs.
- Render category and status values at a more readable display size.
- Add one line of helper copy so non-numeric cards feel informative instead of empty.
- Preserve the existing three-card structure and page logic.

## Scope

- `src/ZZZWiki.jsx`
- `src/hsr/HsrWiki.jsx`
- shared hero stat styling in `src/ZZZWiki.css`

## Verification

- Build the frontend bundle.
- Run the focused frontend test suite to ensure the page structure change does not regress existing UI behavior.
