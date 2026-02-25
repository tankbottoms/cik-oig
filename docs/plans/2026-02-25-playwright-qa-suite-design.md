# Playwright QA Suite Design

## Goal

Automated end-to-end test suite that exercises the full CIK-OIG user workflow: adding entities, pinning, grouping, tagging, searching/downloading accessions, and verifying settings persistence. Tests must be repeatable, order-independent, and run across phone/tablet/desktop breakpoints against both dev and production builds.

## Test Entities

- Dynamic Associates
- Legal Access Technologies
- MW Medical Inc (pre-loaded default)
- Davi Skin (both CIK variants)

## File Structure

```
tests/
  playwright.config.ts
  helpers/
    entities.ts          -- entity constants, test data
    actions.ts           -- reusable page actions
  e2e/
    core-workflow.spec.ts
    settings-resilience.spec.ts
    order-independence.spec.ts
    responsive.spec.ts
    stress.spec.ts
```

## Test Specs

### core-workflow.spec.ts
Full user journey: clear state -> add 5 entities via search -> pin each -> create group "Cane Entities" -> change group color -> hit SEARCH -> wait for pipeline -> open settings -> verify pinned entities, saved groups, recent history -> close settings -> reopen -> verify persistence.

### settings-resilience.spec.ts
Open/close settings panel at every intermediate state: before adding entities, after adding each entity, after pinning, after grouping, after search, after clearing. Verifies no crash at any point.

### order-independence.spec.ts
Runs the same operations (add, pin, group, search, settings) in multiple shuffled orders. Verifies all combinations work.

### responsive.spec.ts
Runs core workflow at three breakpoints:
- Phone: 390x844 (iPhone 13)
- Tablet: 820x1180 (iPad)
- Desktop: 1440x900

### stress.spec.ts
Rapid entity additions, group creation, settings toggle cycles. Adds 10+ entities, creates multiple groups, rapidly toggles settings.

## Config

- `webServer` auto-starts dev or preview server
- Projects: `dev` (vite dev), `prod` (vite build + preview)
- Retries: 1 on CI, 0 locally
- Screenshots on failure
- HTML reporter

## Package Scripts

```json
"test": "npx playwright test",
"test:dev": "npx playwright test --project=dev-desktop",
"test:prod": "npx playwright test --project=prod-desktop",
"test:ui": "npx playwright test --ui"
```
