# Playwright QA Suite Design

Status: **Implemented** (2026-02-25)

## Goal

Automated end-to-end test suite that exercises the full CIK-OIG user workflow: adding entities, pinning, grouping, tagging, searching/downloading accessions, and verifying settings persistence. Tests must be repeatable, order-independent, and run across phone/tablet/desktop breakpoints against both dev and production builds.

## Test Entities

- Dynamic Associates (CIK 0001909492)
- Legal Access Technologies (CIK 0001909736)
- MW Medical Inc (CIK 0001059577, pre-loaded default)
- Davi Skin (CIK 0001819446)

## File Structure

```
tests/
  playwright.config.ts       -- ports 5188/4188, 6 projects, Chromium only
  helpers/
    entities.ts              -- entity constants, test data, extra entities
    actions.ts               -- reusable page actions (freshStart, addEntity, etc.)
  e2e/
    core-workflow.spec.ts    -- 1 test
    settings-resilience.spec.ts -- 2 tests
    order-independence.spec.ts  -- 5 tests
    responsive.spec.ts       -- 3 tests
    stress.spec.ts           -- 5 tests
    tag-group-workflow.spec.ts  -- 6 tests (tag naming, color, person mode, history)
```

## Results

22 tests x 6 configurations = 132 total executions, all passing.

| Configuration | Tests | Status |
|---------------|-------|--------|
| dev-desktop (1440x900) | 22 | PASS |
| dev-tablet (820x1180) | 22 | PASS |
| dev-phone (390x844) | 22 | PASS |
| prod-desktop (1440x900) | 22 | PASS |
| prod-tablet (820x1180) | 22 | PASS |
| prod-phone (390x844) | 22 | PASS |

## Config Details

- Dedicated test ports: dev=5188, prod=4188 (avoids collision with other dev servers)
- All projects use Chromium (only browser installed)
- Tablet/phone use `isMobile: true` and `hasTouch: true` with appropriate user agents
- `webServer` auto-starts vite dev or builds+previews
- Screenshots on failure, video retained on failure, trace on first retry
- HTML reporter (open: never)

## Package Scripts

```json
"test": "npx playwright test --config tests/playwright.config.ts",
"test:dev": "npx playwright test --config tests/playwright.config.ts --project=dev-desktop",
"test:prod": "npx playwright test --config tests/playwright.config.ts --project=prod-desktop",
"test:tags": "npx playwright test --config tests/playwright.config.ts --project=dev-desktop tag-group-workflow",
"test:all": "... sequential per-project run (most reliable)",
"test:ui": "npx playwright test --config tests/playwright.config.ts --ui"
```

## Bugs Found and Fixed During QA

1. **Stale persistedFavorites after group operations** -- `persistedFavorites` was not reloaded after `addEntitiesToGroup()` and `saveEntityGroup()`, causing settings panel to show stale data.
2. **Null-safe access on persistedFavorites** -- `persistedFavorites.entities.length` crashed when entities was undefined. Fixed with optional chaining and nullish coalescing.
3. **Duplicate #each keys** -- Settings panel used `entity.cik` as key, which collided when the same entity appeared in multiple contexts. Fixed with composite keys including index.
