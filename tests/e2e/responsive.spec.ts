import { test, expect } from '@playwright/test';
import { TEST_ENTITIES, GROUP_NAME } from '../helpers/entities';
import {
	freshStart,
	addEntity,
	pinEntity,
	createGroup,
	startSearch,
	openSettings,
	closeSettings,
	getEntityBadgeCount,
	verifyPageAlive,
	clearDefaultEntity,
} from '../helpers/actions';

/**
 * This spec runs the same workflow at all viewport sizes.
 * The actual viewport is set by the project config (phone/tablet/desktop).
 * So this spec focuses on verifying the UI adapts and remains functional.
 */
test.describe('Responsive Workflow', () => {
	test('core workflow at current viewport', async ({ page }) => {
		const viewport = page.viewportSize();
		const label = viewport
			? `${viewport.width}x${viewport.height}`
			: 'unknown';

		await freshStart(page);
		await verifyPageAlive(page);
		await clearDefaultEntity(page);

		// Add entities
		for (const entity of TEST_ENTITIES) {
			await addEntity(page, entity.searchTerm);
			await verifyPageAlive(page);
		}

		const badgeCount = await getEntityBadgeCount(page);
		expect(badgeCount).toBeGreaterThanOrEqual(TEST_ENTITIES.length);

		// Pin entities
		for (const entity of TEST_ENTITIES) {
			const fragment = entity.searchTerm.split(' ')[0].toUpperCase();
			await pinEntity(page, fragment).catch(() => {});
		}

		// Group
		await createGroup(page, GROUP_NAME);
		await verifyPageAlive(page);

		// Search
		await startSearch(page);
		await verifyPageAlive(page);

		// Settings
		await openSettings(page);

		// Verify settings popup is visible and scrollable at this viewport
		const settingsPopup = page.locator('.settings-popup');
		await expect(settingsPopup).toBeVisible({ timeout: 5_000 });

		// Verify key sections render
		const pinnedLabel = page.locator('.settings-section-label').filter({ hasText: 'PINNED' });
		await expect(pinnedLabel).toBeVisible({ timeout: 5_000 });

		await closeSettings(page);
		await verifyPageAlive(page);

		// Take a screenshot for visual verification
		await page.screenshot({
			path: `tests/screenshots/responsive-${label}.png`,
			fullPage: true,
		});
	});

	test('search input accessible at current viewport', async ({ page }) => {
		await freshStart(page);

		const input = page.locator('input[placeholder*="entity"], input[placeholder*="Entity"], input[placeholder*="CIK"]');
		await expect(input).toBeVisible({ timeout: 5_000 });

		// Verify input is clickable
		await input.click();
		await input.fill('MW Medical');

		const dropdown = page.locator('.search-dropdown');
		await dropdown.waitFor({ state: 'visible', timeout: 10_000 });

		await verifyPageAlive(page);
	});

	test('settings button accessible at current viewport', async ({ page }) => {
		await freshStart(page);

		const settingsBtn = page.locator('.settings-toggle');
		await expect(settingsBtn).toBeVisible({ timeout: 5_000 });

		// Click should work
		await settingsBtn.click();
		const popup = page.locator('.settings-popup');
		await expect(popup).toBeVisible({ timeout: 5_000 });

		await verifyPageAlive(page);
	});
});
