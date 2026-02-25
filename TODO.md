# TODO

## Testing

- [ ] Add CI pipeline (GitHub Actions) to run `bun run test:all` on push
- [ ] Add visual regression testing with Playwright screenshot comparisons
- [ ] Add network stubbing for offline/error scenario tests
- [ ] Test OIG verification proxy end-to-end (currently requires live API)
- [ ] Add performance benchmarks for entity search (1M+ dataset)

## Features

- [ ] Export search results (CSV, JSON)
- [ ] Batch entity search (upload list of CIKs)
- [ ] Filing content preview in-app (instead of popup window)
- [ ] OIG match severity scoring and sorting
- [ ] Search history persistence across sessions

## Technical Debt

- [ ] Refactor `+page.svelte` (90KB single file) into smaller components
- [ ] Replace `state_referenced_locally` warnings with proper `$derived` usage
- [ ] Add TypeScript strict mode
- [ ] Add a11y keyboard events to dropdown items (currently div with onclick)
