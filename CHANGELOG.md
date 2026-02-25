# Changelog

## 2026-02-25

### Added

- Playwright QA test suite with 22 tests across 6 viewport/build configurations
  - `core-workflow.spec.ts` -- Full user journey (add, pin, group, tag, search, settings)
  - `settings-resilience.spec.ts` -- Open/close settings at every intermediate state
  - `order-independence.spec.ts` -- Operations in 5 different orderings
  - `responsive.spec.ts` -- Core workflow at desktop, tablet, phone viewports
  - `stress.spec.ts` -- 10+ entities, multiple groups, rapid toggle, add/remove cycles
  - `tag-group-workflow.spec.ts` -- Tag naming, color picker, person mode, recent history
- Reusable test helpers (`tests/helpers/actions.ts`, `tests/helpers/entities.ts`)
- Test commands: `test`, `test:dev`, `test:prod`, `test:all`, `test:ui`, `test:tags`
- Design doc at `docs/plans/2026-02-25-playwright-qa-suite-design.md`

### Fixed

- Group assignment stale state: `persistedFavorites` now syncs after group add/create
- Null-safe checks for `persistedFavorites.entities` and `entityHistory` in settings panel
- Unique composite keys for `#each` blocks to prevent duplicate key errors on settings render

## 2026-02-24

### Fixed

- Settings crash from Temporal Dead Zone error in effect hook
- Person mode OIG search hang with improved error handling
- Blank page error from `$derived(settingsOpen)` TDZ crash

### Added

- CURRENT SEARCH container with pin icon header
- Color picker UI for entity summary rows (long-press interaction)
- Error handling and null-safe checks throughout settings panel

## 2026-02-23

### Fixed

- Popup dismissal, hover overlay blocking, and stale state bugs
- Empty page issue from debug logging
- Settings data loading race condition

## 2026-02-22

### Added

- Entity color grouping with pastel color palette
- Gray #C4C4C4 replaced with visible #D4A5FF in pastel colors

## 2026-02-20

### Added

- Initial release: SEC EDGAR entity search with OIG cross-reference
- Fuzzy typeahead across 1M+ entities
- Filing pipeline (DEF 14A, 10-K, 10-Q, 8-K, S-1)
- 10-pattern name extraction from SEC filings
- OIG LEIE batch search and verification proxy
- Person search mode
- Pin/unpin names across searches
- Neo-brutalist UI with dark mode
